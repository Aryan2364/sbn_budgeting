import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { Logger, type LoggerService } from '@nestjs/common';
import type { Pool } from 'pg';
import webpush from 'web-push';

import { PUSH } from '../../src/complaints/messages';
import { ENDPOINT_MAX, isPushEndpoint } from '../../src/push/push.dto';
import {
  complaintPush, PUSH_TIMEOUT_MS, PUSH_TTL_SECONDS, pushConfigFromEnv, PushService,
} from '../../src/push/push.service';

/**
 * Phone notifications (plan-phone Phase 6a), without a database: the
 * VAPID configuration and its disabled path, the payload, the
 * lock-screen words (L11), the endpoint rule, and that sending can never
 * throw into a complaint action. The database half (sending, 404/410
 * clean-up, the routes and the hooks) is test/access/push.test.ts.
 */

const KEYS = webpush.generateVAPIDKeys();
const VALID = {
  VAPID_PUBLIC_KEY: KEYS.publicKey,
  VAPID_PRIVATE_KEY: KEYS.privateKey,
  VAPID_SUBJECT: 'mailto:push-test@example.com',
};
const VARS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

/** Captures Nest's log lines for the duration of a test. */
function captureLogs(): Array<{ level: string; message: string }> {
  const lines: Array<{ level: string; message: string }> = [];
  const at = (level: string) => (message: unknown) => {
    lines.push({ level, message: String(message) });
  };
  const logger: LoggerService = { log: at('log'), error: at('error'), warn: at('warn'), debug: at('debug'), verbose: at('verbose') };
  Logger.overrideLogger(logger);
  return lines;
}

