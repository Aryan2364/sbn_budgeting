import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchShadow, parseShadowLine, routeMatcher, type ShadowWorld } from '../equivalence/intended';

/**
 * The shadow classification the equivalence run applies (plan 6.3.3):
 * every ACCESS-SHADOW line must be D2, D3 or D4 as the plan defines
 * them, and anything else is unplanned.
 */

const ADMIN = 'a0000000-0000-4000-8000-000000000001';
const STAFF = 'a0000000-0000-4000-8000-000000000004';
const NOBODY = 'a0000000-0000-4000-8000-00000000000e';
const ID = 'f0000000-0000-4000-8000-000000000001';

const world: ShadowWorld = {
  routeOf: routeMatcher([
    { method: 'GET', path: '/api/cost-heads', declaredModule: 'budget' },
    { method: 'GET', path: '/api/cost-heads/:id', declaredModule: 'budget' },
    { method: 'DELETE', path: '/api/cost-heads/:id', declaredModule: 'budget' },
    { method: 'GET', path: '/api/complaints/:id', declaredModule: 'complaints' },
    { method: 'GET', path: '/api/users/:id', declaredModule: 'platform' },
    { method: 'GET', path: '/api/users/picker', declaredModule: 'platform' },
  ]),
  adminGains: new Map([[ADMIN, new Set(['budget'])]]),
  noModuleRows: new Set([NOBODY]),
};

const line = (rest: string): string => rest;

describe('shadow classification', () => {
  it('parses a guard line', () => {
    assert.deepEqual(parseShadowLine(`GET /api/users/picker user=${NOBODY} old=allow new=deny permission=platform.people.pick`), {
      method: 'GET',
      path: '/api/users/picker',
      user: NOBODY,
      old: 'allow',
      next: 'deny',
      permission: 'platform.people.pick',
      raw: `GET /api/users/picker user=${NOBODY} old=allow new=deny permission=platform.people.pick`,
    });
    assert.equal(parseShadowLine('nonsense'), null);
  });

  it('matches D2, D3 and D4 exactly as the plan defines them, and nothing else', () => {
    const result = matchShadow(
      [
        // D2: a platform admin gains Budget.
        line(`DELETE /api/cost-heads/${ID} user=${ADMIN} old=deny new=allow`),
        // D3: a master GET by a non-manager.
        line(`GET /api/cost-heads/${ID} user=${STAFF} old=allow new=deny permission=budget.cost_heads.manage`),
        // D4: the picker, for someone with no module rows.
        line(`GET /api/users/picker user=${NOBODY} old=allow new=deny permission=platform.people.pick`),
        // Unplanned: the admin gains Complaints, which the report does not list.
        line(`GET /api/complaints/${ID} user=${ADMIN} old=deny new=allow`),
        // Unplanned: a non-admin gains something.
        line(`DELETE /api/cost-heads/${ID} user=${STAFF} old=deny new=allow`),
        // Unplanned: a master WRITE refused, or a GET refused for another key.
        line(`DELETE /api/cost-heads/${ID} user=${STAFF} old=allow new=deny permission=budget.cost_heads.manage`),
        line(`GET /api/cost-heads user=${STAFF} old=allow new=deny permission=budget.sites.view`),
        // Unplanned: the picker refused to someone who has module rows; /users/:id is not the picker.
        line(`GET /api/users/picker user=${STAFF} old=allow new=deny permission=platform.people.pick`),
        line(`GET /api/users/${ID} user=${NOBODY} old=allow new=deny permission=platform.people.pick`),
        'garbage',
      ],
      world,
    );
    assert.deepEqual(result.matched, { D2: 1, D3: 1, D4: 1 });
    assert.equal(result.unmatched.length, 6);
    assert.deepEqual(result.unparsed, ['garbage']);
  });

  it('a static route segment beats a parameter', () => {
    assert.equal(world.routeOf('GET', '/api/users/picker')?.route, 'GET /api/users/picker');
    assert.equal(world.routeOf('GET', `/api/users/${ID}`)?.route, 'GET /api/users/:id');
    assert.equal(world.routeOf('POST', '/api/users/picker'), null);
  });
});
