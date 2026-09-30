import { UnprocessableEntityException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

import type { AuthModules } from '../common/current-user';
import type { ModuleName } from '../common/module-access.decorator';
import { lockLocations } from '../common/one-each';

type Db = Pool | PoolClient;

/**
 * The write helpers the people form and the import share, so a person
 * saved either way ends up in exactly the same state.
 */

/** Which roles each module accepts. Mirrors user_module_access_role_check (0009). */
export const MODULE_ROLES: Record<ModuleName, readonly string[]> = {
  platform: ['admin'],
  budget: ['admin', 'staff'],
  complaints: ['admin', 'member'],
};

/** A modules patch: a role sets it, null removes it, a missing key leaves it. */
export type ModulesPatch = { [K in keyof AuthModules]?: AuthModules[K] | null };

export async function applyModules(
  db: PoolClient,
  userId: string,
  patch: ModulesPatch,
): Promise<void> {
  for (const [module, role] of Object.entries(patch)) {
    if (role === undefined) continue;
    if (role === null) {
      await db.query('delete from user_module_access where user_id = $1 and module = $2', [
        userId,
        module,
      ]);
    } else {
      await db.query(
        `insert into user_module_access (user_id, module, role) values ($1, $2, $3)
         on conflict (user_id, module) do update set role = excluded.role`,
        [userId, module, role],
      );
    }
  }
}

/**
 * Replaces the person's locations with exactly `locationIds`. Locks
 * the old and the new locations first so two admins assigning the same
 * place cannot both pass the one-each check.
 */
export async function replaceLocations(
  db: PoolClient,
  userId: string,
  locationIds: string[],
): Promise<void> {
  const { rows } = await db.query<{ location_id: string }>(
    'select location_id from user_locations where user_id = $1',
    [userId],
  );
  const before = rows.map((r) => r.location_id);
  await lockLocations(db, [...new Set([...before, ...locationIds])]);
  await db.query(
    'delete from user_locations where user_id = $1 and not (location_id = any($2::uuid[]))',
    [userId, locationIds],
  );
  if (locationIds.length > 0) {
    await db.query(
      `insert into user_locations (user_id, location_id)
       select $1, unnest($2::uuid[]) on conflict do nothing`,
      [userId, locationIds],
    );
  }
}

/**
 * reports_to must not loop back (CONTRACT section 2): the routing walk
 * up the chain (plan 3.4) would never end. Checks the chain ABOVE the
 * new manager; if it passes through this person, the edge makes a loop.
 */
export async function assertNoCycle(
  db: Db,
  userId: string,
  reportsToId: string | null,
): Promise<void> {
  if (!reportsToId) return;
  if (reportsToId === userId) {
    throw new UnprocessableEntityException(
      'Someone can’t report to themselves. Choose the person they report to.',
    );
  }
  const { rows } = await db.query<{ loops: boolean; manager: string; me: string }>(
    `with recursive chain(id, depth) as (
       select $2::uuid, 0
       union all
       select u.reports_to, c.depth + 1
       from chain c join users u on u.id = c.id
       where u.reports_to is not null and c.depth < 200
     )
     select exists (select 1 from chain where id = $1::uuid) as loops,
            (select name from users where id = $2::uuid) as manager,
            (select name from users where id = $1::uuid) as me`,
    [userId, reportsToId],
  );
  const row = rows[0];
  if (row?.loops) {
    throw new UnprocessableEntityException(
      `${row.manager} already reports to ${row.me}, directly or through others, so ${row.me} ` +
        `can’t report to ${row.manager}. Choose someone higher up.`,
    );
  }
}
