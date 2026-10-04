import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ClientBase } from 'pg';

import {
  ACCESS_MANAGE_KEY,
  adminGrants,
  deriveRoleRows,
  describeKeys,
  isPermissionKey,
  keyInfo,
  type Grant,
  type Scope,
} from '../access/catalogue';
import { SEED_ROLES, SEED_ROLE_IDS, insertSeedRole, type LegacyModule, type SeedRole } from '../access/seed-roles';
import { loadEnv } from './env';
import { closePool, getPool } from './pool';

/**
 * The decision 23 mapping: today's levels (user_module_access) to the
 * seed roles. Access plan section 5.4, R11.1, corrected by C1-C4.
 *
 *   npm run access:map-levels              DRY RUN (the default): prints
 *                                          every change it would make and
 *                                          the report; writes nothing
 *   npm run access:map-levels -- --apply   makes the changes, in one
 *                                          transaction
 *
 * It is a FULL RE-SYNC. On every run, for each seed role (found by its
 * fixed id, C2): create it if missing; make its role_permissions rows
 * exactly the seed set, adding and removing; make its holders exactly
 * the people whose user_module_access rows imply it, adding and
 * removing. Picks are derived as a role save derives them. Every change
 * writes one access_audit row, actor System, note "Decision 23 mapping".
 * A second run with no data change makes no change, writes no rows and
 * does not move access_version. It never touches a role whose id is not
 * a seed id, and it never renames a seed role back.
 *
 * It runs at P1 and again at P9, immediately before the switch. After
 * P10 ships it must never run again: from then roles carry more than
 * levels can say, and a re-sync would undo role work.
 */

export const AUDIT_NOTE = 'Decision 23 mapping';
export const SYSTEM_ACTOR = 'System';
const ACCESS_LOCK = 'sadbhavna.access';

export type ChangeKind = 'role.created' | 'role.permissions_changed' | 'user.role_added' | 'user.role_removed';

export interface ResyncChange {
  kind: ChangeKind;
  roleId: string;
  roleName: string;
  /** Present on user.role_* changes. */
  userId?: string;
  userName?: string;
  /** Present on role.permissions_changed. */
  added?: Grant[];
  removed?: Grant[];
  text: string;
}

export interface Person {
  id: string;
  name: string;
}

export interface MappingReport {
  /** 1. Holders per role, after the run. */
  holders: Array<{ roleId: string; roleName: string; people: Person[] }>;
  /** 2. Platform admins who are not budget admins (revised O1): Admin gives them Budget, and maybe Complaints. */
  platformLevelOnly: Array<Person & { gains: string[] }>;
  /** 3. Every other Admin gain: platform + budget admins who are not complaints admins. */
  otherAdminGains: Array<Person & { gains: string[] }>;
  /** 4. People whose active flag is false (set by migration 0012, section 5.1.8). */
  inactive: Person[];
  /** 5. Sites no active person covers: no active lead and no ticked user_units row. */
  uncoveredSites: Person[];
  /** 6. People whose roles grant less than their module rows did. Must be empty. */
  underGranted: Array<Person & { module: LegacyModule; had: string; derived: string }>;
}

export interface ResyncResult {
  applied: boolean;
  changes: ResyncChange[];
  auditRows: number;
  report: MappingReport;
}

interface RoleRow {
  id: string;
  name: string;
  description: string;
}

const SCOPE_ORDER: readonly Scope[] = ['own', 'team', 'units', 'all'];

const grantId = (g: Grant): string => `${g.key}|${g.scope}`;
const grantText = (g: Grant): string => `${g.key} (${g.scope})`;

function permissionSnapshot(rows: readonly Grant[]): { permissions: Record<string, Scope[]> } {
  const out: Record<string, Scope[]> = {};
  for (const r of [...rows].sort((a, b) => a.key.localeCompare(b.key))) {
    (out[r.key] ??= []).push(r.scope);
  }
  for (const scopes of Object.values(out)) scopes.sort((a, b) => SCOPE_ORDER.indexOf(a) - SCOPE_ORDER.indexOf(b));
  return { permissions: out };
}

