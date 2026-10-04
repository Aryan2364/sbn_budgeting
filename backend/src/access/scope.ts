import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ClientBase, Pool } from 'pg';

import { type AccessContext, can, scopesFor } from './access-context';
import { ALL_CATALOGUES, PICK_ACTION, keyInfo, type PermissionKey, type RecordType, type Scope } from './catalogue';
import { reasonFor } from './permission.guard';

/**
 * The shared scope filter (access plan 6.1.4, decisions 16 and 26,
 * RESOLUTIONS O4 and O5, backend kit 5.4).
 *
 * Every list, count, report, dashboard figure, Pick, read by id and
 * write on a scopable record goes through `scopeWhere`. It turns the
 * scopes the caller holds for ONE permission into ONE SQL predicate over
 * the record's alias, so scope is decided inside the data query, never
 * by filtering rows in code (kit rule 14).
 *
 * - Not held: `false`. Held at All: `true`. Otherwise the scopes held,
 *   joined with `or` (plan 3.4.3: scopes combine as a union).
 * - Every predicate starts with a marker comment, `/*scope:<key>*\/`,
 *   which the test-time query guard looks for.
 * - The user id ALWAYS goes in through `param()`, cast to uuid. It is
 *   never inlined into the SQL text.
 *
 * The sets (plan 6.1.4), from the scope functions of migration 0012:
 *   TEAM       me and everyone under me (reporting_closure)
 *   LED        the sites I lead (manager or supervisor)
 *   TEAM_UNITS the sites led by anyone in TEAM; includes LED (O4)
 *   MY_UNITS   the sites ticked on me, plus LED (O4)
 * Every scope wider than Own includes Own (O4).
 *
 * The functions are plain `language sql stable` and are called in FROM,
 * so Postgres inlines them; each set is an uncorrelated subquery, so a
 * list is still ONE query with no per-row lookups.
 */

/** Pushes a value and returns its placeholder (`$3`). runListQuery's own `param`. */
export type Param = (value: unknown) => string;

/** The record types a scope predicate exists for (plan 5.2). */
export const RECORD_TYPES: readonly RecordType[] = [
  'project',
  'site',
  'site_budget',
  'expense',
  'variance',
  'complaint',
  'person',
];

/** The six people a complaint names (Own, plan 6.1.4). */
const COMPLAINT_PEOPLE = ['raised_by', 'supervisor_id', 'manager_id', 'hod_id', 'ceo_id', 'approver_id'] as const;

/** A column name from the catalogue; refused if it is anything but a bare identifier. */
function column(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`scope: "${name}" is not a column name`);
  return name;
}

function alias(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`scope: "${name}" is not a table alias`);
  return name;
}

/** The SQL for the four sets, for the caller `me` (a placeholder, already cast). */
function setsFor(me: string) {
  return {
    TEAM: `(select st.id from shared.access_team_user_ids(${me}) as st(id))`,
    LED: `(select sl.id from sites sl where sl.manager_id = ${me} or sl.supervisor_id = ${me})`,
    TEAM_UNITS: `(select stu.id from shared.access_team_unit_ids(${me}) as stu(id))`,
    MY_UNITS: `(select smu.id from shared.access_my_unit_ids(${me}) as smu(id))`,
  };
}

type Sets = ReturnType<typeof setsFor>;
type NarrowScope = Exclude<Scope, 'all'>;

/** The action's extra "mine" columns (complaint reassign: manager_id, hod_id). */
function ownColumnsOf(key: PermissionKey): readonly string[] | undefined {
  const info = keyInfo(key);
  const action = key.split('.')[2];
  return info?.section?.actions.find((a) => a.key === action)?.ownColumns;
}

/** One site predicate over the sites alias `s`. */
function sitePredicate(scope: NarrowScope, s: string, me: string, sets: Sets): string {
  const own = `(${s}.manager_id = ${me} or ${s}.supervisor_id = ${me} or ${s}.created_by = ${me})`;
  switch (scope) {
    case 'own':
      return own;
    case 'team':
      return `(${s}.id in ${sets.TEAM_UNITS} or ${s}.created_by in ${sets.TEAM})`;
    case 'units':
      return `(${own} or ${s}.id in ${sets.MY_UNITS})`;
  }
}

