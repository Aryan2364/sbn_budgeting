import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import {
  D14_PUSH_ROUTES,
  intendedIdFor,
  matchSwitchOnly,
  missingPushRoutes,
  type IntendedWorld,
} from '../equivalence/intended';

/**
 * D14 (owner, 13 Oct 2026; plan-phone Phase 6a): POST and DELETE
 * /push/subscriptions are new. Only those two routes and their cases
 * ADDED to a run match; nothing else does.
 */

const POST = 'POST /api/push/subscriptions';
const DEL = 'DELETE /api/push/subscriptions';
const w: IntendedWorld = { runCases: {} };

describe('intended difference D14 (phone notification routes)', () => {
  it('lists exactly the two push routes', () => {
    assert.deepEqual([...D14_PUSH_ROUTES].sort(), [DEL, POST]);
  });

  it('their route and every one of their cases added in a run is D14', () => {
    assert.equal(intendedIdFor({ key: POST, kind: 'route-only-in-run' }, w), 'D14');
    assert.equal(intendedIdFor({ key: DEL, kind: 'route-only-in-run' }, w), 'D14');
    assert.equal(intendedIdFor({ key: `${POST} |supervisor`, kind: 'case-only-in-run' }, w), 'D14');
    assert.equal(intendedIdFor({ key: `${DEL} |(signed out)`, kind: 'case-only-in-run' }), 'D14');
  });

  it('nothing else matches: not missing from a run, not another push route, not a field', () => {
    assert.equal(intendedIdFor({ key: POST, kind: 'route-only-in-baseline' }, w), null);
    assert.equal(intendedIdFor({ key: `${DEL} |ceo`, kind: 'case-only-in-baseline' }, w), null);
    for (const other of ['GET /api/push/subscriptions', 'POST /api/push/send', 'POST /api/notifications/read-all']) {
      assert.equal(intendedIdFor({ key: other, kind: 'route-only-in-run' }, w), null, other);
      assert.equal(intendedIdFor({ key: `${other} |ceo`, kind: 'case-only-in-run' }, w), null, other);
    }
    const field: Difference = { key: `${POST} |ceo`, kind: 'field', field: 'status', baseline: 204, run: 400 };
    assert.equal(intendedIdFor(field, w), null);
  });

  it('every listed route must appear as added', () => {
    const both: Difference[] = [
      { key: POST, kind: 'route-only-in-run' },
      { key: DEL, kind: 'route-only-in-run' },
    ];
    assert.deepEqual(missingPushRoutes(both), []);
    assert.equal(missingPushRoutes([both[0]!]).length, 1);
    assert.match(missingPushRoutes([both[0]!])[0]!, /DELETE/);
    // Added cases alone do not prove the route is new.
    assert.equal(missingPushRoutes([{ key: `${POST} |ceo`, kind: 'case-only-in-run' }]).length, 2);
  });

  it('against a pre-switch build D14 matches too (it came after it)', () => {
    const result = matchSwitchOnly([{ key: POST, kind: 'route-only-in-run' }], w);
    assert.deepEqual(result.matched, { D14: 1 });
    assert.equal(result.unmatched.length, 0);
  });
});
