import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { loadEnv } from './env';
import { closePool, getPool } from './pool';

loadEnv();

/**
 * Plain SQL migrations, applied in filename order, each inside its own
 * transaction, each recorded with a checksum.
 *
 * No ORM migration format on purpose. The variance definition is the
 * heart of this product and it is SQL; a generated migration file would
 * put a layer between the reviewer and the only thing worth reviewing.
 *
 * The checksum is not paranoia. Editing a migration that has already
 * run leaves every other database in the world on the old version while
 * the file says otherwise, and the failure surfaces months later as a
 * column that exists on one machine. This refuses to start instead.
 */
const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'migrations');

function checksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export async function migrate(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    create table if not exists schema_migrations (
      version    text        primary key,
      checksum   text        not null,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Map<string, string>();
  const existing = await pool.query<{ version: string; checksum: string }>(
    'select version, checksum from schema_migrations',
  );
  for (const row of existing.rows) applied.set(row.version, row.checksum);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  let ran = 0;

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const sum = checksum(sql);
    const seen = applied.get(version);

    if (seen !== undefined) {
      if (seen !== sum) {
        throw new Error(
          `Migration ${version} has changed since it was applied. ` +
            `Write a new migration instead of editing an applied one.`,
        );
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into schema_migrations (version, checksum) values ($1, $2)',
        [version, sum],
      );
      await client.query('commit');
      // eslint-disable-next-line no-console
      console.log(`applied ${version}`);
      ran += 1;
    } catch (error) {
      await client.query('rollback');
      throw new Error(
        `Migration ${version} failed and was rolled back: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      client.release();
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    ran === 0 ? 'nothing to apply, schema is current' : `${ran} migration(s) applied`,
  );
}

if (require.main === module) {
  migrate()
    .then(() => closePool())
    .catch(async (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : error);
      await closePool();
      process.exit(1);
    });
}