/** One scope's predicate for one record type (plan 6.1.4's table). */
function predicate(
  record: RecordType,
  scope: NarrowScope,
  a: string,
  me: string,
  sets: Sets,
  ownColumns: readonly string[] | undefined,
): string {
  switch (record) {
    case 'site':
      return sitePredicate(scope, a, me, sets);

    case 'project': {
      // Visible if any of its sites is (decision 26), or I created it.
      const anySite = `exists (select 1 from sites sps where sps.project_id = ${a}.id and ${sitePredicate(scope, 'sps', me, sets)})`;
      const creator = scope === 'team' ? `${a}.created_by in ${sets.TEAM}` : `${a}.created_by = ${me}`;
      return `(${creator} or ${anySite})`;
    }

    case 'site_budget':
    case 'variance':
      return `${a}.site_id in (select sbs.id from sites sbs where ${sitePredicate(scope, 'sbs', me, sets)})`;

    case 'expense': {
      switch (scope) {
        case 'own':
          return `(${a}.created_by = ${me})`;
        case 'team':
          return `(${a}.created_by in ${sets.TEAM} or ${a}.site_id in ${sets.TEAM_UNITS})`;
        case 'units':
          return `(${a}.created_by = ${me} or ${a}.site_id in ${sets.MY_UNITS})`;
      }
      break;
    }

    case 'complaint': {
      const people = COMPLAINT_PEOPLE.map((c) => `${a}.${c}`);
      // An action may narrow what makes a complaint "mine" (reassign: manager or HOD, O6).
      const mine = (ownColumns ?? COMPLAINT_PEOPLE).map((c) => `${a}.${column(c)}`);
      // coalesce: `x in (a, null)` is null, not false, when nothing matches.
      const own = `coalesce(${me} in (${mine.join(', ')}), false)`;
      switch (scope) {
        case 'own':
          return own;
        case 'team':
          // Any of the six in my team, or the complaint's site is a team site.
          return `(${people.map((p) => `${p} in ${sets.TEAM}`).join(' or ')} or ${a}.site_id in ${sets.TEAM_UNITS})`;
        case 'units':
          // Site-less legacy complaints match Own and All only (O10 Q9).
          return `(${own} or ${a}.site_id in ${sets.MY_UNITS})`;
      }
      break;
    }

    case 'person': {
      switch (scope) {
        case 'own':
          return `(${a}.id = ${me})`;
        case 'team':
          return `(${a}.id in ${sets.TEAM})`;
        case 'units':
          return (
            `(${a}.id = ${me} or exists (select 1 from sites sus ` +
            `where (sus.manager_id = ${a}.id or sus.supervisor_id = ${a}.id) and sus.id in ${sets.MY_UNITS}))`
          );
      }
      break;
    }
  }
  throw new Error(`scope: no predicate for ${record} at ${scope}`);
}

/**
 * The scope predicate for `key` over the record at `alias`.
 *
 *   scopeWhere(ctx, 'budget.expenses.view', 'expense', 'e', param)
 *   -> (/*scope:budget.expenses.view*\/ (e.created_by = $3::uuid) or (...))
 *
 * Put it beside the query's other conditions, ANDed (kit rule 17: the
 * client may narrow, never widen).
 */
export function scopeWhere(
  ctx: AccessContext,
  key: PermissionKey,
  record: RecordType,
  aliasName: string,
  param: Param,
): string {
  const marker = `/*scope:${key}*/`;
  const held = scopesFor(ctx, key);
  if (held.size === 0) return `(${marker} false)`;
  if (held.has('all')) return `(${marker} true)`;

  const a = alias(aliasName);
  const me = `${param(ctx.userId)}::uuid`;
  const sets = setsFor(me);
  const ownColumns = record === 'complaint' ? ownColumnsOf(key) : undefined;
  const parts = (['own', 'team', 'units'] as const)
    .filter((s) => held.has(s))
    .map((s) => predicate(record, s, a, me, sets, ownColumns));
  return `(${marker} ${parts.join(' or ')})`;
}

// ---------------------------------------------------------------------
// Creates and writes that set a site (plan 6.1.4 step 5, O5)
// ---------------------------------------------------------------------

