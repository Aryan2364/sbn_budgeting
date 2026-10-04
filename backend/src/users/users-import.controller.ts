import {
  BadRequestException, Body, Controller, HttpCode, Inject, Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { ArrayMaxSize, IsArray } from 'class-validator';
import type { Pool, PoolClient } from 'pg';

import { type AccessContext, CurrentAccess, can } from '../access/access-context';
import { AccessService } from '../access/access.service';
import { ACCESS_MANAGE_KEY } from '../access/catalogue';
import { Can } from '../access/decorators';
import { IMPORT_DEFAULT_ROLE_ID } from '../access/seed-roles';
import { CurrentUser, type AuthUser } from '../common/current-user';
import { phoneDigits } from '../common/phone';
import { PG_POOL } from '../db/db.module';
import { formatPhone } from './users.controller';
import { assertNoCycle } from './user-writes';

type Db = Pool | PoolClient;

export class ImportDto {
  @IsArray({ message: 'Send the rows as a list' })
  @ArrayMaxSize(2000, { message: 'Import at most 2,000 people at a time. Split the file.' })
  rows!: unknown[];
}

type Status = 'new' | 'update' | 'unchanged' | 'error';

interface Change {
  field: string;
  from: string | null;
  to: string | null;
}

export interface PreviewRow {
  index: number;
  status: Status;
  matchedUserId?: string;
  changes: Change[];
  messages: string[];
}

export interface PreviewResult {
  rows: PreviewRow[];
  summary: Record<Status, number>;
}

interface DbUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designationId: string | null;
  reportsTo: string | null;
  canLogin: boolean;
  passwordHash: string | null;
}

/** What one row will write, once it has passed. */
interface Plan {
  index: number;
  key: string;
  status: Status;
  matched: DbUser | null;
  name: string;
  phone: string;
  email: string | null;
  designationId: string | null;
  reportsToPhone: string | null;
  reportsToKey: string | null;
  canLogin: boolean;
  password: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * People import (CONTRACT section 2). The browser parses the .xlsx and
 * sends JSON rows; the server never parses a spreadsheet.
 *
 * Preview and commit run THE SAME analysis, so commit can never do
 * something the preview did not show. Matching is by phone, then email,
 * never by name: two people called Ramesh Patel are two people.
 *
 * A blank cell means "leave as it is" for someone who already exists,
 * so re-importing a partial sheet cannot wipe designations. Re-committing
 * the same file reports every row unchanged.
 *
 * People have no locations any more (removed 1 Oct 2026): a `locations`
 * value in a row, from an old template, is ignored without comment.
 */
@Controller('users/import')
export class UsersImportController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly access: AccessService,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @Can('platform.people.create')
  async preview(@Body() body: ImportDto, @CurrentAccess() access: AccessContext): Promise<PreviewResult> {
    const { result } = await analyse(this.pool, body.rows, can(access, ACCESS_MANAGE_KEY));
    return result;
  }

