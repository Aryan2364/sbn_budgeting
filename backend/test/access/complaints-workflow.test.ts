import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P5 ("Done when"), through the REAL routes, as simplified by
 * the owner on 5 Oct 2026 (RESOLUTIONS A1-A3, migration 0013):
 * permission x workflow on the P0 fixtures with the decision 23 mapping,
 * the query guard in 'throw' mode.
 *
 * Both layers must pass (DECISIONS 27, plan 6.2):
 *   - the permission layer (the key, at a scope covering this
 *     complaint) refuses with 403 naming the key;
 *   - the workflow layer (are you the supervisor on THIS complaint, does
 *     its status allow it) refuses with today's codes (L1 403, status 409).
 * There is no approval: resolving closes a complaint. Routing takes the
 * supervisor and manager from the site and reads no designation. The
 * detail's `can` and its `actions` alias say exactly what the route then
 * does.
 */

const VIEW_ONLY = 'f5000000-0000-4000-8000-000000000001';

describe('complaints workflow layer through the routes (P5, A1-A3)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;
  let F: typeof import('../equivalence/fixtures');
  let NAMES: Record<string, string>;

  async function send(user: string, method: string, path: string, body?: unknown | FormData): Promise<{ status: number; body: any }> {
    const id = F.U[user as keyof typeof F.U];
    const headers: Record<string, string> = {
      authorization: `Bearer ${harness.mintToken({ id, name: NAMES[id]! })}`,
    };
    const form = body instanceof FormData;
    if (body !== undefined && !form) headers['content-type'] = 'application/json';
    const res = await fetch(`${harness.baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
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
  const call = (user: string, method: string, path: string, body?: unknown) => send(user, method, path, body);

  const NOTE = { note: 'Workflow test' };
  const act = (user: string, id: string, action: string, body: unknown = NOTE) =>
    call(user, 'POST', `/complaints/${id}/${action}`, body);

  /** Resolve with a note and one photo (multipart), as the screen does. */
  function resolve(user: string, id: string) {
    const form = new FormData();
    form.append('resolutionNote', 'Fixed it');
    form.append('photos', new Blob([F.TINY_PNG], { type: 'image/png' }), 'fixed.png');
    return send(user, 'POST', `/complaints/${id}/resolve`, form);
  }

  const raise = (user: string, siteId: string = F.S.a, categoryId: string = F.CC.pd_approval) =>
    call(user, 'POST', '/complaints', {
      siteId,
      categoryId,
      complainantName: 'Workflow Test',
      complainantPhone: '9825012345',
      description: 'Raised by the P5 test',
    });

  before(async () => {
    db = await openScratchDatabase('p5_workflow', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    F = await import('../equivalence/fixtures');

    // A person who may view every complaint and do nothing else: no
    // module rows (from P9 the permission guard decides from roles alone)
    // and ONLY a test role, view at All.
    await db.client.query(`insert into roles (id, name) values ($1, 'Test: view complaints only')`, [VIEW_ONLY]);
    await db.client.query(
      `insert into role_permissions (role_id, permission_key, scope) values ($1, 'complaints.complaints.view', 'all')`,
      [VIEW_ONLY],
    );
    await db.client.query(`insert into user_roles (user_id, role_id) values ($1, $2)`, [F.U.no_module, VIEW_ONLY]);

    const { rows } = await db.client.query<{ id: string; name: string }>('select id, name from users');
    NAMES = Object.fromEntries(rows.map((r) => [r.id, r.name]));

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

  it('0013 closed every complaint that waited for approval, by its resolver, when resolved, and says so', async () => {
    const { rows } = await db.client.query<{ id: string; status: string; same_time: boolean; same_person: boolean; note: string | null }>(
      `select c.id, c.status, c.closed_at = c.resolved_at as same_time, c.closed_by = c.resolved_by as same_person,
              (select e.note from complaint_events e
               where e.complaint_id = c.id and e.kind = 'closed' and e.actor_id is null) as note
       from complaints c where c.id = any($1::uuid[]) order by c.id`,
      [[F.K.awaiting, F.K.self_resolved, F.K.raised_by_approver]],
    );
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.deepEqual([r.status, r.same_time, r.same_person, r.note], ['closed', true, true, 'closed: approval removed'], r.id);
    }
    const detail = await call('complaints_admin', 'GET', `/complaints/${F.K.awaiting}`);
    assert.equal(detail.status, 200);
    for (const gone of ['requiresApproval', 'hod', 'ceo', 'approver']) assert.ok(!(gone in detail.body), gone);
    assert.equal(detail.body.status, 'closed');
    assert.equal(detail.body.closedBy.id, F.U.supervisor);
    // Nothing else moved: an open complaint stays open, a closed one closed.
    assert.equal((await call('complaints_admin', 'GET', `/complaints/${F.K.open}`)).body.status, 'open');
  });

  it('resolving closes the complaint, keeps the note and photos, and tells the raiser', async () => {
    const res = await resolve('supervisor', F.K.in_progress);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'closed');
    assert.equal(res.body.resolutionNote, 'Fixed it');
    assert.equal(res.body.resolvedBy.id, F.U.supervisor);
    assert.equal(res.body.closedBy.id, F.U.supervisor);
    assert.ok(res.body.closedAt);
    assert.equal(res.body.photos.filter((p: { stage: string }) => p.stage === 'resolve').length, 1);
    assert.equal(res.body.events.at(-1).kind, 'resolved');
    assert.equal(res.body.events.at(-1).toStatus, 'closed');
    // Resolving again is a stale action on a closed complaint (409).
    assert.equal((await resolve('supervisor', F.K.closed)).status, 409);
  });

  it('there is no approve or send back', async () => {
    for (const action of ['approve', 'send-back']) {
      assert.equal((await act('complaints_admin', F.K.open, action)).status, 404, action);
    }
    assert.equal((await call('raiser', 'GET', '/complaints?tab=approval')).status, 400);
    assert.equal((await call('raiser', 'GET', '/complaints?status=awaiting_approval')).status, 400);
    assert.deepEqual(Object.keys((await call('raiser', 'GET', '/complaints/counts')).body).sort(), ['all', 'assigned', 'raised']);
    assert.deepEqual(
      Object.keys((await call('complaints_admin', 'GET', '/complaints/summary')).body.byStatus).sort(),
      ['closed', 'in_progress', 'open'],
    );
  });

  it('permission held, wrong person: the workflow refuses (L1 403, no permission named)', async () => {
    // Start and resolve: only the assigned supervisor, whatever their scope.
    const admin = await act('complaints_admin', F.K.open, 'start', {});
    assert.equal(admin.status, 403);
    assert.equal(admin.body.permission, undefined, 'a workflow refusal, not the permission layer');
    assert.match(admin.body.message, /Only Suresh Supervisor, the assigned supervisor, can start work on this/);
    assert.equal((await act('manager', F.K.open, 'start', {})).status, 403);
    assert.equal((await act('supervisor', F.K.open, 'start', {})).status, 200);
  });

  it('permission not held: 403 naming the key, before the workflow is asked', async () => {
    for (const [action, key, body] of [
      ['start', 'complaints.complaints.work', {}],
      ['comments', 'complaints.complaints.comment', NOTE],
      ['reassign', 'complaints.complaints.reassign', { note: 'x', supervisorId: F.U.supervisor2 }],
    ] as const) {
      const res = await act('no_module', F.K.open, action, body);
      assert.equal(res.status, 403, action);
      assert.equal(res.body.permission, key, action);
    }
    // Their detail: `can` lists only held keys (none); the alias still has all four, refused.
    const detail = await call('no_module', 'GET', `/complaints/${F.K.open}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.can, {});
    assert.deepEqual(Object.keys(detail.body.actions).sort(), ['comment', 'reassign', 'resolve', 'start']);
    for (const name of ['start', 'resolve', 'reassign', 'comment']) {
      assert.equal(detail.body.actions[name].allowed, false, name);
      assert.match(detail.body.actions[name].reason, /^Only people allowed to /, name);
    }
  });

  it('status: a held permission and the right person still meet the status rule (409)', async () => {
    assert.equal((await act('supervisor', F.K.closed, 'start', {})).status, 409, 'closed');
    assert.equal(
      (await act('manager', F.K.closed, 'reassign', { note: 'x', supervisorId: F.U.supervisor2 })).status,
      409,
      'closed complaints are never reassigned',
    );
  });

  it('reassign: its scope is its reach (Own = the manager, All = any), never a designation', async () => {
    const body = { note: 'Moving it', supervisorId: F.U.supervisor2 };
    assert.equal((await act('manager', F.K.open, 'reassign', body)).status, 200);
    // Complaints administrator: reassign at All, not named on K1 at all.
    assert.equal((await act('complaints_admin', F.K.open, 'reassign', body)).status, 200);
    // The HOD sees K1 through Team, but reassign is Own: its manager only (A2).
    for (const user of ['hod', 'supervisor']) {
      const refused = await act(user, F.K.open, 'reassign', body);
      assert.equal(refused.status, 403, user);
      assert.equal(refused.body.permission, 'complaints.complaints.reassign', user);
    }
    // The detail names the person who can, never a role (D1).
    const detail = await call('supervisor', 'GET', `/complaints/${F.K.open}`);
    assert.equal(detail.body.can.reassign, 'Only Mahesh Manager, the manager, can reassign this.');
  });

  it("the detail's `can` is the full answer per action, and `actions` is its alias", async () => {
    const detail = await call('supervisor', 'GET', `/complaints/${F.K.open}`);
    assert.equal(detail.status, 200);
    const { can, actions } = detail.body;
    assert.deepEqual(Object.keys(can).sort(), ['comment', 'reassign', 'resolve', 'start']);
    assert.equal(can.start, true);
    assert.equal(can.resolve, true);
    assert.equal(can.comment, true);
    for (const [name, answer] of Object.entries(can)) {
      assert.deepEqual(actions[name], answer === true ? { allowed: true, reason: null } : { allowed: false, reason: answer }, name);
    }
    // And the route agrees with it.
    assert.equal((await act('supervisor', F.K.open, 'start', {})).status, 200);
  });

  it('routing: the site names the supervisor and manager, and nothing else; raising never waits on an approver', async () => {
    // The Project Director used to be the only approver for this
    // category on Site A, so raising it himself was refused (L3). Now it
    // simply goes to the site's people.
    const own = await raise('approver');
    assert.equal(own.status, 201, JSON.stringify(own.body));
    assert.equal(own.body.supervisor.id, F.U.supervisor);
    assert.equal(own.body.manager.id, F.U.manager);
    for (const gone of ['hod', 'ceo', 'approver', 'requiresApproval']) assert.ok(!(gone in own.body), gone);
    assert.deepEqual(Object.keys(own.body.events[0].payload.routing).sort(), ['manager', 'supervisor']);

    // Site B names no manager: the supervisor's reports_to is copied.
    const b = await raise('raiser', F.S.b);
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal(b.body.supervisor.id, F.U.supervisor2);
    assert.equal(b.body.manager.id, F.U.manager);

    // Designations are labels only: taking them all away changes nothing.
    await db.client.query('update users set designation_id = null where designation_id is not null');
    const bare = await raise('raiser');
    assert.equal(bare.status, 201, JSON.stringify(bare.body));
    assert.equal(bare.body.supervisor.id, F.U.supervisor);
    assert.equal(bare.body.manager.id, F.U.manager);
  });

  it('can receive means active and can sign in (routing and the raise form)', async () => {
    await db.client.query('update users set active = false where id = $1', [F.U.supervisor2]);
    try {
      const sites = await call('raiser', 'GET', '/complaints/sites');
      const siteB = (sites.body.data as Array<{ id: string; canReceive: boolean; supervisor: unknown }>).find(
        (s) => s.id === F.S.b,
      )!;
      assert.equal(siteB.canReceive, false);
      assert.equal(siteB.supervisor, null);
      const res = await raise('raiser', F.S.b, F.CC.no_approval);
      assert.equal(res.status, 422);
      // Nor can an inactive person be made the supervisor by reassigning.
      assert.equal(
        (await act('manager', F.K.open, 'reassign', { note: 'x', supervisorId: F.U.supervisor2 })).status,
        422,
      );
    } finally {
      await db.client.query('update users set active = true where id = $1', [F.U.supervisor2]);
    }
  });
});
