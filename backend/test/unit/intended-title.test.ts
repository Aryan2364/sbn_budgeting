import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import {
  D11_CASES,
  intendedIdFor,
  matchSwitchOnly,
  missingOptionalFields,
  withoutComplaintTitle,
  type IntendedWorld,
} from '../equivalence/intended';

/**
 * The complaint title (owner decision, 6 Oct 2026; migration 0014).
 *   D7  complaint list rows and the detail gain `title`: additive only,
 *       on those two routes only, and left out of their digests only.
 *   D11 the complainant's name, phone and description are optional: the
 *       raise cases without them are ADDED cases, matched only when they
 *       answer as the same person's full raise does.
 */

const LIST = 'GET /api/complaints [tab-all] |raiser';
const DETAIL = 'GET /api/complaints/:id |raiser|30000000-0000-4000-8000-000000000001';
const keys = (key: string, field: 'keys' | 'itemKeys', baseline: string[], run: string[]): Difference => ({
  key, kind: 'field', field, baseline, run: [...run].sort(),
});

describe('intended difference D7: complaints gain `title`', () => {
  it('list rows gaining `can` and `title` together, or `title` alone, is D7', () => {
    assert.equal(intendedIdFor(keys(LIST, 'itemKeys', ['id', 'status'], ['can', 'id', 'status', 'title'])), 'D7');
    assert.equal(intendedIdFor(keys(LIST, 'itemKeys', ['can', 'id', 'status'], ['can', 'id', 'status', 'title'])), 'D7');
  });

  it('the detail gaining them beside D8 removals is still matched', () => {
    const d = keys(
      'GET /api/complaints/:id |raiser|x',
      'keys',
      ['actions', 'approver', 'ceo', 'hod', 'id', 'requiresApproval'],
      ['actions', 'can', 'id', 'title'],
    );
    assert.equal(intendedIdFor(d, { runCases: {} }), 'D8');
    assert.equal(intendedIdFor(keys(DETAIL, 'keys', ['actions', 'id'], ['actions', 'can', 'id', 'title'])), 'D7');
  });

  it('nothing wider: another key, another route, or a key lost never matches', () => {
    assert.equal(intendedIdFor(keys(LIST, 'itemKeys', ['id'], ['can', 'id', 'title', 'extra'])), null);
    assert.equal(intendedIdFor(keys(LIST, 'itemKeys', ['description', 'id'], ['can', 'id', 'title'])), null);
    assert.equal(intendedIdFor(keys('GET /api/sites |raiser', 'itemKeys', ['id'], ['can', 'id', 'title'])), null);
    assert.equal(intendedIdFor(keys('GET /api/complaints/summary |raiser', 'keys', ['a'], ['a', 'title'])), null);
    const field: Difference = { key: LIST, kind: 'field', field: 'total', baseline: 3, run: 4 };
    assert.equal(intendedIdFor(field), null);
  });

  it('the digest drops `title` on the two complaint routes only, and nothing else', () => {
    const row = { id: '1', title: 'T', description: 'D' };
    assert.deepEqual(withoutComplaintTitle('/api/complaints', [row]), [{ id: '1', description: 'D' }]);
    assert.deepEqual(
      withoutComplaintTitle('/api/complaints/30000000-0000-4000-8000-000000000001', row),
      { id: '1', description: 'D' },
    );
    assert.deepEqual(withoutComplaintTitle('/api/complaints/summary', row), row);
    assert.deepEqual(withoutComplaintTitle('/api/sites', [row]), [row]);
    assert.deepEqual(withoutComplaintTitle('/api/notifications', { items: [row] }), { items: [row] });
  });
});

describe('intended difference D11: complainant name, phone and description optional', () => {
  const world = (statuses: Record<string, number>): IntendedWorld => ({
    runCases: Object.fromEntries(Object.entries(statuses).map(([k, status]) => [k, { status }])),
  });
  const added = (key: string): Difference => ({ key, kind: 'case-only-in-run' });
  const [WITHOUT, BLANK] = D11_CASES as [string, string];

  it('an added D11 case answered as the full raise is D11', () => {
    const w = world({
      'POST /api/complaints |raiser': 201,
      [`${WITHOUT} |raiser`]: 201,
      'POST /api/complaints |budget_staff': 403,
      [`${BLANK} |budget_staff`]: 403,
    });
    assert.equal(intendedIdFor(added(`${WITHOUT} |raiser`), w), 'D11');
    assert.equal(intendedIdFor(added(`${BLANK} |budget_staff`), w), 'D11');
    assert.equal(matchSwitchOnly([added(`${WITHOUT} |raiser`)], w).unmatched.length, 0);
  });

  it('a different answer from the full raise, a missing case, a field or another route never matches', () => {
    const w = world({ 'POST /api/complaints |raiser': 201, [`${WITHOUT} |raiser`]: 400 });
    assert.equal(intendedIdFor(added(`${WITHOUT} |raiser`), w), null);
    assert.equal(intendedIdFor(added(`${WITHOUT} |raiser`)), null, 'needs the run');
    assert.equal(intendedIdFor({ key: `${WITHOUT} |raiser`, kind: 'case-only-in-baseline' }, w), null);
    const field: Difference = { key: `${WITHOUT} |raiser`, kind: 'field', field: 'status', baseline: 400, run: 201 };
    assert.equal(intendedIdFor(field, w), null);
    const other = world({ 'POST /api/complaints |raiser': 201, 'POST /api/complaints [other] |raiser': 201 });
    assert.equal(intendedIdFor(added('POST /api/complaints [other] |raiser'), other), null);
  });

  it('must appear: each D11 case must succeed for someone', () => {
    const ok = world({
      'POST /api/complaints |raiser': 201,
      [`${WITHOUT} |raiser`]: 201,
      [`${BLANK} |raiser`]: 201,
    });
    assert.deepEqual(missingOptionalFields([added(`${WITHOUT} |raiser`), added(`${BLANK} |raiser`)], ok), []);
    const refused = world({ 'POST /api/complaints |raiser': 403, [`${WITHOUT} |raiser`]: 403, [`${BLANK} |raiser`]: 403 });
    assert.equal(missingOptionalFields([added(`${WITHOUT} |raiser`), added(`${BLANK} |raiser`)], refused).length, 2);
  });
});
