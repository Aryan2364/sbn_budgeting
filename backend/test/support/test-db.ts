import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Client } from 'pg';

import { testDatabaseUrl } from './test-env';

/**
 * Creating, resetting and migrating the throwaway test database.
 *
 * The migration loop is a copy of src/db/migrate.ts on purpose rather
 * than an import of it: migrate.ts loads backend/.env at import time,
 * and the harness must never read that file (see test-env.ts). The
 * checksum and the one-transaction-per-file rule are the same, so a
 * migration that would fail in production fails here too.
 */

/** backend/migrations, from either test/support or dist-test/test/support. */
function migrationsDir(): string {
  const candidates = [
    resolve(__dirname, '..', '..', 'migrations'),
    resolve(__dirname, '..', '..', '..', 'migrations'),
  ];
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).some((f) => f.endsWith('.sql'))) return dir;
    } catch {
      // try the next one
    }
  }
  throw new Error(`Could not find backend/migrations from ${__dirname}`);
}

function maintenanceUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  parsed.search = '';
  return parsed.toString();
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Drops (if asked) and creates the test database. Refuses non-test names.
 * `target` defaults to TEST_DATABASE_URL; the access tests pass a scratch
 * database of their own (test/access/support.ts), which must also say "test".
 */
export async function recreateTestDatabase({
  drop,
  target,
}: {
  drop: boolean;
  target?: { url: string; name: string };
}): Promise<void> {
  const { url, name } = target ?? testDatabaseUrl();
  if (!/test/i.test(name)) throw new Error(`Refusing to create or drop "${name}": not a test database.`);
  const admin = new Client({ connectionString: maintenanceUrl(url) });
  await admin.connect();
  try {
    if (drop) {
      await admin.query(`drop database if exists ${quoteIdent(name)} with (force)`);
    }
    const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [name]);
    if (!rowCount) await admin.query(`create database ${quoteIdent(name)}`);
  } finally {
    await admin.end();
  }
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Applies the pending migrations, in order. `through` stops after that
 * version (e.g. '0012_access'), so data written for an older schema can
 * be seeded and then carried forward by the later migrations, exactly
 * as production data is (test/equivalence/fixtures.ts FIXTURE_SCHEMA).
 */
export async function migrateTestDatabase(
  target?: { url: string },
  { through }: { through?: string } = {},
): Promise<string[]> {
  const { url } = target ?? testDatabaseUrl();
  const client = new Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`
      create table if not exists schema_migrations (
        version    text        primary key,
        checksum   text        not null,
        applied_at timestamptz not null default now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      'select version, checksum from schema_migrations',
    );
    const seen = new Map(rows.map((r) => [r.version, r.checksum]));
    const dir = migrationsDir();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      const version = file.replace(/\.sql$/, '');
      if (through !== undefined && version > through) break;
      const sql = readFileSync(join(dir, file), 'utf8');
      const sum = checksum(sql);
      const prior = seen.get(version);
      if (prior !== undefined) {
        if (prior !== sum) throw new Error(`Migration ${version} changed since it was applied.`);
        continue;
      }
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (version, checksum) values ($1, $2)', [
          version,
          sum,
        ]);
        await client.query('commit');
        applied.push(version);
      } catch (error) {
        await client.query('rollback');
        throw new Error(
          `Migration ${version} failed on the test database: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

/** Runs `work` with a plain client on the test database, outside the app. */
export async function withTestClient<T>(
  work: (client: Client) => Promise<T>,
  target?: { url: string },
): Promise<T> {
  const { url } = target ?? testDatabaseUrl();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
