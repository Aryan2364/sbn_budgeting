import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';

import { unmappedMessage } from '../../src/access/mapping-check';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P9: the boot safety check (src/access/mapping-check.ts).
 * The switched code decides from roles alone, so it must refuse to
 * start on a database whose current people have old levels but no
 * roles (the mapping not applied, or applied only partly), and say how
 * to fix it. Booted for real, on one scratch database, in three states:
 *   empty (freshly migrated, nobody)  -> boots;
 *   fixtures, no mapping              -> refuses, naming the count and the fix;
 *   fixtures, mapping applied         -> boots.
 */

describe('the message (pure)', () => {
  it('names the count and the fix in plain words', () => {
    const m = unmappedMessage(12);
    assert.match(m, /12 current people have an old module level/);
    assert.match(m, /npm run access:map-levels`/);
    assert.match(m, /npm run access:map-levels -- --apply`/);
    assert.match(m, /will not start/);
    assert.match(unmappedMessage(1), /1 current person has/);
  });
});

describe('boot safety check: refuses to start until the mapping is applied (P9)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;

  before(async () => {
    db = await openScratchDatabase('p9_mapcheck');
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();
    const { prepareTestEnv } = await import('../support/test-env');
    prepareTestEnv();
  });

  after(async () => {
    await db?.close();
  });

  /** Boots the real AppModule (init runs every bootstrap hook) and closes it again. */
  async function boot(): Promise<void> {
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../../src/app.module');
    const pool = await import('../../src/db/pool');
    let app: INestApplication | undefined;
    try {
      app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
      await app.init();
    } finally {
      await app?.close();
      await pool.closePool();
    }
  }

  it('a freshly migrated, empty database boots', async () => {
    await boot();
  });

  it('old levels with no roles: refuses to start, with the count and the fix', async () => {
    const { seedFixtures } = await import('../equivalence/fixtures');
    const { tmpdir } = await import('node:os');
    await seedFixtures(db.client, tmpdir());
    const { rows } = await db.client.query<{ n: number }>(
      `select count(*)::int as n from users u
       where u.active and exists (select 1 from user_module_access m where m.user_id = u.id)`,
    );
    const expected = rows[0]!.n;
    assert.ok(expected > 0, 'the fixtures have people with old levels');
    await assert.rejects(boot(), (error: Error) => {
      assert.equal(error.message, unmappedMessage(expected));
      return true;
    });
  });

  it('an inactive person with old levels and no role does not block the start', async () => {
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    const { U } = await import('../equivalence/fixtures');
    await db.client.query('delete from user_roles where user_id = $1', [U.budget_staff]);
    await db.client.query('update users set active = false where id = $1', [U.budget_staff]);
    await boot();
    await db.client.query('update users set active = true where id = $1', [U.budget_staff]);
    await assert.rejects(boot(), (error: Error) => error.message === unmappedMessage(1));
  });

  it('after the mapping is applied, it boots', async () => {
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    await boot();
  });
});
