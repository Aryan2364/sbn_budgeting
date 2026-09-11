import { NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';

/**
 * The small amount of SQL plumbing every write endpoint repeats.
 *
 * Deliberately not a repository base class or a generic service: those
 * hide the SQL, and the SQL is the part worth reading. This just stops
 * five modules from each writing their own "build a SET clause" loop
 * slightly differently.
 */

/** Turns { name: 'x', phone: null } into `set name=$1, phone=$2`. */
export function buildUpdate(
  fields: Record<string, unknown>,
  startAt = 1,
): { clause: string; values: unknown[] } {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  const values = entries.map(([, v]) => v);
  const clause = entries
    .map(([column], i) => `${column} = $${startAt + i}`)
    .join(', ');
  return { clause, values };
}

export async function findOneOrFail<T>(
  pool: Pool,
  sql: string,
  values: unknown[],
  what: string,
): Promise<T> {
  const { rows } = await pool.query(sql, values);
  if (rows.length === 0) {
    // Section 7.2 rule 2: state the cause, then the next action.
    throw new NotFoundException(`That ${what} no longer exists. It may have been deleted.`);
  }
  return rows[0] as T;
}

/**
 * Postgres error codes worth translating into something a person can
 * act on. Section 7.2 rule 3: never show a raw technical error.
 */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

export function isPgError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}
