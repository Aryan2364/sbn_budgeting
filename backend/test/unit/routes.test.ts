import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prepareTestEnv } from '../support/test-env';
import { discoverRoutes, startHarnessApp, type HarnessApp } from '../support/app';
import { ROUTES } from '../equivalence/cases';
import { D10_REMOVED_ROUTES } from '../equivalence/intended';
import { BASELINE_FILE, readSnapshot } from '../equivalence/snapshot';
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

  it('D10: the removed report routes are gone from the app and the cases, and still in the baseline', () => {
    const discovered = discoverRoutes(harness.app).map((r) => `${r.method} ${r.path}`);
    const baseline = readSnapshot(BASELINE_FILE());
    for (const route of D10_REMOVED_ROUTES) {
      assert.ok(!discovered.includes(route), `${route} is still served`);
      assert.equal(ROUTES[route], undefined, `${route} still has a case`);
      // The baseline is never re-recorded: D10 matches its cases as missing.
      assert.ok(baseline.routes.includes(route), `${route} is not in the baseline`);
      assert.ok(Object.keys(baseline.cases).some((k) => k.startsWith(`${route} |`)), `${route} has no baseline cases`);
    }
  });

  it('mirrors main.ts: global prefix and a guarded-by-default API', async () => {
    const res = await fetch(`${harness.baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
  });
});
