import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { checkRoutes, type RouteHandler } from '../../src/access/boot-guard';
import { declarationsOf } from '../../src/access/decorators';
import { PlatformPickController } from '../../src/pick/platform-pick.controller';
import { UsersController } from '../../src/users/users.controller';
import { intendedIdFor } from '../equivalence/intended';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P3b, platform lane, "Done when": the scope filter through
 * the REAL routes, on a fixture graph, with the query guard in 'throw'
 * mode, so any statement of these routes that reads a guarded table
 * without a scope marker fails the request:
 *   - GET /pick/platform/people: the people Pick, scoped by the Pick
 *     scopes held, searched on the server (name and designation),
 *     narrowed by designationId and canReceive, at most 50, by name,
 *     exactly { id, name, designationName }; 403 without the Pick;
 *   - GET /pick/platform/designations and /locations: everyone, active
 *     ones unless includeInactive=true, the declared fields only;
 *   - GET /users and GET /users/:id through platform.people.view: the
 *     list is the scoped set; a person outside it is the same 404;
 *   - PATCH and DELETE /users/:id: out of view scope 404, visible but
 *     outside the action's scope 403 with the reason;
 *   - GET /users/picker (the alias): scoped by the Pick; from P9 a
 *     caller with no Pick (D4) is refused 403.
 *
 * The graph:
 *   ceo
 *    └ hod
 *       ├ mgrA ─ supA        S1: manager mgrA, supervisor supA
 *       └ mgrB ─ supB        S2: manager mgrB, supervisor supB
 *   office (ticked S2), outsider, noLogin (cannot sign in), gone (inactive)
 *   60 "Bulk" people, for the 50-match cap.
 */

