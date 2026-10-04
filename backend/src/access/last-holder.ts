import { ConflictException } from '@nestjs/common';
import type { ClientBase } from 'pg';

/**
 * Someone must always be able to manage access (decision 21, access plan
 * 6.1.11 steps 1 and 4, R7, R11.4, R11.9; backend kit 7.2-7.3; frontend
 * kit 40.11).
 *
 * Only the Admin role grants `access.rights.manage` (revised O1), so the
 * people who can manage access are the active people who can sign in and
 * hold Admin. Every access write runs in one transaction that first takes
 * the access lock below, reads the managers BEFORE the change, applies
 * it, and calls `assertSomeoneCanManageAccess`: if nobody is left, the
 * write rolls back with a 409 naming the person it would have taken it
 * from. It covers removing Admin from them, deactivating them, turning
 * off their sign-in and deleting them. Removing your own Admin while
 * someone else holds it is allowed.
 *
 * The lock serialises every access write (R11.9), so two admins removing
 * each other at the same moment cannot both succeed: the second waits,
 * then sees the first's change and is refused.
 *
 * This file is the "last-holder query" of self-check A2: one of the few
 * places `system_key` is read, and the only one in the access API.
 */

/** The advisory-lock key every access write takes (the mapping re-sync and the site lead change use it too). */
export const ACCESS_LOCK_KEY = 'sadbhavna.access';

type Db = Pick<ClientBase, 'query'>;

/** Serialises access writes until the transaction ends. Call first, inside the write's transaction. */
export async function takeAccessLock(db: Db): Promise<void> {
  await db.query('select pg_advisory_xact_lock(hashtext($1))', [ACCESS_LOCK_KEY]);
}

/** The ids of the people who can manage access now, as a subquery. */
export const ACCESS_MANAGERS_SQL = `
  select lhu.id
  from users lhu /*scope-exempt: the last-holder rule counts every person who can manage access*/
  join user_roles lhur on lhur.user_id = lhu.id
  join roles lhr on lhr.id = lhur.role_id
  where lhr.system_key = 'admin'
    and lhu.active and lhu.can_login and lhu.password_hash is not null`;

/**
 * SQL that is true when the person `userIdSql` is the ONLY person who can
 * manage access (R11.4): they are counted, and nobody else is.
 */
export function isLastAccessManagerSql(userIdSql: string): string {
  return `coalesce((select array_agg(distinct lhm.id) from (${ACCESS_MANAGERS_SQL}) lhm) = array[${userIdSql}]::uuid[], false)`;
}

/** The ids of the role or roles that grant access.rights.manage (Admin). */
export async function accessManagerRoleIds(db: Db): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `select r.id from roles r where r.system_key = 'admin' order by r.id`,
  );
  return rows.map((r) => r.id);
}

/** Admin's people, for the dual-write's derived levels: who holds the computed role. */
export async function accessManagerRoleHolders(db: Db, userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { rows } = await db.query<{ user_id: string }>(
    `select ur.user_id from user_roles ur join roles r on r.id = ur.role_id
     where r.system_key = 'admin' and ur.user_id = any($1::uuid[])`,
    [userIds],
  );
  return new Set(rows.map((r) => r.user_id));
}

export interface AccessManager {
  id: string;
  name: string;
}

/** The people who can manage access now, by name. */
export async function accessManagers(db: Db): Promise<AccessManager[]> {
  const { rows } = await db.query<AccessManager>(
    `select u.id, u.name
     from users u /*scope-exempt: the last-holder rule names the people who can manage access*/
     where u.id in (${ACCESS_MANAGERS_SQL})
     order by u.name, u.id`,
  );
  return rows;
}

/** Kit 40.11's sentence. Names what the person can do, never a role. */
export function lastHolderReason(name: string): string {
  return `${name} is the only person who can manage access. Give that to someone else first.`;
}

/** 409 `{ error: 'blocked', reason }` (R7). `message` repeats the reason for today's client. */
export function blocked(reason: string): ConflictException {
  return new ConflictException({ error: 'blocked', reason, message: reason });
}

/**
 * After the change, inside the same locked transaction: refuses (409)
 * when the change left nobody who can manage access. A database that
 * had nobody before is not made worse by this change, so it is not
 * refused here.
 */
export async function assertSomeoneCanManageAccess(db: Db, before: readonly AccessManager[]): Promise<void> {
  if (before.length === 0) return;
  const after = await accessManagers(db);
  if (after.length > 0) return;
  throw blocked(lastHolderReason(before[0]!.name));
}
