import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prepareTestEnv } from '../support/test-env';
import { discoverRoutes, startHarnessApp, type HarnessApp } from '../support/app';
import { ROUTES } from '../equivalence/cases';
import { openScratchDatabase, type ScratchDb } from '../access/support';

/**
 * Every route the app serves has a baseline case, and every baseline
 * case names a route that exists. A new endpoint without a case would
 * otherwise only show up as "NO-CASE" rows in a long report.
 *
 * It boots on its own freshly migrated, empty scratch database: since
 * P9 the app checks the role mapping at boot (access/mapping-check.ts),
 * which needs the tables, so it cannot boot on whatever state the
 * shared test database happens to be in.
 */

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe('access baseline route coverage', { skip: enabled ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let harness: HarnessApp;
  let db: ScratchDb;

  before(async () => {
    db = await openScratchDatabase('routes');
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();
    prepareTestEnv();
    harness = await startHarnessApp();
  });

  after(async () => {
    await harness?.close();
    await db?.close();
  });

  it('every discovered route has a case, and every case a route', () => {
    const discovered = discoverRoutes(harness.app).map((r) => `${r.method} ${r.path}`);
    const missing = discovered.filter((k) => !ROUTES[k]);
    const stale = Object.keys(ROUTES).filter((k) => !discovered.includes(k));
    assert.deepEqual(missing, [], `routes with no baseline case: ${missing.join(', ')}`);
    assert.deepEqual(stale, [], `baseline cases for routes that no longer exist: ${stale.join(', ')}`);
  });

  it('mirrors main.ts: global prefix and a guarded-by-default API', async () => {
    const res = await fetch(`${harness.baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
  });
});