// ---------------------------------------------------------------------
// Today's levels, derived back from permissions (plan 5.5), used only
// for report item 6. P6's access/legacy-levels.ts must agree with this.
// ---------------------------------------------------------------------

const LEVEL_RANK: Record<string, number> = { none: 0, staff: 1, member: 1, admin: 2 };

const BUDGET_FULL = describeKeys()
  .filter((k) => k.module === 'budget' && k.kind !== 'pick')
  .map((k) => k.key);

export function legacyLevelsFor(grants: readonly Grant[]): Record<LegacyModule, string> {
  const atAll = new Set(grants.filter((g) => g.scope === 'all').map((g) => g.key));
  const nonPick = (module: string): boolean =>
    grants.some((g) => g.key.startsWith(`${module}.`) && keyInfo(g.key)?.kind !== 'pick');
  return {
    platform: atAll.has(ACCESS_MANAGE_KEY) ? 'admin' : 'none',
    budget: BUDGET_FULL.every((k) => atAll.has(k)) ? 'admin' : nonPick('budget') ? 'staff' : 'none',
    complaints:
      atAll.has('complaints.complaints.view') && atAll.has('complaints.complaints.reassign')
        ? 'admin'
        : nonPick('complaints')
          ? 'member'
          : 'none',
  };
}

// ---------------------------------------------------------------------
// The re-sync
// ---------------------------------------------------------------------

export interface ResyncOptions {
  /** false (the default) = dry run: compute and report, write nothing. */
  apply?: boolean;
}

