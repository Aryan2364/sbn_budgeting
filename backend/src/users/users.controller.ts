import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get,
  HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Transform } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength,
} from 'class-validator';
import type { Pool, PoolClient } from 'pg';

import { type AccessContext, CurrentAccess, can } from '../access/access-context';
import { AccessService } from '../access/access.service';
import type { AuditActor } from '../access/audit';
import { ACCESS_MANAGE_KEY } from '../access/catalogue';
import { Can, PickOf } from '../access/decorators';
import { reasonFor } from '../access/permission.guard';
import { type Param as SqlParam, type RecordCan, assertRecordAccess, canSelect, scopeWhere } from '../access/scope';
import {
  findOneOrFail, isPgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgConstraint,
} from '../common/crud';
import { CurrentUser, type AuthModules, type AuthUser } from '../common/current-user';
import { ListQueryDto } from '../common/list-query.dto';
import { runListQuery, type ListResult, type ListScope, type MatchInfo } from '../common/list-query';
import { ModuleRole, type ModuleName } from '../common/module-access.decorator';
import { normalisePhone, PHONE_SQL } from '../common/phone';
import { PG_POOL } from '../db/db.module';
import { applyModules, MODULE_ROLES, type ModulesPatch } from './user-writes';

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

  /**
   * "This person is current" (plan 3.4.9). An access field: changing it
   * needs access.rights.manage (O8) and is audited. PATCH only.
   */
  @IsOptional()
  @IsBoolean()
  active?: boolean;

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
  /**
   * What the caller may do with this person (plan 6.1.4 item 6), for the
   * actions they hold at some scope: `true`, or the reason they may not.
   * Computed in the same query as the row. Today's own rules (open
   * complaints, sites, reports) still answer on the request itself.
   */
  can: RecordCan;
}

/** The row actions the people screens offer, and the key each needs. */
const PERSON_ACTIONS = { edit: 'platform.people.edit', delete: 'platform.people.delete' } as const;

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

/** findOneOrFail's wording for a person, kept for a scope miss too (R7). */
const PERSON_NOT_FOUND = 'That person no longer exists. It may have been deleted.';

/** "9825012345" -> "98250 12345", the way people read a number back. */
export function formatPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

/**
 * What `GET /users/picker` returns for one person: enough to pick them
 * by name, and nothing else. No phone, no email, no module roles.
 */
export interface PersonOption {
  id: string;
  name: string;
  designationName: string | null;
}

// Shared by the full list, the picker and the people Pick
// (pick/platform-pick.controller.ts), so they cannot drift.
// `none` finds the people nobody has given a designation yet.
export const designationFilter = (value: string, param: (v: unknown) => string): string =>
  value === 'none'
    ? 'u.designation_id is null'
    : `u.designation_id = ${param(uuidOr400(value, 'designationId'))}`;

const canLoginFilter = (value: string, param: (v: unknown) => string): string =>
  `u.can_login = ${param(value === 'true')}`;

/**
 * One list of people, shared by every module (plan 3.1).
 *
 * The full record (phone, email, module roles) is platform admin only,
 * reading as well as writing (CONTRACT section 1). Every other screen
 * that only has to PICK a person (the budget site form, complaint
 * reassignment, "reports to") reads the people Pick,
 * `GET /pick/platform/people?q=` (names and designations only, searched
 * on the server, at most 50), or its older alias `GET /users/picker`.
 * Your own profile is `GET /auth/me`.
 *
 * Scope (access plan 6.1.4): the list and a person's record go through
 * platform.people.view; editing and deleting check the person against
 * the view scope (404) and the action's scope (403) first.
 */
