import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import {
  D10_REMOVED_ROUTES,
  intendedIdFor,
  matchSwitchOnly,
  missingRemovals,
  type IntendedWorld,
} from '../equivalence/intended';

/**
 * D10 (owner decision, 6 Oct 2026): GET /reports/variance/periods and
 * GET /reports/variance/sites/:siteId were removed as unused. Only their
 * route and their cases MISSING from a run match; nothing else does.
 */

const PERIODS = 'GET /api/reports/variance/periods';
const SITE = 'GET /api/reports/variance/sites/:siteId';
const w: IntendedWorld = { runCases: {} };

describe('intended difference D10 (removed report routes)', () => {
  it('lists exactly the two removed routes', () => {
    assert.deepEqual([...D10_REMOVED_ROUTES].sort(), [PERIODS, SITE]);
  });

  it('their route and every one of their cases missing from a run is D10', () => {
    assert.equal(intendedIdFor({ key: PERIODS, kind: 'route-only-in-baseline' }, w), 'D10');
    assert.equal(intendedIdFor({ key: SITE, kind: 'route-only-in-baseline' }, w), 'D10');
    assert.equal(intendedIdFor({ key: `${PERIODS} |budget_staff`, kind: 'case-only-in-baseline' }, w), 'D10');
    assert.equal(intendedIdFor({ key: `${SITE} |(signed out)`, kind: 'case-only-in-baseline' }, w), 'D10');
    // Without a world too (the matcher needs nothing from it).
    assert.equal(intendedIdFor({ key: `${SITE} |ceo`, kind: 'case-only-in-baseline' }), 'D10');
  });

  it('nothing else matches: not their neighbours, not a case added, not a field', () => {
    const neighbours = [
      'GET /api/reports/variance',
      'GET /api/reports/variance/periods-summary',
      'GET /api/reports/variance/head-periods',
      'GET /api/reports/variance/summary',
      'GET /api/sites/:id',
    ];
    for (const route of neighbours) {
      assert.equal(intendedIdFor({ key: route, kind: 'route-only-in-baseline' }, w), null, route);
      assert.equal(intendedIdFor({ key: `${route} |budget_staff`, kind: 'case-only-in-baseline' }, w), null, route);
    }
    assert.equal(intendedIdFor({ key: PERIODS, kind: 'route-only-in-run' }, w), null);
    assert.equal(intendedIdFor({ key: `${SITE} |ceo`, kind: 'case-only-in-run' }, w), null);
    const field: Difference = { key: `${PERIODS} |budget_staff`, kind: 'field', field: 'status', baseline: 200, run: 404 };
    assert.equal(intendedIdFor(field, w), null);
  });

  it('every listed route must appear as removed', () => {
    const both: Difference[] = [
      { key: PERIODS, kind: 'route-only-in-baseline' },
      { key: SITE, kind: 'route-only-in-baseline' },
    ];
    assert.deepEqual(missingRemovals(both), []);
    assert.equal(missingRemovals([both[0]!]).length, 1);
    assert.match(missingRemovals([both[0]!])[0]!, /sites\/:siteId/);
    // Missing cases alone do not prove the route is gone.
    assert.equal(missingRemovals([{ key: `${PERIODS} |ceo`, kind: 'case-only-in-baseline' }]).length, 2);
  });

  it('against a pre-switch build D10 matches too (it came after it)', () => {
    const result = matchSwitchOnly([{ key: SITE, kind: 'route-only-in-baseline' }], w);
    assert.deepEqual(result.matched, { D10: 1 });
    assert.equal(result.unmatched.length, 0);
  });
});
