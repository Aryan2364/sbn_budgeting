import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { AUDIT_NOTE, formatResync, resyncAccessMapping } from '../../src/db/map-access-levels';
import { U } from '../equivalence/fixtures';
import { SKIP_REASON, accessVersion, count, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * The decision 23 mapping as a full re-sync (plan 5.4, R11.1), on the
 * P0 fixtures: dry run writes nothing; the first run maps every level;
 * a second run changes nothing, writes no audit rows and leaves
 * access_version alone; a planted change is re-synced both ways.
 */

const R = SEED_ROLE_IDS;

describe('access mapping re-sync', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;

  const holders = async (roleId: string): Promise<string[]> =>
    (
      await db.client.query<{ user_id: string }>('select user_id from user_roles where role_id = $1 order by user_id', [roleId])
    ).rows.map((r) => r.user_id);
  const sorted = (...ids: string[]): string[] => [...ids].sort();
  const auditCount = (): Promise<number> => count(db.client, 'select count(*) from access_audit');

  before(async () => {
    db = await openScratchDatabase('mapping', { fixtures: true });
  });

  after(async () => {
    await db?.close();
  });

  it('the migration seeds the five roles, with no rows and no holders', async () => {
    const { rows } = await db.client.query<{ id: string; name: string; system_key: string | null }>(
      'select id, name, system_key from roles order by id',
    );
    assert.deepEqual(rows.map((r) => [r.id, r.system_key]), [
      [R.admin, 'admin'],
      [R.budget_admin, null],
      [R.budget_staff, null],
      [R.complaints_admin, null],
      [R.complaints_member, null],
    ]);
    assert.equal(await count(db.client, 'select count(*) from role_permissions'), 0);
    assert.equal(await count(db.client, 'select count(*) from user_roles'), 0);
    assert.equal(await accessVersion(db.client), '1');
  });

  it('a dry run (the default) reports every change and writes nothing', async () => {
    const auditBefore = await auditCount();
    const result = await resyncAccessMapping(db.client);
    assert.equal(result.applied, false);
    assert.ok(result.changes.length > 0);
    assert.equal(await count(db.client, 'select count(*) from role_permissions'), 0);
    assert.equal(await count(db.client, 'select count(*) from user_roles'), 0);
    assert.equal(await auditCount(), auditBefore);
    assert.equal(await accessVersion(db.client), '1');
    assert.match(formatResync(result), /DRY RUN/);
  });

  it('the first run maps every level, lists the platform-admin-only people, and audits each change', async () => {
    const auditBefore = await auditCount();
    const result = await resyncAccessMapping(db.client, { apply: true });
    assert.equal(result.applied, true);

    assert.deepEqual(await holders(R.admin), sorted(U.platform_admin, U.all_admin));
    assert.deepEqual(await holders(R.budget_admin), sorted(U.all_admin, U.budget_admin, U.no_login));
    assert.deepEqual(await holders(R.budget_staff), sorted(U.budget_staff, U.staff_member));
    assert.deepEqual(await holders(R.complaints_admin), sorted(U.all_admin, U.complaints_admin));
    assert.deepEqual(
      await holders(R.complaints_member),
      sorted(U.staff_member, U.raiser, U.supervisor, U.supervisor2, U.manager, U.approver, U.hod, U.ceo),
    );
    assert.equal(await count(db.client, 'select count(*) from user_roles where granted_by is not null'), 0);

    // Admin is computed: no rows. Complaints member: view and comment at
    // Team (A3), raise, work and reassign at Own (C1), plus the declared
    // Picks at All (O5).
    assert.equal(await count(db.client, 'select count(*) from role_permissions where role_id = $1', [R.admin]), 0);
    const member = (
      await db.client.query<{ k: string }>(
        `select permission_key || ':' || scope as k from role_permissions where role_id = $1 order by 1`,
        [R.complaints_member],
      )
    ).rows.map((r) => r.k);
    assert.deepEqual(member, [
      'budget.sites.pick:all',
      'complaints.complaints.comment:team',
      'complaints.complaints.raise:own',
      'complaints.complaints.reassign:own',
      'complaints.complaints.view:team',
      'complaints.complaints.work:own',
      'platform.people.pick:all',
    ]);

    assert.deepEqual(result.report.platformLevelOnly.map((p) => p.id), [U.platform_admin]);
    assert.deepEqual(result.report.platformLevelOnly[0]!.gains, ['Budget', 'Complaints']);
    assert.deepEqual(result.report.underGranted, []);
    assert.deepEqual(result.report.uncoveredSites.map((s) => s.name), ['Site C']);

    const written = (await auditCount()) - auditBefore;
    assert.equal(written, result.auditRows);
    assert.equal(written, result.changes.length);
    assert.equal(
      await count(db.client, `select count(*) from access_audit where note = $1 and (actor_id is not null or actor_name <> 'System')`, [AUDIT_NOTE]),
      0,
    );
  });

  it('a second run changes nothing, writes no audit rows and leaves access_version alone', async () => {
    const auditBefore = await auditCount();
    const version = await accessVersion(db.client);
    const result = await resyncAccessMapping(db.client, { apply: true });
    assert.deepEqual(result.changes, []);
    assert.equal(result.auditRows, 0);
    assert.equal(await auditCount(), auditBefore);
    assert.equal(await accessVersion(db.client), version);
  });

  it('re-syncs a planted change both ways, and never touches a role that is not a seed role', async () => {
    // Planted: Rekha becomes a complaints admin; a stray Budget staff
    // holder; a stray row on Budget staff; an ordinary role with a holder.
    await db.client.query(`update user_module_access set role = 'admin' where user_id = $1 and module = 'complaints'`, [U.raiser]);
    await db.client.query('insert into user_roles (user_id, role_id) values ($1, $2)', [U.ceo, R.budget_staff]);
    await db.client.query(`insert into role_permissions values ($1, 'budget.projects.delete', 'all'), ($1, 'retired.key.view', 'own')`, [R.budget_staff]);
    await db.client.query(`insert into roles (id, name) values ('00000000-0000-4000-8000-0000000000aa', '+ Tester')`);
    await db.client.query(`insert into role_permissions values ('00000000-0000-4000-8000-0000000000aa', 'budget.projects.view', 'own')`);
    await db.client.query(`insert into user_roles (user_id, role_id) values ($1, '00000000-0000-4000-8000-0000000000aa')`, [U.hod]);

    const result = await resyncAccessMapping(db.client, { apply: true });
    const texts = result.changes.map((c) => c.text);
    assert.ok(texts.includes('give "Complaints administrator" to Rekha Raiser'), texts.join('\n'));
    assert.ok(texts.includes('take "Complaints member" from Rekha Raiser'), texts.join('\n'));
    assert.ok(texts.includes('take "Budget staff" from Chandra Ceo'), texts.join('\n'));
    assert.ok(texts.some((t) => t.includes('remove budget.projects.delete (all)') && t.includes('remove retired.key.view (own)')));
    assert.equal(result.changes.length, 4);

    assert.ok((await holders(R.complaints_admin)).includes(U.raiser));
    assert.ok(!(await holders(R.complaints_member)).includes(U.raiser));
    assert.ok(!(await holders(R.budget_staff)).includes(U.ceo));
    assert.equal(await count(db.client, `select count(*) from role_permissions where role_id = '00000000-0000-4000-8000-0000000000aa'`), 1);
    assert.equal(await count(db.client, `select count(*) from user_roles where role_id = '00000000-0000-4000-8000-0000000000aa'`), 1);

    const audit = (
      await db.client.query<{ action: string; target_name: string; role_name: string; before: unknown; after: unknown }>(
        `select action, target_name, role_name, before, after from access_audit
          where target_id = $1 and note = $2 order by id desc limit 2`,
        [U.raiser, AUDIT_NOTE],
      )
    ).rows;
    assert.deepEqual(audit.map((a) => a.action).sort(), ['user.role_added', 'user.role_removed']);
    assert.ok(audit.every((a) => a.target_name === 'Rekha Raiser' && a.before && a.after));

    const again = await resyncAccessMapping(db.client, { apply: true });
    assert.deepEqual(again.changes, []);
  });

  it('re-creates a deleted seed role under its fixed id and never renames one back', async () => {
    await db.client.query(`update roles set name = 'Office staff' where id = $1`, [R.budget_staff]);
    await db.client.query('delete from user_roles where role_id = $1', [R.complaints_member]);
    await db.client.query('delete from roles where id = $1', [R.complaints_member]);

    const result = await resyncAccessMapping(db.client, { apply: true });
    assert.equal(result.changes[0]?.kind, 'role.created');
    const { rows } = await db.client.query<{ id: string; name: string }>(
      'select id, name from roles where id = any($1::uuid[]) order by id',
      [[R.budget_staff, R.complaints_member]],
    );
    assert.deepEqual(rows.map((r) => r.name), ['Office staff', 'Complaints member']);
    assert.equal((await holders(R.complaints_member)).length, 7);
    assert.deepEqual((await resyncAccessMapping(db.client, { apply: true })).changes, []);
  });

  it('reports people set inactive', async () => {
    await db.client.query('update users set active = false where id = $1', [U.no_login]);
    const result = await resyncAccessMapping(db.client);
    assert.deepEqual(result.report.inactive.map((p) => p.id), [U.no_login]);
    assert.deepEqual(result.changes, []);
  });
});
