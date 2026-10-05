import type { PoolClient } from 'pg';

/**
 * In-app notifications (CONTRACT section 3, plan Q5 default).
 *
 * Written inside the same transaction as the complaint change that
 * caused them, so a rolled-back action notifies nobody.
 *
 * The rules every caller would otherwise repeat live here:
 *   - nobody is notified twice for one action (first kind listed wins,
 *     so list the most specific recipient first);
 *   - the person who took the action is never notified of it;
 *   - null recipients (no manager) are skipped.
 */

export type NotificationKind =
  | 'assigned'         // you are the supervisor now
  | 'copied'           // you are the manager on a new complaint
  | 'closed'           // your complaint was resolved, which closes it
  | 'reassigned_away'; // the complaint moved from you to someone else

export interface Recipient {
  userId: string | null | undefined;
  kind: NotificationKind;
  title: string;
}

export async function notify(
  client: PoolClient,
  complaintId: string,
  actorId: string,
  body: string | null,
  recipients: Recipient[],
): Promise<string[]> {
  const seen = new Set<string>([actorId]);
  const notified: string[] = [];
  for (const r of recipients) {
    if (!r.userId || seen.has(r.userId)) continue;
    seen.add(r.userId);
    await client.query(
      `insert into notifications (user_id, complaint_id, kind, title, body)
       values ($1, $2, $3, $4, $5)`,
      [r.userId, complaintId, r.kind, r.title, body],
    );
    notified.push(r.userId);
  }
  return notified;
}