/** A pool that records every statement and answers with no rows. */
function fakePool(): { pool: Pool; sql: string[] } {
  const sql: string[] = [];
  const pool = {
    query: async (text: string) => {
      sql.push(text);
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, sql };
}

describe('push: VAPID configuration', () => {
  it('none set: off, not a mistake', () => {
    const c = pushConfigFromEnv({});
    assert.equal(c.enabled, false);
    assert.ok(!c.enabled && !c.misconfigured);
    // Blank counts as not set.
    const blank = pushConfigFromEnv({ VAPID_PUBLIC_KEY: ' ', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' });
    assert.ok(!blank.enabled && !blank.misconfigured);
  });

  it('some set: off, a mistake naming exactly the missing ones', () => {
    const c = pushConfigFromEnv({ VAPID_PUBLIC_KEY: KEYS.publicKey, VAPID_PRIVATE_KEY: KEYS.privateKey });
    assert.ok(!c.enabled && c.misconfigured);
    assert.match(c.reason, /VAPID_SUBJECT is not set/);
    assert.doesNotMatch(c.reason, /VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY/);
    const two = pushConfigFromEnv({ VAPID_SUBJECT: VALID.VAPID_SUBJECT });
    assert.ok(!two.enabled && two.misconfigured);
    assert.match(two.reason, /VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set/);
  });

  it('all set but invalid: off, a mistake, and the reason never shows a key', () => {
    const badKey = pushConfigFromEnv({ ...VALID, VAPID_PRIVATE_KEY: 'c2hvcnQ' });
    assert.ok(!badKey.enabled && badKey.misconfigured);
    assert.match(badKey.reason, /private key/i);
    const badSubject = pushConfigFromEnv({ ...VALID, VAPID_SUBJECT: 'push-test@example.com' });
    assert.ok(!badSubject.enabled && badSubject.misconfigured);
    for (const c of [badKey, badSubject]) {
      assert.ok(!c.enabled);
      assert.ok(!c.reason.includes(KEYS.privateKey) && !c.reason.includes(KEYS.publicKey));
    }
  });

  it('all three valid: on, trimmed', () => {
    const c = pushConfigFromEnv({ ...VALID, VAPID_SUBJECT: `  ${VALID.VAPID_SUBJECT} ` });
    assert.ok(c.enabled);
    assert.deepEqual(c.vapid, { subject: VALID.VAPID_SUBJECT, publicKey: KEYS.publicKey, privateKey: KEYS.privateKey });
  });
});

describe('push: the service, off and on', () => {
  const saved: Record<string, string | undefined> = {};
  let logs: Array<{ level: string; message: string }>;
  const realSend = webpush.sendNotification;

  beforeEach(() => {
    for (const v of VARS) saved[v] = process.env[v];
    logs = captureLogs();
  });
  afterEach(() => {
    for (const v of VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
    (webpush as { sendNotification: unknown }).sendNotification = realSend;
    Logger.overrideLogger(['log', 'error', 'warn']);
  });

  it('without the variables: says so once at startup, sends nothing, reads nothing', async () => {
    for (const v of VARS) delete process.env[v];
    let sends = 0;
    (webpush as { sendNotification: unknown }).sendNotification = async () => {
      sends += 1;
    };
    const { pool, sql } = fakePool();
    const push = new PushService(pool);
    assert.equal(push.enabled, false);
    assert.equal(logs.filter((l) => /Phone notifications: off/.test(l.message)).length, 1);
    assert.equal(logs.filter((l) => l.level === 'error').length, 0);

    const result = await push.sendToUsers(['a0000000-0000-4000-8000-000000000001'], complaintPush('x', 'y'));
    assert.deepEqual(result, { sent: 0, removed: 0, failed: 0 });
    push.dispatch([{ userIds: ['a0000000-0000-4000-8000-000000000001'], payload: complaintPush('x', 'y') }]);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(sql, []);
    assert.equal(sends, 0);
    // Still exactly one line: sending while off logs nothing more.
    assert.equal(logs.filter((l) => /Phone notifications/.test(l.message)).length, 1);
  });

  it('half configured: OFF as an error naming the missing variable, never a key', () => {
    process.env.VAPID_PUBLIC_KEY = KEYS.publicKey;
    process.env.VAPID_PRIVATE_KEY = KEYS.privateKey;
    delete process.env.VAPID_SUBJECT;
    const push = new PushService(fakePool().pool);
    assert.equal(push.enabled, false);
    const errors = logs.filter((l) => l.level === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0]!.message, /OFF, VAPID_SUBJECT is not set/);
    assert.ok(logs.every((l) => !l.message.includes(KEYS.privateKey)));
  });

  it('dispatch returns at once and never throws, even when a send fails or hangs', async () => {
    Object.assign(process.env, VALID);
    const push = new PushService(fakePool().pool);
    assert.equal(push.enabled, true);
    assert.ok(logs.some((l) => l.message === 'Phone notifications: on'));

    let calls = 0;
    push.sendToUsers = async () => {
      calls += 1;
      if (calls === 1) throw new Error('push service down');
      return new Promise<never>(() => undefined); // never settles
    };
    const started = Date.now();
    assert.doesNotThrow(() =>
      push.dispatch([
        { userIds: ['u1'], payload: complaintPush('c1', 'one') },
        { userIds: ['u2'], payload: complaintPush('c1', 'two') },
        { userIds: [], payload: complaintPush('c1', 'nobody') },
      ]),
    );
    assert.ok(Date.now() - started < 50);
    await new Promise((r) => setImmediate(r));
    assert.equal(calls, 2, 'one send per note with people; none for an empty one');
    assert.ok(logs.some((l) => l.level === 'warn' && /push service down/.test(l.message)));
  });
});

describe('push: what the phone gets', () => {
  it('the payload opens the complaint and replaces older ones for it', () => {
    const id = '30000000-0000-4000-8000-000000000001';
    assert.deepEqual(complaintPush(id, 'line'), {
      title: 'line',
      body: '',
      url: `/complaints/${id}`,
      tag: `complaint-${id}`,
    });
    assert.equal(PUSH_TTL_SECONDS, 86_400);
    assert.equal(PUSH_TIMEOUT_MS, 10_000);
  });

  it('lock-screen words (L11): the number and the event only, in Gujarati', () => {
    const ref = 'C-000123';
    assert.equal(PUSH.assigned(ref), 'નવી ફરિયાદ C-000123 તમને સોંપાઈ');
    assert.equal(PUSH.copied(ref), 'નવી ફરિયાદ C-000123 નોંધાઈ');
    assert.equal(PUSH.closed(ref), 'તમારી ફરિયાદ C-000123 ઉકેલાઈ ગઈ');
    assert.equal(PUSH.reassignedToYou(ref), 'ફરિયાદ C-000123 તમને સોંપાઈ');
    assert.equal(PUSH.reassignedAway(ref), 'ફરિયાદ C-000123 હવે બીજાને સોંપાઈ');
    for (const make of Object.values(PUSH)) {
      // One argument: nothing but the reference can reach the lock screen.
      assert.equal(make.length, 1);
      const line = make(ref);
      // The only Latin is the reference itself.
      assert.deepEqual(line.match(/[A-Za-z0-9-]+/g), [ref]);
    }
  });

  it('endpoint: an https push-service address, never an internal one', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc:APA91b',
      'https://web.push.apple.com/QGx2bmJ',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
      'https://wns2-pn1p.notify.windows.com/w/?token=BQYAAA',
    ]) {
      assert.equal(isPushEndpoint(ok), true, ok);
    }
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://localhost/push',
      'https://127.0.0.1/push',
      'https://10.0.0.5/push',
      'https://[::1]/push',
      'https://169.254.169.254/latest',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://internal/push',
      'ftp://fcm.googleapis.com/x',
      'not a url',
      '',
      `https://fcm.googleapis.com/${'a'.repeat(ENDPOINT_MAX)}`,
      42,
      null,
    ]) {
      assert.equal(isPushEndpoint(bad), false, String(bad));
    }
  });
});
