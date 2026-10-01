import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Transform } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength,
} from 'class-validator';
import type { Pool, PoolClient } from 'pg';

import {
  findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgConstraint,
} from '../common/crud';
import { CurrentUser, type AuthModules, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type MatchInfo } from '../common/list-query';
import { ModuleRole, type ModuleName } from '../common/module-access.decorator';
import { normalisePhone, PHONE_SQL } from '../common/phone';
import { PG_POOL } from '../db/db.module';
import { applyModules, assertNoCycle, MODULE_ROLES, type ModulesPatch } from './user-writes';

const blankToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/**
 * CONTRACT section 2. POST needs `name` and `canLogin`; on PATCH every
 * key is optional and a key that is left out is left alone. `null`
 * clears a field; in `modules`, `null` removes that module.
 *
 * People have no locations any more (removed 1 Oct 2026, user decision):
 * a `locationIds` key from a cached frontend is stripped by the global
 * whitelist pipe and has no effect.
 */
export class UserDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Enter the person’s name' })
  name?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsEmail({}, { message: 'Enter a complete email address, like name@company.com' })
  email?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  phone?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsUUID('all', { message: 'Choose a designation from the list' })
  designationId?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @IsUUID('all', { message: 'Choose who they report to from the list' })
  reportsToId?: string | null;

  @IsOptional()
  @IsObject()
  modules?: Record<string, unknown>;

  /**
   * The budget role under its old name. The budget people screen sent
   * it before modules existed; accepted as `modules.budget` so a cached
   * frontend keeps working through the deploy. `modules.budget` wins.
   */
  @IsOptional()
  @IsIn(['admin', 'staff'], { message: 'Choose a role' })
  role?: 'admin' | 'staff';

  @IsOptional()
  @IsBoolean()
  canLogin?: boolean;

  /** Only sent when setting or changing one. Never returned. */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A password needs at least 8 characters' })
  password?: string;
}

interface Person {
  id: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  canLogin: boolean;
  designation: Person | null;
  reportsTo: Person | null;
  modules: AuthModules;
  /**
   * What points at this person. `remove` refuses while any is above
   * zero, and the SCREEN has to know that before it offers the delete —
   * a control that fails after being clicked is not allowed. Counted
   * rather than a boolean so the reason can name the number.
   */
  siteCount: number;
  expenseCount: number;
  /** Complaints not yet closed that this person is routed on. */
  openComplaintCount: number;
}

const FROM = `
  users u
  left join designations d on d.id = u.designation_id
  left join users r on r.id = u.reports_to
  left join lateral (
    select
      (select count(*)::int from sites s
        where s.manager_id = u.id or s.supervisor_id = u.id) as site_count,
      (select count(*)::int from expenses e where e.created_by = u.id) as expense_count,
      (select count(*)::int from complaints c
        where c.status <> 'closed'
          and u.id in (c.supervisor_id, c.manager_id, c.hod_id, c.ceo_id, c.approver_id))
        as open_complaint_count
  ) c on true
  left join lateral (
    select coalesce(json_object_agg(m.module, m.role), '{}'::json) as modules
    from user_module_access m where m.user_id = u.id
  ) mods on true`;

const SELECT = `
  u.id, u.name, u.email, u.phone, u.can_login as "canLogin",
  case when d.id is null then null else json_build_object('id', d.id, 'name', d.name) end
    as designation,
  case when r.id is null then null else json_build_object('id', r.id, 'name', r.name) end
    as "reportsTo",
  mods.modules,
  c.site_count as "siteCount", c.expense_count as "expenseCount",
  c.open_complaint_count as "openComplaintCount"`;

const BUDGET_ROLE_SQL = `(select m.role from user_module_access m
                          where m.user_id = u.id and m.module = 'budget')`;

/** "9825012345" -> "98250 12345", the way people read a number back. */
export function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

/**
 * One list of people, shared by every module (plan 3.1). The budget
 * site form, the locations screen and complaint reassignment all pick
 * from it, so **reading is open to anyone signed in**; writing is
 * platform admin only (CONTRACT section 1).
 */