/** The site-record section whose Pick a `createSiteFrom: 'pick'` action checks the site against. */
function sitePickOf(key: PermissionKey): PermissionKey | null {
  const info = keyInfo(key);
  for (const need of info?.needs ?? []) {
    if (!('pick' in need)) continue;
    const [module, section] = need.pick.split('.');
    const target = ALL_CATALOGUES.find((c) => c.module === module)?.sections.find((s) => s.key === section);
    if (target?.record === 'site') return `${need.pick}.${PICK_ACTION}` as PermissionKey;
  }
  return null;
}

/**
 * May the caller create (or move) a record of `key`'s kind onto the site
 * `siteSql` (a column or a placeholder)? O5:
 *   Own   - only a site they lead;
 *   Team  - a site their team runs (TEAM_UNITS);
 *   Selected sites - a ticked or led site (MY_UNITS);
 *   All   - any site.
 * Exception: an action declared `createSiteFrom: 'pick'`
 * (complaints.complaints.raise) checks the site against the sites Pick
 * it needs instead, which raise declares at All: any site.
 *
 * A new site is itself the unit: creating one is allowed at any held
 * scope (its created_by then makes it Own), so this is not called for it.
 */
export function createSiteWhere(ctx: AccessContext, key: PermissionKey, siteSql: string, param: Param): string {
  const marker = `/*scope:${key}*/`;
  const held = scopesFor(ctx, key);
  if (held.size === 0) return `(${marker} false)`;

  const info = keyInfo(key);
  const action = info?.section?.actions.find((a) => a.key === key.split('.')[2]);
  if (action?.createSiteFrom === 'pick') {
    const pick = sitePickOf(key);
    if (!pick) throw new Error(`${key} declares createSiteFrom: 'pick' but needs no sites Pick`);
    return `(${marker} exists (select 1 from sites cps where cps.id = ${siteSql} and ${scopeWhere(ctx, pick, 'site', 'cps', param)}))`;
  }

  if (held.has('all')) return `(${marker} true)`;
  const me = `${param(ctx.userId)}::uuid`;
  const sets = setsFor(me);
  const parts: string[] = [];
  if (held.has('own')) parts.push(`${siteSql} in ${sets.LED}`);
  if (held.has('team')) parts.push(`${siteSql} in ${sets.TEAM_UNITS}`);
  if (held.has('units')) parts.push(`${siteSql} in ${sets.MY_UNITS}`);
  return `(${marker} ${parts.join(' or ')})`;
}

// ---------------------------------------------------------------------
// The record-level reason (plan 6.1.10)
// ---------------------------------------------------------------------

const OWN_PHRASE: Record<RecordType, string> = {
  site: 'if you lead or added them',
  project: 'if you added them or lead one of their sites',
  site_budget: 'on sites you lead or added',
  variance: 'on sites you lead or added',
  expense: 'if you added them',
  complaint: 'if they name you',
  person: 'for yourself',
};

const SCOPE_PHRASE: Record<'team' | 'units', string> = {
  team: 'for your team and the sites it runs',
  units: 'on your selected sites and the sites you lead',
};

/**
 * Why `key` is refused on a record the caller can see (403, plan
 * 6.1.10), from the action's label and the scopes held, never written
 * per key: "You can edit expenses only if you added them." Names the
 * permission's reach, never a role (kit 26.2).
 */
export function recordReason(ctx: AccessContext, key: PermissionKey, record: RecordType): string {
  const held = scopesFor(ctx, key);
  if (held.size === 0 || held.has('all')) return reasonFor(key);
  const label = keyInfo(key)?.label ?? key;
  const ownColumns = record === 'complaint' ? ownColumnsOf(key) : undefined;
  const own =
    ownColumns && ownColumns.length
      ? `if you are their ${ownColumns.map((c) => c.replace(/_id$/, '').replace('hod', 'HOD')).join(' or ')}`
      : OWN_PHRASE[record];
  const phrases: string[] = [];
  if (held.has('own')) phrases.push(own);
  if (held.has('team')) phrases.push(SCOPE_PHRASE.team);
  if (held.has('units')) phrases.push(SCOPE_PHRASE.units);
  return `You can ${label} only ${phrases.join(', or ')}.`;
}

