import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import { isPgError, PG_UNIQUE_VIOLATION } from '../common/crud';
import { runListQuery, type ListParams, type ListResult, type MatchInfo } from '../common/list-query';
import { PG_POOL } from '../db/db.module';
import { assertNoCycle } from '../users/user-writes';
import type { AccessContext } from './access-context';
import { AUDIT_ACTIONS, permissionsSnapshot, writeAudit, type AuditActor, type AuditEntry } from './audit';
import {
  ACCESS_MANAGE_KEY,
  ALL_CATALOGUES,
  PICK_ACTION,
  adminGrants,
  RESERVED_SECTION,
  SCOPES,
  deriveRoleRows,
  keyInfo,
  type Grant,
  type Scope,
} from './catalogue';
import {
  accessManagerRoleIds,
  accessManagers,
  assertSomeoneCanManageAccess,
  blocked,
  isLastAccessManagerSql,
  LAST_HOLDER_SUFFIX,
  takeAccessLock,
  type AccessManager,
} from './last-holder';
import {
  levelsOfUsers,
  rolesForModulesPatch,
  writeChangedLevels,
  type LegacyLevels,
  type LevelsPatch,
} from './legacy-levels';
import { effectivePermissions, RoleMapService } from './role-map.service';
import { scopeWhere } from './scope';

/**
 * The access write API (access plan 6.1.11 and P6, backend kit 7, kit
 * 40). It owns every access write: roles (create, save whole, delete),
 * a person's roles and ticked sites (saved together), `active` and
 * `reports_to`. The people form and the import call it for those parts,
 * inside their own transactions, through `AccessWrite`.
 *
 * Every write runs in ONE transaction:
 *   1. the access lock (R11.9), and who can manage access before;
 *   2. read before, apply, read after;
 *   3. Picks and see amounts derived on a role save, with notices (R6, O9);
 *   4. the last-holder rule (409);
 *   5. the access_audit rows, in the same transaction (R9);
 *   6. the dual-write to user_module_access until P11 (R11.2);
 *   7. commit. A role edit has bumped access_version by trigger; nothing
 *      here bumps it.
 *
 * Reads for the four screens (backend kit 7.4) are here too. They are
 * behind access.rights.manage, which only Admin holds, at All.
 */

export const SCOPE_LABEL: Record<Scope, string> = { own: 'Own', team: 'Team', units: 'Selected sites', all: 'All' };

/** Kit 40.2 rule 7. */
export const FIXED_ROLE_REASON = 'This role always holds every permission and cannot be changed.';

/** Kit 40.2 rule 6. */
export function holdersReason(n: number): string {
  return `${n === 1 ? '1 person has' : `${n} people have`} this role. Remove it from them before deleting it.`;
}

const PERSON_NOT_FOUND = 'That person no longer exists. It may have been deleted.';
const ROLE_NOT_FOUND = 'That role no longer exists. It may have been deleted.';

export interface Named {
  id: string;
  name: string;
}

type Db = Pick<PoolClient, 'query'>;

const ROLE_ORDER_SQL = (r: string): string => `(${r}.name like '+%'), lower(${r}.name), ${r}.id`;

function byRoleOrder(a: Named, b: Named): number {
  const plus = Number(a.name.startsWith('+')) - Number(b.name.startsWith('+'));
  return plus || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id);
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------
// One access write, inside a caller's transaction
// ---------------------------------------------------------------------

/**
 * One access write. `begin` takes the access lock and notes who can
 * manage access; the change methods apply and queue their audit rows;
 * `finish` applies the last-holder rule, writes the audit rows and the
 * dual-write. Everything runs on the caller's transaction client, so a
 * refusal rolls the whole change back.
 */
export class AccessWrite {
  private readonly entries: AuditEntry[] = [];
  private readonly levelsBefore = new Map<string, LegacyLevels>();

  private constructor(
    readonly db: Db,
    readonly actor: AuditActor,
    private readonly managersBefore: AccessManager[],
  ) {}

  static async begin(db: Db, actor: AuditActor): Promise<AccessWrite> {
    await takeAccessLock(db);
    return new AccessWrite(db, actor, await accessManagers(db));
  }

  /** Notes people's derived levels BEFORE their roles change, for the dual-write. */
  async track(userIds: readonly string[]): Promise<void> {
    const missing = [...new Set(userIds)].filter((id) => !this.levelsBefore.has(id));
    for (const [id, levels] of await levelsOfUsers(this.db, missing)) this.levelsBefore.set(id, levels);
  }

  audit(entry: Omit<AuditEntry, 'actor'>): void {
    this.entries.push({ ...entry, actor: this.actor });
  }

  /** The last-holder rule, the audit rows and the dual-write. Call last, before commit. */
  async finish(): Promise<{ auditRows: number; levelWrites: number }> {
    await assertSomeoneCanManageAccess(this.db, this.managersBefore);
    const auditRows = await writeAudit(this.db, this.entries);
    const after = await levelsOfUsers(this.db, [...this.levelsBefore.keys()]);
    const levelWrites = await writeChangedLevels(this.db, this.levelsBefore, after);
    return { auditRows, levelWrites };
  }

  // ---- a person ---------------------------------------------------------

