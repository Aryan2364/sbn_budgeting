import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Difference } from '../equivalence/compare';
import {
  intendedIdFor,
  matchSwitchOnly,
  missingSwitchOver,
  moduleLookup,
  type IntendedWorld,
} from '../equivalence/intended';

/**
 * The switch-over's intended differences (plan P9, 6.3.3): from P9 the
 * permission guard decides every route, so D2, D3 and D4 show as
 * differences from the (never re-recorded) baseline, matched case by
 * case on the case's two statuses, and nothing wider.
 */

const ID = 'f0000000-0000-4000-8000-000000000001';

const moduleOf = moduleLookup([
  { method: 'GET', path: '/api/cost-heads', declaredModule: 'budget' },
  { method: 'GET', path: '/api/cost-heads/:id', declaredModule: 'budget' },
  { method: 'DELETE', path: '/api/cost-heads/:id', declaredModule: 'budget' },
  { method: 'GET', path: '/api/expenses', declaredModule: 'budget' },
  { method: 'GET', path: '/api/complaints/:id', declaredModule: 'complaints' },
  { method: 'GET', path: '/api/designations', declaredModule: 'platform' },
  { method: 'GET', path: '/api/users/:id', declaredModule: 'platform' },
  { method: 'GET', path: '/api/users/picker', declaredModule: 'platform' },
]);

/** A world in which `cases` maps each key to its [baseline, run] statuses. */
function world(cases: Record<string, [unknown, unknown]>): IntendedWorld {
  return {
    runCases: Object.fromEntries(Object.entries(cases).map(([k, [, run]]) => [k, { status: run }])) as IntendedWorld['runCases'],
    baselineCases: Object.fromEntries(Object.entries(cases).map(([k, [base]]) => [k, { status: base }])),
    switchOver: {
      d2Gains: new Map([['platform_admin', new Set(['budget'])]]),
      noModuleRows: new Set(['no_module']),
      moduleOf,
    },
  };
}

const diff = (key: string, field: Difference['field'], baseline: unknown, run: unknown): Difference => ({
  key, kind: 'field', field, baseline, run,
});

