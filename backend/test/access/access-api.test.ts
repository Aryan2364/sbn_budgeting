import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';

import { describeKeys, type Grant, type Scope } from '../../src/access/catalogue';
import { legacyLevelsFor as levelsP6, rolesForModulesPatch } from '../../src/access/legacy-levels';
import { SEED_ROLES, SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { legacyLevelsFor as levelsP1 } from '../../src/db/map-access-levels';
import { SKIP_REASON, accessVersion, count, dbTestsEnabled, openScratchDatabase, prng, type ScratchDb } from './support';

/**
 * Access plan P6, "Done when": a scripted HTTP walk-through of the access
 * write API on the REAL app, with writes that PERSIST between requests
 * (no transaction-per-request wrapper here, so the last-holder race runs
 * two genuinely concurrent transactions). The query guard is in 'throw'
 * mode, so every statement of these routes carries a scope marker or a
 * reviewed exemption.
 *
 * The database is a scratch copy seeded with the P0 fixtures and mapped
 * by the decision 23 re-sync, so the roles are the real seed roles:
 * platform_admin and all_admin hold Admin.
 */

describe('legacy levels (pure)', () => {
  const seedRows = (ids: string[]): Grant[] =>
    SEED_ROLES.filter((r) => ids.includes(r.id)).flatMap((r) =>
      r.systemKey === 'admin'
        ? describeKeys().map((k) => ({ key: k.key, scope: 'all' as Scope }))
        : r.grants.map(([key, scope]) => ({ key, scope })),
    );

  it('agrees with the mapping script for every combination of seed roles', () => {
    const ids = SEED_ROLES.map((r) => r.id);
    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const held = ids.filter((_, i) => mask & (1 << i));
      assert.deepEqual(levelsP6(seedRows(held)), levelsP1(seedRows(held)), held.join(','));
    }
  });

  it('agrees with the mapping script on random grant sets', () => {
    const keys = describeKeys();
    const scopes: Scope[] = ['own', 'team', 'units', 'all'];
    const rnd = prng(6);
    for (let n = 0; n < 500; n += 1) {
      const grants = keys
        .filter(() => rnd() < 0.4)
        .map((k) => ({ key: k.key, scope: rnd() < 0.7 ? 'all' : scopes[Math.floor(rnd() * 4)]! }));
      assert.deepEqual(levelsP6(grants), levelsP1(grants));
    }
  });

  it('round-trips each seed role: its level maps to it, and it derives that level back', () => {
    for (const seed of SEED_ROLES) {
      const { add } = rolesForModulesPatch({ [seed.heldBy.module]: seed.heldBy.role });
      assert.deepEqual(add, [seed.id]);
      assert.equal(levelsP6(seedRows([seed.id]))[seed.heldBy.module], seed.heldBy.role);
    }
    assert.deepEqual(rolesForModulesPatch({ budget: null }).add, []);
    assert.deepEqual(rolesForModulesPatch({ budget: null }).remove.sort(), [
      SEED_ROLE_IDS.budget_admin,
      SEED_ROLE_IDS.budget_staff,
    ]);
  });
});