  /** The person, locked for this write. 404 when they do not exist. */
  async person(userId: string): Promise<{ id: string; name: string; active: boolean; reportsTo: string | null }> {
    const { rows } = await this.db.query<{ id: string; name: string; active: boolean; reportsTo: string | null }>(
      `select u.id, u.name, u.active, u.reports_to as "reportsTo"
       from users u /*scope-exempt: the person this access write changes, checked by its route*/
       where u.id = $1 for update of u`,
      [userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(PERSON_NOT_FOUND);
    return row;
  }

  private async rolesOf(userId: string): Promise<Named[]> {
    const { rows } = await this.db.query<Named>(
      `select r.id, r.name from user_roles ur join roles r on r.id = ur.role_id
       where ur.user_id = $1 order by ${ROLE_ORDER_SQL('r')}`,
      [userId],
    );
    return rows;
  }

  /** Adds and removes roles (the shim, the import, a person's page). Audited one row per role. */
  async changeRoles(user: Named, add: readonly string[], remove: readonly string[]): Promise<number> {
    await this.track([user.id]);
    const held = await this.rolesOf(user.id);
    const heldIds = new Set(held.map((r) => r.id));
    const toAdd = [...new Set(add)].filter((id) => !heldIds.has(id));
    const toRemove = [...new Set(remove)].filter((id) => heldIds.has(id) && !toAdd.includes(id));
    if (!toAdd.length && !toRemove.length) return 0;

    const names = new Map(held.map((r) => [r.id, r.name]));
    if (toAdd.length) {
      const { rows } = await this.db.query<Named>('select id, name from roles where id = any($1::uuid[])', [toAdd]);
      if (rows.length !== toAdd.length) {
        throw new UnprocessableEntityException('That role no longer exists. Refresh and choose again.');
      }
      for (const r of rows) names.set(r.id, r.name);
    }

    let current = [...held];
    for (const roleId of toAdd) {
      const role = { id: roleId, name: names.get(roleId)! };
      await this.db.query('insert into user_roles (user_id, role_id, granted_by) values ($1, $2, $3)', [
        user.id,
        roleId,
        this.actor.id,
      ]);
      const before = current;
      current = [...current, role].sort(byRoleOrder);
      this.audit({ action: 'user.role_added', target: user, role, before: { roles: before }, after: { roles: current } });
    }
    for (const roleId of toRemove) {
      const role = { id: roleId, name: names.get(roleId)! };
      await this.db.query('delete from user_roles where user_id = $1 and role_id = $2', [user.id, roleId]);
      const before = current;
      current = current.filter((r) => r.id !== roleId);
      this.audit({ action: 'user.role_removed', target: user, role, before: { roles: before }, after: { roles: current } });
    }
    return toAdd.length + toRemove.length;
  }

  /** Makes the person's roles exactly `roleIds`. */
  async setRoles(user: Named, roleIds: readonly string[]): Promise<number> {
    const held = await this.rolesOf(user.id);
    const want = new Set(roleIds);
    return this.changeRoles(
      user,
      [...want],
      held.filter((r) => !want.has(r.id)).map((r) => r.id),
    );
  }

  /** The compatibility shim (plan 5.5): a modules patch from the old screen, as seed roles. */
  async applyModulesPatch(user: Named, patch: LevelsPatch): Promise<number> {
    const { add, remove } = rolesForModulesPatch(patch);
    // A seed role the owner has deleted cannot be given; the level row still is, as today.
    const { rows } = add.length
      ? await this.db.query<{ id: string }>('select id from roles where id = any($1::uuid[])', [add])
      : { rows: [] as Array<{ id: string }> };
    return this.changeRoles(user, rows.map((r) => r.id), remove);
  }

  /** Makes the person's ticked sites exactly `unitIds`. One audit row with the full sets. */
  async setUnits(user: Named, unitIds: readonly string[]): Promise<boolean> {
    const want = [...new Set(unitIds)];
    const { rows: held } = await this.db.query<Named>(
      `select s.id, s.name from user_units uu
       join sites s /*scope-exempt: the sites ticked on the person this access write changes*/ on s.id = uu.unit_id
       where uu.user_id = $1 order by s.name, s.id`,
      [user.id],
    );
    const heldIds = new Set(held.map((s) => s.id));
    const add = want.filter((id) => !heldIds.has(id));
    const remove = held.filter((s) => !want.includes(s.id)).map((s) => s.id);
    if (!add.length && !remove.length) return false;

    const { rows: chosen } = await this.db.query<Named>(
      `select s.id, s.name from sites s /*scope-exempt: the sites an access write ticks, chosen from every site*/
       where s.id = any($1::uuid[]) order by s.name, s.id`,
      [want],
    );
    if (chosen.length !== want.length) {
      throw new UnprocessableEntityException('One of those sites no longer exists. Refresh and choose again.');
    }
    if (remove.length) {
      await this.db.query('delete from user_units where user_id = $1 and unit_id = any($2::uuid[])', [user.id, remove]);
    }
    if (add.length) {
      await this.db.query(
        `insert into user_units (user_id, unit_id, granted_by)
         select $1, u, $3 from unnest($2::uuid[]) as t(u)`,
        [user.id, add, this.actor.id],
      );
    }
    this.audit({ action: 'user.units_changed', target: user, before: { units: held }, after: { units: chosen } });
    return true;
  }

  /** Activates or deactivates (O8). The closure is rebuilt by trigger, in this transaction. */
  async setActive(userId: string, active: boolean): Promise<boolean> {
    const person = await this.person(userId);
    if (person.active === active) return false;
    await this.db.query(
      'update users u /*scope-exempt: the person this access write changes, checked by its route*/ set active = $2 where u.id = $1',
      [userId, active],
    );
    this.audit({
      action: active ? 'user.activated' : 'user.deactivated',
      target: { id: person.id, name: person.name },
      before: { active: person.active },
      after: { active },
    });
    return true;
  }

  /**
   * Changes who the person reports to (O8). The closure is rebuilt by
   * trigger, in this transaction (decision 15). `checkCycle: false` is
   * for the import, which checks the whole file's chain once at the end.
   */
  async setReportsTo(userId: string, reportsToId: string | null, options: { checkCycle?: boolean } = {}): Promise<boolean> {
    const person = await this.person(userId);
    if ((person.reportsTo ?? null) === (reportsToId ?? null)) return false;
    const ids = [person.reportsTo, reportsToId].filter((x): x is string => Boolean(x));
    const { rows } = await this.db.query<Named>(
      'select u.id, u.name from users u /*scope-exempt: name snapshots of the managers in a reports_to change*/ where u.id = any($1::uuid[])',
      [ids],
    );
    const names = new Map(rows.map((r) => [r.id, r.name]));
    if (reportsToId && !names.has(reportsToId)) {
      throw new UnprocessableEntityException('The person they report to no longer exists. Refresh and choose again.');
    }
    if (reportsToId && options.checkCycle !== false) await assertNoCycle(this.db as PoolClient, userId, reportsToId);
    await this.db.query(
      'update users u /*scope-exempt: the person this access write changes, checked by its route*/ set reports_to = $2 where u.id = $1',
      [userId, reportsToId],
    );
    const side = (id: string | null) => ({ reportsTo: id ? { id, name: names.get(id) ?? id } : null });
    this.audit({
      action: 'user.reports_to_changed',
      target: { id: person.id, name: person.name },
      before: side(person.reportsTo),
      after: side(reportsToId),
    });
    return true;
  }
}

// ---------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------

export interface RoleInput {
  name?: string;
  description?: string;
  /** One scope per ticked permission: { 'budget.expenses.edit': 'own' }. Picks are derived, never ticked. */
  permissions?: Record<string, unknown>;
}

export interface PersonAccessInput {
  roleIds: string[];
  unitIds: string[];
}

/** A role's ticks, checked against the catalogue. 400 on anything the grid could not have sent. */
export function parseTicks(permissions: Record<string, unknown> | undefined): Grant[] {
  if (permissions === undefined) return [];
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    throw new BadRequestException('Send the permissions as { "<key>": "<scope>" }.');
  }
  const ticks: Grant[] = [];
  for (const [key, scope] of Object.entries(permissions)) {
    const info = keyInfo(key);
    if (!info) throw new BadRequestException(`There is no permission called "${key}".`);
    if (info.kind === 'access') {
      throw new BadRequestException('Managing access is held only by the Admin role and cannot be given to another role.');
    }
    // Picks are derived on every save, never ticked; one sent is ignored (R6: never refused over Picks).
    if (info.kind === 'pick') continue;
    if (typeof scope !== 'string' || !(SCOPES as readonly string[]).includes(scope)) {
      throw new BadRequestException(`The scope of ${info.label} must be one of ${SCOPES.join(', ')}.`);
    }
    if (!info.scopes.includes(scope as Scope)) {
      throw new BadRequestException(
        `${capitalise(info.label)} can only be given at ${info.scopes.map((s) => SCOPE_LABEL[s]).join(' or ')}.`,
      );
    }
    ticks.push({ key, scope: scope as Scope });
  }
  return ticks;
}

const grantId = (g: Grant): string => `${g.key}|${g.scope}`;
const labelOf = (key: string): string => keyInfo(key)?.label ?? key;
const joinAnd = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** Which ticks need this derived row (a Pick at a scope, or see amounts). */
function neededByOf(row: Grant, ticks: readonly Grant[]): string[] {
  const out: string[] = [];
  for (const t of ticks) {
    const info = keyInfo(t.key);
    for (const need of info?.needs ?? []) {
      if ('amounts' in need) {
        if (row.key === `${info!.module}.${RESERVED_SECTION}.see`) out.push(labelOf(t.key));
      } else if (row.key === `${need.pick}.${PICK_ACTION}` && (need.scope ?? t.scope) === row.scope) {
        out.push(labelOf(t.key));
      }
    }
  }
  return [...new Set(out)];
}

/**
 * The save's notices (plan 6.1.11 step 3, R6, O9): one plain sentence
 * per Pick added or removed, per see amounts added or kept because
 * something needs it, and per anything unusual. Never a refusal.
 */
export function roleNotices(before: readonly Grant[], after: readonly Grant[], ticks: readonly Grant[]): string[] {
  const notices: string[] = [];
  const beforeIds = new Set(before.map(grantId));
  const afterIds = new Set(after.map(grantId));
  const tickedIds = new Set(ticks.map(grantId));

  for (const row of after) {
    const kind = keyInfo(row.key)?.kind;
    if (kind === 'pick' && !beforeIds.has(grantId(row))) {
      notices.push(`Added ${labelOf(row.key)} (${SCOPE_LABEL[row.scope]}), needed by ${joinAnd(neededByOf(row, ticks))}.`);
    }
    if (kind === 'amounts' && !tickedIds.has(grantId(row))) {
      const by = joinAnd(neededByOf(row, ticks));
      notices.push(
        beforeIds.has(grantId(row))
          ? `Kept see amounts, because ${by} needs it. Untick ${by} first to remove it.`
          : `Added see amounts, needed by ${by}.`,
      );
    }
  }
  for (const row of before) {
    if (keyInfo(row.key)?.kind === 'pick' && !afterIds.has(grantId(row))) {
      notices.push(`Removed ${labelOf(row.key)} (${SCOPE_LABEL[row.scope]}): nothing ticked needs it any more.`);
    }
  }

  // Unusual, never refused: an action ticked without its section's view.
  const tickedKeys = new Set(ticks.map((t) => t.key));
  for (const t of ticks) {
    const info = keyInfo(t.key);
    if (info?.kind !== 'action' || !info.section || t.key.endsWith('.view')) continue;
    const view = `${info.module}.${info.section.key}.view`;
    if (!keyInfo(view) || tickedKeys.has(view)) continue;
    notices.push(
      `${capitalise(info.label)} is ticked without ${labelOf(view)}, so people with this role can ` +
        `${info.label} but not open them.`,
    );
  }
  return notices;
}

// ---------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------

export type Can = Record<string, true | string>;

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  /** Active people holding it now (kit 40.2 rule 2). */
  people: number;
  /** Everyone holding it, active or not: delete is refused while above zero. */
  holders: number;
  can: Can;
}

