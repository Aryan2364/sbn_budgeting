import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import webpush from 'web-push';

import { PG_POOL } from '../db/db.module';

/**
 * Phone notifications (web push). Plan: complain/plan-phone-2026-10-13-1035.md,
 * Phase 6a; CONTRACT section 9 push-notifications.
 *
 * Three rules hold everywhere here:
 *
 * 1. Push never breaks or slows a complaint action. The complaints
 *    service calls `dispatch` AFTER its transaction has committed and
 *    does not wait for it; nothing here throws to a caller, and every
 *    failure is logged and dropped.
 * 2. Push only goes to people the bell just notified (the ids `notify()`
 *    returned), and only to those who can still sign in. Its words are
 *    `PUSH` in complaints/messages.ts: the complaint number and the
 *    event, never a title, name, phone number or site (plan L11).
 * 3. Without the VAPID keys in the environment push is OFF: one line in
 *    the startup log, and nothing is sent. Subscribing still works, so a
 *    phone that turned notifications on is ready when the keys are set.
 *
 * A subscription the push service says is gone (404 or 410) is deleted.
 * Any other failure counts up `failure_count` and is logged by host and
 * status only: the endpoint itself is a secret address for that phone.
 */

/** What the phone's service worker (frontend `public/sw-push.js`) shows. */
export interface PushPayload {
  /** The lock-screen line: PUSH in complaints/messages.ts. */
  title: string;
  /** Always empty: the title says everything that may be shown (L11). */
  body: string;
  /** Opened on tap, relative to the app's origin. */
  url: string;
  /** One notification per complaint on the phone: a newer one replaces it. */
  tag: string;
}

/** The people to send one payload to. */
export interface PushNote {
  userIds: readonly string[];
  payload: PushPayload;
}

export interface PushSendResult {
  /** Subscriptions the push service accepted. */
  sent: number;
  /** Subscriptions deleted because the push service said 404 or 410. */
  removed: number;
  /** Other failures (counted on the row, logged). */
  failed: number;
}

export interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export type PushConfig =
  | { enabled: true; vapid: VapidDetails }
  | {
      enabled: false;
      /** Why, for the startup log. Never contains a key. */
      reason: string;
      /** Some but not all variables set, or invalid: a mistake, logged as an error. */
      misconfigured: boolean;
    };

/** How long the push service keeps an undelivered message: one day. */
export const PUSH_TTL_SECONDS = 86_400;
/** Socket timeout for one send to the push service. */
export const PUSH_TIMEOUT_MS = 10_000;

const VAPID_VARS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

/**
 * Reads VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT. All three
 * blank: off. Some set: off, and a misconfiguration. All set but not
 * valid (web-push checks the key lengths and that the subject is a
 * mailto: or https: address): off, and a misconfiguration.
 */
export function pushConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PushConfig {
  const value = (name: (typeof VAPID_VARS)[number]): string => env[name]?.trim() ?? '';
  const missing = VAPID_VARS.filter((name) => !value(name));
  if (missing.length === VAPID_VARS.length) {
    return { enabled: false, reason: `${VAPID_VARS.join(', ')} are not set`, misconfigured: false };
  }
  if (missing.length > 0) {
    return {
      enabled: false,
      reason: `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set (set all three, or none)`,
      misconfigured: true,
    };
  }
  const vapid: VapidDetails = {
    subject: value('VAPID_SUBJECT'),
    publicKey: value('VAPID_PUBLIC_KEY'),
    privateKey: value('VAPID_PRIVATE_KEY'),
  };
  try {
    // Signs a throwaway header: the same checks a real send makes.
    webpush.getVapidHeaders('https://push.invalid', vapid.subject, vapid.publicKey, vapid.privateKey, 'aes128gcm');
  } catch (error) {
    // web-push's messages name the variable's problem (length, subject
    // form), never the key itself.
    const why = error instanceof Error ? error.message : String(error);
    return { enabled: false, reason: `the VAPID settings are not valid: ${why}`, misconfigured: true };
  }
  return { enabled: true, vapid };
}

/** The payload for one complaint event. `title` comes from PUSH (messages.ts). */
export function complaintPush(complaintId: string, title: string): PushPayload {
  return { title, body: '', url: `/complaints/${complaintId}`, tag: `complaint-${complaintId}` };
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The push service's host, for logs: the full endpoint is a secret address. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return '(unreadable endpoint)';
  }
}

function statusOf(error: unknown): number | null {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : null;
}

const GONE = new Set([404, 410]);

