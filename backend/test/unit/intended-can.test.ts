import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import { intendedIdFor, withoutRecordCan } from '../equivalence/intended';

/**
 * D7's per-record `can` (plan 6.1.4 item 6, 6.3.3): a GET's rows or
 * detail may gain exactly `can`, and the digest ignores it; nothing else
 * is excused.
 */
describe('intended difference D7: every list row and detail gains `can`', () => {
  const keysDiff = (field: 'keys' | 'itemKeys', baseline: string[], run: string[], route = 'GET /api/complaints'): Difference => ({
    key: `${route} [tab-all] |raiser`,
    kind: 'field',
    field,
    baseline,
    run,
  });

  it('matches rows or a detail gaining exactly `can`', () => {
    assert.equal(intendedIdFor(keysDiff('itemKeys', ['id', 'name'], ['can', 'id', 'name'], 'GET /api/sites')), 'D7');
    assert.equal(intendedIdFor(keysDiff('keys', ['id', 'name'], ['can', 'id', 'name'], 'GET /api/sites/:id')), 'D7');
    // Complaints also gain `title` (migration 0014; intended-title.test.ts),
    // and the detail `rootCause` (0015; intended-rootcause-language.test.ts).
    assert.equal(intendedIdFor(keysDiff('itemKeys', ['id', 'status'], ['can', 'id', 'status', 'title'])), 'D7');
    assert.equal(
      intendedIdFor(
        keysDiff('keys', ['actions', 'id'], ['actions', 'can', 'id', 'rootCause', 'title'], 'GET /api/complaints/:id'),
      ),
      'D7',
    );
  });

  it('matches nothing else', () => {
    assert.equal(intendedIdFor(keysDiff('itemKeys', ['id', 'status'], ['can', 'extra', 'id', 'status'])), null);
    assert.equal(intendedIdFor(keysDiff('itemKeys', ['id', 'status'], ['id'])), null);
    assert.equal(intendedIdFor(keysDiff('itemKeys', ['id'], ['can', 'id'], 'POST /api/complaints')), null);
    assert.equal(intendedIdFor({ key: 'GET /api/complaints [tab-all] |raiser', kind: 'field', field: 'ids', baseline: [], run: ['x'] }), null);
    assert.equal(intendedIdFor({ key: 'GET /api/complaints [tab-all] |raiser', kind: 'field', field: 'digest', baseline: 'a', run: 'b' }), null);
  });

  it('removes `can` from the record and its rows, and nothing else', () => {
    assert.deepEqual(withoutRecordCan({ id: 1, can: { x: true }, data: [{ id: 2, can: {} }] }), { id: 1, data: [{ id: 2 }] });
    assert.deepEqual(withoutRecordCan([{ id: 1, can: {} }, { id: 2 }]), [{ id: 1 }, { id: 2 }]);
    assert.deepEqual(withoutRecordCan({ nested: { can: 1 } }), { nested: { can: 1 } });
    assert.equal(withoutRecordCan(null), null);
  });
});