export interface RoleDetail extends RoleRow {
  /** Every stored row, Picks and see amounts included; Admin's every key at All, computed. */
  permissions: Partial<Record<string, Scope[]>>;
}

export interface RoleSaved {
  role: RoleDetail;
  notices: string[];
}

export interface PersonRow {
  id: string;
  name: string;
  active: boolean;
  canLogin: boolean;
  designationName: string | null;
  isLastAccessManager: boolean;
  roles: Named[];
  unitIds: string[];
  ledUnits: Named[];
  reportsTo: Named | null;
  usesUnits: boolean;
  can: Can;
}

export interface PersonDetail extends Omit<PersonRow, 'roles'> {
  roles: Array<Named & { scopes: Scope[]; can: Can }>;
  units: Array<Named & { locationId: string | null; locationName: string | null }>;
  /** The roles that use Selected sites (kit 40.7 rule 8). */
  usesUnitsBy: Named[];
}

export interface UnitRow {
  id: string;
  name: string;
  locationId: string | null;
  locationName: string | null;
}

export interface EffectiveRow {
  key: string;
  section: string;
  sectionLabel: string;
  /** The action's short name, or "Pick". */
  action: string;
  kind: 'action' | 'pick' | 'access';
  /** Combined reach: All replaces the rest (kit 40.9 rule 7). */
  scopes: Scope[];
  /** Every role granting it, with that role's own scopes (kit 40.9 rule 8). */
  from: Array<Named & { scopes: Scope[] }>;
  /** Picks only: what each is for (kit 40.9 rule 9). */
  neededBy?: Array<{ key: string; label: string; scopes: Scope[] }>;
}