@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  readonly config: PushConfig;

  /** Reads the VAPID variables once, when the app is built. */
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {
    this.config = pushConfigFromEnv(process.env);
    // Logged once, at startup.
    if (this.config.enabled) {
      this.logger.log('Phone notifications: on');
    } else if (this.config.misconfigured) {
      this.logger.error(`Phone notifications: OFF, ${this.config.reason}. Complaints keep working without them.`);
    } else {
      this.logger.log(`Phone notifications: off (${this.config.reason})`);
    }
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  // -------------------------------------------------------------------
  // Subscriptions (POST and DELETE /push/subscriptions)
  // -------------------------------------------------------------------

  /**
   * Saves this phone for `userId`. Upsert on the endpoint: the same phone
   * signed in as someone else now belongs to them, and its keys and
   * failure count start fresh.
   */
  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent: string | null,
  ): Promise<void> {
    await this.pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update
         set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
             user_agent = excluded.user_agent, updated_at = now(), failure_count = 0,
             last_success_at = case when push_subscriptions.user_id = excluded.user_id
                                    then push_subscriptions.last_success_at end`,
      [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent ? userAgent.slice(0, 512) : null],
    );
  }

  /**
   * Removes this phone, only if it is the caller's. Someone else's phone,
   * or one never saved, is left alone and answers the same way.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.pool.query(`delete from push_subscriptions where endpoint = $1 and user_id = $2`, [endpoint, userId]);
  }

  // -------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------

  /**
   * Fire and forget, for after a transaction has committed: starts every
   * send and returns at once. Never throws, never rejects.
   */
  dispatch(notes: readonly PushNote[]): void {
    if (!this.config.enabled) return;
    for (const note of notes) {
      if (note.userIds.length === 0) continue;
      void this.sendToUsers(note.userIds, note.payload).catch((error: unknown) => {
        this.logger.warn(`Push not sent: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  /**
   * Sends `payload` to every phone of these people who can still sign
   * in, all at once (allSettled), then tidies up: 404/410 deleted, other
   * failures counted, successes stamped. Resolves even when sends fail.
   */
  async sendToUsers(userIds: readonly string[], payload: PushPayload): Promise<PushSendResult> {
    const result: PushSendResult = { sent: 0, removed: 0, failed: 0 };
    const config = this.config;
    const ids = [...new Set(userIds)];
    if (!config.enabled || ids.length === 0) return result;

    const { rows } = await this.pool.query<SubscriptionRow>(
      `select s.id, s.endpoint, s.p256dh, s.auth
       from push_subscriptions s
       join users u /*scope-exempt: push goes only to people notify() already chose; this reads whether they can sign in*/
         on u.id = s.user_id
       where s.user_id = any($1::uuid[]) and u.active and u.can_login`,
      [ids],
    );
    if (rows.length === 0) return result;

    const body = JSON.stringify(payload);
    const settled = await Promise.allSettled(
      rows.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: PUSH_TTL_SECONDS,
          timeout: PUSH_TIMEOUT_MS,
          vapidDetails: config.vapid,
        }),
      ),
    );

    const ok: string[] = [];
    const gone: string[] = [];
    const failed: string[] = [];
    settled.forEach((outcome, i) => {
      const s = rows[i]!;
      if (outcome.status === 'fulfilled') {
        ok.push(s.id);
        return;
      }
      const status = statusOf(outcome.reason);
      if (status !== null && GONE.has(status)) {
        gone.push(s.id);
        return;
      }
      failed.push(s.id);
      const why = status !== null ? `status ${status}` : outcome.reason instanceof Error ? outcome.reason.message : 'unknown error';
      this.logger.warn(`Push to ${hostOf(s.endpoint)} failed (${why}); will try again on the next event.`);
    });

    await this.tidy(
      `delete from push_subscriptions where id = any($1::uuid[])`, gone, 'remove dead subscriptions');
    await this.tidy(
      `update push_subscriptions set last_success_at = now(), failure_count = 0 where id = any($1::uuid[])`,
      ok, 'stamp delivered subscriptions');
    await this.tidy(
      `update push_subscriptions set failure_count = failure_count + 1 where id = any($1::uuid[])`,
      failed, 'count failed subscriptions');

    result.sent = ok.length;
    result.removed = gone.length;
    result.failed = failed.length;
    return result;
  }

  /** Bookkeeping after a send. A failure here is logged, never thrown. */
  private async tidy(sql: string, ids: string[], what: string): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.pool.query(sql, [ids]);
    } catch (error) {
      this.logger.warn(`Could not ${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