@Controller('users')
export class UsersController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly access: AccessService,
  ) {}

  /**
   * A person picker's options. Declared before `:id` so "picker" is
   * never read as an id. Same pagination, sort and filter conventions
   * as every list.
   *
   * ALIAS of `GET /pick/platform/people` (access plan 5.3.5), kept with
   * today's paginated shape and `canLogin` filter until the screens have
   * moved to the Pick (P7, P8). P11 deletes it.
   *
   * Scoped by the people Pick (platform.people.pick) the caller holds.
   * Until P9 the OLD guard still decides this route and lets every
   * signed-in user in, so a caller with no Pick (people with no role,
   * D4) is answered exactly as before roles; from P9 the new guard
   * refuses them (403) before this runs, and P9 deletes that branch.
   */
  @PickOf('platform.people')
  @Get('picker')
  picker(
    @Query() query: ListQueryDto,
    @CurrentAccess() access: AccessContext,
    @Query('designationId') designationId?: string,
    @Query('canLogin') canLogin?: string,
  ): Promise<ListResult<PersonOption & MatchInfo>> {
    const holdsPick = can(access, 'platform.people.pick');
    const scope: ListScope = holdsPick
      ? { key: 'platform.people.pick', record: 'person', alias: 'u' }
      : { unscoped: 'legacy-until-p9', why: 'D4: no people Pick; the old guard lets them in until P9.' };
    return runListQuery<PersonOption>(
      this.pool,
      {
        scope,
        ...(holdsPick
          ? {}
          : { baseWhere: '/*scope-exempt: D4, the answer today to a signed-in caller with no people Pick, until P9 refuses them*/ true' }),
        from: `users u left join designations d on d.id = u.designation_id`,
        select: `u.id, u.name, d.name as "designationName"`,
        titleField: { sql: 'u.name', label: 'Name' },
        // Section 27.1: name and designation are the only fields this
        // endpoint shows, so they are the only ones it searches. Matching
        // on phone or email here would let anyone signed in probe for
        // them a character at a time.
        searchFields: [{ sql: 'd.name', label: 'Designation' }],
        sortable: { name: 'u.name', designation: 'd.name' },
        defaultSort: { key: 'name', direction: 'asc' },
        filters: { designationId: designationFilter, canLogin: canLoginFilter },
      },
      { ...query, filters: { designationId, canLogin } },
      access,
    );
  }

  @Get()
  @ModuleRole('platform', 'admin')
  @Can('platform.people.view')
  list(
    @Query() query: ListQueryDto,
    @CurrentAccess() access: AccessContext,
    @Query('designationId') designationId?: string,
    @Query('module') module?: string,
    @Query('canLogin') canLogin?: string,
    @Query('role') role?: string,
  ): Promise<ListResult<UserRow & MatchInfo>> {
    return runListQuery<UserRow>(
      this.pool,
      {
        scope: { key: 'platform.people.view', record: 'person', alias: 'u' },
        can: PERSON_ACTIONS,
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
          designationId: designationFilter,
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
          canLogin: canLoginFilter,
          // The old budget-role filter, kept for a cached frontend.
          role: (value, param) => `${BUDGET_ROLE_SQL} = ${param(value)}`,
        },
      },
      { ...query, filters: { designationId, module, canLogin, role } },
      access,
    );
  }

  @Get(':id')
  @ModuleRole('platform', 'admin')
  @Can('platform.people.view')
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAccess() access: AccessContext,
  ): Promise<UserRow> {
    return this.load(id, access);
  }

  @Post()
  @ModuleRole('platform', 'admin')
  @Can('platform.people.create')
  async create(
    @Body() body: UserDto,
    @CurrentUser() me: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<UserRow> {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Enter the person’s name');
    if (body.canLogin === undefined) {
      throw new BadRequestException('Say whether this person can sign in');
    }
    const email = body.email?.trim() || null;
    const phone = normalisePhone(body.phone);
    const modules = parseModules(body);
    // Access parts of a new person (O8, plan 5.3.4): their module levels
    // (the compatibility shim, as seed roles) and who they report to.
    const givesModules = Object.values(modules).some((role) => role !== null && role !== undefined);
    if (givesModules || body.reportsToId) assertCanManageAccess(access);
    assertLoginCredentials(body.canLogin, email, phone, Boolean(body.password));
    await this.assertReferences(body);
    await this.assertUnique(email, phone, null);

    const passwordHash = body.password ? await hash(body.password, 12) : null;
    const canLogin = body.canLogin;
    const id = await this.inTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into users (name, email, phone, designation_id, password_hash, can_login)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [name, email, phone, body.designationId ?? null, passwordHash, canLogin],
      );
      const newId = rows[0]!.id;
      if (givesModules || body.reportsToId) {
        const write = await this.access.begin(client, actorOf(me));
        // Today's level rows, then the seed roles they mean (plan 5.5).
        await applyModules(client, newId, modules);
        await write.applyModulesPatch({ id: newId, name }, modules);
        if (body.reportsToId) await write.setReportsTo(newId, body.reportsToId);
        await write.finish();
      }
      return newId;
    });
    // The person this request just created, read back for the response.
    return this.load(id, access, { justCreated: true });
  }

  @Patch(':id')
  @ModuleRole('platform', 'admin')
  // The access fields (modules, active, reportsToId) also need
  // access.rights.manage (O8), checked in the handler when they change.
  @Can('platform.people.edit')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UserDto,
    @CurrentUser() me: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<UserRow> {
    // Out of the caller's view scope: 404, as if it did not exist (R7).
    // Visible but outside their edit scope: 403 with the reason.
    await assertRecordAccess(this.pool, access, {
      table: 'users', alias: 'u', record: 'person', id,
      view: 'platform.people.view', action: 'platform.people.edit', notFound: PERSON_NOT_FOUND,
    });
    const existing = await findOneOrFail<{
      email: string | null; phone: string | null; canLogin: boolean; hasPassword: boolean;
      active: boolean; reportsTo: string | null; modules: Record<string, string>;
    }>(
      this.pool,
      `select email, phone, can_login as "canLogin",
              (password_hash is not null) as "hasPassword",
              active, reports_to as "reportsTo",
              (select coalesce(json_object_agg(m.module, m.role), '{}'::json)
               from user_module_access m where m.user_id = users.id) as modules
       from users /*scope-exempt: the person assertRecordAccess just checked*/ where id = $1`,
      [id],
      'person',
    );

    if (body.name !== undefined && !body.name.trim()) {
      throw new BadRequestException('Enter the person’s name');
    }
    const email = body.email === undefined ? existing.email : body.email?.trim() || null;
    const phone = body.phone === undefined ? existing.phone : normalisePhone(body.phone);
    const canLogin = body.canLogin ?? existing.canLogin;
    // Only what actually changes is an access write: the form resends every field.
    const modules = Object.fromEntries(
      Object.entries(parseModules(body)).filter(
        ([module, role]) => role !== undefined && (role ?? null) !== (existing.modules[module] ?? null),
      ),
    ) as ModulesPatch;
    const changesModules = Object.keys(modules).length > 0;
    const changesActive = body.active !== undefined && body.active !== existing.active;
    const changesReportsTo = body.reportsToId !== undefined && (body.reportsToId ?? null) !== existing.reportsTo;
    if (changesModules || changesActive || changesReportsTo) assertCanManageAccess(access);
    // Turning off the sign-in of the last person who can manage access is
    // refused like removing their Admin (D5): it runs under the access lock.
    const turnsOffSignIn = existing.canLogin && !canLogin;

    assertLoginCredentials(canLogin, email, phone, Boolean(body.password) || existing.hasPassword);
    await this.assertReferences(body);
    await this.assertUnique(email, phone, id);

    const passwordHash = body.password ? await hash(body.password, 12) : null;
    await this.inTransaction(async (client) => {
      const write =
        changesModules || changesActive || changesReportsTo || turnsOffSignIn
          ? await this.access.begin(client, actorOf(me))
          : null;
      await client.query(
        `update users /*scope-exempt: the person assertRecordAccess checked above*/ set
           name           = coalesce($2, name),
           email          = $3,
           phone          = $4,
           designation_id = case when $5 then $6::uuid else designation_id end,
           can_login      = $7,
           password_hash  = coalesce($8, password_hash)
         where id = $1`,
        [id, body.name?.trim() ?? null, email, phone,
         body.designationId !== undefined, body.designationId ?? null,
         canLogin, passwordHash],
      );
      if (!write) return;
      // The access parts, audited, under the access lock (plan 6.1.11).
      const person = await write.person(id);
      if (changesModules) {
        // Today's level rows, then the seed roles they mean (plan 5.5).
        await applyModules(client, id, modules);
        await write.applyModulesPatch(person, modules);
      }
      if (changesActive) await write.setActive(id, body.active!);
      // Checks the chain as it stands for a loop, then rebuilds the closure.
      if (changesReportsTo) await write.setReportsTo(id, body.reportsToId ?? null);
      await write.finish();
    });
    return this.load(id, access);
  }

  @Delete(':id')
  @ModuleRole('platform', 'admin')
  @Can('platform.people.delete')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() me: AuthUser,
    @CurrentAccess() access: AccessContext,
  ): Promise<void> {
    // Deleting yourself logs you out of an account you can no longer
    // sign back into. Refused rather than confirmed.
    if (id === me.id) {
      throw new ConflictException('You can’t delete your own account.');
    }
    await assertRecordAccess(this.pool, access, {
      table: 'users', alias: 'u', record: 'person', id,
      view: 'platform.people.view', action: 'platform.people.delete', notFound: PERSON_NOT_FOUND,
    });
    const row = await this.load(id, access);
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
      'select count(*)::int as count from users /*scope-exempt: counts the direct reports of the person checked above*/ where reports_to = $1',
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
      await this.inTransaction(async (client) => {
        // Deleting the last person who can manage access is refused (D5);
        // the roles it removes are written to the access history (5.1.7).
        const write = await this.access.begin(client, actorOf(me));
        await write.setRoles(await write.person(id), []);
        await client.query('delete from users /*scope-exempt: the person assertRecordAccess checked above*/ where id = $1', [id]);
        await write.finish();
      });
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

  /**
   * One person's full record, with its `can` answers. It is read through
   * the caller's people view scope, so a person outside it is the same
   * 404 as one that does not exist (R7); `justCreated` is the person the
   * request itself just created, read back for the response.
   */
  private load(id: string, access: AccessContext, options: { justCreated?: boolean } = {}): Promise<UserRow> {
    const values: unknown[] = [id];
    const param: SqlParam = (v) => {
      values.push(v);
      return `$${values.length}`;
    };
    const scope = options.justCreated
      ? '/*scope-exempt: the person this request just created*/ true'
      : scopeWhere(access, 'platform.people.view', 'person', 'u', param);
    const canSql = canSelect(access, PERSON_ACTIONS, 'person', 'u', param);
    return findOneOrFail<UserRow>(
      this.pool,
      `select ${SELECT}, ${canSql} as "can" from ${FROM} where u.id = $1 and ${scope}`,
      values,
      'person',
    );
  }

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
      const { rowCount } = await this.pool.query(
        'select 1 from users /*scope-exempt: only whether the chosen manager exists; reportsTo is an access field (P6)*/ where id = $1',
        [body.reportsToId],
      );
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
       from users /*scope-exempt: email and phone are unique across every person; names the one clash*/
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

const actorOf = (user: AuthUser): AuditActor => ({ id: user.id, name: user.name });

/**
 * The access fields of a person (module levels, active, reports_to) need
 * access.rights.manage (O8, plan 5.3.4) on top of the route's own key.
 * 403 with the kit 26.2 reason, like the route guard.
 */
function assertCanManageAccess(access: AccessContext): void {
  if (can(access, ACCESS_MANAGE_KEY)) return;
  const reason = reasonFor(ACCESS_MANAGE_KEY);
  throw new ForbiddenException({ error: 'forbidden', permission: ACCESS_MANAGE_KEY, reason, message: reason });
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
