import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P5 ("Done when"), through the REAL routes: permission x
 * workflow on the P0 fixtures with the decision 23 mapping, the query
 * guard in 'throw' mode.
 *
 * Both layers must pass (DECISIONS 27, plan 6.2):
 *   - the permission layer (the key, at a scope covering this
 *     complaint) refuses with 403 naming the key;
 *   - the workflow layer (are you the supervisor / the approver on THIS
 *     complaint, not its raiser or resolver, does its status allow it)
 *     refuses with today's codes (L1 403, L2 422, status 409), and with
 *     409 `blocked` for self-approval (D6, R7).
 * The detail's `can` and its `actions` alias say exactly what the route
 * then does. Routing never picks the raiser as approver.
 */

const APPROVE_ONLY_VIEW = 'f5000000-0000-4000-8000-000000000001';

describe('complaints workflow layer through the routes (P5)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;
  let F: typeof import('../equivalence/fixtures');
  let NAMES: Record<string, string>;

  async function call(user: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    const id = F.U[user as keyof typeof F.U];
    const headers: Record<string, string> = {
      authorization: `Bearer ${harness.mintToken({ id, name: NAMES[id]! })}`,
    };
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

  const NOTE = { note: 'Workflow test' };
  const act = (user: string, id: string, action: string, body: unknown = NOTE) =>
    call(user, 'POST', `/complaints/${id}/${action}`, body);

  before(async () => {
    db = await openScratchDatabase('p5_workflow', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    F = await import('../equivalence/fixtures');

    // A person who may view every complaint and do nothing else: today's
    // complaints access (so the old route guard, which still decides
    // until P9, lets them in) and ONLY a test role, view at All.
    await db.client.query(
      `insert into user_module_access (user_id, module, role) values ($1, 'complaints', 'member')`,
      [F.U.no_module],
    );
    await db.client.query(`insert into roles (id, name) values ($1, 'Test: view complaints only')`, [APPROVE_ONLY_VIEW]);
    await db.client.query(
      `insert into role_permissions (role_id, permission_key, scope) values ($1, 'complaints.complaints.view', 'all')`,
      [APPROVE_ONLY_VIEW],
    );
    await db.client.query(`insert into user_roles (user_id, role_id) values ($1, $2)`, [F.U.no_module, APPROVE_ONLY_VIEW]);

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

  it('approve: the approver may; the raiser-approver and resolver-approver are blocked with 409 (D6)', async () => {
    // K3: raised by the raiser, resolved by the supervisor, awaiting approval.
    assert.equal((await act('approver', F.K.awaiting, 'approve')).status, 200);
    assert.equal((await act('approver', F.K.awaiting, 'send-back')).status, 200);

    for (const [id, made] of [
      [F.K.raised_by_approver, 'raised'],
      [F.K.self_resolved, 'resolved'],
    ] as const) {
      for (const [action, decide] of [
        ['approve', 'approve it'],
        ['send-back', 'send it back'],
      ] as const) {
        const res = await act('approver', id, action);
        assert.equal(res.status, 409, `${action} ${made}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.error, 'blocked');
        assert.equal(res.body.reason, `You ${made} this complaint, so someone else must ${decide}.`);
      }
      // The detail says so before anyone tries, in `can` and its alias.
      const detail = await call('approver', 'GET', `/complaints/${id}`);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.can.approve, `You ${made} this complaint, so someone else must approve it.`);
      assert.equal(detail.body.can.sendBack, `You ${made} this complaint, so someone else must send it back.`);
      assert.deepEqual(detail.body.actions.approve, { allowed: false, reason: detail.body.can.approve });
    }
  });

  it('permission held, wrong person: the workflow refuses (L1 403, no permission named)', async () => {
    // A complaints administrator holds approve at All, yet is not K3's approver.
    const admin = await act('complaints_admin', F.K.awaiting, 'approve');
    assert.equal(admin.status, 403);
    assert.equal(admin.body.permission, undefined, 'a workflow refusal, not the permission layer');
    assert.match(admin.body.message, /Only Anil Approver, the approver, can approve this/);
    // The supervisor holds approve at Own and is named on K3, but is not its approver.
    assert.equal((await act('supervisor', F.K.awaiting, 'approve')).status, 403);
    // Start and resolve: only the assigned supervisor, whatever their scope.
    assert.equal((await act('manager', F.K.open, 'start', {})).status, 403);
    assert.equal((await act('complaints_admin', F.K.open, 'start', {})).status, 403);
    assert.equal((await act('supervisor', F.K.open, 'start', {})).status, 200);
  });

  it('permission not held: 403 naming the key, before the workflow is asked', async () => {
    for (const [action, key, body] of [
      ['approve', 'complaints.complaints.approve', NOTE],
      ['send-back', 'complaints.complaints.approve', NOTE],
      ['start', 'complaints.complaints.work', {}],
      ['comments', 'complaints.complaints.comment', NOTE],
      ['reassign', 'complaints.complaints.reassign', { note: 'x', supervisorId: F.U.supervisor2 }],
    ] as const) {
      const res = await act('no_module', F.K.awaiting, action, body);
      assert.equal(res.status, 403, action);
      assert.equal(res.body.permission, key, action);
    }
    // Their detail: `can` lists only held keys (none); the alias still has all six, refused.
    const detail = await call('no_module', 'GET', `/complaints/${F.K.awaiting}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.can, {});
    for (const name of ['start', 'resolve', 'approve', 'sendBack', 'reassign', 'comment']) {
      assert.equal(detail.body.actions[name].allowed, false, name);
      assert.match(detail.body.actions[name].reason, /^Only people allowed to /, name);
    }
  });

  it('status: a held permission and the right person still meet the status rule (409)', async () => {
    assert.equal((await act('approver', F.K.open, 'approve')).status, 409, 'not resolved yet');
    assert.equal((await act('approver', F.K.closed, 'approve')).status, 409, 'already closed');
    assert.equal((await act('supervisor', F.K.closed, 'resolve', {})).status, 409, 'closed');
    assert.equal(
      (await act('manager', F.K.closed, 'reassign', { note: 'x', supervisorId: F.U.supervisor2 })).status,
      409,
      'closed complaints are never reassigned',
    );
    // Not applicable: a category that needs no approval (L2 422).
    assert.equal((await act('complaints_admin', F.K.in_progress_no_approval, 'approve')).status, 422);
  });

  it('reassign: its scope is its reach (Own = manager or HOD, All = any), never an admin flag', async () => {
    const body = { note: 'Moving it', supervisorId: F.U.supervisor2 };
    assert.equal((await act('manager', F.K.open, 'reassign', body)).status, 200);
    assert.equal((await act('hod', F.K.open, 'reassign', body)).status, 200);
    // Complaints administrator: reassign at All, not named on K1 at all.
    assert.equal((await act('complaints_admin', F.K.open, 'reassign', body)).status, 200);
    const refused = await act('supervisor', F.K.open, 'reassign', body);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.permission, 'complaints.complaints.reassign');

    // The detail names the people who can, never a role (D1).
    const detail = await call('supervisor', 'GET', `/complaints/${F.K.open}`);
    assert.equal(detail.body.can.reassign, 'Only Mahesh Manager, the manager, or Hema Hod, the HOD, can reassign this.');
  });

  it("the detail's `can` is the full answer per action, and `actions` is its alias", async () => {
    const detail = await call('supervisor', 'GET', `/complaints/${F.K.open}`);
    assert.equal(detail.status, 200);
    const { can, actions } = detail.body;
    assert.deepEqual(Object.keys(can).sort(), ['approve', 'comment', 'reassign', 'resolve', 'sendBack', 'start']);
    assert.equal(can.start, true);
    assert.equal(can.resolve, true);
    assert.equal(can.comment, true);
    assert.equal(can.approve, 'Only Anil Approver, the approver, can approve this.');
    for (const [name, answer] of Object.entries(can)) {
      assert.deepEqual(actions[name], answer === true ? { allowed: true, reason: null } : { allowed: false, reason: answer }, name);
    }
    // And the route agrees with it.
    assert.equal((await act('supervisor', F.K.open, 'start', {})).status, 200);
  });

  it('routing never picks the raiser as approver, and walks on up for the same designation', async () => {
    const raise = (user: string, categoryId: string, siteId: string = F.S.a) =>
      call(user, 'POST', '/complaints', {
        siteId,
        categoryId,
        complainantName: 'Workflow Test',
        complainantPhone: '9825012345',
        description: 'Raised by the P5 test',
      });

    // The Project Director is the only one up Site A's chain: raising a
    // PD-approved complaint himself leaves nobody to approve it (L3 422).
    const own = await raise('approver', F.CC.pd_approval);
    assert.equal(own.status, 422, JSON.stringify(own.body));
    assert.match(own.body.message, /you can't approve a complaint you raised/);
    // Anyone else raising it gets him as approver.
    const other = await raise('hod', F.CC.pd_approval);
    assert.equal(other.status, 201, JSON.stringify(other.body));
    assert.equal(other.body.approver.id, F.U.approver);

    // A second HOD above the first: the HOD who raises it is skipped for the next one.
    const { rows } = await db.client.query<{ designation_id: string }>('select designation_id from users where id = $1', [F.U.ceo]);
    await db.client.query(`update users set designation_id = (select id from designations where seed_key = 'hod') where id = $1`, [F.U.ceo]);
    try {
      const skipped = await raise('hod', F.CC.hod_approval);
      assert.equal(skipped.status, 201, JSON.stringify(skipped.body));
      assert.equal(skipped.body.approver.id, F.U.ceo);
      const normal = await raise('raiser', F.CC.hod_approval);
      assert.equal(normal.body.approver.id, F.U.hod);
    } finally {
      await db.client.query('update users set designation_id = $2 where id = $1', [F.U.ceo, rows[0]!.designation_id]);
    }
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
      const res = await call('raiser', 'POST', '/complaints', {
        siteId: F.S.b,
        categoryId: F.CC.no_approval,
        complainantName: 'Workflow Test',
        complainantPhone: '9825012345',
        description: 'Nobody active to receive it',
      });
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
