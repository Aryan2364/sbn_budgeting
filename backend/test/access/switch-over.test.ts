import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';

import { SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P9, "Done when", on the REAL app: the permission guard
 * decides every route from the roles, and the old levels
 * (user_module_access) decide nothing any more:
 *   - a person whose roles are taken away but whose module rows stay is
 *     refused; a person with a role and no module rows is let in;
 *   - D2: a platform-admin-only person (Admin) reaches Budget and
 *     Complaints;
 *   - D3: a full master list needs `manage`; the Pick still answers;
 *   - D4: the people picker needs the people Pick;
 *   - the dual-write is kept (R11.2): an access write still writes
 *     user_module_access, so redeploying the previous tag is a working
 *     rollback.
 *
 * The database is a scratch copy seeded with the P0 fixtures and mapped
 * by the decision 23 re-sync, so the roles are the real seed roles.
 */
describe('switch-over: the permission guard decides (P9)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let app: INestApplication;
  let baseUrl: string;
  let mint: (id: string) => string;
  let U: typeof import('../equivalence/fixtures').U;

  async function call(
    path: string,
    as: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { authorization: `Bearer ${mint(as)}` };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${baseUrl}/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  const levels = async (userId: string): Promise<Record<string, string>> => {
    const { rows } = await db.client.query<{ module: string; role: string }>(
      'select module, role from user_module_access where user_id = $1',
      [userId],
    );
    return Object.fromEntries(rows.map((r) => [r.module, r.role]));
  };

  before(async () => {
    db = await openScratchDatabase('p9_switch', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();

    const { prepareTestEnv } = await import('../support/test-env');
    const { assertMainTsUnchanged, GLOBAL_PREFIX } = await import('../support/app');
    const { enableQueryGuard } = await import('../support/query-guard');
    prepareTestEnv();
    assertMainTsUnchanged();
    enableQueryGuard('throw');
    const { ValidationPipe } = await import('@nestjs/common');
    const { NestFactory } = await import('@nestjs/core');
    const { JwtService } = await import('@nestjs/jwt');
    const { AppModule } = await import('../../src/app.module');
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.setGlobalPrefix(GLOBAL_PREFIX);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const jwt = app.get(JwtService);
    mint = (id) => jwt.sign({ sub: id, name: 'x' });
    ({ U } = await import('../equivalence/fixtures'));
  });

  after(async () => {
    await app?.close();
    const pool = await import('../../src/db/pool');
    await pool.closePool();
    await db?.close();
  });

  it('module rows without a role open nothing: the guard refuses with the key', async () => {
    assert.equal((await call('/expenses', U.budget_staff)).status, 200);
    await db.client.query('delete from user_roles where user_id = $1', [U.budget_staff]);
    assert.equal((await levels(U.budget_staff)).budget, 'staff', 'the old level is still there');
    const res = await call('/expenses', U.budget_staff);
    assert.equal(res.status, 403);
    assert.equal(res.body.permission, 'budget.expenses.view');
    assert.equal(res.body.reason, 'Only people allowed to view expenses can do this.');
  });

  it('a role without module rows opens its routes', async () => {
    assert.deepEqual(await levels(U.no_module), {});
    assert.equal((await call('/expenses', U.no_module)).status, 403);
    await db.client.query('insert into user_roles (user_id, role_id) values ($1, $2)', [
      U.no_module,
      SEED_ROLE_IDS.budget_staff,
    ]);
    assert.equal((await call('/expenses', U.no_module)).status, 200);
    await db.client.query('delete from user_roles where user_id = $1', [U.no_module]);
  });

  it('D2: the platform-admin-only person holds Admin and reaches Budget and Complaints', async () => {
    assert.deepEqual(await levels(U.platform_admin), { platform: 'admin' });
    for (const path of ['/expenses', '/projects', '/sites', '/cost-heads', '/complaints', '/complaint-categories']) {
      assert.equal((await call(path, U.platform_admin)).status, 200, path);
    }
  });

  it('D3: a full master list needs manage; choosing from it uses the Pick', async () => {
    const res = await call('/cost-heads', U.staff_member);
    assert.equal(res.status, 403);
    assert.equal(res.body.permission, 'budget.cost_heads.manage');
    assert.equal((await call('/pick/budget/cost_heads', U.staff_member)).status, 200);
    assert.equal((await call('/cost-heads', U.budget_admin)).status, 200);
  });

  it('D4: the people picker needs the people Pick', async () => {
    const res = await call('/users/picker', U.no_module);
    assert.equal(res.status, 403);
    assert.equal(res.body.permission, 'platform.people.pick');
    assert.equal((await call('/users/picker', U.staff_member)).status, 200);
  });

  it('the dual-write is kept: an access write still writes the old levels (rollback, R11.2)', async () => {
    const res = await call(`/access/people/${U.no_module}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: [SEED_ROLE_IDS.complaints_member], unitIds: [] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(await levels(U.no_module), { complaints: 'member' });
    const off = await call(`/access/people/${U.no_module}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: [], unitIds: [] },
    });
    assert.equal(off.status, 200);
    assert.deepEqual(await levels(U.no_module), {});
  });
});
