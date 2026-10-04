import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P3b, complaints lane ("Done when"): the scope filter,
 * applied through the REAL routes, on the P0 fixtures with the decision
 * 23 mapping, with the query guard in 'throw' mode (so any statement
 * that reads a guarded table without a scope marker fails its request).
 *
 *   - Own (complaints member) = raised by me or named on the snapshot,
 *     exactly today's member rule; All (complaints admin) = everything.
 *   - Selected sites reaches the complaints on the ticked site and never
 *     a site-less legacy complaint (O10 Q9); detail, photo, counts and
 *     summary all agree with the list.
 *   - Every row and detail carries `can`; reassign at Own is "manager or
 *     HOD" (O6), and acting outside it is 403 naming the permission.
 *   - Raise reaches every site through its declared Pick at All (O5).
 *   - GET /pick/complaints/categories is pick-for-everyone and returns
 *     the declared fields only.
 */

const VIEWER_ROLE = 'f3b00000-0000-4000-8000-000000000001';

describe('complaints lane: scope through the routes (P3b)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;
  let F: typeof import('../equivalence/fixtures');
  let NAMES: Record<string, string>;

  /** One request as `user` (a fixture key), or signed out. */
  async function call(
    user: string | null,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {};
    if (user) {
      const id = F.U[user as keyof typeof F.U];
      headers.authorization = `Bearer ${harness.mintToken({ id, name: NAMES[id]! })}`;
    }
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${harness.baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const { testTxIdle } = await import('../support/test-tx');
    const text = await res.text();
    await testTxIdle();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }

  async function listIds(user: string, tab = 'all'): Promise<string[]> {
    const res = await call(user, 'GET', `/complaints?tab=${tab}&pageSize=100`);
    assert.equal(res.status, 200, `${user} list: ${JSON.stringify(res.body)}`);
    return (res.body.data as Array<{ id: string }>).map((r) => r.id).sort();
  }

  async function sqlIds(sql: string, params: unknown[] = []): Promise<string[]> {
    const { rows } = await db.client.query<{ id: string }>(sql, params);
    return rows.map((r) => r.id).sort();
  }

  before(async () => {
    db = await openScratchDatabase('p3b_complaints', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    F = await import('../equivalence/fixtures');

    // A Selected-sites viewer: no_module has no module rows (from P9 the
    // permission guard decides from roles alone) and ONLY a test role,
    // view at Selected sites, ticked on Site A.
    await db.client.query(`insert into roles (id, name) values ($1, 'Test: view complaints on selected sites')`, [
      VIEWER_ROLE,
    ]);
    await db.client.query(
      `insert into role_permissions (role_id, permission_key, scope) values ($1, 'complaints.complaints.view', 'units')`,
      [VIEWER_ROLE],
    );
    await db.client.query(`insert into user_roles (user_id, role_id) values ($1, $2)`, [F.U.no_module, VIEWER_ROLE]);
    await db.client.query(`insert into user_units (user_id, unit_id) values ($1, $2)`, [F.U.no_module, F.S.a]);

    const { rows } = await db.client.query<{ id: string; name: string }>('select id, name from users');
    NAMES = Object.fromEntries(rows.map((r) => [r.id, r.name]));

    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();
    const { startHarnessApp } = await import('../support/app');
    harness = await startHarnessApp({ queryGuard: 'throw' });

    // The app reads photos from the harness's scratch folder; put K1's there.
    const { prepareTestEnv } = await import('../support/test-env');
    const photo = join(prepareTestEnv().uploadDir, F.K1_PHOTO_KEY);
    mkdirSync(dirname(photo), { recursive: true });
    writeFileSync(photo, F.TINY_PNG);
  });

  after(async () => {
    await harness?.close();
    await db?.close();
  });

  it('Own is "raised by me or named on it" and All is everything, on every tab', async () => {
    const all = await sqlIds('select id from complaints');
    const members = ['raiser', 'supervisor', 'supervisor2', 'manager', 'approver', 'hod', 'ceo', 'staff_member'];
    for (const user of members) {
      const me = F.U[user as keyof typeof F.U];
      const named = await sqlIds(
        `select id from complaints
         where $1 in (raised_by, supervisor_id, manager_id, hod_id, ceo_id, approver_id)`,
        [me],
      );
      assert.deepEqual(await listIds(user), named, `${user}: named on`);
      const raised = await sqlIds('select id from complaints where raised_by = $1', [me]);
      assert.deepEqual(await listIds(user, 'raised'), raised, `${user}: raised tab`);
    }
    for (const user of ['complaints_admin', 'all_admin']) assert.deepEqual(await listIds(user), all, user);
  });

  it('a site-less legacy complaint is reached by the people named on it and by All only', async () => {
    const legacy = F.K.legacy_location;
    assert.ok((await listIds('raiser')).includes(legacy), 'raised it (Own)');
    assert.ok((await listIds('supervisor')).includes(legacy), 'named on it (Own)');
    assert.ok((await listIds('complaints_admin')).includes(legacy), 'All');
    assert.ok(!(await listIds('supervisor2')).includes(legacy), 'not named on it');
    assert.equal((await call('supervisor2', 'GET', `/complaints/${legacy}`)).status, 404);
  });

  it('Selected sites reaches the ticked site only, never a legacy complaint, and every read agrees', async () => {
    const onSiteA = await sqlIds('select id from complaints where site_id = $1', [F.S.a]);
    assert.ok(onSiteA.length > 0);
    assert.deepEqual(await listIds('no_module'), onSiteA);

    // Detail and photo: in scope 200, out of scope the same 404 as a missing complaint.
    assert.equal((await call('no_module', 'GET', `/complaints/${F.K.open}`)).status, 200);
    assert.equal((await call('no_module', 'GET', `/complaints/${F.K.open}/photos/${F.PH.k1_raise}`)).status, 200);
    for (const out of [F.K.legacy_location, F.K.open_no_approval]) {
      assert.equal((await call('no_module', 'GET', `/complaints/${out}`)).status, 404, out);
    }

    // Counts and the dashboard cover the same set.
    const counts = await call('no_module', 'GET', '/complaints/counts');
    assert.equal(counts.status, 200);
    assert.equal(counts.body.all, onSiteA.length);
    const summary = await call('no_module', 'GET', '/complaints/summary');
    assert.equal(summary.status, 200);
    const byStatus = Object.values(summary.body.byStatus as Record<string, number>).reduce((a, b) => a + b, 0);
    assert.equal(byStatus, onSiteA.length);
    assert.deepEqual(
      (summary.body.bySite as Array<{ site: { id: string | null } }>).map((b) => b.site.id),
      [F.S.a],
      'no "No site" bucket: the legacy complaint is out of reach',
    );

    // The test role holds no action, so the rows carry an empty `can`.
    const list = await call('no_module', 'GET', '/complaints?pageSize=100');
    for (const row of list.body.data) assert.deepEqual(row.can, {});
  });

  it('rows and detail carry `can`; reassign at Own is manager or HOD, and acting outside it is 403', async () => {
    const rowOf = async (user: string, id: string) =>
      ((await call(user, 'GET', '/complaints?pageSize=100')).body.data as Array<{ id: string; can: any }>).find(
        (r) => r.id === id,
      )!;

    const asSupervisor = await rowOf('supervisor', F.K.open);
    assert.equal(asSupervisor.can.comment, true);
    assert.equal(asSupervisor.can.work, true);
    assert.equal(typeof asSupervisor.can.reassign, 'string', 'named on it, but not its manager or HOD');
    assert.equal((await rowOf('manager', F.K.open)).can.reassign, true);
    assert.equal((await rowOf('hod', F.K.open)).can.reassign, true);
    assert.deepEqual((await rowOf('complaints_admin', F.K.open)).can, {
      comment: true, work: true, approve: true, reassign: true,
    });

    const detail = await call('supervisor', 'GET', `/complaints/${F.K.open}`);
    assert.equal(detail.status, 200);
    assert.equal(typeof detail.body.can.reassign, 'string');
    assert.ok(detail.body.actions, 'the workflow answers are still there');

    const refused = await call('supervisor', 'POST', `/complaints/${F.K.open}/reassign`, {
      supervisorId: F.U.supervisor2,
      note: 'Moving it',
    });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.permission, 'complaints.complaints.reassign');

    const allowed = await call('manager', 'POST', `/complaints/${F.K.open}/reassign`, {
      supervisorId: F.U.supervisor2,
      note: 'Moving it',
    });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.supervisor.id, F.U.supervisor2);

    // Outside the view scope, an action is the same 404 as a missing complaint.
    assert.equal(
      (await call('supervisor2', 'POST', `/complaints/${F.K.legacy_location}/comments`, { note: 'Hello' })).status,
      404,
    );
  });

  it('raise reaches every site through its declared Pick at All (O5)', async () => {
    const sites = await call('raiser', 'GET', '/complaints/sites');
    assert.equal(sites.status, 200);
    assert.deepEqual(
      (sites.body.data as Array<{ id: string }>).map((s) => s.id).sort(),
      [F.S.a, F.S.b, F.S.c_no_people].sort(),
    );

    // Raise needs no tie to the site: the raiser leads none of them.
    const raised = await call('raiser', 'POST', '/complaints', {
      siteId: F.S.b,
      categoryId: F.CC.no_approval,
      complainantName: 'Scope Test',
      complainantPhone: '9825012345',
      description: 'Raised on a site the raiser does not lead',
    });
    assert.equal(raised.status, 201, JSON.stringify(raised.body));
    assert.ok(raised.body.can, 'the new complaint comes back with its `can`');

    // A site nobody can receive at is still refused by routing (L3), not by scope.
    const nobody = await call('raiser', 'POST', '/complaints', {
      siteId: F.S.c_no_people,
      categoryId: F.CC.no_approval,
      complainantName: 'Scope Test',
      complainantPhone: '9825012345',
      description: 'Nobody can receive this',
    });
    assert.equal(nobody.status, 422);
  });

  it('GET /pick/complaints/categories is pick-for-everyone and returns the declared fields only', async () => {
    // budget_staff holds nothing in Complaints, and still picks categories.
    const active = await call('budget_staff', 'GET', '/pick/complaints/categories');
    assert.equal(active.status, 200, JSON.stringify(active.body));
    assert.deepEqual(
      (active.body as Array<{ name: string }>).map((c) => c.name),
      ['Information', 'Tree damage', 'Water supply'],
    );
    for (const option of active.body) {
      assert.deepEqual(Object.keys(option).sort(), [
        'approverDesignation', 'id', 'isActive', 'name', 'requiresApproval',
      ]);
    }
    assert.deepEqual(
      active.body.find((c: { name: string }) => c.name === 'Tree damage').approverDesignation,
      { id: F.D.project_director, name: 'Project Director' },
    );

    const everything = await call('budget_staff', 'GET', '/pick/complaints/categories?includeInactive=true');
    assert.equal(everything.body.length, 4);
    const searched = await call('raiser', 'GET', '/pick/complaints/categories?q=water');
    assert.deepEqual((searched.body as Array<{ id: string }>).map((c) => c.id), [F.CC.hod_approval]);

    assert.equal((await call(null, 'GET', '/pick/complaints/categories')).status, 401);
    assert.equal((await call('raiser', 'GET', '/pick/complaints/categories?includeInactive=maybe')).status, 400);
  });
});
