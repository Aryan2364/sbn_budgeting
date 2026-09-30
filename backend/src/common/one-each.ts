import { ConflictException } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

/** The designations the one-each rule applies to (plan Q1a default). */
export const ONE_EACH_KEYS = ['supervisor', 'manager'] as const;

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function oneEachMessage(
  location: string,
  designation: string,
  holder: string,
): string {
  return (
    `${location} already has a ${designation.toLowerCase()} (${holder}). ` +
    `Change it in Settings → Locations, or remove ${firstName(holder)} from ${location} first.`
  );
}

/**
 * CONTRACT section 2, the one-each rule: a location has at most one
 * Supervisor-designation person and one Manager-designation person in
 * user_locations. Checked AFTER a write, inside the same transaction,
 * against the final state — so it catches a new location, a changed
 * designation, and both at once. The caller rolls back on the throw.
 *
 * Enforced here rather than by an index because designation lives on
 * users and a cross-table unique index cannot see it (0009, part 5).
 */
export async function assertOneEach(db: Db, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const { rows } = await db.query<{ location: string; designation: string; holder: string }>(
    `select l.name as location, d.name as designation, o.name as holder
     from user_locations ul
     join users me        on me.id = ul.user_id
     join designations d  on d.id = me.designation_id and d.seed_key = any($2)
     join locations l     on l.id = ul.location_id
     join user_locations ul2 on ul2.location_id = ul.location_id and ul2.user_id <> me.id
     join users o         on o.id = ul2.user_id and o.designation_id = me.designation_id
     where me.id = any($1)
     order by l.name, o.name
     limit 1`,
    [userIds, ONE_EACH_KEYS],
  );
  const clash = rows[0];
  if (clash) {
    throw new ConflictException(oneEachMessage(clash.location, clash.designation, clash.holder));
  }
}

/** Serialises writes that touch the same locations' assignments. */
export async function lockLocations(db: PoolClient, locationIds: string[]): Promise<void> {
  if (locationIds.length === 0) return;
  await db.query('select id from locations where id = any($1) order by id for update', [
    locationIds,
  ]);
}
