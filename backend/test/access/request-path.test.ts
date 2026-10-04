import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Pool } from 'pg';

import { SKIP_REASON, accessVersion, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * The access request path on the real app (access plan P2a, "Done when"):
 *   - boot validation passes (the app boots; the route check is clean);
 *   - one query per request: the user row brings role ids and the
 *     access version, and the role map answers from memory;
 *   - a role edit is seen on the next request, with ONE reload however
 *     many requests arrive at once;
 *   - deactivating a person gives 401 on their next request, and refuses
 *     their sign-in, with no restart and no cache clear;
 *   - /auth/me carries MyAccess beside AuthUser: no role names, no
 *     refusals, no labels.
 *
 * Runs on its own scratch database, seeded with the P0 fixtures and
 * mapped by the decision 23 re-sync, so the roles are the real ones.
 */

const WORDS_NEVER_IN_ME = [
  'Admin',
  'Budget administrator',
  'Budget staff',
  'Complaints administrator',
  'Complaints member',
  'reason',
  'label',
  'Only people',
  'roleIds',
  'roles',
];

describe('access request path', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  // Loaded after TEST_DATABASE_URL points at the scratch database.
  let harness: import('../support/app').HarnessApp;
  let U: typeof import('../equivalence/fixtures').U;
  let password: string;
  let roleMap: import('../../src/access/role-map.service').RoleMapService;
  let seedIds: typeof import('../../src/access/seed-roles').SEED_ROLE_IDS;
  const counter = { queries: 0, connects: 0 };

  const tokenFor = (id: string): string => harness.mintToken({ id, name: 'x' });

  async function call(
    path: string,
    as: string | null,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: unknown; queries: number; connects: number }> {
    const { testTxIdle } = await import('../support/test-tx');
    counter.queries = 0;
    counter.connects = 0;
    const headers: Record<string, string> = {};
    if (as) headers.authorization = `Bearer ${tokenFor(as)}`;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${harness.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    await testTxIdle();
    return {
      status: res.status,
      body: text ? (JSON.parse(text) as unknown) : null,
      queries: counter.queries,
      connects: counter.connects,
    };
  }

  before(async () => {
    db = await openScratchDatabase('request_path', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });

    // The harness boots against the scratch database.
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();

    ({ U, FIXTURE_PASSWORD: password } = await import('../equivalence/fixtures'));
    ({ SEED_ROLE_IDS: seedIds } = await import('../../src/access/seed-roles'));
    const { startHarnessApp } = await import('../support/app');
    const { RoleMapService } = await import('../../src/access/role-map.service');
    harness = await startHarnessApp();
    roleMap = harness.app.get(RoleMapService);

    // Count what the APP sends: every pool.query and every pool.connect.
    const pool = harness.app.get<Pool>('PG_POOL');
    const query = pool.query.bind(pool) as (...a: unknown[]) => unknown;
    const connect = pool.connect.bind(pool) as (...a: unknown[]) => unknown;
    (pool as unknown as { query: unknown }).query = (...a: unknown[]) => {
      counter.queries += 1;
      return query(...a);
    };
    (pool as unknown as { connect: unknown }).connect = (...a: unknown[]) => {
      counter.connects += 1;
      return connect(...a);
    };
  });

  after(async () => {
    await harness?.close();
    await db?.close();
  });

  it('boots: boot validation passes, and /auth/login and /auth/me carry their declarations', async () => {
    const { DiscoveryService } = await import('@nestjs/core');
    const { checkRoutes, collectRouteHandlers } = await import('../../src/access/boot-guard');
    const handlers = collectRouteHandlers(harness.app.get(DiscoveryService, { strict: false }));
    const result = checkRoutes(handlers, { requireDeclarations: false, requirePickRoutes: false });
    assert.deepEqual(result.errors, []);
    const login = handlers.find((h) => h.route.startsWith('POST /auth/login'))!;
    const me = handlers.find((h) => h.route.startsWith('GET /auth/me'))!;
    assert.equal(login.isPublic, true);
    assert.deepEqual(me.declarations, [{ kind: 'signedIn' }]);
    assert.ok(!result.undeclared.some((r) => r.startsWith('GET /auth/me') || r.startsWith('POST /auth/login')));
  });

  it('one query per request: the user row, and nothing else for access', async () => {
    // Warm the role map (the first request after a start reads it).
    await call('/api/reports/variance/periods', U.budget_staff);
    const loads = roleMap.loads;

    const periods = await call('/api/reports/variance/periods', U.budget_staff);
    assert.equal(periods.status, 200);
    assert.equal(periods.queries, 1, 'a static route costs exactly the per-request user query');
    assert.equal(periods.connects, 0);

    // A refusal by the old guard costs the same one query.
    const refused = await call('/api/reports/variance/periods', U.raiser);
    assert.equal(refused.status, 403);
    assert.equal(refused.queries, 1);

    // /auth/me adds its own data query (the sites for `units`), nothing more.
    const me = await call('/api/auth/me', U.budget_staff);
    assert.equal(me.status, 200);
    assert.equal(me.queries, 2);
    assert.equal(roleMap.loads, loads, 'no reload while the access version is unchanged');
  });

  it('/auth/me carries MyAccess beside AuthUser, with no role names, refusals or labels', async () => {
    const res = await call('/api/auth/me', U.budget_staff);
    assert.equal(res.status, 200);
    const body = res.body as Record<string, unknown> & { access: Record<string, unknown> };
    assert.deepEqual(Object.keys(body).sort(), ['access', 'designation', 'email', 'id', 'modules', 'name', 'phone']);
    assert.deepEqual(Object.keys(body.access).sort(), ['permissions', 'units', 'version']);
    assert.equal(body.access.version, Number(await accessVersion(db.client)));
    const perms = body.access.permissions as Record<string, string[]>;
    assert.deepEqual(perms['budget.expenses.edit'], ['own']);
    assert.deepEqual(perms['budget.expenses.view'], ['all']);
    assert.deepEqual(perms['budget.amounts.see'], ['all']);
    // A Pick needed at two scopes is two rows (R6): edit at Own needs sites at Own.
    assert.deepEqual(perms['budget.sites.pick'], ['own', 'all']);
    assert.deepEqual(perms['budget.cost_heads.pick'], ['all']);
    assert.equal(perms['budget.expenses.delete'], undefined);
    assert.equal(perms['access.rights.manage'], undefined);

    const text = JSON.stringify(body.access);
    for (const word of [...WORDS_NEVER_IN_ME, ...Object.values(seedIds)]) {
      assert.ok(!text.includes(word), `access must not carry "${word}"`);
    }
  });

  it('Admin holds every key at All, access.rights.manage included', async () => {
    const res = await call('/api/auth/me', U.platform_admin);
    const { PERMISSION_KEYS } = await import('../../src/access/catalogue');
    const perms = (res.body as { access: { permissions: Record<string, string[]> } }).access.permissions;
    assert.deepEqual(Object.keys(perms), [...PERMISSION_KEYS]);
    for (const scopes of Object.values(perms)) assert.deepEqual(scopes, ['all']);
  });

  it('never 403s an active person with no roles; they hold only the everyone Picks', async () => {
    const res = await call('/api/auth/me', U.no_module);
    assert.equal(res.status, 200);
    const perms = (res.body as { access: { permissions: Record<string, string[]> } }).access.permissions;
    assert.deepEqual(Object.keys(perms).sort(), [
      'budget.cost_heads.pick',
      'complaints.categories.pick',
      'platform.designations.pick',
      'platform.locations.pick',
    ]);
  });

  it('units are the sites ticked on the person plus the sites they lead', async () => {
    const { rows } = await db.client.query<{ id: string }>(
      'select id::text as id from sites where manager_id = $1 or supervisor_id = $1 order by 1',
      [U.supervisor],
    );
    assert.ok(rows.length > 0, 'the fixtures name the supervisor on a site');
    const led = rows.map((r) => r.id);
    let units = (await call('/api/auth/me', U.supervisor)).body as { access: { units: string[] } };
    assert.deepEqual(units.access.units, led);

    const { rows: other } = await db.client.query<{ id: string }>(
      'select id::text as id from sites where id <> all($1::uuid[]) order by 1 limit 1',
      [led],
    );
    await db.client.query('insert into user_units (user_id, unit_id) values ($1, $2)', [U.supervisor, other[0]!.id]);
    try {
      units = (await call('/api/auth/me', U.supervisor)).body as { access: { units: string[] } };
      assert.deepEqual(units.access.units, [...led, other[0]!.id].sort());
    } finally {
      await db.client.query('delete from user_units where user_id = $1', [U.supervisor]);
    }
  });

  it('a role edit is seen on the next request, with one reload', async () => {
    await call('/api/auth/me', U.budget_staff);
    const loads = roleMap.loads;
    const before = Number(await accessVersion(db.client));

    await db.client.query(`insert into role_permissions (role_id, permission_key, scope) values ($1, 'budget.expenses.delete', 'all')`, [
      seedIds.budget_staff,
    ]);
    try {
      assert.equal(Number(await accessVersion(db.client)), before + 1);
      const first = await call('/api/reports/variance/periods', U.budget_staff);
      assert.equal(first.status, 200);
      assert.equal(first.queries, 2, 'the user query, plus the one role-map read');
      assert.equal(roleMap.loads, loads + 1);

      const me = await call('/api/auth/me', U.budget_staff);
      const perms = (me.body as { access: { version: number; permissions: Record<string, string[]> } }).access;
      assert.equal(perms.version, before + 1);
      assert.deepEqual(perms.permissions['budget.expenses.delete'], ['all']);

      const again = await call('/api/reports/variance/periods', U.budget_staff);
      assert.equal(again.queries, 1, 'back to one query once the map is current');
    } finally {
      await db.client.query(`delete from role_permissions where role_id = $1 and permission_key = 'budget.expenses.delete'`, [
        seedIds.budget_staff,
      ]);
    }
  });

  it('many requests arriving after a role edit share one reload (single-flight)', async () => {
    await call('/api/auth/me', U.budget_staff); // catch up with the previous test's delete
    const loads = roleMap.loads;
    await db.client.query(`update roles set description = description || ' ' where id = $1`, [seedIds.budget_staff]);
    try {
      const { testTxIdle } = await import('../support/test-tx');
      const people = [U.budget_staff, U.raiser, U.platform_admin, U.no_module, U.supervisor, U.manager];
      const statuses = await Promise.all(
        people.map(async (id) =>
          (await fetch(`${harness.baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${tokenFor(id)}` } })).status,
        ),
      );
      await testTxIdle();
      assert.deepEqual(statuses, people.map(() => 200));
      assert.equal(roleMap.loads, loads + 1);
    } finally {
      await db.client.query(`update roles set description = rtrim(description) where id = $1`, [seedIds.budget_staff]);
    }
  });

  it('a key the code does not know is ignored and counted, never granted (R5)', async () => {
    await db.client.query(`insert into role_permissions (role_id, permission_key, scope) values ($1, 'budget.expenses.retired', 'all')`, [
      seedIds.budget_staff,
    ]);
    try {
      const me = await call('/api/auth/me', U.budget_staff);
      const perms = (me.body as { access: { permissions: Record<string, string[]> } }).access.permissions;
      assert.equal(perms['budget.expenses.retired'], undefined);
      assert.equal(roleMap.snapshot.unknownKeys.get('budget.expenses.retired'), 1);
    } finally {
      await db.client.query(`delete from role_permissions where permission_key = 'budget.expenses.retired'`);
    }
  });

  it('deactivating a person gives 401 on their next request and refuses their sign-in; reactivating restores both', async () => {
    assert.equal((await call('/api/auth/me', U.budget_staff)).status, 200);
    const loginBody = { login: 'budget_staff@harness.test', password };
    assert.equal((await call('/api/auth/login', null, { method: 'POST', body: loginBody })).status, 200);
    const version = await accessVersion(db.client);

    await db.client.query('update users set active = false where id = $1', [U.budget_staff]);
    try {
      assert.equal(await accessVersion(db.client), version, 'active never bumps the access version');
      const next = await call('/api/auth/me', U.budget_staff);
      assert.equal(next.status, 401);
      assert.equal(next.queries, 1);
      assert.equal((await call('/api/reports/variance/periods', U.budget_staff)).status, 401);
      assert.equal((await call('/api/auth/login', null, { method: 'POST', body: loginBody })).status, 401);
    } finally {
      await db.client.query('update users set active = true where id = $1', [U.budget_staff]);
    }
    assert.equal((await call('/api/auth/me', U.budget_staff)).status, 200);
    assert.equal((await call('/api/auth/login', null, { method: 'POST', body: loginBody })).status, 200);
  });

  it('can_login alone still ends access, as today', async () => {
    const res = await call('/api/auth/me', U.no_login);
    assert.equal(res.status, 401);
  });
});
