import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { SKIP_REASON, accessVersion, count, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Migration 0013 (owner decisions A1-A3, 5 Oct 2026) on data shaped like
 * the day before it: the P0 fixtures (three complaints waiting for
 * approval, categories that need approval) seeded at their own schema,
 * plus roles as the old mapping wrote them (approve at Own for a
 * complaints member, at All for a complaints admin) and a custom role
 * holding only approve. Then 0013 runs, and every promise it makes is
 * checked. Production (no complaint, no category) is the empty case, run
 * by every other scratch database.
 */

const CUSTOM = 'f0130000-0000-4000-8000-000000000001';
const MEMBER = SEED_ROLE_IDS.complaints_member;
const ADMIN = SEED_ROLE_IDS.complaints_admin;
const STAFF = SEED_ROLE_IDS.budget_staff;

describe('migration 0013: complaints without approval, members at Team', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let F: typeof import('../equivalence/fixtures');
  let versionBefore: string;

  const rows = async (roleId: string): Promise<string[]> =>
    (
      await db.client.query<{ k: string }>(
        `select permission_key || ':' || scope as k from role_permissions where role_id = $1 order by 1`,
        [roleId],
      )
    ).rows.map((r) => r.k);

  before(async () => {
    db = await openScratchDatabase('m0013', { fixtures: true, stopAtFixtureSchema: true });
    F = await import('../equivalence/fixtures');
    const grant = (roleId: string, pairs: Array<[string, string]>) =>
      db.client.query(
        `insert into role_permissions (role_id, permission_key, scope)
         select $1, k, s::access_scope from unnest($2::text[], $3::text[]) as t(k, s)`,
        [roleId, pairs.map(([k]) => k), pairs.map(([, s]) => s)],
      );
    const c = (a: string) => `complaints.complaints.${a}`;
    // The old mapping (RESOLUTIONS C1), and a member already ticked at Team for comment.
    await grant(MEMBER, [
      [c('view'), 'own'], [c('raise'), 'own'], [c('comment'), 'own'], [c('comment'), 'team'], [c('work'), 'own'],
      [c('approve'), 'own'], [c('reassign'), 'own'], ['budget.sites.pick', 'all'], ['platform.people.pick', 'all'],
    ]);
    await grant(ADMIN, [
      [c('view'), 'all'], [c('raise'), 'all'], [c('comment'), 'all'], [c('work'), 'all'], [c('approve'), 'all'],
      [c('reassign'), 'all'], ['complaints.categories.manage', 'all'], ['budget.sites.pick', 'all'], ['platform.people.pick', 'all'],
    ]);
    await grant(STAFF, [['budget.expenses.view', 'all']]);
    await db.client.query(`insert into roles (id, name) values ($1, '+ Complaint approver')`, [CUSTOM]);
    await grant(CUSTOM, [[c('approve'), 'team']]);
    // History from the approval days: an approval and a send-back.
    await db.client.query(
      `insert into complaint_events (complaint_id, kind, actor_id, note, from_status, to_status) values
         ($1, 'sent_back', $2, 'Photo is blurred', 'awaiting_approval', 'in_progress'),
         ($1, 'approved', $2, 'Looks good', 'awaiting_approval', 'closed')`,
      [F.K.closed, F.U.approver],
    );
    versionBefore = await accessVersion(db.client);
    const applied = await db.migrate();
    // 0013 first; the later migrations (0014: complaint title; 0015: root
    // cause, whose check must accept every complaint 0013 closed) after it.
    assert.equal(applied[0], '0013_complaints_no_approval');
    assert.deepEqual(applied.slice(1), ['0014_complaint_title', '0015_complaint_root_cause']);
  });

  after(async () => {
    await db?.close();
  });

  it('closes each complaint that waited for approval, by its resolver, when resolved, with one timeline line', async () => {
    const { rows: closed } = await db.client.query<{ id: string; status: string; ok: boolean; events: number }>(
      `select c.id, c.status, (c.closed_at = c.resolved_at and c.closed_by = c.resolved_by) as ok,
              (select count(*)::int from complaint_events e
               where e.complaint_id = c.id and e.kind = 'closed' and e.actor_id is null
                 and e.note = 'closed: approval removed' and e.from_status = 'awaiting_approval'
                 and e.to_status = 'closed') as events
       from complaints c where c.id = any($1::uuid[]) order by c.id`,
      [[F.K.awaiting, F.K.self_resolved, F.K.raised_by_approver]],
    );
    assert.deepEqual(closed.map((r) => [r.status, r.ok, r.events]), [
      ['closed', true, 1], ['closed', true, 1], ['closed', true, 1],
    ]);
    // Everything else keeps its status.
    assert.equal(await count(db.client, `select count(*) from complaints where status = 'open'`), 3);
    assert.equal(await count(db.client, `select count(*) from complaints where status = 'in_progress'`), 2);
    assert.equal(await count(db.client, `select count(*) from complaints where status = 'closed'`), 5);
  });

  it('keeps old approvals and send-backs in the timeline under the kinds that remain', async () => {
    const { rows: events } = await db.client.query<{ kind: string; note: string }>(
      `select kind, note from complaint_events where complaint_id = $1 and actor_id = $2 order by kind`,
      [F.K.closed, F.U.approver],
    );
    assert.deepEqual(events, [
      { kind: 'closed', note: 'Looks good' },
      { kind: 'comment', note: 'Sent back: Photo is blurred' },
    ]);
    await assert.rejects(
      db.client.query(`insert into complaint_events (complaint_id, kind) values ($1, 'approved')`, [F.K.open]),
      /complaint_events_kind_check/,
    );
  });

  it('drops awaiting_approval and the approval and designation columns', async () => {
    await assert.rejects(
      db.client.query(`update complaints set status = 'awaiting_approval' where id = $1`, [F.K.open]),
      /complaints_status_check/,
    );
    const { rows: cols } = await db.client.query<{ c: string }>(
      `select table_name || '.' || column_name as c from information_schema.columns
       where (table_name = 'complaints' and column_name in ('requires_approval', 'approver_id', 'hod_id', 'ceo_id'))
          or (table_name = 'complaint_categories' and column_name in ('requires_approval', 'approver_designation_id'))`,
    );
    assert.deepEqual(cols, []);
  });

  it('removes approve from every role and moves the member role to Team for view and comment', async () => {
    assert.equal(await count(db.client, `select count(*) from role_permissions where permission_key = 'complaints.complaints.approve'`), 0);
    assert.deepEqual(await rows(MEMBER), [
      'budget.sites.pick:all',
      'complaints.complaints.comment:team',
      'complaints.complaints.raise:own',
      'complaints.complaints.reassign:own',
      'complaints.complaints.view:team',
      'complaints.complaints.work:own',
      'platform.people.pick:all',
    ]);
    assert.ok(!(await rows(ADMIN)).some((k) => k.includes('.approve:')));
    assert.equal((await rows(ADMIN)).length, 8);
    assert.deepEqual(await rows(CUSTOM), []);
    assert.deepEqual(await rows(STAFF), ['budget.expenses.view:all'], 'an unrelated role is untouched');
  });

  it('writes one History row per role changed, in the re-sync format, and raises the access version', async () => {
    const { rows: audit } = await db.client.query<{
      actor_id: string | null; actor_name: string; action: string; target_type: string; target_id: string;
      target_name: string; role_name: string; before: any; after: any; note: string;
    }>(`select * from access_audit where note like 'Migration 0013%' order by target_name`);
    assert.deepEqual(audit.map((a) => a.target_name), ['+ Complaint approver', 'Complaints administrator', 'Complaints member']);
    for (const a of audit) {
      assert.equal(a.actor_id, null);
      assert.equal(a.actor_name, 'System');
      assert.equal(a.action, 'role.permissions_changed');
      assert.equal(a.target_type, 'role');
      assert.equal(a.role_name, a.target_name);
      assert.ok('complaints.complaints.approve' in a.before.permissions, a.target_name);
      assert.ok(!('complaints.complaints.approve' in a.after.permissions), a.target_name);
    }
    const member = audit.find((a) => a.target_id === MEMBER)!;
    assert.deepEqual(member.before.permissions['complaints.complaints.view'], ['own']);
    assert.deepEqual(member.before.permissions['complaints.complaints.comment'], ['own', 'team']);
    assert.deepEqual(member.after.permissions['complaints.complaints.view'], ['team']);
    assert.deepEqual(member.after.permissions['complaints.complaints.comment'], ['team']);
    assert.deepEqual(audit.find((a) => a.target_id === CUSTOM)!.after, { permissions: {} });
    assert.ok(BigInt(await accessVersion(db.client)) > BigInt(versionBefore), 'access_version rose');
  });

  it('leaves the seed roles exactly as seed-roles.ts declares them (the re-sync finds nothing to change)', async () => {
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    const result = await resyncAccessMapping(db.client, { apply: false });
    const roleChanges = result.changes.filter(
      (c) => c.kind === 'role.permissions_changed' && (c.roleId === MEMBER || c.roleId === ADMIN),
    );
    assert.deepEqual(roleChanges.map((c) => c.text), []);
  });
});
