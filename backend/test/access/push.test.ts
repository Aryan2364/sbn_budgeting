import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Pool } from 'pg';
import webpush from 'web-push';

import type { PushNote, PushPayload, PushService } from '../../src/push/push.service';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Phone notifications (plan-phone Phase 6a), through the REAL routes and
 * the real database, on the P0 fixtures with the decision 23 mapping and
 * the query guard in 'throw' mode. web-push is mocked: nothing leaves
 * the machine.
 *
 *   - POST / DELETE /push/subscriptions: signed in only, about the
 *     caller's own phone, upsert on the endpoint;
 *   - raise, resolve and reassign push to exactly the people the bell
 *     notified, with the lock-screen line for their event (L11, L12);
 *     start and comment push nothing; a refused action pushes nothing;
 *     a failing or hanging push never fails or delays the action;
 *   - sending: only people who can sign in; 404/410 delete the phone,
 *     other failures count up, successes are stamped.
 */

const KEYS = webpush.generateVAPIDKeys();
const VAPID = {
  VAPID_PUBLIC_KEY: KEYS.publicKey,
  VAPID_PRIVATE_KEY: KEYS.privateKey,
  VAPID_SUBJECT: 'mailto:push-test@example.com',
};
const PHONE_KEYS = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

type SendCall = { endpoint: string; payload: unknown; options: Record<string, unknown> };
const realSend = webpush.sendNotification;
function mockSend(answer: (endpoint: string) => Promise<unknown>): SendCall[] {
  const calls: SendCall[] = [];
  (webpush as { sendNotification: unknown }).sendNotification = (
    sub: { endpoint: string },
    payload: string,
    options: Record<string, unknown>,
  ) => {
    calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), options });
    return answer(sub.endpoint);
  };
  return calls;
}
function restoreSend(): void {
  (webpush as { sendNotification: unknown }).sendNotification = realSend;
}
const refuse = (status: number, endpoint: string) =>
  Promise.reject(new webpush.WebPushError(`status ${status}`, status, {}, '', endpoint));

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('phone notifications (plan-phone Phase 6a)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;
  let F: typeof import('../equivalence/fixtures');
  let M: typeof import('../../src/complaints/messages');
  let P: typeof import('../../src/push/push.service');
  let NAMES: Record<string, string>;
  let push: PushService;
  let pool: Pool;
  const dispatched: PushNote[][] = [];

  async function send(
    user: string | null,
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; body: any; ms: number }> {
    const headers: Record<string, string> = { ...extraHeaders };
    if (user) {
      const id = F.U[user as keyof typeof F.U];
      headers.authorization = `Bearer ${harness.mintToken({ id, name: NAMES[id]! })}`;
    }
    const form = body instanceof FormData;
    if (body !== undefined && !form) headers['content-type'] = 'application/json';
    const started = Date.now();
    const res = await fetch(`${harness.baseUrl}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    const text = await res.text();
    const ms = Date.now() - started;
    const { testTxIdle } = await import('../support/test-tx');
    await testTxIdle();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, ms };
  }

  const raise = (user: string, siteId: string = F.S.a) =>
    send(user, 'POST', '/complaints', {
      title: 'Push test title',
      siteId,
      categoryId: F.CC.pd_approval,
      complainantName: 'Push Complainant',
      complainantPhone: '9825012345',
      description: 'Raised by the push test',
    });

  function resolve(user: string, id: string) {
    const form = new FormData();
    form.append('resolutionNote', 'Fixed it');
    form.append('rootCause', 'The joint was loose');
    form.append('photos', new Blob([F.TINY_PNG], { type: 'image/png' }), 'fixed.png');
    return send(user, 'POST', `/complaints/${id}/resolve`, form);
  }

  /** What the last action handed to push, with ids as fixture names. */
  function lastPush(): Array<{ to: string[]; payload: PushPayload }> {
    const notes = dispatched.at(-1);
    assert.ok(notes, 'nothing was dispatched');
    const nameOf = (id: string) => Object.entries(F.U).find(([, v]) => v === id)?.[0] ?? id;
    return notes.map((n) => ({ to: n.userIds.map(nameOf), payload: n.payload }));
  }

  before(async () => {
    db = await openScratchDatabase('push', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    F = await import('../equivalence/fixtures');
    const { rows } = await db.client.query<{ id: string; name: string }>('select id, name from users');
    NAMES = Object.fromEntries(rows.map((r) => [r.id, r.name]));

    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();
    const { startHarnessApp } = await import('../support/app');
    harness = await startHarnessApp({ queryGuard: 'throw' });

    M = await import('../../src/complaints/messages');
    P = await import('../../src/push/push.service');
    push = harness.app.get(P.PushService);
    pool = harness.app.get<Pool>('PG_POOL');
    // Every action's hand-off to push, recorded; the real dispatch still runs.
    const realDispatch = push.dispatch.bind(push);
    push.dispatch = (notes) => {
      dispatched.push(notes.map((n) => ({ userIds: [...n.userIds], payload: n.payload })));
      realDispatch(notes);
    };
  });

  after(async () => {
    restoreSend();
    await harness?.close();
    await db?.close();
  });

  // -------------------------------------------------------------------
  // The routes
  // -------------------------------------------------------------------

  it('the harness has push off: no VAPID keys in a test run', () => {
    assert.equal(push.enabled, false);
  });

  it('signed out: 401 on both routes', async () => {
    const body = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: PHONE_KEYS };
    assert.equal((await send(null, 'POST', '/push/subscriptions', body)).status, 401);
    assert.equal((await send(null, 'DELETE', '/push/subscriptions', { endpoint: body.endpoint })).status, 401);
    // Signed in but no longer able to sign in: still 401.
    assert.equal((await send('no_login', 'POST', '/push/subscriptions', body)).status, 401);
  });

  it('POST saves the browser subscription for the CALLER, whoever they are, and answers 204', async () => {
    const seen: Array<{ userId: string; sub: unknown; ua: string | null }> = [];
    const realSubscribe = push.subscribe.bind(push);
    push.subscribe = async (userId, sub, ua) => {
      seen.push({ userId, sub, ua });
      return realSubscribe(userId, sub, ua);
    };
    try {
      // Exactly what PushSubscription.toJSON() gives, expirationTime included.
      const browser = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc:APA91', expirationTime: null, keys: PHONE_KEYS };
      // Anyone signed in, with or without complaint permissions.
      for (const user of ['supervisor', 'no_module', 'budget_staff']) {
        const res = await send(user, 'POST', '/push/subscriptions', browser, { 'user-agent': 'PushTest/1.0 (Android)' });
        assert.equal(res.status, 204, `${user}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body, null);
      }
      assert.deepEqual(seen.map((s) => s.userId), [F.U.supervisor, F.U.no_module, F.U.budget_staff]);
      // expirationTime is dropped by the whitelist.
      assert.deepEqual(JSON.parse(JSON.stringify(seen[0]!.sub)), { endpoint: browser.endpoint, keys: PHONE_KEYS });
      assert.equal(seen[0]!.ua, 'PushTest/1.0 (Android)');
    } finally {
      push.subscribe = realSubscribe;
    }
  });

  it('POST refuses anything but a push-service subscription (400), before saving', async () => {
    const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: PHONE_KEYS };
    const bad: Array<[string, unknown]> = [
      ['http', { ...good, endpoint: 'http://fcm.googleapis.com/fcm/send/abc' }],
      ['ip address', { ...good, endpoint: 'https://10.0.0.5/push' }],
      ['localhost', { ...good, endpoint: 'https://localhost/push' }],
      ['too long', { ...good, endpoint: `https://fcm.googleapis.com/${'a'.repeat(2048)}` }],
      ['no endpoint', { keys: PHONE_KEYS }],
      ['no keys', { endpoint: good.endpoint }],
      ['keys not an object', { ...good, keys: 'x' }],
      ['no auth', { ...good, keys: { p256dh: PHONE_KEYS.p256dh } }],
      ['p256dh not base64url', { ...good, keys: { ...PHONE_KEYS, p256dh: 'not base64/+' } }],
      ['auth too long', { ...good, keys: { ...PHONE_KEYS, auth: 'A'.repeat(129) } }],
    ];
    for (const [why, body] of bad) {
      const res = await send('supervisor', 'POST', '/push/subscriptions', body);
      assert.equal(res.status, 400, `${why}: ${JSON.stringify(res.body)}`);
    }
  });

  it('DELETE removes the CALLER\'s phone only, and answers 204 either way', async () => {
    const seen: Array<[string, string]> = [];
    const realUnsubscribe = push.unsubscribe.bind(push);
    push.unsubscribe = async (userId, endpoint) => {
      seen.push([userId, endpoint]);
      return realUnsubscribe(userId, endpoint);
    };
    try {
      const endpoint = 'https://web.push.apple.com/QGx2bmJ';
      assert.equal((await send('raiser', 'DELETE', '/push/subscriptions', { endpoint })).status, 204);
      assert.deepEqual(seen, [[F.U.raiser, endpoint]]);
      assert.equal((await send('raiser', 'DELETE', '/push/subscriptions', {})).status, 400);
      assert.equal((await send('raiser', 'DELETE', '/push/subscriptions', { endpoint: 'x'.repeat(2049) })).status, 400);
    } finally {
      push.unsubscribe = realUnsubscribe;
    }
  });

  it('upsert on the endpoint: the same phone moves to whoever signed in last; only its owner removes it', async () => {
    const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/upsert-test';
    const rowsFor = () =>
      db.client.query<{ user_id: string; auth: string; user_agent: string | null; failure_count: number }>(
        'select user_id, auth, user_agent, failure_count from push_subscriptions where endpoint = $1',
        [endpoint],
      );
    // Outside a request: the service's statements commit to the scratch database.
    await push.subscribe(F.U.supervisor, { endpoint, keys: PHONE_KEYS }, 'Phone A');
    await db.client.query('update push_subscriptions set failure_count = 3 where endpoint = $1', [endpoint]);
    await push.subscribe(F.U.manager, { endpoint, keys: { ...PHONE_KEYS, auth: 'NewAuthSecret0000000AA' } }, null);
    let rows = (await rowsFor()).rows;
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { user_id: F.U.manager, auth: 'NewAuthSecret0000000AA', user_agent: null, failure_count: 0 });

    await push.unsubscribe(F.U.supervisor, endpoint); // no longer theirs: left alone
    assert.equal((await rowsFor()).rows.length, 1);
    await push.unsubscribe(F.U.manager, endpoint);
    assert.equal((await rowsFor()).rows.length, 0);
  });

  // -------------------------------------------------------------------
  // The hooks: the same events as the bell
  // -------------------------------------------------------------------

  it('raise: the supervisor gets "assigned", the manager "copied"; nothing else on the lock screen', async () => {
    const res = await raise('raiser');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { id, reference } = res.body as { id: string; reference: string };
    assert.deepEqual(lastPush(), [
      { to: ['supervisor'], payload: P.complaintPush(id, M.PUSH.assigned(reference)) },
      { to: ['manager'], payload: P.complaintPush(id, M.PUSH.copied(reference)) },
    ]);
    const wire = JSON.stringify(dispatched.at(-1));
    for (const secret of ['Push test title', 'Raised by the push test', 'Push Complainant', '9825012345', NAMES[F.U.raiser]!]) {
      assert.ok(!wire.includes(secret), `the push carries "${secret}"`);
    }
  });

  it('raise by the manager: the actor is never pushed (derived from notify()\'s answer)', async () => {
    const res = await raise('manager');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(lastPush(), [
      { to: ['supervisor'], payload: P.complaintPush(res.body.id, M.PUSH.assigned(res.body.reference)) },
    ]);
  });

  it('resolve: the raiser gets "closed"', async () => {
    const res = await resolve('supervisor', F.K.in_progress);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(lastPush(), [
      { to: ['raiser'], payload: P.complaintPush(F.K.in_progress, M.PUSH.closed(res.body.reference)) },
    ]);
  });

  it('reassign: the new supervisor gets "to you", the old one "moved away"', async () => {
    const res = await send('manager', 'POST', `/complaints/${F.K.open}/reassign`, { note: 'Push test', supervisorId: F.U.supervisor2 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ref = res.body.reference as string;
    assert.deepEqual(lastPush(), [
      { to: ['supervisor2'], payload: P.complaintPush(F.K.open, M.PUSH.reassignedToYou(ref)) },
      { to: ['supervisor'], payload: P.complaintPush(F.K.open, M.PUSH.reassignedAway(ref)) },
    ]);
  });

  it('start and comment notify nobody, so push nothing; a refused action never reaches push', async () => {
    const started = await send('supervisor', 'POST', `/complaints/${F.K.open}/start`, {});
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.deepEqual(dispatched.at(-1), []);
    const commented = await send('supervisor', 'POST', `/complaints/${F.K.open}/comments`, { note: 'Push test' });
    assert.equal(commented.status, 200, JSON.stringify(commented.body));
    assert.deepEqual(dispatched.at(-1), []);

    const before = dispatched.length;
    // Wrong person (403), stale status (409), missing root cause (422).
    assert.equal((await resolve('complaints_admin', F.K.in_progress)).status, 403);
    assert.equal((await resolve('supervisor', F.K.closed)).status, 409);
    const noCause = new FormData();
    noCause.append('resolutionNote', 'Fixed it');
    noCause.append('photos', new Blob([F.TINY_PNG], { type: 'image/png' }), 'fixed.png');
    assert.equal((await send('supervisor', 'POST', `/complaints/${F.K.in_progress}/resolve`, noCause)).status, 422);
    assert.equal(dispatched.length, before, 'a refused action dispatched a push');
  });

  it('a failing or hanging push never fails or slows the action', async () => {
    const realConfig = push.config;
    const realSendToUsers = push.sendToUsers;
    let calls = 0;
    (push as { config: unknown }).config = P.pushConfigFromEnv(VAPID);
    push.sendToUsers = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('push service down')) : new Promise<never>(() => undefined);
    };
    try {
      const res = await raise('raiser');
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(calls, 2, 'both notes were handed to the sender');
      assert.ok(res.ms < 5000, `the raise took ${res.ms} ms`);
      assert.match(res.body.reference, /^C-\d+$/);
    } finally {
      (push as { config: unknown }).config = realConfig;
      push.sendToUsers = realSendToUsers;
    }
  });

  // -------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------

  it('sending: people who can sign in only; 404/410 delete the phone; other failures count; success is stamped', async () => {
    const E = {
      ok: 'https://fcm.googleapis.com/fcm/send/ok',
      gone: 'https://fcm.googleapis.com/fcm/send/gone410',
      missing: 'https://web.push.apple.com/missing404',
      broken: 'https://updates.push.services.mozilla.com/wpush/v2/broken500',
      noLogin: 'https://fcm.googleapis.com/fcm/send/nologin',
      inactive: 'https://fcm.googleapis.com/fcm/send/inactive',
    };
    await db.client.query(`update users set active = false where id = $1`, [F.U.hod]);
    const owners: Array<[string, string]> = [
      [E.ok, F.U.supervisor], [E.gone, F.U.supervisor], [E.missing, F.U.manager],
      [E.broken, F.U.raiser], [E.noLogin, F.U.no_login], [E.inactive, F.U.hod],
    ];
    for (const [endpoint, userId] of owners) {
      await db.client.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth, failure_count) values ($1, $2, $3, $4, 2)`,
        [userId, endpoint, PHONE_KEYS.p256dh, PHONE_KEYS.auth],
      );
    }
    const calls = mockSend((endpoint) => {
      if (endpoint === E.gone) return refuse(410, endpoint);
      if (endpoint === E.missing) return refuse(404, endpoint);
      if (endpoint === E.broken) return refuse(500, endpoint);
      return Promise.resolve({ statusCode: 201, body: '', headers: {} });
    });

    const saved = Object.fromEntries(Object.keys(VAPID).map((k) => [k, process.env[k]]));
    Object.assign(process.env, VAPID);
    let sender: PushService;
    try {
      sender = new P.PushService(pool);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    assert.equal(sender.enabled, true);
    const payload = P.complaintPush(F.K.open, M.PUSH.assigned('C-000001'));
    const result = await sender.sendToUsers(
      [F.U.supervisor, F.U.manager, F.U.raiser, F.U.no_login, F.U.hod, F.U.supervisor, F.U.bystander],
      payload,
    );
    restoreSend();

    assert.deepEqual(result, { sent: 1, removed: 2, failed: 1 });
    assert.deepEqual(calls.map((c) => c.endpoint).sort(), [E.broken, E.gone, E.missing, E.ok].sort());
    for (const c of calls) {
      assert.deepEqual(c.payload, payload);
      assert.deepEqual(c.options, {
        TTL: 86_400,
        timeout: 10_000,
        vapidDetails: { subject: VAPID.VAPID_SUBJECT, publicKey: KEYS.publicKey, privateKey: KEYS.privateKey },
      });
    }
    const { rows } = await db.client.query<{ endpoint: string; failure_count: number; stamped: boolean }>(
      `select endpoint, failure_count, last_success_at is not null as stamped
       from push_subscriptions where endpoint = any($1::text[]) order by endpoint`,
      [Object.values(E)],
    );
    const state = Object.fromEntries(rows.map((r) => [r.endpoint, [r.failure_count, r.stamped]]));
    assert.deepEqual(state, {
      [E.ok]: [0, true],
      [E.broken]: [3, false],
      [E.noLogin]: [2, false],
      [E.inactive]: [2, false],
    });
  });

  it('end to end: a phone subscribed, then a raise by someone else pushes to it once, after the commit', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/end-to-end';
    await db.client.query('delete from push_subscriptions');
    await push.subscribe(F.U.supervisor, { endpoint, keys: PHONE_KEYS }, 'Phone');
    const calls = mockSend(() => Promise.resolve({ statusCode: 201, body: '', headers: {} }));
    const realConfig = push.config;
    (push as { config: unknown }).config = P.pushConfigFromEnv(VAPID);
    try {
      const res = await raise('raiser');
      assert.equal(res.status, 201, JSON.stringify(res.body));
      await until(() => calls.length > 0);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(calls.length, 1, 'one phone, one push (the manager has none)');
      assert.equal(calls[0]!.endpoint, endpoint);
      assert.deepEqual(calls[0]!.payload, {
        title: M.PUSH.assigned(res.body.reference),
        body: '',
        url: `/complaints/${res.body.id}`,
        tag: `complaint-${res.body.id}`,
      });
    } finally {
      (push as { config: unknown }).config = realConfig;
      restoreSend();
    }
  });
});