export interface EffectiveModule {
  module: string;
  label: string;
  /** Null when the module has no see-amounts tick. */
  seeAmounts: { held: boolean; from: Named[] } | null;
  rows: EffectiveRow[];
}

export interface EffectiveAccess {
  person: {
    id: string;
    name: string;
    active: boolean;
    roles: Named[];
    units: UnitRow[];
    ledUnits: Named[];
    teamSize: number;
  };
  modules: EffectiveModule[];
  /** Module labels where they hold nothing (kit 40.9 rule 4). */
  noAccessTo: string[];
}

function combined(scopes: Iterable<Scope>): Scope[] {
  const set = new Set(scopes);
  return set.has('all') ? ['all'] : SCOPES.filter((s) => set.has(s));
}

// ---------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uuidOr400(value: string, key: string): string {
  if (!UUID_RE.test(value)) throw new BadRequestException(`${key} must be an id`);
  return value;
}

function dateOr400(value: string, key: string): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${key} must be a date, like 2026-10-03`);
  }
  return value;
}

@Injectable()
export class AccessService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly roleMap: RoleMapService,
  ) {}

  /** One access write in its own transaction, for the /access routes. */
  async write<T>(actor: AuditActor, work: (w: AccessWrite) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const w = await AccessWrite.begin(client, actor);
      const result = await work(w);
      await w.finish();
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Begins an access write inside a caller's transaction (the people form, the import). */
  begin(client: Db, actor: AuditActor): Promise<AccessWrite> {
    return AccessWrite.begin(client, actor);
  }

  /** The role or roles that grant access.rights.manage: fixed, never edited (kit 40.2 rule 7). */
  private fixedRoleIds(db: Db = this.pool): Promise<string[]> {
    return accessManagerRoleIds(db);
  }

  // ---- roles ------------------------------------------------------------

  private roleCanSql(fixedParam: string): string {
    return `jsonb_build_object(
      'edit', case when r.id = any(${fixedParam}::uuid[]) then to_jsonb(${`'${FIXED_ROLE_REASON.replace(/'/g, "''")}'`}::text)
                   else 'true'::jsonb end,
      'delete', case when r.id = any(${fixedParam}::uuid[]) then to_jsonb(${`'${FIXED_ROLE_REASON.replace(/'/g, "''")}'`}::text)
                     when h.holders = 1 then to_jsonb('1 person has this role. Remove it from them before deleting it.'::text)
                     when h.holders > 1 then to_jsonb(h.holders || ' people have this role. Remove it from them before deleting it.')
                     else 'true'::jsonb end)`;
  }

  private static readonly ROLE_FROM = `
    roles r
    left join lateral (
      select count(*) filter (where hu.active)::int as people, count(*)::int as holders
      from user_roles hur
      join users hu /*scope-exempt: counts the holders of each role, for the access screens*/ on hu.id = hur.user_id
      where hur.role_id = r.id
    ) h on true`;

  async listRoles(params: ListParams): Promise<ListResult<RoleRow & MatchInfo>> {
    const fixed = await this.fixedRoleIds();
    return runListQuery<RoleRow>(this.pool, {
      scope: { unscoped: 'master', why: 'The roles, behind access.rights.manage, which only Admin holds, at All.' },
      from: AccessService.ROLE_FROM,
      select: `r.id, r.name, r.description, h.people, h.holders,
               ${this.roleCanSql(`array[${fixed.map((id) => `'${uuidOr400(id, 'role')}'`).join(',')}]`)} as can`,
      titleField: { sql: 'r.name', label: 'Name' },
      searchFields: [{ sql: 'r.description', label: 'Description' }],
      sortable: { name: `(r.name like '+%'), lower(r.name)`, people: 'h.people' },
      defaultSort: { key: 'name', direction: 'asc' },
    }, params);
  }

  async getRole(id: string, db: Db = this.pool): Promise<RoleDetail> {
    if (!UUID_RE.test(id)) throw new NotFoundException(ROLE_NOT_FOUND);
    const fixed = await this.fixedRoleIds(db);
    const { rows } = await db.query<RoleRow>(
      `select r.id, r.name, r.description, h.people, h.holders, ${this.roleCanSql('$2')} as can
       from ${AccessService.ROLE_FROM} where r.id = $1`,
      [id, fixed],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(ROLE_NOT_FOUND);
    const grants: Grant[] = fixed.includes(id) ? adminGrants() : await this.storedRows(db, id);
    const permissions: Partial<Record<string, Scope[]>> = {};
    for (const g of grants) (permissions[g.key] ??= []).push(g.scope);
    for (const scopes of Object.values(permissions)) scopes!.sort((a, b) => SCOPES.indexOf(a) - SCOPES.indexOf(b));
    return { ...row, permissions };
  }

  private async storedRows(db: Db, roleId: string): Promise<Grant[]> {
    const { rows } = await db.query<Grant>(
      'select permission_key as key, scope::text as scope from role_permissions where role_id = $1 order by permission_key, scope',
      [roleId],
    );
    return rows;
  }

  private cleanName(name: string | undefined): string {
    const n = name?.trim() ?? '';
    if (!n) throw new BadRequestException('Enter the role’s name');
    if (n.length > 80) throw new BadRequestException('A role name can be at most 80 characters');
    return n;
  }

  private duplicateName(name: string): ConflictException {
    return new ConflictException(`There is already a role called ${name}. Choose another name.`);
  }

  private async insertRows(db: Db, roleId: string, rows: readonly Grant[]): Promise<void> {
    if (!rows.length) return;
    await db.query(
      `insert into role_permissions (role_id, permission_key, scope)
       select $1, k, s::access_scope from unnest($2::text[], $3::text[]) as t(k, s)`,
      [roleId, rows.map((g) => g.key), rows.map((g) => g.scope)],
    );
  }

  async createRole(actor: AuditActor, input: RoleInput): Promise<RoleSaved> {
    const name = this.cleanName(input.name);
    const description = input.description?.trim() ?? '';
    const ticks = parseTicks(input.permissions);
    const { rows } = deriveRoleRows(ticks);
    try {
      const id = await this.write(actor, async (w) => {
        const { rows: created } = await w.db.query<{ id: string }>(
          'insert into roles (name, description) values ($1, $2) returning id',
          [name, description],
        );
        const roleId = created[0]!.id;
        await this.insertRows(w.db, roleId, rows);
        w.audit({
          action: 'role.created',
          target: { id: roleId, name },
          role: { id: roleId, name },
          after: { name, description, ...permissionsSnapshot(rows) },
        });
        return roleId;
      });
      return { role: await this.getRole(id), notices: roleNotices([], rows, ticks) };
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) throw this.duplicateName(name);
      throw error;
    }
  }

  /** Saves the whole role at once: name, description, one scope per tick (kit 40.3 rule 4). */
  async updateRole(actor: AuditActor, id: string, input: RoleInput): Promise<RoleSaved> {
    if (!UUID_RE.test(id)) throw new NotFoundException(ROLE_NOT_FOUND);
    const ticks = parseTicks(input.permissions);
    const { rows: after } = deriveRoleRows(ticks);
    let notices: string[] = [];
    const name = this.cleanName(input.name);
    try {
      await this.write(actor, async (w) => {
        const { rows: found } = await w.db.query<{ name: string; description: string }>(
          'select name, description from roles where id = $1 for update',
          [id],
        );
        const role = found[0];
        if (!role) throw new NotFoundException(ROLE_NOT_FOUND);
        if ((await this.fixedRoleIds(w.db)).includes(id)) throw blocked(FIXED_ROLE_REASON);
        const description = input.description === undefined ? role.description : input.description.trim();

        const { rows: holders } = await w.db.query<{ user_id: string }>(
          'select user_id from user_roles where role_id = $1',
          [id],
        );
        await w.track(holders.map((h) => h.user_id));

        const before = await this.storedRows(w.db, id);
        const beforeIds = new Set(before.map(grantId));
        const afterIds = new Set(after.map(grantId));
        const added = after.filter((g) => !beforeIds.has(grantId(g)));
        const removed = before.filter((g) => !afterIds.has(grantId(g)));
        const renamed = role.name !== name || role.description !== description;
        notices = roleNotices(before, after, ticks);

        if (renamed) {
          await w.db.query('update roles set name = $2, description = $3, updated_at = now() where id = $1', [
            id,
            name,
            description,
          ]);
          w.audit({
            action: 'role.renamed',
            target: { id, name },
            role: { id, name },
            before: { name: role.name, description: role.description },
            after: { name, description },
          });
        }
        if (added.length || removed.length) {
          for (const g of removed) {
            await w.db.query('delete from role_permissions where role_id = $1 and permission_key = $2 and scope = $3', [
              id,
              g.key,
              g.scope,
            ]);
          }
          await this.insertRows(w.db, id, added);
          if (!renamed) await w.db.query('update roles set updated_at = now() where id = $1', [id]);
          w.audit({
            action: 'role.permissions_changed',
            target: { id, name },
            role: { id, name },
            before: permissionsSnapshot(before),
            after: permissionsSnapshot(after),
          });
        }
      });
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) throw this.duplicateName(name);
      throw error;
    }
    return { role: await this.getRole(id), notices };
  }

  /** Refused (409) while anyone, active or not, holds the role (kit 40.2 rule 6). */
  async deleteRole(actor: AuditActor, id: string): Promise<void> {
    if (!UUID_RE.test(id)) throw new NotFoundException(ROLE_NOT_FOUND);
    await this.write(actor, async (w) => {
      const { rows: found } = await w.db.query<{ name: string; description: string }>(
        'select name, description from roles where id = $1 for update',
        [id],
      );
      const role = found[0];
      if (!role) throw new NotFoundException(ROLE_NOT_FOUND);
      if ((await this.fixedRoleIds(w.db)).includes(id)) throw blocked(FIXED_ROLE_REASON);
      const { rows: count } = await w.db.query<{ n: number }>(
        'select count(*)::int as n from user_roles where role_id = $1',
        [id],
      );
      const holders = count[0]?.n ?? 0;
      if (holders > 0) throw blocked(holdersReason(holders));
      const before = await this.storedRows(w.db, id);
      await w.db.query('delete from roles where id = $1', [id]);
      w.audit({
        action: 'role.deleted',
        target: { id, name: role.name },
        role: { id, name: role.name },
        before: { name: role.name, description: role.description, ...permissionsSnapshot(before) },
      });
    });
  }

  // ---- people -----------------------------------------------------------

  private static readonly PERSON_FROM = `
    users u
    left join designations d on d.id = u.designation_id
    left join users m on m.id = u.reports_to`;

  /** A person's columns for the People list and page (backend kit 7.4 item 2). */
  private static personSelect(): string {
    const isLast = isLastAccessManagerSql('u.id');
    const suffix = `'${LAST_HOLDER_SUFFIX.replace(/'/g, "''")}'`;
    return `
      u.id, u.name, u.active, u.can_login as "canLogin", d.name as "designationName",
      ${isLast} as "isLastAccessManager",
      coalesce((select json_agg(json_build_object('id', pr.id, 'name', pr.name) order by ${ROLE_ORDER_SQL('pr')})
                from user_roles pur join roles pr on pr.id = pur.role_id where pur.user_id = u.id), '[]'::json) as roles,
      coalesce((select array_agg(puu.unit_id::text order by puu.unit_id) from user_units puu where puu.user_id = u.id),
               '{}') as "unitIds",
      coalesce((select json_agg(json_build_object('id', ls.id, 'name', ls.name) order by ls.name, ls.id)
                from sites ls where ls.manager_id = u.id or ls.supervisor_id = u.id), '[]'::json) as "ledUnits",
      case when m.id is null then null else json_build_object('id', m.id, 'name', m.name) end as "reportsTo",
      exists (select 1 from user_roles xur join role_permissions xrp on xrp.role_id = xur.role_id
              where xur.user_id = u.id and xrp.scope = 'units') as "usesUnits",
      jsonb_build_object(
        'editAccess', 'true'::jsonb,
        'activate', case when u.active then to_jsonb(u.name || ' is already active.') else 'true'::jsonb end,
        'deactivate', case when not u.active then to_jsonb(u.name || ' is already inactive.')
                           when ${isLast} then to_jsonb(u.name || ${suffix})
                           else 'true'::jsonb end) as can`;
  }

  /** Sites nobody covers: no active lead, and no active person has them ticked (decision 4, kit 40.8). */
  async uncoveredUnits(db: Db = this.pool): Promise<Named[]> {
    const { rows } = await db.query<Named>(
      `select s.id, s.name /*scope-exempt: the access screens list every site nobody covers*/
       from sites s
       where not exists (select 1 from users cu where cu.active and (cu.id = s.manager_id or cu.id = s.supervisor_id))
         and not exists (select 1 from user_units cuu join users cu2 on cu2.id = cuu.user_id
                         where cuu.unit_id = s.id and cu2.active)
       order by s.name, s.id`,
    );
    return rows;
  }

  async listPeople(
    access: AccessContext,
    params: ListParams,
  ): Promise<ListResult<PersonRow & MatchInfo> & { uncoveredUnits: Named[] }> {
    const list = await runListQuery<PersonRow>(
      this.pool,
      {
        // access.rights.manage is held only by Admin, at All: the marker states the key that decides.
        scope: { key: ACCESS_MANAGE_KEY, record: 'person', alias: 'u' },
        from: AccessService.PERSON_FROM,
        select: AccessService.personSelect(),
        titleField: { sql: 'u.name', label: 'Name' },
        searchFields: [
          { sql: 'd.name', label: 'Designation' },
          {
            sql: `(select string_agg(sr.name, ', ') from user_roles sur join roles sr on sr.id = sur.role_id where sur.user_id = u.id)`,
            label: 'Roles',
          },
        ],
        sortable: { name: 'u.name', status: 'u.active', designation: 'd.name' },
        defaultSort: { key: 'name', direction: 'asc' },
        filters: {
          roleId: (v, param) =>
            `exists (select 1 from user_roles fur where fur.user_id = u.id and fur.role_id = ${param(uuidOr400(v, 'roleId'))}::uuid)`,
          status: (v, param) => {
            if (v !== 'active' && v !== 'inactive') throw new BadRequestException('status must be active or inactive');
            return `u.active = ${param(v === 'active')}`;
          },
          locationId: (v, param) =>
            `exists (select 1 from sites fs where fs.location_id = ${param(uuidOr400(v, 'locationId'))}::uuid
                     and (fs.manager_id = u.id or fs.supervisor_id = u.id
                          or fs.id in (select fuu.unit_id from user_units fuu where fuu.user_id = u.id)))`,
          // "Selected sites: none chosen" (kit 40.6 rule 5): a role uses Selected sites and nothing is ticked.
          unitsNoneChosen: (v) => {
            if (v !== 'true') throw new BadRequestException('unitsNoneChosen must be true');
            return `exists (select 1 from user_roles nur join role_permissions nrp on nrp.role_id = nur.role_id
                            where nur.user_id = u.id and nrp.scope = 'units')
                    and not exists (select 1 from user_units nuu where nuu.user_id = u.id)`;
          },
        },
      },
      params,
      access,
    );
    return { ...list, uncoveredUnits: await this.uncoveredUnits() };
  }

  /** One person's access page (kit 40.7). 404 when they do not exist. */
  async getPerson(access: AccessContext, id: string): Promise<PersonDetail> {
    if (!UUID_RE.test(id)) throw new NotFoundException(PERSON_NOT_FOUND);
    const values: unknown[] = [id];
    const param = (v: unknown): string => {
      values.push(v);
      return `$${values.length}`;
    };
    // The same scope as the list: access.rights.manage, which only Admin holds, at All.
    const scope = scopeWhere(access, ACCESS_MANAGE_KEY, 'person', 'u', param);
    const fixed = param(await this.fixedRoleIds());
    const suffix = param(LAST_HOLDER_SUFFIX);
    const { rows } = await this.pool.query<PersonDetail & { rolesDetail: PersonDetail['roles'] }>(
      `select ${AccessService.personSelect()},
              coalesce((select json_agg(json_build_object(
                          'id', pr.id, 'name', pr.name,
                          'scopes', case when pr.id = any(${fixed}::uuid[]) then array['all']
                                         else coalesce((select array_agg(distinct prp.scope::text)
                                                        from role_permissions prp
                                                        where prp.role_id = pr.id and prp.permission_key not like '%.pick'),
                                                       '{}') end,
                          'can', jsonb_build_object('remove',
                            case when pr.id = any(${fixed}::uuid[]) and ${isLastAccessManagerSql('u.id')}
                                 then to_jsonb(u.name || ${suffix}::text) else 'true'::jsonb end))
                        order by ${ROLE_ORDER_SQL('pr')})
                        from user_roles pur join roles pr on pr.id = pur.role_id where pur.user_id = u.id),
                       '[]'::json) as "rolesDetail",
              coalesce((select json_agg(json_build_object('id', ts.id, 'name', ts.name,
                                                          'locationId', tl.id, 'locationName', tl.name)
                                        order by tl.name nulls last, ts.name, ts.id)
                        from user_units tuu join sites ts on ts.id = tuu.unit_id
                        left join locations tl on tl.id = ts.location_id
                        where tuu.user_id = u.id), '[]'::json) as units,
              coalesce((select json_agg(json_build_object('id', ur2.id, 'name', ur2.name) order by ${ROLE_ORDER_SQL('ur2')})
                        from roles ur2
                        where ur2.id in (select uur.role_id from user_roles uur where uur.user_id = u.id)
                          and exists (select 1 from role_permissions urp where urp.role_id = ur2.id and urp.scope = 'units')),
                       '[]'::json) as "usesUnitsBy"
       from ${AccessService.PERSON_FROM}
       where u.id = $1 and ${scope}`,
      values,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(PERSON_NOT_FOUND);
    const { rolesDetail, ...rest } = row;
    // scopes come back in storage order; R1 order on screen.
    for (const r of rolesDetail) r.scopes = SCOPES.filter((s) => r.scopes.includes(s));
    return { ...rest, roles: rolesDetail };
  }

  /** A person's page saves their roles and ticked sites together: one request, one transaction (kit 7.4). */
  async saveAccess(access: AccessContext, actor: AuditActor, id: string, input: PersonAccessInput): Promise<PersonDetail> {
    if (!UUID_RE.test(id)) throw new NotFoundException(PERSON_NOT_FOUND);
    await this.write(actor, async (w) => {
      const person = await w.person(id);
      await w.setRoles(person, input.roleIds);
      await w.setUnits(person, input.unitIds);
    });
    return this.getPerson(access, id);
  }

  async setActive(access: AccessContext, actor: AuditActor, id: string, active: boolean): Promise<PersonDetail> {
    if (!UUID_RE.test(id)) throw new NotFoundException(PERSON_NOT_FOUND);
    await this.write(actor, (w) => w.setActive(id, active));
    return this.getPerson(access, id);
  }

  async setReportsTo(
    access: AccessContext,
    actor: AuditActor,
    id: string,
    reportsToId: string | null,
  ): Promise<PersonDetail> {
    if (!UUID_RE.test(id)) throw new NotFoundException(PERSON_NOT_FOUND);
    await this.write(actor, (w) => w.setReportsTo(id, reportsToId));
    return this.getPerson(access, id);
  }

  /** Every site, unpaginated, with its location: the unit picker (plan 6.1.5, kit 40.7 rule 9). */
  async units(): Promise<UnitRow[]> {
    const { rows } = await this.pool.query<UnitRow>(
      `select s.id, s.name, l.id as "locationId", l.name as "locationName"
       from sites s /*scope-exempt: the unit picker lists every site, behind access.rights.manage*/
       left join locations l on l.id = s.location_id
       order by l.name nulls last, s.name, s.id`,
    );
    return rows;
  }

  // ---- what they can do -------------------------------------------------

  /** One person's real access, and which role gave each (kit 40.9, backend kit 7.4 item 3). */
  async effective(access: AccessContext, id: string): Promise<EffectiveAccess> {
    const person = await this.getPerson(access, id);
    const { rows: team } = await this.pool.query<{ n: number }>(
      'select greatest(count(*) - 1, 0)::int as n from shared.access_team_user_ids($1::uuid)',
      [id],
    );
    const units = await this.units();
    const ticked = new Set(person.unitIds);

    // The role map is current for this request's access version (JwtAuthGuard).
    const map = this.roleMap.snapshot;
    const everyone = new Set<string>(
      ALL_CATALOGUES.flatMap((c) =>
        c.sections.filter((s) => s.pick?.everyone).map((s) => `${c.module}.${s.key}.${PICK_ACTION}`),
      ),
    );
    const held = new Map<string, { scopes: Set<Scope>; from: Array<Named & { scopes: Scope[] }> }>();
    for (const r of person.roles) {
      for (const [key, scopes] of effectivePermissions(map, [r.id])) {
        if (everyone.has(key)) continue;
        let entry = held.get(key);
        if (!entry) held.set(key, (entry = { scopes: new Set(), from: [] }));
        for (const s of scopes) entry.scopes.add(s);
        entry.from.push({ id: r.id, name: r.name, scopes: combined(scopes) });
      }
    }

    /** What a Pick is for: held permissions whose needs name it, and its own section's view. */
    const neededBy = (pickKey: string): Array<{ key: string; label: string; scopes: Scope[] }> => {
      const section = pickKey.slice(0, -`.${PICK_ACTION}`.length);
      const out: Array<{ key: string; label: string; scopes: Scope[] }> = [];
      for (const [key, entry] of held) {
        const info = keyInfo(key);
        if (!info || info.kind === 'pick') continue;
        const need = info.needs.find((n) => 'pick' in n && n.pick === section) as
          | { pick: string; scope?: 'all' }
          | undefined;
        if (!need && key !== `${section}.view`) continue;
        out.push({ key, label: info.label, scopes: need?.scope === 'all' ? ['all'] : combined(entry.scopes) });
      }
      return out;
    };

    const modules: EffectiveModule[] = [];
    const noAccessTo: string[] = [];
    for (const cat of ALL_CATALOGUES) {
      const rows: EffectiveRow[] = [];
      for (const section of cat.sections) {
        for (const action of section.actions) {
          const key = `${cat.module}.${section.key}.${action.key}`;
          const entry = held.get(key);
          if (!entry) continue;
          rows.push({
            key,
            section: section.key,
            sectionLabel: section.label,
            action: action.short,
            kind: cat.module === 'access' ? 'access' : 'action',
            scopes: combined(entry.scopes),
            from: entry.from,
          });
        }
        const pickKey = `${cat.module}.${section.key}.${PICK_ACTION}`;
        const pick = held.get(pickKey);
        if (pick) {
          rows.push({
            key: pickKey,
            section: section.key,
            sectionLabel: section.label,
            action: 'Pick',
            kind: 'pick',
            scopes: combined(pick.scopes),
            from: pick.from,
            neededBy: neededBy(pickKey),
          });
        }
      }
      const amounts = held.get(`${cat.module}.${RESERVED_SECTION}.see`);
      const seeAmounts =
        'seeAmounts' in cat && cat.seeAmounts
          ? { held: Boolean(amounts), from: (amounts?.from ?? []).map((f) => ({ id: f.id, name: f.name })) }
          : null;
      if (rows.length === 0 && !amounts) {
        if (cat.module !== 'access') noAccessTo.push(cat.label);
        continue;
      }
      modules.push({ module: cat.module, label: cat.label, seeAmounts, rows });
    }

    return {
      person: {
        id: person.id,
        name: person.name,
        active: person.active,
        roles: person.roles.map((r) => ({ id: r.id, name: r.name })),
        units: units.filter((u) => ticked.has(u.id)),
        ledUnits: person.ledUnits,
        teamSize: team[0]?.n ?? 0,
      },
      modules,
      noAccessTo,
    };
  }

  // ---- history ----------------------------------------------------------

  /** The access history, newest first, 25 a page (kit 40.10, backend kit 7.4 item 4). Read-only. */
  history(params: ListParams): Promise<ListResult<Record<string, unknown> & MatchInfo>> {
    const day = (v: string, param: (x: unknown) => string, key: string): string =>
      `((${param(dateOr400(v, key))}::date)::timestamp at time zone 'Asia/Kolkata')`;
    return runListQuery<Record<string, unknown>>(this.pool, {
      scope: { unscoped: 'master', why: 'The access history, behind access.rights.manage, which only Admin holds, at All.' },
      from: 'access_audit a',
      select: `a.id::text as id, a.at, a.action, a.target_type as "targetType",
               json_build_object('id', a.actor_id, 'name', a.actor_name) as "changedBy",
               json_build_object('id', a.target_id, 'name', a.target_name) as target,
               case when a.role_id is null then null else json_build_object('id', a.role_id, 'name', a.role_name) end as role,
               a.before, a.after, a.note`,
      // Search covers the names of people and roles (kit 40.10 rule 5), as they were.
      titleField: { sql: 'a.target_name', label: 'Affected' },
      searchFields: [
        { sql: 'a.actor_name', label: 'Changed by' },
        { sql: 'a.role_name', label: 'Role' },
      ],
      // When is the only sortable column; the identity orders rows written in one transaction.
      sortable: { at: 'a.id' },
      defaultSort: { key: 'at', direction: 'desc' },
      filters: {
        actorId: (v, param) => `a.actor_id = ${param(uuidOr400(v, 'actorId'))}::uuid`,
        personId: (v, param) => `a.target_type = 'user' and a.target_id = ${param(uuidOr400(v, 'personId'))}::uuid`,
        roleId: (v, param) => `a.role_id = ${param(uuidOr400(v, 'roleId'))}::uuid`,
        action: (v, param) => {
          const kinds = v.split(',').map((k) => k.trim()).filter(Boolean);
          const unknown = kinds.filter((k) => !(AUDIT_ACTIONS as readonly string[]).includes(k));
          if (!kinds.length || unknown.length) {
            throw new BadRequestException(`action must be one or more of ${AUDIT_ACTIONS.join(', ')}`);
          }
          return `a.action = any(${param(kinds)}::text[])`;
        },
        from: (v, param) => `a.at >= ${day(v, param, 'from')}`,
        to: (v, param) => `a.at < ${day(v, param, 'to')} + interval '1 day'`,
      },
    }, params);
  }
}