export async function resyncAccessMapping(db: ClientBase, options: ResyncOptions = {}): Promise<ResyncResult> {
  const apply = options.apply === true;
  await db.query('begin');
  try {
    // Serialise against every other access write (R11.9).
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [ACCESS_LOCK]);
    const result = await plan(db, apply);
    if (apply && result.report.underGranted.length) {
      throw new Error(
        'Refusing to apply: some people would hold less than their module rows give them today ' +
          '(report item 6). Nothing was written.',
      );
    }
    await db.query(apply ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function plan(db: ClientBase, apply: boolean): Promise<ResyncResult> {
  const roles = (
    await db.query<RoleRow>('select id, name, description from roles order by name')
  ).rows;
  const rolesById = new Map(roles.map((r) => [r.id, r]));

  const users = (
    await db.query<{ id: string; name: string; active: boolean }>(
      'select id, name, active from users /*scope-exempt: the mapping script re-syncs the roles of every person from their levels*/ order by name, id',
    )
  ).rows;

  const levels = (
    await db.query<{ user_id: string; module: LegacyModule; role: string }>(
      'select user_id, module, role from user_module_access',
    )
  ).rows;
  const levelOf = new Map<string, Partial<Record<LegacyModule, string>>>();
  for (const l of levels) (levelOf.get(l.user_id) ?? levelOf.set(l.user_id, {}).get(l.user_id)!)[l.module] = l.role;

  const permRows = (
    await db.query<{ role_id: string; permission_key: string; scope: Scope }>(
      'select role_id, permission_key, scope from role_permissions',
    )
  ).rows;
  const permsOf = new Map<string, Grant[]>();
  for (const p of permRows) {
    (permsOf.get(p.role_id) ?? permsOf.set(p.role_id, []).get(p.role_id)!).push({
      key: p.permission_key,
      scope: p.scope,
    });
  }

  const holdings = (await db.query<{ user_id: string; role_id: string }>('select user_id, role_id from user_roles')).rows;
  const rolesOfUser = new Map<string, Set<string>>();
  for (const h of holdings) (rolesOfUser.get(h.user_id) ?? rolesOfUser.set(h.user_id, new Set()).get(h.user_id)!).add(h.role_id);

  const changes: ResyncChange[] = [];
  let auditRows = 0;

  const audit = async (row: {
    action: ChangeKind;
    targetType: 'role' | 'user';
    targetId: string;
    targetName: string;
    roleId: string;
    roleName: string;
    before: unknown;
    after: unknown;
  }): Promise<void> => {
    auditRows += 1;
    if (!apply) return;
    await db.query(
      `insert into access_audit (actor_id, actor_name, action, target_type, target_id, target_name,
                                 role_id, role_name, before, after, note)
       values (null, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [SYSTEM_ACTOR, row.action, row.targetType, row.targetId, row.targetName, row.roleId, row.roleName,
       row.before === null ? null : JSON.stringify(row.before),
       row.after === null ? null : JSON.stringify(row.after), AUDIT_NOTE],
    );
  };

  // 1. Roles: create any seed role that is missing. Never rename.
  for (const seed of SEED_ROLES) {
    if (rolesById.has(seed.id)) continue;
    const clash = roles.find((r) => r.name.toLowerCase() === seed.name.toLowerCase());
    if (clash) {
      throw new Error(
        `Seed role "${seed.name}" (${seed.id}) is missing, and role "${clash.name}" (${clash.id}) ` +
          'already has its name. Resolve that by hand; the re-sync never touches other roles.',
      );
    }
    if (apply) await insertSeedRole(db, seed);
    const created: RoleRow = { id: seed.id, name: seed.name, description: seed.description };
    roles.push(created);
    rolesById.set(seed.id, created);
    changes.push({ kind: 'role.created', roleId: seed.id, roleName: seed.name, text: `create role "${seed.name}"` });
    await audit({
      action: 'role.created', targetType: 'role', targetId: seed.id, targetName: seed.name,
      roleId: seed.id, roleName: seed.name, before: null,
      after: { name: seed.name, description: seed.description },
    });
  }

  // 2. Permissions: exactly the seed set, Picks derived. Admin holds no
  //    rows (it is computed, and a trigger refuses them). Seed roles are
  //    known by their fixed ids (C2), never by their system key.
  for (const seed of SEED_ROLES) {
    const role = rolesById.get(seed.id)!;
    const current = permsOf.get(seed.id) ?? [];
    const desired = seed.id === SEED_ROLE_IDS.admin ? [] : rowsFor(seed);
    const currentIds = new Set(current.map(grantId));
    const desiredIds = new Set(desired.map(grantId));
    const added = desired.filter((g) => !currentIds.has(grantId(g)));
    const removed = current.filter((g) => !desiredIds.has(grantId(g)));
    if (!added.length && !removed.length) continue;

    if (apply) {
      for (const g of removed) {
        await db.query('delete from role_permissions where role_id = $1 and permission_key = $2 and scope = $3', [
          seed.id, g.key, g.scope,
        ]);
      }
      if (added.length) {
        await db.query(
          `insert into role_permissions (role_id, permission_key, scope)
           select $1, k, s::access_scope from unnest($2::text[], $3::text[]) as t(k, s)`,
          [seed.id, added.map((g) => g.key), added.map((g) => g.scope)],
        );
      }
      await db.query('update roles set updated_at = now() where id = $1', [seed.id]);
    }
    permsOf.set(seed.id, desired);
    const parts = [...added.map((g) => `add ${grantText(g)}`), ...removed.map((g) => `remove ${grantText(g)}`)];
    changes.push({
      kind: 'role.permissions_changed', roleId: seed.id, roleName: role.name, added, removed,
      text: `role "${role.name}": ${parts.join(', ')}`,
    });
    await audit({
      action: 'role.permissions_changed', targetType: 'role', targetId: seed.id, targetName: role.name,
      roleId: seed.id, roleName: role.name,
      before: permissionSnapshot(current), after: permissionSnapshot(desired),
    });
  }

  // 3. Holders: exactly the people whose module rows imply the role.
  const roleList = (userId: string): Array<{ id: string; name: string }> =>
    [...(rolesOfUser.get(userId) ?? [])]
      .map((id) => ({ id, name: rolesById.get(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  for (const seed of SEED_ROLES) {
    const role = rolesById.get(seed.id)!;
    for (const user of users) {
      const wants = levelOf.get(user.id)?.[seed.heldBy.module] === seed.heldBy.role;
      const holds = rolesOfUser.get(user.id)?.has(seed.id) ?? false;
      if (wants === holds) continue;
      const before = { roles: roleList(user.id) };
      const held = rolesOfUser.get(user.id) ?? rolesOfUser.set(user.id, new Set()).get(user.id)!;
      if (wants) {
        if (apply) {
          await db.query('insert into user_roles (user_id, role_id, granted_by) values ($1, $2, null)', [
            user.id, seed.id,
          ]);
        }
        held.add(seed.id);
      } else {
        if (apply) {
          await db.query('delete from user_roles where user_id = $1 and role_id = $2', [user.id, seed.id]);
        }
        held.delete(seed.id);
      }
      const kind: ChangeKind = wants ? 'user.role_added' : 'user.role_removed';
      changes.push({
        kind, roleId: seed.id, roleName: role.name, userId: user.id, userName: user.name,
        text: `${wants ? 'give' : 'take'} "${role.name}" ${wants ? 'to' : 'from'} ${user.name}`,
      });
      await audit({
        action: kind, targetType: 'user', targetId: user.id, targetName: user.name,
        roleId: seed.id, roleName: role.name, before, after: { roles: roleList(user.id) },
      });
    }
  }

  // 4. The report, from the state after the run (planned, on a dry run).
  const effective = (userId: string): Grant[] => {
    const out: Grant[] = [];
    for (const roleId of rolesOfUser.get(userId) ?? []) {
      if (roleId === SEED_ROLE_IDS.admin) out.push(...adminGrants());
      else out.push(...(permsOf.get(roleId) ?? []).filter((g) => isPermissionKey(g.key)));
    }
    return out;
  };

  const report: MappingReport = {
    holders: [],
    platformLevelOnly: [],
    otherAdminGains: [],
    inactive: users.filter((u) => !u.active).map(({ id, name }) => ({ id, name })),
    uncoveredSites: [],
    underGranted: [],
  };

  const seedOrder = new Map(SEED_ROLES.map((s, i) => [s.id, i]));
  const orderedRoles = [...roles].sort(
    (a, b) => (seedOrder.get(a.id) ?? 99) - (seedOrder.get(b.id) ?? 99) || a.name.localeCompare(b.name),
  );
  for (const role of orderedRoles) {
    report.holders.push({
      roleId: role.id,
      roleName: role.name,
      people: users.filter((u) => rolesOfUser.get(u.id)?.has(role.id)).map(({ id, name }) => ({ id, name })),
    });
  }

  for (const user of users) {
    const had = levelOf.get(user.id) ?? {};
    if (had.platform === 'admin') {
      const gains: string[] = [];
      if (had.budget !== 'admin') gains.push(had.budget === 'staff' ? 'Budget (from staff to everything)' : 'Budget');
      if (had.complaints !== 'admin') {
        gains.push(had.complaints === 'member' ? 'Complaints (from member to everything)' : 'Complaints');
      }
      if (had.budget !== 'admin') report.platformLevelOnly.push({ id: user.id, name: user.name, gains });
      else if (gains.length) report.otherAdminGains.push({ id: user.id, name: user.name, gains });
    }
    const derived = legacyLevelsFor(effective(user.id));
    for (const module of ['platform', 'budget', 'complaints'] as const) {
      const before = had[module] ?? 'none';
      if ((LEVEL_RANK[derived[module]] ?? 0) < (LEVEL_RANK[before] ?? 0)) {
        report.underGranted.push({ id: user.id, name: user.name, module, had: before, derived: derived[module] });
      }
    }
  }

  report.uncoveredSites = (
    await db.query<Person>(
      `select s.id, s.name /*scope-exempt: the mapping report lists every site nobody covers*/
         from sites s
        where not exists (select 1 from users u
                           where u.active and (u.id = s.manager_id or u.id = s.supervisor_id))
          and not exists (select 1 from user_units uu join users u on u.id = uu.user_id
                           where uu.unit_id = s.id and u.active)
        order by s.name, s.id`,
    )
  ).rows;

  return { applied: apply, changes, auditRows, report };
}

function rowsFor(seed: SeedRole): Grant[] {
  return deriveRoleRows(seed.grants.map(([key, scope]) => ({ key, scope }))).rows;
}

// ---------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------

export function formatResync(result: ResyncResult): string {
  const lines: string[] = [];
  const { report } = result;
  const people = (list: Person[]): string => (list.length ? list.map((p) => p.name).join(', ') : '(none)');

  lines.push(
    result.applied
      ? 'Access mapping re-sync (decision 23): APPLIED.'
      : 'Access mapping re-sync (decision 23): DRY RUN. Nothing was written. Re-run with --apply to make these changes.',
  );
  lines.push('');
  lines.push(`Changes (${result.changes.length}; ${result.auditRows} audit row(s)${result.applied ? ' written' : ' would be written'}):`);
  if (!result.changes.length) lines.push('  none: the seed roles already match user_module_access.');
  for (const c of result.changes) lines.push(`  - ${c.text}`);

  lines.push('');
  lines.push('PLATFORM-ADMIN-ONLY PEOPLE (revised O1). Admin gives them modules they do not have today;');
  lines.push('each is an intended difference (D2):');
  if (!report.platformLevelOnly.length) lines.push('  (none)');
  for (const p of report.platformLevelOnly) lines.push(`  - ${p.name}: gains ${p.gains.join(' and ')}`);

  lines.push('');
  lines.push('Report');
  lines.push('1. Holders per role:');
  for (const h of report.holders) lines.push(`   ${h.roleName} (${h.people.length}): ${people(h.people)}`);
  lines.push('2. Platform-admin-only people: see the list above.');
  lines.push('3. Other Admin gains (platform + budget admins who are not complaints admins):');
  if (!report.otherAdminGains.length) lines.push('   (none)');
  for (const p of report.otherAdminGains) lines.push(`   - ${p.name}: gains ${p.gains.join(' and ')}`);
  lines.push(`4. Inactive people (${report.inactive.length}): ${people(report.inactive)}`);
  lines.push(`5. Sites nobody covers (${report.uncoveredSites.length}): ${people(report.uncoveredSites)}`);
  lines.push(`6. People whose roles grant less than their module rows (must be none): ${report.underGranted.length}`);
  for (const u of report.underGranted) lines.push(`   - ${u.name}: ${u.module} was ${u.had}, roles give ${u.derived}`);
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------

export const REPORT_FILE = resolve(__dirname, '..', '..', 'access-mapping-report.txt');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const known = new Set(['--apply', '--dry-run']);
  const unknown = args.filter((a) => !known.has(a));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(' ')}. Use --dry-run (default) or --apply.`);
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('Pass --apply or --dry-run, not both.');
  const apply = args.includes('--apply');

  // The environment wins; backend/.env is read only when it names no database.
  if (!process.env.DATABASE_URL) loadEnv();

  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ db: string }>('select current_database() as db');
    const result = await resyncAccessMapping(client, { apply });
    const text = `Database: ${rows[0]?.db}\nRun at: ${new Date().toISOString()}\n${formatResync(result)}`;
    process.stdout.write(text);
    writeFileSync(REPORT_FILE, text);
    process.stdout.write(`\nReport saved to ${REPORT_FILE}\n`);
    if (result.report.underGranted.length) process.exitCode = 1;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  main()
    .then(() => closePool())
    .catch(async (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