const id = (n: number): string => `b2000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const P = {
  ceo: id(1), hod: id(2), mgrA: id(3), supA: id(4), mgrB: id(5), supB: id(6),
  office: id(7), outsider: id(8), noLogin: id(9), gone: id(10),
} as const;
type Who = keyof typeof P;
const LABEL: Record<string, string> = Object.fromEntries(Object.entries(P).map(([k, v]) => [v, k]));
const labels = (ids: string[]): string[] => ids.map((i) => LABEL[i] ?? 'bulk').sort();

const SUPERVISOR = id(101);
const RETIRED = id(102);
const NORTH = id(201);
const OLD_PLACE = id(202);
const S1 = id(301);
const S2 = id(302);

const ROLE = { team: id(401), units: id(402), own: id(403), all: id(404), pickOwn: id(405), editOwn: id(406) };

const NOT_FOUND = 'That person no longer exists. It may have been deleted.';

async function seed(db: ScratchDb['client']): Promise<void> {
  await db.query('begin');
  await db.query(
    `insert into designations (id, name, sort_order, is_active) values
       ($1, 'Pick Supervisor', 900, true), ($2, 'Pick Retired', 901, false)`,
    [SUPERVISOR, RETIRED],
  );
  await db.query(
    `insert into locations (id, name, is_active) values ($1, 'Pick North', true), ($2, 'Pick Old Place', false)`,
    [NORTH, OLD_PLACE],
  );
  const people: Array<[Who, Who | null, boolean, boolean]> = [
    // name, reports to, can sign in, active
    ['ceo', null, true, true], ['hod', 'ceo', true, true], ['mgrA', 'hod', true, true],
    ['supA', 'mgrA', true, true], ['mgrB', 'hod', true, true], ['supB', 'mgrB', true, true],
    ['office', null, true, true], ['outsider', null, true, true],
    ['noLogin', null, false, true], ['gone', null, true, false],
  ];
  for (const [who, , canLogin, active] of people) {
    await db.query(
      `insert into users (id, name, email, password_hash, can_login, active, designation_id)
       values ($1, $2, $3, 'x', $4, $5, $6)`,
      [P[who], `Person ${who}`, `${who}@p3b.test`, canLogin, active, who.startsWith('sup') ? SUPERVISOR : null],
    );
  }
  for (const [who, boss] of people) {
    if (boss) await db.query('update users set reports_to = $2 where id = $1', [P[who], P[boss]]);
  }
  for (let n = 1; n <= 60; n += 1) {
    await db.query(`insert into users (name, can_login) values ($1, false)`, [`Bulk ${String(n).padStart(2, '0')}`]);
  }
  await db.query(
    `insert into sites (id, name, planned_trees, plantation_start_date, manager_id, supervisor_id, location_id) values
       ($1, 'Pick S1', 10, '2025-01-01', $3, $4, $7), ($2, 'Pick S2', 10, '2025-01-01', $5, $6, $7)`,
    [S1, S2, P.mgrA, P.supA, P.mgrB, P.supB, NORTH],
  );
  await db.query('insert into user_units (user_id, unit_id) values ($1, $2)', [P.office, S2]);

  // Roles at each scope. Viewing a section implies its own Pick at the same scope.
  const role = async (roleId: string, name: string, rows: Array<[string, string]>): Promise<void> => {
    await db.query('insert into roles (id, name) values ($1, $2)', [roleId, name]);
    for (const [key, scope] of rows) {
      await db.query('insert into role_permissions (role_id, permission_key, scope) values ($1, $2, $3)', [roleId, key, scope]);
    }
  };
  await role(ROLE.team, 'P3b team people', [
    ['platform.people.view', 'team'], ['platform.people.edit', 'team'], ['platform.people.delete', 'team'],
  ]);
  await role(ROLE.units, 'P3b units people', [['platform.people.view', 'units']]);
  await role(ROLE.own, 'P3b own people', [['platform.people.view', 'own']]);
  await role(ROLE.all, 'P3b all people', [['platform.people.view', 'all']]);
  await role(ROLE.pickOwn, 'P3b pick own', [['platform.people.pick', 'own']]);
  await role(ROLE.editOwn, 'P3b view all edit own', [
    ['platform.people.view', 'all'], ['platform.people.edit', 'own'], ['platform.people.delete', 'own'],
  ]);
  const give: Array<[Who, string]> = [
    ['hod', ROLE.team], ['office', ROLE.units], ['supA', ROLE.own], ['ceo', ROLE.all],
    ['mgrA', ROLE.pickOwn], ['mgrB', ROLE.editOwn],
  ];
  for (const [who, roleId] of give) {
    await db.query('insert into user_roles (user_id, role_id) values ($1, $2)', [P[who], roleId]);
  }
  await db.query('commit');
}

describe('platform scope through the real routes (P3b)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;

  async function call(
    path: string,
    as: Who,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: any }> {
    const { testTxIdle } = await import('../support/test-tx');
    const headers: Record<string, string> = { authorization: `Bearer ${harness.mintToken({ id: P[as], name: as })}` };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${harness.baseUrl}/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    await testTxIdle();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** Every row of a paginated list, at the largest page size. */
  async function all(path: string, as: Who): Promise<{ status: number; ids: string[]; total: number }> {
    const ids: string[] = [];
    let total = 0;
    for (let page = 1; page < 50; page += 1) {
      const sep = path.includes('?') ? '&' : '?';
      const res = await call(`${path}${sep}page=${page}&pageSize=100`, as);
      if (res.status !== 200) return { status: res.status, ids: [], total: 0 };
      ids.push(...res.body.data.map((r: { id: string }) => r.id));
      total = res.body.total;
      if (page >= res.body.totalPages) break;
    }
    return { status: 200, ids, total };
  }

  const named = (ids: string[]): string[] => labels(ids.filter((i) => LABEL[i]));

  before(async () => {
    db = await openScratchDatabase('p3b_platform');
    await seed(db.client);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();
    const { startHarnessApp } = await import('../support/app');
    harness = await startHarnessApp({ queryGuard: 'throw' });
  });

  after(async () => {
    await harness?.close();
    await db?.close();
  });

  // ---- the people Pick ------------------------------------------------

  it('people Pick: scoped by the Pick scopes held (Own, Team, Selected sites, All)', async () => {
    const pick = async (as: Who): Promise<string[]> => {
      const res = await call('/pick/platform/people?q=Person', as);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return labels(res.body.map((r: { id: string }) => r.id));
    };
    assert.deepEqual(await pick('mgrA'), ['mgrA']); // Pick at Own: themselves
    assert.deepEqual(await pick('supA'), ['supA']); // view at Own implies the Pick at Own
    assert.deepEqual(await pick('hod'), ['hod', 'mgrA', 'mgrB', 'supA', 'supB']);
    assert.deepEqual(await pick('office'), ['mgrB', 'office', 'supB']); // the leads of their ticked S2
    assert.deepEqual(await pick('ceo'), Object.keys(P).sort());
  });

  it('people Pick: 403 with the reason without the Pick', async () => {
    const res = await call('/pick/platform/people', 'outsider');
    assert.equal(res.status, 403);
    assert.equal(res.body.permission, 'platform.people.pick');
    assert.match(res.body.reason, /^Only people allowed to /);
  });

  it('people Pick: exactly id, name and designationName; at most 50, by name, with no paging', async () => {
    const res = await call('/pick/platform/people?q=Bulk', 'ceo');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 50);
    assert.deepEqual(Object.keys(res.body[0]).sort(), ['designationName', 'id', 'name']);
    const names = res.body.map((r: { name: string }) => r.name);
    assert.equal(names[0], 'Bulk 01');
    assert.equal(names[49], 'Bulk 50');
    // The 51st and later are reached by searching, never by preloading.
    const later = await call('/pick/platform/people?q=Bulk%2060', 'ceo');
    assert.deepEqual(later.body.map((r: { name: string }) => r.name), ['Bulk 60']);
  });

  it('people Pick: q matches the name or the designation; designationId and canReceive narrow', async () => {
    const byDesignation = await call('/pick/platform/people?q=pick%20superv', 'ceo');
    assert.deepEqual(labels(byDesignation.body.map((r: { id: string }) => r.id)), ['supA', 'supB']);
    assert.equal(byDesignation.body[0].designationName, 'Pick Supervisor');

    const filtered = await call(`/pick/platform/people?designationId=${SUPERVISOR}`, 'hod');
    assert.deepEqual(labels(filtered.body.map((r: { id: string }) => r.id)), ['supA', 'supB']);

    const receivers = await call('/pick/platform/people?q=Person&canReceive=true', 'ceo');
    const got = labels(receivers.body.map((r: { id: string }) => r.id));
    assert.ok(!got.includes('noLogin') && !got.includes('gone'), got.join(','));
    assert.ok(got.includes('supA'));

    // A filter only narrows: the scope still applies under it.
    const narrowed = await call(`/pick/platform/people?designationId=${SUPERVISOR}`, 'supA');
    assert.deepEqual(labels(narrowed.body.map((r: { id: string }) => r.id)), ['supA']);

    assert.equal((await call('/pick/platform/people?designationId=nope', 'ceo')).status, 400);
    assert.equal((await call('/pick/platform/people?canReceive=maybe', 'ceo')).status, 400);
    assert.equal((await call('/pick/platform/people?q=a&q=b', 'ceo')).status, 400);
  });

  it('people Pick: a search is text, not a pattern', async () => {
    const res = await call('/pick/platform/people?q=%25', 'ceo');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  // ---- the master Picks -----------------------------------------------

  it('designations and locations Picks: everyone, active only unless includeInactive, declared fields', async () => {
    const d = await call('/pick/platform/designations?q=Pick', 'outsider');
    assert.equal(d.status, 200);
    assert.deepEqual(d.body, [{ id: SUPERVISOR, name: 'Pick Supervisor', seedKey: null, isActive: true }]);
    const dAll = await call('/pick/platform/designations?q=Pick&includeInactive=true', 'outsider');
    assert.deepEqual(dAll.body.map((r: { name: string; isActive: boolean }) => [r.name, r.isActive]), [
      ['Pick Retired', false], ['Pick Supervisor', true],
    ]);

    const l = await call('/pick/platform/locations?q=Pick', 'outsider');
    assert.equal(l.status, 200);
    assert.deepEqual(l.body, [{ id: NORTH, name: 'Pick North', isActive: true }]);
    const lAll = await call('/pick/platform/locations?q=pick&includeInactive=true', 'outsider');
    assert.deepEqual(lAll.body.map((r: { name: string }) => r.name), ['Pick North', 'Pick Old Place']);
  });

  it('designations Pick: carries the routing seed keys the screens find their defaults by', async () => {
    const res = await call('/pick/platform/designations', 'outsider');
    const keys = res.body.map((r: { seedKey: string | null }) => r.seedKey).filter(Boolean);
    assert.ok(keys.includes('supervisor') && keys.includes('hod'), keys.join(','));
  });

  // ---- the people list and record -------------------------------------

  it('GET /users: the scoped set, with total and pages over it', async () => {
    const team = await all('/users', 'hod');
    assert.equal(team.status, 200);
    assert.deepEqual(labels(team.ids), ['hod', 'mgrA', 'mgrB', 'supA', 'supB']);
    assert.equal(team.total, 5);
    assert.deepEqual(labels((await all('/users', 'office')).ids), ['mgrB', 'office', 'supB']);
    assert.deepEqual(labels((await all('/users', 'supA')).ids), ['supA']);
    const everyone = await all('/users', 'ceo');
    assert.equal(everyone.total, 70);
    assert.deepEqual(named(everyone.ids), Object.keys(P).sort());
  });

  it('GET /users and /users/:id: each person carries can, from the same query, for the actions held', async () => {
    const team = await call('/users?pageSize=100', 'hod');
    for (const row of team.body.data) assert.deepEqual(row.can, { edit: true, delete: true });
    const other = await call(`/users/${P.supA}`, 'mgrB');
    assert.deepEqual(other.body.can, {
      edit: 'You can edit people only for yourself.',
      delete: 'You can delete people only for yourself.',
    });
    assert.deepEqual((await call(`/users/${P.mgrB}`, 'mgrB')).body.can, { edit: true, delete: true });
    // Neither action held: nothing to answer (the page-level check covers it).
    assert.deepEqual((await call(`/users/${P.supA}`, 'ceo')).body.can, {});
  });

  it('GET /users/:id: inside the scope 200; outside it the same 404 as a missing person', async () => {
    assert.equal((await call(`/users/${P.supB}`, 'hod')).status, 200);
    const outside = await call(`/users/${P.outsider}`, 'hod');
    assert.equal(outside.status, 404);
    assert.equal(outside.body.message, NOT_FOUND);
    const missing = await call(`/users/${id(999)}`, 'hod');
    assert.deepEqual(missing.body, outside.body);
  });

  it('PATCH /users/:id: out of view scope 404; visible but outside the edit scope 403 with the reason', async () => {
    const patch = (target: Who, as: Who) =>
      call(`/users/${P[target]}`, as, { method: 'PATCH', body: { name: `Person ${target}` } });
    assert.equal((await patch('supA', 'hod')).status, 200);
    const outside = await patch('outsider', 'hod');
    assert.equal(outside.status, 404);
    assert.equal(outside.body.message, NOT_FOUND);
    const refused = await patch('supA', 'mgrB');
    assert.equal(refused.status, 403);
    assert.equal(refused.body.permission, 'platform.people.edit');
    assert.equal(refused.body.reason, 'You can edit people only for yourself.');
    assert.equal((await patch('mgrB', 'mgrB')).status, 200);
  });

  it('DELETE /users/:id: out of view scope 404; visible but outside the delete scope 403', async () => {
    assert.equal((await call(`/users/${P.outsider}`, 'hod', { method: 'DELETE' })).status, 404);
    const refused = await call(`/users/${P.office}`, 'mgrB', { method: 'DELETE' });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.permission, 'platform.people.delete');
    // Inside the scope, today's rules still apply: supB leads S2.
    assert.equal((await call(`/users/${P.supB}`, 'hod', { method: 'DELETE' })).status, 409);
  });

  // ---- the alias --------------------------------------------------------

  it('GET /users/picker: scoped by the Pick; a caller with no Pick is refused 403 (D4, from P9)', async () => {
    assert.deepEqual(labels((await all('/users/picker', 'mgrA')).ids), ['mgrA']);
    assert.deepEqual(labels((await all('/users/picker', 'hod')).ids), ['hod', 'mgrA', 'mgrB', 'supA', 'supB']);
    const refused = await call('/users/picker', 'outsider');
    assert.equal(refused.status, 403);
    assert.equal(refused.body.permission, 'platform.people.pick');
    const shape = await call('/users/picker?pageSize=1', 'hod');
    assert.deepEqual(Object.keys(shape.body.data[0]).sort(), ['designationName', 'id', 'matchedField', 'matchedValue', 'name']);
  });
});

// ---------------------------------------------------------------------
// No database
// ---------------------------------------------------------------------

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

function handlersOf(controller: new (...a: never[]) => unknown): RouteHandler[] {
  const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).flatMap((name) => {
    const fn = proto[name];
    if (name === 'constructor' || typeof fn !== 'function') return [];
    const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
    const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
    if (method === undefined || path === undefined) return [];
    return [{ route: `${METHODS[method]} /${base}/${path}`, isPublic: false, declarations: declarationsOf(fn) }];
  });
}

describe('platform Pick routes (P3b, no database)', () => {
  it('every platform Pick a permission needs, or everyone picks, has its @PickOf route', () => {
    const handlers = [...handlersOf(PlatformPickController), ...handlersOf(UsersController)];
    const { errors } = checkRoutes(handlers, { requireDeclarations: true, requirePickRoutes: true });
    const platform = errors.filter((e) => e.includes('"platform.'));
    assert.deepEqual(platform, []);
    const routes = handlersOf(PlatformPickController).map((h) => `${h.route} ${JSON.stringify(h.declarations)}`);
    assert.deepEqual(routes.sort(), [
      'GET /pick/platform/designations [{"kind":"pickOf","section":"platform.designations"}]',
      'GET /pick/platform/locations [{"kind":"pickOf","section":"platform.locations"}]',
      'GET /pick/platform/people [{"kind":"pickOf","section":"platform.people"}]',
    ]);
  });

  it('equivalence: an ADDED /pick or /access route or case is D7; a missing one, or any other, is not', () => {
    assert.equal(intendedIdFor({ key: 'GET /api/pick/platform/people', kind: 'route-only-in-run' }), 'D7');
    assert.equal(intendedIdFor({ key: 'GET /api/pick/platform/people [q] |Ceo', kind: 'case-only-in-run' }), 'D7');
    assert.equal(intendedIdFor({ key: 'GET /api/access/roles |Ceo', kind: 'case-only-in-run' }), 'D7');
    assert.equal(intendedIdFor({ key: 'GET /api/pick/platform/people', kind: 'route-only-in-baseline' }), null);
    assert.equal(intendedIdFor({ key: 'GET /api/pick/platform/people |Ceo', kind: 'case-only-in-baseline' }), null);
    assert.equal(intendedIdFor({ key: 'GET /api/users/picker2', kind: 'route-only-in-run' }), null);
    assert.equal(intendedIdFor({ key: 'GET /api/picker/x |Ceo', kind: 'case-only-in-run' }), null);
  });
});
