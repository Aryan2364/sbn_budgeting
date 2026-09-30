import {
  BadRequestException, Body, Controller, HttpCode, Inject, Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { ArrayMaxSize, IsArray } from 'class-validator';
import type { Pool, PoolClient } from 'pg';

import { ModuleRole } from '../common/module-access.decorator';
import { assertOneEach, oneEachMessage, ONE_EACH_KEYS } from '../common/one-each';
import { phoneDigits } from '../common/phone';
import { PG_POOL } from '../db/db.module';
import { formatPhone } from './users.controller';
import { assertNoCycle, replaceLocations } from './user-writes';

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
  newLocations: string[];
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
  locationIds: string[];
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
  /** Lower-cased location names; new ones do not have an id yet. */
  locationKeys: string[];
  locationsChanged: boolean;
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
 * so re-importing a partial sheet cannot wipe designations or
 * locations. Re-committing the same file reports every row unchanged.
 */
@Controller('users/import')
export class UsersImportController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Post('preview')
  @HttpCode(200)
  @ModuleRole('platform', 'admin')
  async preview(@Body() body: ImportDto): Promise<PreviewResult> {
    const { result } = await analyse(this.pool, body.rows);
    return result;
  }

  @Post('commit')
  @HttpCode(200)
  @ModuleRole('platform', 'admin')
  async commit(
    @Body() body: ImportDto,
  ): Promise<{ created: number; updated: number; unchanged: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // One import at a time, so two admins cannot both create "Vesu".
      await client.query(`select pg_advisory_xact_lock(hashtext('users-import'))`);

      const { result, plans } = await analyse(client, body.rows);
      if (result.summary.error > 0) {
        const n = result.summary.error;
        throw new UnprocessableEntityException(
          `${n} ${n === 1 ? 'row has a problem' : 'rows have problems'}, so nothing was imported. ` +
            'Fix them in the file and preview again.',
        );
      }

      // Missing locations first, so every row can point at one.
      for (const name of result.newLocations) {
        await client.query('insert into locations (name) values ($1) on conflict (name) do nothing', [
          name,
        ]);
      }
      const { rows: locRows } = await client.query<{ id: string; name: string }>(
        'select id, name from locations',
      );
      const locationId = new Map(locRows.map((l) => [l.name.trim().toLowerCase(), l.id]));

      const idByKey = new Map<string, string>();
      const touched: Plan[] = [];
      let created = 0;
      let updated = 0;
      let unchanged = 0;

      // Pass 1: the people and their locations.
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
          // New people can raise complaints from day one (CONTRACT section 2).
          await client.query(
            `insert into user_module_access (user_id, module, role)
             values ($1, 'complaints', 'member') on conflict do nothing`,
            [id],
          );
          created += 1;
        } else {
          id = plan.matched!.id;
          await client.query(
            `update users set name = $2, phone = $3, email = $4, designation_id = $5,
                    can_login = $6, password_hash = coalesce($7, password_hash)
             where id = $1`,
            [id, plan.name, plan.phone, plan.email, plan.designationId, plan.canLogin, passwordHash],
          );
          updated += 1;
        }
        idByKey.set(plan.key, id);
        if (plan.status === 'new' || plan.locationsChanged) {
          const ids = plan.locationKeys.map((k) => locationId.get(k)!);
          await replaceLocations(client, id, ids);
        }
        touched.push(plan);
      }

      // Pass 2: reports-to, now that everyone in the file has an id.
      for (const plan of touched) {
        const id = idByKey.get(plan.key)!;
        const managerId = plan.reportsToKey
          ? (idByKey.get(plan.reportsToKey) ?? plan.reportsToKey)
          : null;
        await client.query('update users set reports_to = $2 where id = $1', [id, managerId]);
      }

      // Backstops: the analysis already refused both, but the database
      // state is what counts.
      for (const plan of touched) {
        const id = idByKey.get(plan.key)!;
        const { rows } = await client.query<{ reports_to: string | null }>(
          'select reports_to from users where id = $1',
          [id],
        );
        await assertNoCycle(client, id, rows[0]?.reports_to ?? null);
      }
      await assertOneEach(
        client,
        touched.map((p) => idByKey.get(p.key)!),
      );

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

