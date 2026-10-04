import type { Pool, PoolClient } from 'pg';

/**
 * Boot safety check (access plan P9). From the switch-over the server
 * decides from roles alone, so a database whose people still have only
 * their old levels (user_module_access) and no roles would refuse every
 * one of them everything. That happens if the switched code is started
 * before the decision 23 mapping (`npm run access:map-levels -- --apply`)
 * has run, or after it ran only partly.
 *
 * So the app refuses to start when any CURRENT person (users.active)
 * holds an old level but no role at all. A freshly migrated, empty
 * database has nobody, and passes. One query, at boot only; it is
 * never run per request.
 *
 * Until P11 every access write keeps the old levels in step with the
 * roles (the dual-write, plan 5.5), so a mapped database stays mapped.
 * P11 DELETES this check together with user_module_access: the query
 * reads that table, so without it the server would refuse to start.
 */

export const UNMAPPED_PEOPLE_SQL = `
  select count(*)::int as n
  from users u /*scope-exempt: the boot safety check counts every current person with old levels and no role*/
  where u.active
    and exists (select 1 from user_module_access m where m.user_id = u.id)
    and not exists (select 1 from user_roles ur where ur.user_id = u.id)`;

/** The plain-English refusal, naming the count and the fix. */
export function unmappedMessage(count: number): string {
  const people = count === 1 ? '1 current person has' : `${count} current people have`;
  return (
    `Access mapping not applied: ${people} an old module level (user_module_access) but no role. ` +
    'This version decides access from roles only, so they would be refused everything. ' +
    'The server will not start until this is fixed. Fix: run `npm run access:map-levels` (a dry run that ' +
    'changes nothing), review its report, then run `npm run access:map-levels -- --apply`, and start ' +
    'the server again. On the production server the same script is ' +
    '`docker compose --env-file .env.production -f docker-compose.deploy.yml run --rm migrate ' +
    'node dist/db/map-access-levels.js` (add `--apply` after review).'
  );
}

/** Counts current people with an old level and no role. */
export async function countUnmappedPeople(db: Pool | PoolClient): Promise<number> {
  const { rows } = await db.query<{ n: number }>(UNMAPPED_PEOPLE_SQL);
  return rows[0]?.n ?? 0;
}

/** Throws `unmappedMessage` when anyone is unmapped. */
export async function assertMappingApplied(db: Pool | PoolClient): Promise<void> {
  const n = await countUnmappedPeople(db);
  if (n > 0) throw new Error(unmappedMessage(n));
}
