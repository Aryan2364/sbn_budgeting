import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prepareTestEnv } from '../support/test-env';
import { discoverRoutes, startHarnessApp, type HarnessApp } from '../support/app';
import { ROUTES } from '../equivalence/cases';

/**
 * Every route the app serves has a baseline case, and every baseline
 * case names a route that exists. A new endpoint without a case would
 * otherwise only show up as "NO-CASE" rows in a long report.
 */

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe('access baseline route coverage', { skip: enabled ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let harness: HarnessApp;

  before(async () => {
    prepareTestEnv();
    harness = await startHarnessApp();
  });

  after(async () => {
    await harness.close();
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