async function analyse(
  db: Db,
  input: unknown[],
): Promise<{ result: PreviewResult; plans: Plan[] }> {
  const { rows: users } = await db.query<DbUser>(
    `select u.id, u.name, u.email, u.phone, u.designation_id as "designationId",
            u.reports_to as "reportsTo", u.can_login as "canLogin",
            u.password_hash as "passwordHash",
            array(select ul.location_id::text from user_locations ul
                  where ul.user_id = u.id) as "locationIds"
     from users u`,
  );
  const { rows: designations } = await db.query<{
    id: string; name: string; seedKey: string | null;
  }>('select id, name, seed_key as "seedKey" from designations');
  const { rows: locations } = await db.query<{ id: string; name: string }>(
    'select id, name from locations',
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
  const locationByKey = new Map(locations.map((l) => [l.name.trim().toLowerCase(), l]));
  const locationKeyById = new Map(locations.map((l) => [l.id, l.name.trim().toLowerCase()]));

  const newLocations = new Map<string, string>(); // key -> spelling from the file
  const locationLabel = (key: string): string =>
    locationByKey.get(key)?.name ?? newLocations.get(key) ?? key;

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

    // Locations: blank keeps an existing person's; unknown names are created.
    const listed = list(row.locations);
    const currentKeys = (matched?.locationIds ?? [])
      .map((id) => locationKeyById.get(id))
      .filter((k): k is string => Boolean(k));
    let locationKeys = currentKeys;
    if (listed.length > 0) {
      locationKeys = [];
      for (const label of listed) {
        const k = label.toLowerCase();
        if (locationKeys.includes(k)) continue;
        locationKeys.push(k);
        if (!locationByKey.has(k) && !newLocations.has(k)) newLocations.set(k, label);
      }
    }
    const locationsChanged = !sameSet(locationKeys, currentKeys);

    const reportsRaw = text(row.reportsToPhone);
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
      locationKeys,
      locationsChanged,
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
  interface State {
    designationId: string | null;
    locationKeys: string[];
    reportsTo: string | null;
  }
  const state = new Map<string, State>();
  for (const u of users) {
    state.set(u.id, {
      designationId: u.designationId,
      locationKeys: u.locationIds.map((id) => locationKeyById.get(id)!).filter(Boolean),
      reportsTo: u.reportsTo,
    });
  }
  for (const plan of plans) {
    state.set(plan.key, {
      designationId: plan.designationId,
      locationKeys: plan.locationKeys,
      reportsTo: plan.reportsToKey,
    });
  }

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

  // One supervisor and one manager per location.
  const planIndexByKey = new Map(plans.map((p, i) => [p.key, i]));
  for (const seedKey of ONE_EACH_KEYS) {
    const designation = designations.find((d) => d.seedKey === seedKey);
    if (!designation) continue;
    const holders = new Map<string, string[]>();
    for (const [k, s] of state) {
      if (s.designationId !== designation.id) continue;
      for (const loc of s.locationKeys) holders.set(loc, [...(holders.get(loc) ?? []), k]);
    }
    for (const [loc, keys] of holders) {
      if (keys.length < 2) continue;
      for (const k of keys) {
        const i = planIndexByKey.get(k);
        if (i === undefined) continue;
        // Name someone already in the database first: that is who the
        // admin has to move.
        const other =
          keys.find((o) => o !== k && !planIndexByKey.has(o)) ?? keys.find((o) => o !== k)!;
        messages[i]!.push(
          oneEachMessage(locationLabel(loc), designation.name, nameByKey.get(other) ?? '?'),
        );
      }
    }
  }

  // ---- pass 3: status and the changes to show ---------------------
  const summary: Record<Status, number> = { new: 0, update: 0, unchanged: 0, error: 0 };
  const rows: PreviewRow[] = [];
  const designationName = (id: string | null): string | null =>
    id ? (designationById.get(id)?.name ?? null) : null;
  const locationsLabel = (keys: string[]): string | null =>
    keys.length ? keys.map(locationLabel).sort((a, b) => a.localeCompare(b)).join(', ') : null;
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
    diff(
      'locations',
      locationsLabel(m ? m.locationIds.map((id) => locationKeyById.get(id)!).filter(Boolean) : []),
      locationsLabel(plan.locationKeys),
    );
    diff('reportsTo', personName(m?.reportsTo ?? null), personName(plan.reportsToKey));
    if (!m || m.canLogin !== plan.canLogin) {
      diff('canLogin', m ? String(m.canLogin) : null, String(plan.canLogin));
    }
    if (plan.password) {
      const same = m?.passwordHash ? await compare(plan.password, m.passwordHash) : false;
      if (same) plan.password = null;
      else changes.push({ field: 'password', from: m?.passwordHash ? 'set' : null, to: 'new password' });
    }
    if (!m) changes.push({ field: 'modules', from: null, to: 'complaints: member' });

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
    result: {
      rows,
      newLocations: [...newLocations.values()].sort((a, b) => a.localeCompare(b)),
      summary,
    },
    plans,
  };
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  throw new BadRequestException('Each cell must be text, a number or yes/no.');
}

/** A list cell: an array, or "Vesu, Adajan" in one cell. */
function list(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.map(text) : text(value).split(/[,;\n]/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function bool(value: unknown): boolean | undefined | 'invalid' {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const v = text(value).toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  return 'invalid';
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
