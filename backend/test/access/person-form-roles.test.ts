import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { INestApplication } from '@nestjs/common';

import { SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { SKIP_REASON, count, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Roles on the people form (owner request, 5 Oct 2026): `roleIds` on
 * `POST /users` and `PATCH /users/:id`, saved in the same transaction as
 * the person through AccessWrite, so the access lock, the last-holder
 * rule, the history and the dual-write all apply as on Access › People.
 *
 * Same harness as access-api.test.ts: the REAL app on a scratch copy of
 * the P0 fixtures, mapped by the decision 23 re-sync, writes persisting
 * between requests, the query guard in 'throw' mode. platform_admin and
 * all_admin hold Admin.
 */

const UNKNOWN_ROLE = '00000000-0000-4000-8000-000000000000';
const PEOPLE_EDITOR = '70000000-0000-4000-8000-0000000000aa';

describe('roles on the people form (POST/PATCH /users roleIds)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let app: INestApplication;
  let baseUrl: string;
  let mint: (id: string) => string;
  let U: typeof import('../equivalence/fixtures').U;
  let formPerson = '';

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

  const audits = async (action: string, targetId: string): Promise<any[]> =>
    (await db.client.query('select * from access_audit where action = $1 and target_id = $2 order by id', [action, targetId]))
      .rows;

  const auditRows = (): Promise<number> => count(db.client, 'select count(*) from access_audit');

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

  const nameOf = async (userId: string): Promise<string> =>
    (await db.client.query<{ name: string }>('select name from users where id = $1', [userId])).rows[0]!.name;

  const sorted = (ids: string[]): string[] => [...ids].sort();

  before(async () => {
    db = await openScratchDatabase('person_form_roles', { fixtures: true });
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
    ({ U } = await import('../equivalence/fixtures'));
  });

  after(async () => {
    await app?.close();
    const pool = await import('../../src/db/pool');
    await pool.closePool();
    await db?.close();
  });

  it('(a, f) create with roleIds: exactly those roles, one user.role_added row each, and the levels follow', async () => {
    const res = await call('/users', U.platform_admin, {
      method: 'POST',
      body: { name: 'Form Person', canLogin: false, roleIds: [SEED_ROLE_IDS.budget_staff, SEED_ROLE_IDS.complaints_member] },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    formPerson = res.body.id as string;
    assert.deepEqual(await rolesOf(formPerson), sorted([SEED_ROLE_IDS.budget_staff, SEED_ROLE_IDS.complaints_member]));

    const added = await audits('user.role_added', formPerson);
    assert.deepEqual(sorted(added.map((r) => r.role_id)), sorted([SEED_ROLE_IDS.budget_staff, SEED_ROLE_IDS.complaints_member]));
    for (const row of added) {
      assert.equal(row.actor_id, U.platform_admin);
      assert.equal(row.target_name, 'Form Person');
    }
    assert.equal((await audits('user.role_removed', formPerson)).length, 0);

    // The dual-write, in the table and in the response read back after commit.
    assert.deepEqual(await levels(formPerson), { budget: 'staff', complaints: 'member' });
    assert.deepEqual(res.body.modules, { budget: 'staff', complaints: 'member' });
  });

  it('(a) create: roles and module levels together are refused (400), nobody created; an empty list gives none', async () => {
    const people = await count(db.client, 'select count(*) from users');
    const both = await call('/users', U.platform_admin, {
      method: 'POST',
      body: { name: 'Shim And Roles', canLogin: false, modules: { budget: 'admin' }, roleIds: [SEED_ROLE_IDS.complaints_member] },
    });
    assert.equal(both.status, 400, JSON.stringify(both.body));
    assert.equal(await count(db.client, 'select count(*) from users'), people);

    const none = await call('/users', U.platform_admin, { method: 'POST', body: { name: 'No Roles', canLogin: false, roleIds: [] } });
    assert.equal(none.status, 201, JSON.stringify(none.body));
    assert.deepEqual(await rolesOf(none.body.id), []);
    assert.deepEqual(await levels(none.body.id), {});
    assert.equal((await audits('user.role_added', none.body.id)).length, 0);
  });

  it('(a) create with a role that does not exist: 422, and nobody is created', async () => {
    const people = await count(db.client, 'select count(*) from users');
    const res = await call('/users', U.platform_admin, {
      method: 'POST',
      body: { name: 'Ghost Role', canLogin: false, roleIds: [UNKNOWN_ROLE] },
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.message, /^That role no longer exists/);
    assert.equal(await count(db.client, 'select count(*) from users'), people);

    const notId = await call('/users', U.platform_admin, { method: 'POST', body: { name: 'Bad Id', canLogin: false, roleIds: ['admin'] } });
    assert.equal(notId.status, 400);
    assert.match(JSON.stringify(notId.body), /Choose roles from the list/);
  });

  it('(b, f) PATCH name and roleIds together: both saved, in one transaction; the levels follow', async () => {
    const res = await call(`/users/${formPerson}`, U.platform_admin, {
      method: 'PATCH',
      body: { name: 'Form Person Renamed', roleIds: [SEED_ROLE_IDS.budget_admin] },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.name, 'Form Person Renamed');
    assert.equal(await nameOf(formPerson), 'Form Person Renamed');
    assert.deepEqual(await rolesOf(formPerson), [SEED_ROLE_IDS.budget_admin]);

    const added = (await audits('user.role_added', formPerson)).at(-1);
    assert.equal(added.role_id, SEED_ROLE_IDS.budget_admin);
    const removed = await audits('user.role_removed', formPerson);
    assert.deepEqual(sorted(removed.map((r) => r.role_id)), sorted([SEED_ROLE_IDS.budget_staff, SEED_ROLE_IDS.complaints_member]));
    // One transaction: every row carries its start time.
    for (const row of removed) assert.equal(String(row.at), String(added.at));

    assert.deepEqual(await levels(formPerson), { budget: 'admin' });
    assert.deepEqual(res.body.modules, { budget: 'admin' });
  });

  it('(c) PATCH a valid name with an unknown role: 422, and neither the name nor the roles change', async () => {
    const rowsBefore = await auditRows();
    const res = await call(`/users/${formPerson}`, U.platform_admin, {
      method: 'PATCH',
      body: { name: 'Should Not Save', roleIds: [SEED_ROLE_IDS.budget_admin, SEED_ROLE_IDS.complaints_member, UNKNOWN_ROLE] },
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.message, /^That role no longer exists/);
    assert.equal(await nameOf(formPerson), 'Form Person Renamed');
    assert.deepEqual(await rolesOf(formPerson), [SEED_ROLE_IDS.budget_admin]);
    assert.deepEqual(await levels(formPerson), { budget: 'admin' });
    assert.equal(await auditRows(), rowsBefore);
  });

  it('(d) without access.rights.manage: a different set is 403 naming the key; the same set saves the rest', async () => {
    // A people editor: create, view and edit people at All, but no Admin role.
    await db.client.query(`insert into roles (id, name) values ($1, 'People editor')`, [PEOPLE_EDITOR]);
    await db.client.query(
      `insert into role_permissions (role_id, permission_key, scope) values
         ($1, 'platform.people.view', 'all'),
         ($1, 'platform.people.edit', 'all'),
         ($1, 'platform.people.create', 'all')`,
      [PEOPLE_EDITOR],
    );
    await db.client.query('insert into user_roles (user_id, role_id) values ($1, $2)', [U.raiser, PEOPLE_EDITOR]);

    const held = await rolesOf(formPerson);
    const rowsBefore = await auditRows();
    for (const roleIds of [[...held, SEED_ROLE_IDS.complaints_member], [], [SEED_ROLE_IDS.budget_staff]]) {
      const res = await call(`/users/${formPerson}`, U.raiser, { method: 'PATCH', body: { name: 'Editor Rename', roleIds } });
      assert.equal(res.status, 403, JSON.stringify(roleIds));
      assert.equal(res.body.permission, 'access.rights.manage');
      assert.match(res.body.reason, /^Only people allowed to manage roles and people's access/);
    }
    assert.equal(await nameOf(formPerson), 'Form Person Renamed');

    // The form resends the roles it shows: the same set (in any order) is no change.
    const same = await call(`/users/${formPerson}`, U.raiser, {
      method: 'PATCH',
      body: { name: 'Editor Rename', roleIds: [...held].reverse() },
    });
    assert.equal(same.status, 200, JSON.stringify(same.body));
    assert.equal(await nameOf(formPerson), 'Editor Rename');
    assert.deepEqual(await rolesOf(formPerson), held);
    assert.equal(await auditRows(), rowsBefore);

    // Adding a person: roles need the key; none (or an empty list) does not.
    const create = await call('/users', U.raiser, {
      method: 'POST',
      body: { name: 'Editor Added', canLogin: false, roleIds: [SEED_ROLE_IDS.complaints_member] },
    });
    assert.equal(create.status, 403, JSON.stringify(create.body));
    assert.equal(create.body.permission, 'access.rights.manage');
    const plain = await call('/users', U.raiser, { method: 'POST', body: { name: 'Editor Added', canLogin: false, roleIds: [] } });
    assert.equal(plain.status, 201, JSON.stringify(plain.body));
    assert.deepEqual(await rolesOf(plain.body.id), []);
  });

  it('(e) removing Admin from the last holder through roleIds: 409 with the last-holder reason; nothing saved', async () => {
    const off = await call(`/access/people/${U.all_admin}/active`, U.platform_admin, { method: 'PUT', body: { active: false } });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    try {
      const rowsBefore = await auditRows();
      for (const roleIds of [[], [SEED_ROLE_IDS.budget_admin]]) {
        const res = await call(`/users/${U.platform_admin}`, U.platform_admin, {
          method: 'PATCH',
          body: { name: 'Pallavi Renamed', roleIds },
        });
        assert.equal(res.status, 409, JSON.stringify(res.body));
        assert.equal(res.body.reason, 'Pallavi Platform is the only person who can manage access. Give that to someone else first.');
      }
      assert.equal(await nameOf(U.platform_admin), 'Pallavi Platform');
      assert.deepEqual(await rolesOf(U.platform_admin), [SEED_ROLE_IDS.admin]);
      assert.deepEqual(await levels(U.platform_admin), { platform: 'admin' });
      assert.equal(await auditRows(), rowsBefore);

      // Adding a role beside Admin is fine: they still manage access.
      const more = await call(`/users/${U.platform_admin}`, U.platform_admin, {
        method: 'PATCH',
        body: { roleIds: [SEED_ROLE_IDS.admin, SEED_ROLE_IDS.complaints_member] },
      });
      assert.equal(more.status, 200, JSON.stringify(more.body));
      assert.deepEqual(await rolesOf(U.platform_admin), sorted([SEED_ROLE_IDS.admin, SEED_ROLE_IDS.complaints_member]));
    } finally {
      const on = await call(`/access/people/${U.all_admin}/active`, U.platform_admin, { method: 'PUT', body: { active: true } });
      assert.equal(on.status, 200);
    }
  });
});