// ---------------------------------------------------------------------
// Per-record answers (plan 6.1.4 step 6, kit 8.3)
// ---------------------------------------------------------------------

/**
 * The SQL of a record's `can` map, for the actions the caller holds at
 * some scope: `{ edit: true, delete: "You can delete ... only ..." }`,
 * as jsonb. Computed in the same query as the rows, never per row in
 * code. Actions not held at all are left out (the page-level useCan
 * covers them). The workflow layer (P5) adds its own reasons on top.
 */
export function canSelect(
  ctx: AccessContext,
  actions: Readonly<Record<string, PermissionKey>>,
  record: RecordType,
  aliasName: string,
  param: Param,
): string {
  const pairs: string[] = [];
  for (const [name, key] of Object.entries(actions)) {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`can: "${name}" is not an action name`);
    if (!can(ctx, key)) continue;
    const pred = scopeWhere(ctx, key, record, aliasName, param);
    const reason = param(recordReason(ctx, key, record));
    pairs.push(`'${name}', case when coalesce(${pred}, false) then 'true'::jsonb else to_jsonb(${reason}::text) end`);
  }
  return pairs.length ? `jsonb_build_object(${pairs.join(', ')})` : `'{}'::jsonb`;
}

/** A record's per-action answers, as `canSelect` returns them. */
export type RecordCan = Record<string, true | string>;

// ---------------------------------------------------------------------
// One record (plan 6.1.4 steps 3 and 4, kit 5.4 "Acting on one record")
// ---------------------------------------------------------------------

/** pg's Pool, or a PoolClient or Client (a transaction's connection). */
export type Queryable = Pool | ClientBase;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OneRecordCheck {
  /** The table, as SQL: `expenses`. */
  table: string;
  /** Its alias in the predicates: `e`. */
  alias: string;
  record: RecordType;
  id: string;
  /** The view permission: a miss is 404, so the record's existence is not revealed (R7). */
  view: PermissionKey;
  /** The action about to be taken: a miss on a visible record is 403 with the record-level reason. */
  action?: PermissionKey;
  /** The route's existing not-found wording (R7: unchanged). */
  notFound: string;
  /** Lock the row (`for update of <alias>`). Use inside the write transaction. */
  forUpdate?: boolean;
}

/**
 * Reads both answers about one record in ONE query, inside the caller's
 * transaction when `db` is a transaction's client:
 *
 *   select (<view pred>) as visible, (<action pred>) as allowed
 *   from expenses e where e.id = $1 for update of e
 *
 * No row, or not visible: 404 with the route's not-found wording.
 * Visible but not allowed: 403 `{ error: 'forbidden', permission, reason }`.
 * The statement that follows (the update itself) carries a
 * reviewed exemption marker: it follows this scoped read.
 */
export async function assertRecordAccess(db: Queryable, ctx: AccessContext, check: OneRecordCheck): Promise<void> {
  const values: unknown[] = [];
  const param: Param = (v) => {
    values.push(v);
    return `$${values.length}`;
  };
  const a = alias(check.alias);
  // Not a uuid cannot name a record: the same 404, never a database error.
  if (!UUID_RE.test(check.id)) throw new NotFoundException(check.notFound);
  if (!/^[a-z_][a-z0-9_.]*$/.test(check.table)) throw new Error(`scope: "${check.table}" is not a table name`);
  const idParam = param(check.id);
  const visible = scopeWhere(ctx, check.view, check.record, a, param);
  const allowed = check.action ? scopeWhere(ctx, check.action, check.record, a, param) : 'true';
  const { rows } = await db.query<{ visible: boolean; allowed: boolean }>(
    `select coalesce(${visible}, false) as visible, coalesce(${allowed}, false) as allowed
     from ${check.table} ${a}
     where ${a}.id = ${idParam}::uuid
     ${check.forUpdate ? `for update of ${a}` : ''}`,
    values,
  );
  const row = rows[0];
  if (!row || !row.visible) throw new NotFoundException(check.notFound);
  if (check.action && !row.allowed) {
    const reason = recordReason(ctx, check.action, check.record);
    throw new ForbiddenException({ error: 'forbidden', permission: check.action, reason, message: reason });
  }
}
