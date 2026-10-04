import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The test process's environment, set up BEFORE any application module
 * is loaded.
 *
 * Three things here are safety, not convenience:
 *
 * 1. The database comes from TEST_DATABASE_URL only, never from
 *    DATABASE_URL or backend/.env, and its name must say "test". A
 *    harness that writes (even in rolled-back transactions) must not be
 *    one typo away from production.
 * 2. The working directory is moved away from backend/ before Nest's
 *    ConfigModule loads, so backend/.env is never read. That file can
 *    hold R2 credentials; a resolve case uploads a photo, and it must
 *    land on a scratch disk, never in the real bucket.
 * 3. R2 is blanked explicitly, so the disk photo store is chosen even if
 *    the shell exported credentials.
 */

export interface TestEnv {
  databaseUrl: string;
  databaseName: string;
  uploadDir: string;
  jwtSecret: string;
}

const NAME_MUST_MATCH = /test/i;

export function testDatabaseUrl(): { url: string; name: string } {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Point it at a LOCAL, throwaway Postgres database whose ' +
        'name contains "test", e.g.\n' +
        '  TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/sadbhavna_access_test' +
        '?options=-c%20search_path%3Dpublic,complaints,shared\n' +
        'The harness creates the database if it is missing and drops it on every --setup run.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid postgres:// URL.');
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!name || !NAME_MUST_MATCH.test(name)) {
    throw new Error(
      `TEST_DATABASE_URL names the database "${name}". The harness only runs against a ` +
        'database whose name contains "test", so it can never be pointed at a real one.',
    );
  }
  return { url, name };
}

let prepared: TestEnv | undefined;

/**
 * Call once, first thing, before importing anything from src/ that
 * reads the environment (app.module, db/pool, photo stores).
 */
export function prepareTestEnv(): TestEnv {
  if (prepared) return prepared;
  const { url, name } = testDatabaseUrl();

  const scratch = join(tmpdir(), 'sadbhavna-access-harness');
  const uploadDir = join(scratch, 'uploads');
  mkdirSync(uploadDir, { recursive: true });

  // (2) Nest's ConfigModule reads `<cwd>/.env`. There is none here.
  process.chdir(scratch);

  process.env.DATABASE_URL = url;
  process.env.UPLOAD_DIR = uploadDir;
  process.env.R2_ACCOUNT_ID = '';
  process.env.R2_ACCESS_KEY_ID = '';
  process.env.R2_SECRET_ACCESS_KEY = '';
  process.env.R2_BUCKET = '';
  process.env.R2_ENDPOINT = '';
  process.env.R2_PREFIX = '';
  // A fixed secret: tokens are minted by the harness, never by a login
  // the harness depends on, and both builds of an equivalence run must
  // accept the same tokens.
  process.env.JWT_SECRET = 'access-harness-secret-not-for-anything-real';
  process.env.JWT_EXPIRES_IN = '12h';

  prepared = {
    databaseUrl: url,
    databaseName: name,
    uploadDir,
    jwtSecret: process.env.JWT_SECRET,
  };
  return prepared;
}
