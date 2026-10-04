import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';

import { seedFixtures } from '../equivalence/fixtures';
import { migrateTestDatabase, recreateTestDatabase } from '../support/test-db';
import { testDatabaseUrl } from '../support/test-env';

/**
 * Scratch databases for the access tests (plan P1).
 *
 * Each test file gets its own database, named after TEST_DATABASE_URL's
 * with a suffix (so it still says "test"), freshly migrated and dropped
 * at the end. node --test runs files in parallel, and the P0 tests use
 * the main test database; separate databases keep them out of each
 * other's way. Never reads DATABASE_URL or backend/.env.
 */

export const dbTestsEnabled = Boolean(process.env.TEST_DATABASE_URL);
export const SKIP_REASON = 'TEST_DATABASE_URL is not set';

export interface ScratchDb {
  client: Client;
  name: string;
  close(): Promise<void>;
}

function scratchTarget(suffix: string): { url: string; name: string } {
  const { url, name } = testDatabaseUrl();
  const scratch = `${name}_${suffix}`;
  const parsed = new URL(url);
  parsed.pathname = `/${scratch}`;
  return { url: parsed.toString(), name: scratch };
}

async function dropDatabase(target: { url: string; name: string }): Promise<void> {
  if (!/test/i.test(target.name)) throw new Error(`Refusing to drop "${target.name}".`);
  const parsed = new URL(target.url);
  parsed.pathname = '/postgres';
  parsed.search = '';
  const admin = new Client({ connectionString: parsed.toString() });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${target.name.replace(/"/g, '""')}" with (force)`);
  } finally {
    await admin.end();
  }
}

/** A freshly migrated scratch database, optionally seeded with the P0 fixtures. */
export async function openScratchDatabase(suffix: string, options: { fixtures?: boolean } = {}): Promise<ScratchDb> {
  const target = scratchTarget(suffix);
  await recreateTestDatabase({ drop: true, target });
  await migrateTestDatabase(target);
  const client = new Client({ connectionString: target.url });
  await client.connect();
  if (options.fixtures) {
    const uploadDir = join(tmpdir(), 'sadbhavna-access-p1-tests', suffix);
    mkdirSync(uploadDir, { recursive: true });
    await seedFixtures(client, uploadDir);
  }
  return {
    client,
    name: target.name,
    close: async () => {
      await client.end();
      await dropDatabase(target);
    },
  };
}

/** A small deterministic PRNG, so a failing random test can be replayed. */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function count(client: Client, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ n: number }>(`select (${sql})::int as n`, params);
  return rows[0]!.n;
}

export async function accessVersion(client: Client): Promise<string> {
  const { rows } = await client.query<{ v: string }>('select access_version as v from access_settings');
  return rows[0]!.v;
}