describe('switch-over intended differences (P9): D2, D3, D4', () => {
  it('D2: a named platform admin reaches a gained module route they were refused, in every field', () => {
    const key = `DELETE /api/cost-heads/:id |platform_admin|${ID}`;
    const w = world({ [key]: [403, 204] });
    assert.equal(intendedIdFor(diff(key, 'status', 403, 204), w), 'D2');
    const read = `GET /api/cost-heads/:id |platform_admin|${ID}`;
    const r = world({ [read]: [403, 200] });
    assert.equal(intendedIdFor(diff(read, 'digest', undefined, 'abc'), r), 'D2');
    assert.equal(intendedIdFor(diff(read, 'keys', undefined, ['id', 'name']), r), 'D2');
  });

  it('D2: same status, only widening (no id lost)', () => {
    const key = 'GET /api/expenses |platform_admin';
    const w = world({ [key]: [200, 200] });
    assert.equal(intendedIdFor(diff(key, 'ids', ['a'], ['a', 'b']), w), 'D2');
    assert.equal(intendedIdFor(diff(key, 'total', 1, 2), w), 'D2');
    assert.equal(intendedIdFor(diff(key, 'ids', ['a', 'b'], ['a']), w), null, 'an id lost is never D2');
  });

  it('D2 never covers someone else, a module not gained, a refusal kept or a new refusal', () => {
    const other = `DELETE /api/cost-heads/:id |budget_staff|${ID}`;
    assert.equal(intendedIdFor(diff(other, 'status', 403, 204), world({ [other]: [403, 204] })), null);
    const complaints = `GET /api/complaints/:id |platform_admin|${ID}`;
    assert.equal(intendedIdFor(diff(complaints, 'status', 403, 200), world({ [complaints]: [403, 200] })), null);
    const crash = `DELETE /api/cost-heads/:id |platform_admin|${ID}`;
    assert.equal(intendedIdFor(diff(crash, 'status', 403, 500), world({ [crash]: [403, 500] })), null, 'never a server error');
    const worse = 'GET /api/expenses |platform_admin';
    assert.equal(intendedIdFor(diff(worse, 'status', 200, 403), world({ [worse]: [200, 403] })), null);
    const noWorld = `DELETE /api/cost-heads/:id |platform_admin|${ID}`;
    assert.equal(intendedIdFor(diff(noWorld, 'status', 403, 204)), null, 'no world, no match');
  });

  it('D3: a master list GET 200 -> 403, for anyone; never a write, never another change', () => {
    const key = 'GET /api/designations |budget_staff';
    assert.equal(intendedIdFor(diff(key, 'status', 200, 403), world({ [key]: [200, 403] })), 'D3');
    assert.equal(intendedIdFor(diff(key, 'ids', ['x'], undefined), world({ [key]: [200, 403] })), 'D3');
    const byId = `GET /api/cost-heads/:id |budget_staff|${ID}`;
    assert.equal(intendedIdFor(diff(byId, 'status', 200, 403), world({ [byId]: [200, 403] })), 'D3');
    const write = `DELETE /api/cost-heads/:id |budget_staff|${ID}`;
    assert.equal(intendedIdFor(diff(write, 'status', 200, 403), world({ [write]: [200, 403] })), null);
    assert.equal(intendedIdFor(diff(key, 'ids', ['x'], ['x', 'y']), world({ [key]: [200, 200] })), null);
  });

  it('D4: the picker 200 -> 403 for someone with no module rows only', () => {
    const key = 'GET /api/users/picker |no_module';
    assert.equal(intendedIdFor(diff(key, 'status', 200, 403), world({ [key]: [200, 403] })), 'D4');
    const staff = 'GET /api/users/picker |budget_staff';
    assert.equal(intendedIdFor(diff(staff, 'status', 200, 403), world({ [staff]: [200, 403] })), null);
    const byId = `GET /api/users/:id |no_module|${ID}`;
    assert.equal(intendedIdFor(diff(byId, 'status', 200, 403), world({ [byId]: [200, 403] })), null);
  });

  it('every listed entry with a population appears, and every D2 person (plan 6.3.2)', () => {
    const d2 = `DELETE /api/cost-heads/:id |platform_admin|${ID}`;
    const d3 = 'GET /api/designations |budget_staff';
    const d4 = 'GET /api/users/picker |no_module';
    const w = world({ [d2]: [403, 204], [d3]: [200, 403], [d4]: [200, 403] });
    const all = [diff(d2, 'status', 403, 204), diff(d3, 'status', 200, 403), diff(d4, 'status', 200, 403)];
    const expect = { d2People: ['platform_admin'], d3Expected: true, d4Expected: true };
    assert.deepEqual(missingSwitchOver(all, w, expect), []);
    assert.deepEqual(missingSwitchOver(all.slice(1), w, expect), [
      'expected intended difference D2 never appeared',
      'D2 lists platform_admin (mapping report), but they gained nothing',
    ]);
    assert.deepEqual(missingSwitchOver(all.slice(0, 2), w, expect), ['expected intended difference D4 never appeared']);
    // No population, nothing expected (e.g. a restore where everyone has module rows).
    assert.deepEqual(missingSwitchOver([], w, { d2People: [], d3Expected: false, d4Expected: false }), []);
  });

  it('against a pre-switch build only D2, D3 and D4 match, and D8 and D9 which came after it (--switch-only)', () => {
    const d3 = 'GET /api/designations |budget_staff';
    const d7 = 'GET /api/expenses |budget_staff';
    const w = world({ [d3]: [200, 403], [d7]: [200, 200] });
    const result = matchSwitchOnly(
      [
        diff(d3, 'status', 200, 403),
        // Would be D7 against the old baseline; a pre-switch build already sent `can`.
        diff(d7, 'itemKeys', ['id'], ['can', 'id']),
        { key: 'GET /api/pick/budget/sites', kind: 'route-only-in-run' },
        // Migration 0013 (A1) came after every pre-switch build.
        { key: 'POST /api/complaints/:id/approve', kind: 'route-only-in-baseline' },
      ],
      w,
    );
    assert.deepEqual(result.matched, { D3: 1, D8: 1 });
    assert.equal(result.unmatched.length, 2);
  });
});