describe('access write API through the real routes (P6)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let app: INestApplication;
  let baseUrl: string;
  let mint: (id: string) => string;
  let U: typeof import('../equivalence/fixtures').U;
  let S: typeof import('../equivalence/fixtures').S;
  let FIXTURE_PASSWORD: string;
  let roleId = '';

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

  const audits = async (action: string, targetId?: string): Promise<any[]> =>
    (
      await db.client.query(
        `select * from access_audit where action = $1 ${targetId ? 'and target_id = $2' : ''} order by id`,
        targetId ? [action, targetId] : [action],
      )
    ).rows;

  const levels = async (userId: string): Promise<Record<string, string>> => {
    const { rows } = await db.client.query<{ module: string; role: string }>(
      'select module, role from user_module_access where user_id = $1',
      [userId],
    );
    return Object.fromEntries(rows.map((r) => [r.module, r.role]));
  };

  const rolesOf = async (userId: string): Promise<string[]> =>
    (await db.client.query<{ role_id: string }>('select role_id from user_roles where user_id = $1 order by role_id', [userId]))
      .rows.map((r) => r.role_id);

  const managers = (): Promise<number> =>
    count(
      db.client,
      `select count(*) from users u join user_roles ur on ur.user_id = u.id
       where ur.role_id = $1 and u.active and u.can_login and u.password_hash is not null`,
      [SEED_ROLE_IDS.admin],
    );

  before(async () => {
    db = await openScratchDatabase('p6_access_api', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();

    // The harness's boot, without the transaction-per-request wrapper.
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
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const jwt = app.get(JwtService);
    mint = (id) => jwt.sign({ sub: id, name: 'x' });
    ({ U, S, FIXTURE_PASSWORD } = await import('../equivalence/fixtures'));
  });

  after(async () => {
    await app?.close();
    const pool = await import('../../src/db/pool');
    await pool.closePool();
    await db?.close();
  });

  it('every /access route needs access.rights.manage (403 with the key)', async () => {
    for (const path of ['/access/roles', '/access/people', '/access/units', '/access/history', `/access/people/${U.budget_staff}/effective`]) {
      const res = await call(path, U.budget_admin);
      assert.equal(res.status, 403, path);
      assert.equal(res.body.permission, 'access.rights.manage');
      assert.match(res.body.reason, /^Only people allowed to manage roles and people's access/);
    }
  });

  it('roles: create derives Picks and see amounts, with notices; the version rises; audited', async () => {
    const v0 = await accessVersion(db.client);
    const res = await call('/access/roles', U.platform_admin, {
      method: 'POST',
      body: { name: '+ Report reader', description: 'Reads the reports', permissions: { 'budget.reports.view': 'all' } },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    roleId = res.body.role.id;
    assert.ok(res.body.notices.includes('Added see amounts, needed by view reports.'), res.body.notices.join(' | '));
    assert.ok(res.body.notices.includes('Added pick sites (All), needed by view reports.'));
    assert.deepEqual(res.body.role.permissions['budget.amounts.see'], ['all']);
    assert.deepEqual(res.body.role.permissions['budget.sites.pick'], ['all']);
    assert.deepEqual(res.body.role.can, { edit: true, delete: true });
    assert.ok(BigInt(await accessVersion(db.client)) > BigInt(v0));

    const [created] = await audits('role.created', roleId);
    assert.equal(created.actor_id, U.platform_admin);
    assert.equal(created.actor_name, 'Pallavi Platform');
    assert.equal(created.role_name, '+ Report reader');
    assert.deepEqual(created.after.permissions['budget.reports.view'], ['all']);

    const dup = await call('/access/roles', U.platform_admin, { method: 'POST', body: { name: '+ REPORT reader' } });
    assert.equal(dup.status, 409);
    const bad = await call('/access/roles', U.platform_admin, {
      method: 'POST',
      body: { name: 'X', permissions: { 'access.rights.manage': 'all' } },
    });
    assert.equal(bad.status, 400);
    const badScope = await call('/access/roles', U.platform_admin, {
      method: 'POST',
      body: { name: 'Y', permissions: { 'budget.cost_heads.manage': 'own' } },
    });
    assert.equal(badScope.status, 400);
  });

  it('roles: saving the whole role adds and removes Picks with notices, never refuses (R6, O9)', async () => {
    const v0 = await accessVersion(db.client);
    const res = await call(`/access/roles/${roleId}`, U.platform_admin, {
      method: 'PUT',
      body: { name: '+ Expense clerk', permissions: { 'budget.expenses.create': 'own' } },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const n = res.body.notices as string[];
    assert.ok(n.includes('Added pick sites (Own), needed by add expenses.'), n.join(' | '));
    assert.ok(n.includes('Removed pick sites (All): nothing ticked needs it any more.'), n.join(' | '));
    assert.ok(n.includes('Removed pick people (All): nothing ticked needs it any more.'), n.join(' | '));
    assert.ok(n.some((x) => x.startsWith('Kept see amounts, because add expenses needs it.')), n.join(' | '));
    assert.ok(n.some((x) => x.startsWith('Add expenses is ticked without view expenses')), n.join(' | '));
    assert.deepEqual(res.body.role.permissions['budget.sites.pick'], ['own']);
    assert.equal(res.body.role.permissions['budget.reports.view'], undefined);
    assert.ok(BigInt(await accessVersion(db.client)) > BigInt(v0));

    const [renamed] = await audits('role.renamed', roleId);
    assert.deepEqual(renamed.before, { name: '+ Report reader', description: 'Reads the reports' });
    assert.equal(renamed.after.name, '+ Expense clerk');
    const [changed] = await audits('role.permissions_changed', roleId);
    assert.deepEqual(changed.before.permissions['budget.sites.pick'], ['all']);
    assert.deepEqual(changed.after.permissions['budget.sites.pick'], ['own']);

    // Unticking see amounts while add expenses needs it: 200, kept, said so.
    const again = await call(`/access/roles/${roleId}`, U.platform_admin, {
      method: 'PUT',
      body: { name: '+ Expense clerk', permissions: { 'budget.expenses.create': 'own' } },
    });
    assert.equal(again.status, 200);
  });

  it('roles: Admin is fixed, and its detail is every key at All', async () => {
    const list = await call('/access/roles?pageSize=100', U.platform_admin);
    assert.equal(list.status, 200);
    const admin = list.body.data.find((r: any) => r.id === SEED_ROLE_IDS.admin);
    const reason = 'This role always holds every permission and cannot be changed.';
    assert.deepEqual(admin.can, { edit: reason, delete: reason });
    assert.equal(admin.people, 2);
    // Job roles first, then "+" roles.
    assert.equal(list.body.data.at(-1).name, '+ Expense clerk');

    const detail = await call(`/access/roles/${SEED_ROLE_IDS.admin}`, U.platform_admin);
    assert.deepEqual(detail.body.permissions['access.rights.manage'], ['all']);
    assert.equal(Object.keys(detail.body.permissions).length, describeKeys().length);

    const edit = await call(`/access/roles/${SEED_ROLE_IDS.admin}`, U.platform_admin, { method: 'PUT', body: { name: 'Boss' } });
    assert.equal(edit.status, 409);
    assert.deepEqual(edit.body.reason, reason);
    assert.equal((await call(`/access/roles/${SEED_ROLE_IDS.admin}`, U.platform_admin, { method: 'DELETE' })).status, 409);
  });

  it('people: roles and sites saved together, audited separately; no version bump; the next request sees it', async () => {
    assert.equal((await call('/pick/budget/sites', U.no_module)).status, 403);
    const v0 = await accessVersion(db.client);
    const res = await call(`/access/people/${U.no_module}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: [roleId], unitIds: [S.a, S.b] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.roles.map((r: any) => r.id), [roleId]);
    assert.deepEqual(res.body.roles[0].scopes, ['own', 'all']);
    assert.deepEqual([...res.body.unitIds].sort(), [S.a, S.b].sort());
    assert.equal(await accessVersion(db.client), v0);
    assert.equal((await call('/pick/budget/sites', U.no_module)).status, 200);

    const [added] = await audits('user.role_added', U.no_module);
    assert.equal(added.role_id, roleId);
    assert.equal(added.target_name, 'Nisha Nomodule');
    assert.deepEqual(added.before, { roles: [] });
    const [units] = await audits('user.units_changed', U.no_module);
    assert.deepEqual(units.before, { units: [] });
    assert.deepEqual(units.after.units.map((u: any) => u.id).sort(), [S.a, S.b].sort());

    // The dual-write: their derived level (any Budget key, not all at All) is staff.
    assert.deepEqual(await levels(U.no_module), { budget: 'staff' });

    assert.equal(
      (await call(`/access/people/${U.no_module}/access`, U.platform_admin, {
        method: 'PUT',
        body: { roleIds: ['00000000-0000-4000-8000-000000000000'], unitIds: [] },
      })).status,
      422,
    );
  });

  it('roles: delete is refused while anyone holds it, naming the count', async () => {
    const list = await call(`/access/roles?search=${encodeURIComponent('Expense clerk')}`, U.platform_admin);
    assert.equal(list.body.data[0].can.delete, '1 person has this role. Remove it from them before deleting it.');
    const res = await call(`/access/roles/${roleId}`, U.platform_admin, { method: 'DELETE' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'blocked');
    assert.equal(res.body.reason, '1 person has this role. Remove it from them before deleting it.');
  });

  it('role edits reach every holder\'s levels (dual-write)', async () => {
    const res = await call(`/access/roles/${roleId}`, U.platform_admin, {
      method: 'PUT',
      body: { name: '+ Expense clerk', permissions: { 'complaints.complaints.view': 'all', 'complaints.complaints.reassign': 'all' } },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await levels(U.no_module), { complaints: 'admin' });
  });

  it('roles: delete after the last holder is removed; audited with the full set', async () => {
    const off = await call(`/access/people/${U.no_module}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: [], unitIds: [] },
    });
    assert.equal(off.status, 200);
    assert.deepEqual(await levels(U.no_module), {});
    assert.equal((await audits('user.role_removed', U.no_module)).length, 1);
    const res = await call(`/access/roles/${roleId}`, U.platform_admin, { method: 'DELETE' });
    assert.equal(res.status, 204);
    const [deleted] = await audits('role.deleted', roleId);
    assert.equal(deleted.role_name, '+ Expense clerk');
    assert.deepEqual(deleted.before.permissions['complaints.complaints.view'], ['all']);
    assert.equal(deleted.after, null);
    assert.equal((await call(`/access/roles/${roleId}`, U.platform_admin)).status, 404);
  });

  it('isLastAccessManager is true for exactly the last holder, and every way to remove them is refused (409)', async () => {
    const flags = async (): Promise<Record<string, boolean>> => {
      const res = await call('/access/people?pageSize=100', U.platform_admin);
      assert.equal(res.status, 200);
      return Object.fromEntries(res.body.data.map((p: any) => [p.id, p.isLastAccessManager]));
    };
    assert.equal(Object.values(await flags()).filter(Boolean).length, 0);

    const off = await call(`/access/people/${U.all_admin}/active`, U.platform_admin, { method: 'PUT', body: { active: false } });
    assert.equal(off.status, 200);
    assert.equal(off.body.active, false);
    const f = await flags();
    assert.deepEqual(Object.keys(f).filter((k) => f[k]), [U.platform_admin]);
    assert.equal((await audits('user.deactivated', U.all_admin)).length, 1);

    const reason = 'Pallavi Platform is the only person who can manage access. Give that to someone else first.';
    const me = await call(`/access/people/${U.platform_admin}`, U.platform_admin);
    assert.equal(me.body.isLastAccessManager, true);
    assert.equal(me.body.can.deactivate, reason);
    assert.equal(me.body.roles.find((r: any) => r.id === SEED_ROLE_IDS.admin).can.remove, reason);

    const attempts = [
      call(`/access/people/${U.platform_admin}/active`, U.platform_admin, { method: 'PUT', body: { active: false } }),
      call(`/access/people/${U.platform_admin}/access`, U.platform_admin, { method: 'PUT', body: { roleIds: [], unitIds: [] } }),
      call(`/users/${U.platform_admin}`, U.platform_admin, { method: 'PATCH', body: { modules: { platform: null } } }),
      call(`/users/${U.platform_admin}`, U.platform_admin, { method: 'PATCH', body: { canLogin: false } }),
      call(`/users/${U.platform_admin}`, U.platform_admin, { method: 'PATCH', body: { active: false } }),
    ];
    for (const res of await Promise.all(attempts)) {
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.equal(res.body.reason, reason);
    }
    assert.equal(await managers(), 1);
    assert.deepEqual(await rolesOf(U.platform_admin), [SEED_ROLE_IDS.admin]);
    assert.deepEqual(await levels(U.platform_admin), { platform: 'admin' });

    const on = await call(`/access/people/${U.all_admin}/active`, U.platform_admin, { method: 'PUT', body: { active: true } });
    assert.equal(on.status, 200);
    assert.equal((await audits('user.activated', U.all_admin)).length, 1);
  });

  it('the last-holder race: two admins removing each other at once, exactly one succeeds', async () => {
    for (let round = 0; round < 3; round += 1) {
      assert.equal(await managers(), 2);
      const [a, b] = await Promise.all([
        call(`/access/people/${U.all_admin}/active`, U.platform_admin, { method: 'PUT', body: { active: false } }),
        call(`/access/people/${U.platform_admin}/active`, U.all_admin, { method: 'PUT', body: { active: false } }),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [200, 409], `${a.status} ${b.status}`);
      assert.equal(await managers(), 1);
      // Put the one who lost back, as the one left.
      const left = a.status === 200 ? U.platform_admin : U.all_admin;
      const gone = a.status === 200 ? U.all_admin : U.platform_admin;
      assert.equal((await call(`/access/people/${gone}/active`, left, { method: 'PUT', body: { active: true } })).status, 200);
    }
  });

  it('reports_to with roles and sites: one request, one transaction; audited; the closure rebuilt; no version bump', async () => {
    const before = await call(`/access/people/${U.budget_staff}`, U.platform_admin);
    assert.equal(before.status, 200);
    assert.equal(before.body.reportsTo, null);
    const heldRoles: string[] = before.body.roles.map((r: any) => r.id);
    const v0 = await accessVersion(db.client);

    // All three parts change in the one save.
    const res = await call(`/access/people/${U.budget_staff}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: [...heldRoles, SEED_ROLE_IDS.complaints_member], unitIds: [S.a], reportsToId: U.budget_admin },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.reportsTo, { id: U.budget_admin, name: 'Bhavna Budgetadmin' });
    assert.ok(res.body.roles.some((r: any) => r.id === SEED_ROLE_IDS.complaints_member));
    assert.deepEqual(res.body.unitIds, [S.a]);
    assert.equal(
      await count(db.client, 'select count(*) from reporting_closure where ancestor_id = $1 and descendant_id = $2', [
        U.budget_admin,
        U.budget_staff,
      ]),
      1,
    );
    assert.equal(await accessVersion(db.client), v0);
    const [row] = await audits('user.reports_to_changed', U.budget_staff);
    assert.deepEqual(row.before, { reportsTo: null });
    assert.deepEqual(row.after, { reportsTo: { id: U.budget_admin, name: 'Bhavna Budgetadmin' } });
    // One transaction: the three audit rows carry one timestamp (now() is the transaction's start).
    const added = (await audits('user.role_added', U.budget_staff)).at(-1);
    const units = (await audits('user.units_changed', U.budget_staff)).at(-1);
    assert.equal(added.role_id, SEED_ROLE_IDS.complaints_member);
    assert.equal(String(added.at), String(row.at));
    assert.equal(String(units.at), String(row.at));

    // Left out, reports_to is unchanged.
    const same = await call(`/access/people/${U.budget_staff}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: heldRoles, unitIds: [S.a] },
    });
    assert.equal(same.status, 200, JSON.stringify(same.body));
    assert.deepEqual(same.body.reportsTo, { id: U.budget_admin, name: 'Bhavna Budgetadmin' });
    assert.equal((await audits('user.reports_to_changed', U.budget_staff)).length, 1);
  });

  it('a failure in the roles part rolls back reports_to too (one transaction)', async () => {
    const reportsTo = async (id: string): Promise<string | null> =>
      (await db.client.query<{ reports_to: string | null }>('select reports_to from users where id = $1', [id])).rows[0]!
        .reports_to;
    const closure = (): Promise<number> =>
      count(db.client, 'select count(*) from reporting_closure where descendant_id = $1', [U.budget_staff]);
    const rolesBefore = await rolesOf(U.budget_staff);
    const closureBefore = await closure();
    const auditBefore = (await audits('user.reports_to_changed', U.budget_staff)).length;
    assert.equal(await reportsTo(U.budget_staff), U.budget_admin);

    // reports_to is applied first; the unknown role then refuses the save (422).
    const bad = await call(`/access/people/${U.budget_staff}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: ['00000000-0000-4000-8000-000000000000'], unitIds: [], reportsToId: U.ceo },
    });
    assert.equal(bad.status, 422, JSON.stringify(bad.body));
    assert.equal(await reportsTo(U.budget_staff), U.budget_admin);
    assert.equal(await closure(), closureBefore);
    assert.deepEqual(await rolesOf(U.budget_staff), rolesBefore);
    assert.equal((await audits('user.reports_to_changed', U.budget_staff)).length, auditBefore);

    // The same for a site that does not exist, and to nobody.
    const badSite = await call(`/access/people/${U.budget_staff}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: rolesBefore, unitIds: ['00000000-0000-4000-8000-000000000000'], reportsToId: null },
    });
    assert.equal(badSite.status, 422, JSON.stringify(badSite.body));
    assert.equal(await reportsTo(U.budget_staff), U.budget_admin);

    // A reporting loop is refused, and nothing else is saved with it.
    const adminReportsTo = await reportsTo(U.budget_admin);
    const loop = await call(`/access/people/${U.budget_admin}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: [], unitIds: [], reportsToId: U.budget_staff },
    });
    assert.equal(loop.status, 422);
    assert.match(loop.body.message, /report/);
    assert.equal(await reportsTo(U.budget_admin), adminReportsTo);
    assert.ok((await rolesOf(U.budget_admin)).length > 0);

    const notId = await call(`/access/people/${U.budget_staff}/access`, U.platform_admin, {
      method: 'PUT',
      body: { roleIds: rolesBefore, unitIds: [], reportsToId: 'nobody' },
    });
    assert.equal(notId.status, 400);
    // The separate reports-to route is gone; the one save carries it.
    assert.equal(
      (await call(`/access/people/${U.budget_staff}/reports-to`, U.platform_admin, { method: 'PUT', body: { reportsToId: null } }))
        .status,
      404,
    );
  });

  it('the people form: the module selects become seed roles (shim), audited, with the dual-write', async () => {
    const res = await call(`/users/${U.budget_staff}`, U.platform_admin, {
      method: 'PATCH',
      body: { modules: { budget: 'admin' } },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(await rolesOf(U.budget_staff), [SEED_ROLE_IDS.budget_admin]);
    assert.deepEqual(await levels(U.budget_staff), { budget: 'admin' });
    assert.equal((await audits('user.role_added', U.budget_staff)).at(-1).role_id, SEED_ROLE_IDS.budget_admin);
    assert.equal((await audits('user.role_removed', U.budget_staff)).at(-1).role_id, SEED_ROLE_IDS.budget_staff);

    // Resending the same values is not an access write and writes no history.
    const rows = await count(db.client, 'select count(*) from access_audit');
    const same = await call(`/users/${U.budget_staff}`, U.platform_admin, {
      method: 'PATCH',
      body: { modules: { budget: 'admin' }, reportsToId: U.budget_admin, active: true },
    });
    assert.equal(same.status, 200);
    assert.equal(await count(db.client, 'select count(*) from access_audit'), rows);
  });

  it('the people form: active and reports_to need access.rights.manage (O8)', async () => {
    // A people editor: view and edit people at All, but no Admin role.
    await db.client.query(`insert into roles (id, name) values ('70000000-0000-4000-8000-000000000001', 'People editor')`);
    await db.client.query(
      `insert into role_permissions (role_id, permission_key, scope) values
         ('70000000-0000-4000-8000-000000000001', 'platform.people.view', 'all'),
         ('70000000-0000-4000-8000-000000000001', 'platform.people.edit', 'all')`,
    );
    await db.client.query(`insert into user_roles (user_id, role_id) values ($1, '70000000-0000-4000-8000-000000000001')`, [U.raiser]);

    for (const body of [{ reportsToId: U.ceo }, { active: false }, { modules: { complaints: 'admin' } }]) {
      const res = await call(`/users/${U.budget_staff}`, U.raiser, { method: 'PATCH', body });
      assert.equal(res.status, 403, JSON.stringify(body));
      assert.equal(res.body.permission, 'access.rights.manage');
    }
    // The rest of the person is theirs to edit.
    assert.equal((await call(`/users/${U.budget_staff}`, U.raiser, { method: 'PATCH', body: { name: 'Bharat Budgetstaff' } })).status, 200);
  });

  it('the people form: deleting a person writes the roles it removes to the history', async () => {
    const res = await call(`/users/${U.bystander}`, U.platform_admin, { method: 'DELETE' });
    assert.equal(res.status, 204, JSON.stringify(res.body));
    // The bystander held no role, so no row; give one to a new person and delete them.
    const created = await call('/users', U.platform_admin, {
      method: 'POST',
      body: { name: 'Temp Person', canLogin: false, modules: { complaints: 'member' }, reportsToId: U.ceo },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.id as string;
    assert.deepEqual(await rolesOf(id), [SEED_ROLE_IDS.complaints_member]);
    assert.equal((await audits('user.reports_to_changed', id)).length, 1);
    assert.equal((await call(`/users/${id}`, U.platform_admin, { method: 'DELETE' })).status, 204);
    const [removed] = await audits('user.role_removed', id);
    assert.equal(removed.role_id, SEED_ROLE_IDS.complaints_member);
    assert.equal(removed.target_name, 'Temp Person');
  });

  it('the import gives new people the Complaints member role (C3), audited, with the dual-write', async () => {
    const rows = [{ name: 'Imported Person', phone: '9000000098', reportsToPhone: '9000000013' }];
    const res = await call('/users/import/commit', U.platform_admin, { method: 'POST', body: { rows } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { rows: found } = await db.client.query<{ id: string; reports_to: string }>(
      `select id, reports_to from users where phone = '9000000098'`,
    );
    const id = found[0]!.id;
    assert.equal(found[0]!.reports_to, U.ceo);
    assert.deepEqual(await rolesOf(id), [SEED_ROLE_IDS.complaints_member]);
    assert.deepEqual(await levels(id), { complaints: 'member' });
    assert.equal((await audits('user.role_added', id))[0].actor_id, U.platform_admin);
    assert.equal((await audits('user.reports_to_changed', id)).length, 1);
  });

  it('what they can do: every key, combined scope, the roles behind it, and what each Pick is for', async () => {
    const res = await call(`/access/people/${U.staff_member}/effective`, U.platform_admin);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const budget = res.body.modules.find((m: any) => m.module === 'budget');
    assert.deepEqual(budget.seeAmounts, { held: true, from: [{ id: SEED_ROLE_IDS.budget_staff, name: 'Budget staff' }] });
    const edit = budget.rows.find((r: any) => r.key === 'budget.expenses.edit');
    assert.deepEqual(edit.scopes, ['own']);
    assert.deepEqual(edit.from.map((f: any) => f.name), ['Budget staff']);
    const sitesPick = budget.rows.find((r: any) => r.key === 'budget.sites.pick');
    assert.deepEqual(sitesPick.scopes, ['all']);
    assert.deepEqual(sitesPick.from.map((f: any) => f.name).sort(), ['Budget staff', 'Complaints member']);
    assert.ok(sitesPick.neededBy.some((n: any) => n.label === 'raise complaints' && n.scopes[0] === 'all'));
    // Pick-for-everyone is left out.
    assert.equal(budget.rows.find((r: any) => r.key === 'budget.cost_heads.pick'), undefined);
    // Settings shows only the people Pick that view reports and reassign need: a Pick is listed in full, with its reason.
    const settings = res.body.modules.find((m: any) => m.module === 'platform');
    assert.deepEqual(settings.rows.map((r: any) => r.key), ['platform.people.pick']);
    assert.deepEqual(settings.rows[0].neededBy.map((n: any) => n.label).sort(), ['reassign complaints', 'view reports']);
    assert.deepEqual(res.body.noAccessTo, []);
    const none = await call(`/access/people/${U.no_module}/effective`, U.platform_admin);
    assert.deepEqual(none.body.noAccessTo, ['Budget', 'Complaints', 'Settings']);
    assert.deepEqual(none.body.modules, []);
    assert.equal(typeof res.body.person.teamSize, 'number');
  });

  it('units and uncovered units', async () => {
    const units = await call('/access/units', U.platform_admin);
    assert.equal(units.status, 200);
    assert.deepEqual(units.body.map((u: any) => u.id).sort(), Object.values(S).sort());
    const people = await call('/access/people', U.platform_admin);
    assert.ok(people.body.uncoveredUnits.some((u: any) => u.id === S.c_no_people));
    assert.ok(!people.body.uncoveredUnits.some((u: any) => u.id === S.a));
  });

  it('history: newest first, 25 a page, filters by person, role, kind and date', async () => {
    const all = await call('/access/history', U.platform_admin);
    assert.equal(all.status, 200);
    assert.equal(all.body.pageSize, 25);
    const ids = all.body.data.map((r: any) => Number(r.id));
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a));

    const mine = await call(`/access/history?personId=${U.no_module}&pageSize=100`, U.platform_admin);
    assert.deepEqual(
      mine.body.data.map((r: any) => r.action).sort(),
      // Ticked, then cleared: one units row each time.
      ['user.role_added', 'user.role_removed', 'user.units_changed', 'user.units_changed'],
    );
    const kinds = await call('/access/history?action=user.activated,user.deactivated&pageSize=100', U.platform_admin);
    assert.ok(kinds.body.data.every((r: any) => r.action === 'user.activated' || r.action === 'user.deactivated'));
    const byRole = await call(`/access/history?roleId=${roleId}&pageSize=100`, U.platform_admin);
    assert.ok(byRole.body.data.some((r: any) => r.action === 'role.deleted'));
    const today = new Date().toISOString().slice(0, 10);
    const dated = await call(`/access/history?from=2000-01-01&to=${today}`, U.platform_admin);
    assert.equal(dated.status, 200);
    assert.equal((await call('/access/history?action=nope', U.platform_admin)).status, 400);
    const search = await call(`/access/history?search=${encodeURIComponent('Expense clerk')}`, U.platform_admin);
    assert.ok(search.body.total > 0);
  });

  it('the history is append-only', async () => {
    await assert.rejects(db.client.query('update access_audit set note = note where false'), /append-only/);
    await assert.rejects(db.client.query('delete from access_audit where false'), /append-only/);
    void FIXTURE_PASSWORD;
  });
});