@Controller('users')
export class UsersController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  list(
    @Query() query: ListQueryDto,
    @Query('designationId') designationId?: string,
    @Query('module') module?: string,
    @Query('canLogin') canLogin?: string,
    @Query('role') role?: string,
  ): Promise<ListResult<UserRow & MatchInfo>> {
    return runListQuery<UserRow>(
      this.pool,
      {
        from: FROM,
        select: SELECT,
        titleField: { sql: 'u.name', label: 'Name' },
        // Search covers every meaningful text field. password_hash is
        // excluded for the obvious reason and that is the only exclusion.
        searchFields: [
          { sql: 'u.email', label: 'Email' },
          { sql: 'u.phone', label: 'Phone' },
          { sql: 'd.name', label: 'Designation' },
          { sql: 'r.name', label: 'Reports to' },
        ],
        sortable: {
          name: 'u.name',
          email: 'u.email',
          phone: 'u.phone',
          // By the designation's name: designations have no order of
          // their own that anyone sets or sees.
          designation: 'd.name',
          reportsTo: 'r.name',
          createdAt: 'u.created_at',
          role: BUDGET_ROLE_SQL,
        },
        defaultSort: { key: 'name', direction: 'asc' },
        filters: {
          // `none` finds the people nobody has given a designation yet.
          designationId: (value, param) =>
            value === 'none'
              ? 'u.designation_id is null'
              : `u.designation_id = ${param(uuidOr400(value, 'designationId'))}`,
          // `budget` = any budget role; `budget:admin` = that role only.
          module: (value, param) => {
            const [mod, modRole] = value.split(':');
            if (!mod || !(mod in MODULE_ROLES)) {
              throw new BadRequestException(
                `module must be one of ${Object.keys(MODULE_ROLES).join(', ')}, optionally :role`,
              );
            }
            return `exists (select 1 from user_module_access f
                            where f.user_id = u.id and f.module = ${param(mod)}
                            ${modRole ? `and f.role = ${param(modRole)}` : ''})`;
          },
          canLogin: (value, param) => `u.can_login = ${param(value === 'true')}`,
          // The old budget-role filter, kept for a cached frontend.
          role: (value, param) => `${BUDGET_ROLE_SQL} = ${param(value)}`,
        },
      },
      { ...query, filters: { designationId, module, canLogin, role } },
    );
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserRow> {
    return findOneOrFail<UserRow>(
      this.pool,
      `select ${SELECT} from ${FROM} where u.id = $1`,
      [id],
      'person',
    );
  }

  @Post()
  @ModuleRole('platform', 'admin')
  async create(@Body() body: UserDto): Promise<UserRow> {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Enter the person’s name');
    if (body.canLogin === undefined) {
      throw new BadRequestException('Say whether this person can sign in');
    }
    const email = body.email?.trim() || null;
    const phone = normalisePhone(body.phone);
    const modules = parseModules(body);
    assertLoginCredentials(body.canLogin, email, phone, Boolean(body.password));
    await this.assertReferences(body);
    await this.assertUnique(email, phone, null);

    const passwordHash = body.password ? await hash(body.password, 12) : null;
    const canLogin = body.canLogin;
    const id = await this.inTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into users (name, email, phone, designation_id, reports_to, password_hash, can_login)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [name, email, phone, body.designationId ?? null, body.reportsToId ?? null,
         passwordHash, canLogin],
      );
      const newId = rows[0]!.id;
      await applyModules(client, newId, modules);
      return newId;
    });
    return this.get(id);
  }

  @Patch(':id')
  @ModuleRole('platform', 'admin')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UserDto,
    @CurrentUser() me: AuthUser,
  ): Promise<UserRow> {
    const existing = await findOneOrFail<{
      email: string | null; phone: string | null; canLogin: boolean; hasPassword: boolean;
    }>(
      this.pool,
      `select email, phone, can_login as "canLogin",
              (password_hash is not null) as "hasPassword"
       from users where id = $1`,
      [id],
      'person',
    );

    if (body.name !== undefined && !body.name.trim()) {
      throw new BadRequestException('Enter the person’s name');
    }
    const email = body.email === undefined ? existing.email : body.email?.trim() || null;
    const phone = body.phone === undefined ? existing.phone : normalisePhone(body.phone);
    const canLogin = body.canLogin ?? existing.canLogin;
    const modules = parseModules(body);

    if (id === me.id && modules.platform === null && me.modules.platform) {
      throw new UnprocessableEntityException(
        'You can’t remove your own platform admin, or nobody might be left to manage people. ' +
          'Ask another platform admin to change it.',
      );
    }
    assertLoginCredentials(canLogin, email, phone, Boolean(body.password) || existing.hasPassword);
    await this.assertReferences(body);
    await this.assertUnique(email, phone, id);

    const passwordHash = body.password ? await hash(body.password, 12) : null;
    await this.inTransaction(async (client) => {
      // Checked against the chain as it stands, before this edge exists.
      if (body.reportsToId !== undefined) await assertNoCycle(client, id, body.reportsToId);
      await client.query(
        `update users set
           name           = coalesce($2, name),
           email          = $3,
           phone          = $4,
           designation_id = case when $5 then $6::uuid else designation_id end,
           reports_to     = case when $7 then $8::uuid else reports_to end,
           can_login      = $9,
           password_hash  = coalesce($10, password_hash)
         where id = $1`,
        [id, body.name?.trim() ?? null, email, phone,
         body.designationId !== undefined, body.designationId ?? null,
         body.reportsToId !== undefined, body.reportsToId ?? null,
         canLogin, passwordHash],
      );
      await applyModules(client, id, modules);
    });
    return this.get(id);
  }

  @Delete(':id')
  @ModuleRole('platform', 'admin')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() me: AuthUser,
  ): Promise<void> {
    // Deleting yourself logs you out of an account you can no longer
    // sign back into. Refused rather than confirmed.
    if (id === me.id) {
      throw new ConflictException('You can’t delete your own account.');
    }
    const row = await this.get(id);
    const n = row.openComplaintCount;
    if (n > 0) {
      const what = n === 1 ? 'open complaint' : 'open complaints';
      throw new ConflictException(
        `${row.name} is on ${n} ${what}. Reassign their ${n} ${what} first.`,
      );
    }
    if (row.siteCount > 0 || row.expenseCount > 0) {
      throw new ConflictException(
        `${row.name} is named on a site or has booked expenses. Remove those links first, ` +
          'or turn off their sign-in instead.',
      );
    }
    const { rows } = await this.pool.query<{ count: number }>(
      'select count(*)::int as count from users where reports_to = $1',
      [id],
    );
    const reports = rows[0]?.count ?? 0;
    if (reports > 0) {
      throw new ConflictException(
        `${reports} ${reports === 1 ? 'person reports' : 'people report'} to ${row.name}. ` +
          'Change who they report to first.',
      );
    }
    try {
      await this.pool.query('delete from users where id = $1', [id]);
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          `${row.name} appears in the history of past complaints, so they can’t be deleted. ` +
            'Turn off their sign-in instead.',
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------

  private async inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(
          pgConstraint(error) === 'users_phone_unique'
            ? 'That phone number is already used by someone else. Each person needs their own.'
            : 'That email address is already used by someone else.',
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** The chosen designation and manager exist (422 otherwise). */
  private async assertReferences(body: UserDto): Promise<void> {
    if (body.designationId) {
      const { rowCount } = await this.pool.query('select 1 from designations where id = $1', [
        body.designationId,
      ]);
      if (!rowCount) {
        throw new UnprocessableEntityException(
          'That designation no longer exists. Refresh and choose again.',
        );
      }
    }
    if (body.reportsToId) {
      const { rowCount } = await this.pool.query('select 1 from users where id = $1', [
        body.reportsToId,
      ]);
      if (!rowCount) {
        throw new UnprocessableEntityException(
          'The person they report to no longer exists. Refresh and choose again.',
        );
      }
    }
  }

  /** Names the other person, which the unique index alone cannot do. */
  private async assertUnique(
    email: string | null,
    phone: string | null,
    exceptId: string | null,
  ): Promise<void> {
    if (!email && !phone) return;
    const { rows } = await this.pool.query<{ name: string; emailClash: boolean }>(
      `select name, (email is not null and lower(email) = lower($1)) as "emailClash"
       from users
       where ($3::uuid is null or id <> $3::uuid)
         and ((email is not null and lower(email) = lower($1))
              or (phone is not null and phone <> '' and ${PHONE_SQL('phone')} = $2))
       limit 1`,
      [email, phone, exceptId],
    );
    const clash = rows[0];
    if (!clash) return;
    throw new ConflictException(
      clash.emailClash
        ? `${email} is already used by ${clash.name}. Each person needs their own email address.`
        : `${formatPhone(phone ?? '')} is already used by ${clash.name}. ` +
            'Each person needs their own phone number.',
    );
  }
}

/**
 * The table constraint refuses a login-enabled row with nothing to log
 * in with, but a constraint violation is a 500 nobody can act on. This
 * is the same rule, said in words.
 */
function assertLoginCredentials(
  canLogin: boolean,
  email: string | null,
  phone: string | null,
  hasPassword: boolean,
): void {
  if (!canLogin) return;
  if (!email && !phone) {
    throw new BadRequestException(
      'Someone who signs in needs an email address or a phone number. Add one, or turn off sign-in.',
    );
  }
  if (!hasPassword) {
    throw new BadRequestException(
      'Someone who signs in needs a password. Set one, or turn off sign-in.',
    );
  }
}

/** Validates the modules patch against the roles 0009 allows. */
function parseModules(body: UserDto): ModulesPatch {
  const raw: Record<string, unknown> = { ...(body.modules ?? {}) };
  if (body.role && raw.budget === undefined) raw.budget = body.role;
  const patch: Record<string, string | null> = {};
  for (const [module, role] of Object.entries(raw)) {
    if (role === undefined) continue;
    const allowed = MODULE_ROLES[module as ModuleName];
    if (!allowed) {
      throw new BadRequestException(
        `There is no module called "${module}". Use ${Object.keys(MODULE_ROLES).join(', ')}.`,
      );
    }
    if (role !== null && (typeof role !== 'string' || !allowed.includes(role))) {
      throw new BadRequestException(
        `${module} access is ${allowed.join(' or ')}, or null to remove it.`,
      );
    }
    patch[module] = role;
  }
  return patch as ModulesPatch;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOr400(value: string, key: string): string {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${key} must be an id`);
  return value;
}