  @Post('commit')
  @HttpCode(200)
  @Can('platform.people.create')
  async commit(
    @Body() body: ImportDto,
    @CurrentUser() me: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<{ created: number; updated: number; unchanged: number }> {
    // reports_to is an access field (O8): without access.rights.manage the
    // column is ignored, and the preview says so (plan 5.3.4).
    const setsReportsTo = can(access, ACCESS_MANAGE_KEY);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // One import at a time, so two admins cannot both create one person.
      await client.query(`select pg_advisory_xact_lock(hashtext('users-import'))`);

      const { result, plans } = await analyse(client, body.rows, setsReportsTo);
      if (result.summary.error > 0) {
        const n = result.summary.error;
        throw new UnprocessableEntityException(
          `${n} ${n === 1 ? 'row has a problem' : 'rows have problems'}, so nothing was imported. ` +
            'Fix them in the file and preview again.',
        );
      }

      // The access lock, after the import's own: new people's roles and
      // reports_to changes are access writes, audited (plan 6.1.11).
      const write = await this.access.begin(client, { id: me.id, name: me.name });
      const defaultRole = await defaultRoleOf(client);

      const idByKey = new Map<string, string>();
      const touched: Plan[] = [];
      let created = 0;
      let updated = 0;
      let unchanged = 0;

      // Pass 1: the people.
      for (const plan of plans) {
        if (plan.status === 'unchanged') {
          unchanged += 1;
          idByKey.set(plan.key, plan.matched!.id);
          continue;
        }
        const passwordHash = plan.password ? await hash(plan.password, 12) : null;
        let id: string;
        if (plan.status === 'new') {
          const { rows } = await client.query<{ id: string }>(
            `insert into users (name, phone, email, designation_id, password_hash, can_login)
             values ($1, $2, $3, $4, $5, $6) returning id`,
            [plan.name, plan.phone, plan.email, plan.designationId, passwordHash, plan.canLogin],
          );
          id = rows[0]!.id;
          // New people can raise complaints from day one (CONTRACT section
          // 2): the Complaints member role (C3, by its fixed id). The
          // dual-write gives them today's complaints: member row with it.
          if (defaultRole) await write.changeRoles({ id, name: plan.name }, [defaultRole.id], []);
          created += 1;
        } else {
          id = plan.matched!.id;
          await client.query(
            `update users /*scope-exempt: the person this import matched by phone or email, as the preview showed*/
                set name = $2, phone = $3, email = $4, designation_id = $5,
                    can_login = $6, password_hash = coalesce($7, password_hash)
             where id = $1`,
            [id, plan.name, plan.phone, plan.email, plan.designationId, plan.canLogin, passwordHash],
          );
          updated += 1;
        }
        idByKey.set(plan.key, id);
        touched.push(plan);
      }

      // Pass 2: reports-to, now that everyone in the file has an id. Each
      // change is audited; the chain is checked once, below, for the file
      // as a whole (one edge at a time could see a loop that the finished
      // file does not have).
      for (const plan of setsReportsTo ? touched : []) {
        const id = idByKey.get(plan.key)!;
        const managerId = plan.reportsToKey
          ? (idByKey.get(plan.reportsToKey) ?? plan.reportsToKey)
          : null;
        await write.setReportsTo(id, managerId, { checkCycle: false });
      }

      // Backstop: the analysis already refused loops, but the database
      // state is what counts.
      for (const plan of touched) {
        const id = idByKey.get(plan.key)!;
        const { rows } = await client.query<{ reports_to: string | null }>(
          'select reports_to from users /*scope-exempt: a person this import created or matched*/ where id = $1',
          [id],
        );
        await assertNoCycle(client, id, rows[0]?.reports_to ?? null);
      }

      await write.finish();

      await client.query('commit');
      return { created, updated, unchanged };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

// -------------------------------------------------------------------

/** The role new people get (C3), or null when the owner has deleted it. */
async function defaultRoleOf(db: Db): Promise<{ id: string; name: string } | null> {
  const { rows } = await db.query<{ id: string; name: string }>('select id, name from roles where id = $1', [
    IMPORT_DEFAULT_ROLE_ID,
  ]);
  return rows[0] ?? null;
}

const REPORTS_TO_IGNORED =
  'Reports to is ignored: only people allowed to manage roles and people’s access can set it.';
const NO_DEFAULT_ROLE =
  'New people normally get the Complaints member role, but it has been deleted, so they will ' +
  'start with no access. Give them a role in Access › People.';

async function analyse(
  db: Db,
  input: unknown[],
  setsReportsTo: boolean,
): Promise<{ result: PreviewResult; plans: Plan[] }> {
  const defaultRole = await defaultRoleOf(db);
  const { rows: users } = await db.query<DbUser>(
    `select u.id, u.name, u.email, u.phone, u.designation_id as "designationId",
            u.reports_to as "reportsTo", u.can_login as "canLogin",
            u.password_hash as "passwordHash"
     from users u /*scope-exempt: the import matches each row to EVERY person by phone or email, so it never creates a duplicate*/`,
  );
  const { rows: designations } = await db.query<{ id: string; name: string }>(
    'select id, name from designations',
  );

  const userByPhone = new Map<string, DbUser>();
  const userByEmail = new Map<string, DbUser>();
  for (const u of users) {
    const p = phoneDigits(u.phone);
    if (p) userByPhone.set(p, u);
    if (u.email) userByEmail.set(u.email.toLowerCase(), u);
  }
  const designationByName = new Map(designations.map((d) => [d.name.trim().toLowerCase(), d]));
  const designationById = new Map(designations.map((d) => [d.id, d]));

  const plans: Plan[] = [];
  const messages: string[][] = [];
  const notes: string[][] = [];
  const seenPhone = new Map<string, string>();
  const seenPerson = new Map<string, string>();

  // ---- pass 1: each row on its own --------------------------------
  for (const [index, raw] of input.entries()) {
    const errors: string[] = [];
    const info: string[] = [];
    const row = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

    const name = text(row.name);
    if (!name) errors.push('Name is missing.');

    const phoneRaw = text(row.phone);
    const phone = phoneDigits(phoneRaw);
    if (!phone) {
      errors.push('Phone is missing. The import recognises people by their phone number.');
    } else if (phone.length < 10) {
      errors.push(`"${phoneRaw}" is not a full phone number. Enter all 10 digits.`);
    }

    const emailRaw = text(row.email);
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    if (email && !EMAIL_RE.test(email)) {
      errors.push(`"${emailRaw}" is not a complete email address.`);
    }

    // Match: phone, then email. Never name.
    const byPhone = phone && phone.length === 10 ? userByPhone.get(phone) : undefined;
    const byEmail = email ? userByEmail.get(email) : undefined;
    if (byPhone && byEmail && byPhone.id !== byEmail.id) {
      errors.push(
        `Phone ${formatPhone(phone!)} belongs to ${byPhone.name} but ${emailRaw} belongs to ` +
          `${byEmail.name}. Fix whichever is wrong.`,
      );
    }
    const matched = byPhone ?? byEmail ?? null;
    const key = matched ? matched.id : `row:${index}`;

    if (phone && phone.length === 10) {
      const earlier = seenPhone.get(phone);
      if (earlier) {
        errors.push(`${formatPhone(phone)} is also on the row for ${earlier}. Each person once.`);
      } else {
        seenPhone.set(phone, name || 'another row');
      }
    }
    if (matched) {
      const earlier = seenPerson.get(matched.id);
      if (earlier) errors.push(`This is ${matched.name} again (also on the row for ${earlier}).`);
      else seenPerson.set(matched.id, name || matched.name);
    }

    // Designation: blank keeps what an existing person has.
    let designationId = matched?.designationId ?? null;
    const designationRaw = text(row.designation);
    if (designationRaw) {
      const d = designationByName.get(designationRaw.toLowerCase());
      if (d) designationId = d.id;
      else {
        errors.push(
          `There is no designation called "${designationRaw}". Add it in Settings → ` +
            'Designations, or fix the spelling.',
        );
      }
    }

    const reportsCell = text(row.reportsToPhone);
    if (reportsCell && !setsReportsTo) info.push(REPORTS_TO_IGNORED);
    const reportsRaw = setsReportsTo ? reportsCell : '';
    const reportsToPhone = reportsRaw ? phoneDigits(reportsRaw) : null;
    if (reportsRaw && (!reportsToPhone || reportsToPhone.length < 10)) {
      errors.push(`Reports-to phone "${reportsRaw}" is not a full phone number.`);
    } else if (reportsToPhone && reportsToPhone === phone) {
      errors.push('Someone can’t report to themselves. Fix the reports-to phone.');
    }

    const canLoginAsked = bool(row.canLogin);
    if (canLoginAsked === 'invalid') {
      errors.push(`Can log in should be yes or no, not "${text(row.canLogin)}".`);
    }
    const password = text(row.password) || null;
    if (password && password.length < 8) {
      errors.push('A password needs at least 8 characters.');
    }
    const hasPassword = Boolean(password) || Boolean(matched?.passwordHash);
    let canLogin =
      canLoginAsked === true || canLoginAsked === false
        ? canLoginAsked
        : matched
          ? matched.canLogin
          : Boolean(password);
    if (canLogin && !hasPassword) {
      canLogin = false;
      info.push('No password, so they can’t sign in yet. Set one in Settings → People.');
    }

    plans.push({
      index,
      key,
      status: 'new',
      matched,
      name: name || matched?.name || '',
      phone: phone ?? '',
      email: email ?? matched?.email ?? null,
      designationId,
      reportsToPhone,
      reportsToKey: null,
      canLogin,
      password,
    });
    messages.push(errors);
    notes.push(info);
  }

  // ---- pass 2: rows against each other ----------------------------
  // Who a phone points at: the database, overlaid with the file.
  const keyByPhone = new Map<string, string>();
  for (const u of users) {
    const p = phoneDigits(u.phone);
    if (p) keyByPhone.set(p, u.id);
  }
  for (const plan of plans) if (plan.phone.length === 10) keyByPhone.set(plan.phone, plan.key);
  const nameByKey = new Map<string, string>(users.map((u) => [u.id, u.name]));
  for (const plan of plans) nameByKey.set(plan.key, plan.name);

  for (const [i, plan] of plans.entries()) {
    if (plan.reportsToPhone && plan.reportsToPhone.length === 10) {
      const target = keyByPhone.get(plan.reportsToPhone);
      if (!target) {
        messages[i]!.push(
          `Reports-to phone ${formatPhone(plan.reportsToPhone)} matches nobody, in the system or ` +
            'in this file. Add that person, or fix the number.',
        );
      } else if (target === plan.key) {
        messages[i]!.push('Someone can’t report to themselves. Fix the reports-to phone.');
      } else {
        plan.reportsToKey = target;
      }
    } else if (plan.matched) {
      plan.reportsToKey = plan.matched.reportsTo;
    }
  }

  // The state after the import: everyone in the database, with the
  // file's rows laid over them.
  const state = new Map<string, { reportsTo: string | null }>();
  for (const u of users) state.set(u.id, { reportsTo: u.reportsTo });
  for (const plan of plans) state.set(plan.key, { reportsTo: plan.reportsToKey });

  // Reporting loops.
  for (const [i, plan] of plans.entries()) {
    const path = [plan.key];
    let at = state.get(plan.key)?.reportsTo ?? null;
    while (at && path.length <= state.size) {
      if (at === plan.key) {
        const names = [...path, at].map((k) => nameByKey.get(k) ?? '?');
        messages[i]!.push(
          `Reporting loop: ${names.join(' → ')}. Someone in the chain has to report higher up.`,
        );
        break;
      }
      path.push(at);
      at = state.get(at)?.reportsTo ?? null;
    }
  }

  // ---- pass 3: status and the changes to show ---------------------
  const summary: Record<Status, number> = { new: 0, update: 0, unchanged: 0, error: 0 };
  const rows: PreviewRow[] = [];
  const designationName = (id: string | null): string | null =>
    id ? (designationById.get(id)?.name ?? null) : null;
  const personName = (k: string | null): string | null => (k ? (nameByKey.get(k) ?? null) : null);

  for (const [i, plan] of plans.entries()) {
    const errors = messages[i]!;
    const changes: Change[] = [];
    const m = plan.matched;
    const diff = (field: string, from: string | null, to: string | null): void => {
      if ((from ?? null) !== (to ?? null)) changes.push({ field, from: from ?? null, to: to ?? null });
    };

    diff('name', m?.name ?? null, plan.name || null);
    diff('phone', m ? phoneDigits(m.phone) : null, plan.phone || null);
    // Case-insensitive, like the unique index: "Priya@X" is "priya@x".
    if ((m?.email?.toLowerCase() ?? null) !== (plan.email?.toLowerCase() ?? null)) {
      changes.push({ field: 'email', from: m?.email ?? null, to: plan.email });
    }
    diff('designation', designationName(m?.designationId ?? null), designationName(plan.designationId));
    diff('reportsTo', personName(m?.reportsTo ?? null), personName(plan.reportsToKey));
    if (!m || m.canLogin !== plan.canLogin) {
      diff('canLogin', m ? String(m.canLogin) : null, String(plan.canLogin));
    }
    if (plan.password) {
      const same = m?.passwordHash ? await compare(plan.password, m.passwordHash) : false;
      if (same) plan.password = null;
      else changes.push({ field: 'password', from: m?.passwordHash ? 'set' : null, to: 'new password' });
    }
    if (!m && defaultRole) changes.push({ field: 'modules', from: null, to: 'complaints: member' });
    if (!m && !defaultRole) notes[i]!.push(NO_DEFAULT_ROLE);

    const status: Status =
      errors.length > 0 ? 'error' : !m ? 'new' : changes.length > 0 ? 'update' : 'unchanged';
    plan.status = status;
    summary[status] += 1;
    rows.push({
      index: plan.index,
      status,
      ...(m ? { matchedUserId: m.id } : {}),
      changes: status === 'error' ? [] : changes,
      messages: [...errors, ...(status === 'unchanged' ? [] : notes[i]!)],
    });
  }

  return {
    result: { rows, summary },
    plans,
  };
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  throw new BadRequestException('Each cell must be text, a number or yes/no.');
}

function bool(value: unknown): boolean | undefined | 'invalid' {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = text(value).toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  return 'invalid';
}
