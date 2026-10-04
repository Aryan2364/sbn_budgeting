import type { ClientBase } from 'pg';

import {
  ACCESS_MANAGE_KEY,
  adminGrants,
  describeKeys,
  keyInfo,
  type Grant,
  type Scope,
} from './catalogue';
import { accessManagerRoleHolders } from './last-holder';
import { SEED_ROLES, type LegacyModule } from './seed-roles';

/**
 * Today's module levels, kept true until P11 (access plan 5.5, R11.2).
 * DELETED AT P11, with the dual-write and the compatibility shim.
 *
 * Two directions:
 *
 * 1. Roles -> levels (the dual-write). Every access write also writes
 *    `user_module_access`, in the same transaction, for every person
 *    whose derived levels changed, so redeploying the previous release
 *    is a working rollback (P9). Levels are derived from PERMISSIONS,
 *    never from role names or ids:
 *
 *      platform   admin   holds access.rights.manage (only Admin)
 *      budget     admin   holds every Budget key at All
 *      budget     staff   otherwise, any Budget key other than a Pick
 *      complaints admin   complaints.complaints.view and .reassign at All
 *      complaints member  otherwise, any Complaints key other than a Pick
 *
 *    `legacyLevelsFor` is the same rule as db/map-access-levels.ts's
 *    (test/access/access-api.test.ts holds the two in step). They are
 *    two copies on purpose: this file is deleted at P11, the mapping
 *    script is not.
 *
 * 2. Levels -> roles (the compatibility shim). The People form and the
 *    import still send module levels. `rolesForModulesPatch` turns a
 *    level into the seed role that holds it (the decision 23 mapping,
 *    by the seed roles' FIXED ids, C2), so the new tables never go stale
 *    behind the old screen.
 *
 * On the seed roles the round trip is exact: a level maps to a role, and
 * the role derives the same level back.
 */

export type LevelName = 'none' | 'admin' | 'staff' | 'member';
export type LegacyLevels = Record<LegacyModule, LevelName>;

export const LEGACY_MODULES: readonly LegacyModule[] = ['platform', 'budget', 'complaints'];

const NO_LEVELS: LegacyLevels = { platform: 'none', budget: 'none', complaints: 'none' };

/** Every Budget key other than a Pick: holding all of them at All is today's budget admin. */
const BUDGET_FULL = describeKeys()
  .filter((k) => k.module === 'budget' && k.kind !== 'pick')
  .map((k) => k.key);

/** The levels someone holding exactly `grants` would have had before roles. */
export function legacyLevelsFor(grants: readonly Grant[]): LegacyLevels {
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

type Db = Pick<ClientBase, 'query'>;

/**
 * What each person's roles grant now, read inside the caller's
 * transaction (so a change it just made is seen): their roles' stored
 * rows, plus Admin's computed grants.
 */
export async function grantsOfUsers(db: Db, userIds: readonly string[]): Promise<Map<string, Grant[]>> {
  const out = new Map<string, Grant[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return out;
  const { rows } = await db.query<{ user_id: string; key: string; scope: Scope }>(
    `select ur.user_id, rp.permission_key as key, rp.scope::text as scope
     from user_roles ur join role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = any($1::uuid[])`,
    [userIds],
  );
  for (const r of rows) out.get(r.user_id)?.push({ key: r.key, scope: r.scope });
  for (const userId of await accessManagerRoleHolders(db, userIds)) out.get(userId)?.push(...adminGrants());
  return out;
}

/** Each person's derived levels now. */
export async function levelsOfUsers(db: Db, userIds: readonly string[]): Promise<Map<string, LegacyLevels>> {
  const grants = await grantsOfUsers(db, userIds);
  return new Map([...grants].map(([id, g]) => [id, legacyLevelsFor(g)]));
}

/**
 * The dual-write (plan 6.1.11 step 7): for every person and module whose
 * derived level changed between `before` and `after`, writes the new
 * level to user_module_access (or removes the row for "none"). Modules
 * whose level did not change are left exactly as they are. Returns how
 * many rows it wrote or removed.
 */
export async function writeChangedLevels(
  db: Db,
  before: ReadonlyMap<string, LegacyLevels>,
  after: ReadonlyMap<string, LegacyLevels>,
): Promise<number> {
  let writes = 0;
  for (const [userId, now] of after) {
    const was = before.get(userId) ?? NO_LEVELS;
    for (const module of LEGACY_MODULES) {
      if (was[module] === now[module]) continue;
      writes += 1;
      if (now[module] === 'none') {
        await db.query('delete from user_module_access where user_id = $1 and module = $2', [userId, module]);
      } else {
        await db.query(
          `insert into user_module_access (user_id, module, role) values ($1, $2, $3)
           on conflict (user_id, module) do update set role = excluded.role`,
          [userId, module, now[module]],
        );
      }
    }
  }
  return writes;
}

// ---------------------------------------------------------------------
// The compatibility shim: levels -> seed roles (removed at P10/P11)
// ---------------------------------------------------------------------

/** A modules patch as the People form sends it: a level sets it, null removes it, a missing key leaves it. */
export type LevelsPatch = Partial<Record<LegacyModule, string | null | undefined>>;

/**
 * The seed roles a modules patch adds and removes (the decision 23
 * mapping, by fixed id). Setting a level gives that level's role and
 * takes the module's other seed roles; null takes them all.
 */
export function rolesForModulesPatch(patch: LevelsPatch): { add: string[]; remove: string[] } {
  const add: string[] = [];
  const remove: string[] = [];
  for (const module of LEGACY_MODULES) {
    const level = patch[module];
    if (level === undefined) continue;
    for (const seed of SEED_ROLES.filter((s) => s.heldBy.module === module)) {
      if (level !== null && seed.heldBy.role === level) add.push(seed.id);
      else remove.push(seed.id);
    }
  }
  return { add, remove };
}
