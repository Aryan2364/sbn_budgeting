import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { SKIP_REASON, accessVersion, count, dbTestsEnabled, openScratchDatabase, prng, type ScratchDb } from './support';

/**
 * The schema's moving parts (plan P1 "done when"):
 * - reporting_closure equals the chain walked by hand, for every user,
 *   after random reports_to edits, inserts, deletes and active toggles;
 * - a reports_to cycle cannot hang the rebuild;
 * - the scope helper functions;
 * - access_version rises on a role_permissions edit and not on a
 *   user_roles edit; the Admin role cannot be given rows.
 */

const id = (n: number): string => `c1000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

describe('reporting closure and scope functions', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;

  /** The closure, computed in JS by walking reports_to up from each person. */
  async function expectedClosure(): Promise<string[]> {
    const { rows } = await db.client.query<{ id: string; reports_to: string | null }>('select id, reports_to from users');
    const up = new Map(rows.map((r) => [r.id, r.reports_to]));
    const out: string[] = [];
    for (const r of rows) {
      let depth = 0;
      let at: string | null = r.id;
      const seen = new Set<string>();
      while (at && !seen.has(at) && depth <= 50) {
        seen.add(at);
        out.push(`${at}>${r.id}@${depth}`);
        at = up.get(at) ?? null;
        depth += 1;
      }
    }
    return out.sort();
  }

  async function actualClosure(): Promise<string[]> {
    const { rows } = await db.client.query<{ k: string }>(
      `select ancestor_id || '>' || descendant_id || '@' || depth as k from reporting_closure order by 1`,
    );
    return rows.map((r) => r.k).sort();
  }

  before(async () => {
    db = await openScratchDatabase('closure');
  });

  after(async () => {
    await db?.close();
  });

  it('matches the hand-walked chain after random edits', async () => {
    const random = prng(20261003);
    const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!;
    const people: number[] = [];

    // 40 people, each reporting to someone created before them (acyclic).
    for (let n = 1; n <= 40; n += 1) {
      const boss = people.length && random() < 0.85 ? id(pick(people)) : null;
      await db.client.query('insert into users (id, name, reports_to) values ($1, $2, $3)', [id(n), `Person ${n}`, boss]);
      people.push(n);
    }
    assert.deepEqual(await actualClosure(), await expectedClosure());

    for (let step = 0; step < 60; step += 1) {
      const roll = random();
      if (roll < 0.6) {
        const n = pick(people);
        const earlier = people.filter((m) => m < n);
        const boss = earlier.length && random() < 0.8 ? id(pick(earlier)) : null;
        await db.client.query('update users set reports_to = $2 where id = $1', [id(n), boss]);
      } else if (roll < 0.75) {
        await db.client.query('update users set active = not active where id = $1', [id(pick(people))]);
      } else if (roll < 0.9) {
        const n = 100 + step;
        await db.client.query('insert into users (id, name, reports_to) values ($1, $2, $3)', [id(n), `New ${n}`, id(pick(people))]);
        people.push(n);
      } else {
        // Delete someone nobody reports to.
        const { rows } = await db.client.query<{ id: string }>(
          `select u.id from users u where u.id::text like 'c1000000-%'
             and not exists (select 1 from users x where x.reports_to = u.id) order by u.id`,
        );
        const victim = pick(rows).id;
        await db.client.query('delete from users where id = $1', [victim]);
        people.splice(people.findIndex((m) => id(m) === victim), 1);
      }
      assert.deepEqual(await actualClosure(), await expectedClosure(), `after step ${step}`);
    }
  });

  it('inactive people stay in the chain, and everyone is in their own team at depth 0', async () => {
    await db.client.query('update users set active = false where id = $1', [id(1)]);
    assert.equal(await count(db.client, 'select count(*) from users u where not exists (select 1 from reporting_closure c where c.ancestor_id = u.id and c.descendant_id = u.id and c.depth = 0)'), 0);
    assert.equal(await count(db.client, 'select count(*) from reporting_closure where ancestor_id = $1 and depth = 0', [id(1)]), 1);
  });

  it('a reports_to cycle does not hang the rebuild', async () => {
    await db.client.query(
      `insert into users (id, name) values ($1, 'Cycle A'), ($2, 'Cycle B'), ($3, 'Cycle C')`,
      [id(901), id(902), id(903)],
    );
    await db.client.query(
      `update users set reports_to = case id when $1::uuid then $2::uuid when $2::uuid then $3::uuid else $1::uuid end
        where id in ($1, $2, $3)`,
      [id(901), id(902), id(903)],
    );
    assert.deepEqual(await actualClosure(), await expectedClosure());
    assert.equal(await count(db.client, 'select count(*) from reporting_closure where ancestor_id = $1', [id(901)]), 3);
  });

  it('scope functions: my sites are ticked plus led; team sites are led by my team', async () => {
    await db.client.query(`insert into users (id, name) values ($1, 'Boss'), ($2, 'Lead')`, [id(801), id(802)]);
    await db.client.query('update users set reports_to = $1 where id = $2', [id(801), id(802)]);
    await db.client.query(
      `insert into projects (id, donor_name, name, planned_trees) values ($1, 'D', 'P', 10)`,
      [id(700)],
    );
    await db.client.query(
      `insert into sites (id, project_id, name, planned_trees, plantation_start_date, manager_id, supervisor_id) values
         ($1, $4, 'Led by lead', 1, '2025-01-01', null, $5),
         ($2, $4, 'Ticked on boss', 1, '2025-01-01', null, null),
         ($3, $4, 'Nobody', 1, '2025-01-01', null, null)`,
      [id(701), id(702), id(703), id(700), id(802)],
    );
    await db.client.query('insert into user_units (user_id, unit_id) values ($1, $2)', [id(801), id(702)]);

    const ids = async (fn: string, me: string): Promise<string[]> =>
      (await db.client.query<{ x: string }>(`select x from ${fn}($1) as x order by x`, [me])).rows.map((r) => r.x);
    assert.deepEqual(await ids('access_my_unit_ids', id(801)), [id(702)]);
    assert.deepEqual(await ids('access_my_unit_ids', id(802)), [id(701)]);
    assert.deepEqual(await ids('access_team_unit_ids', id(801)), [id(701)], 'ticks are personal, team is led sites');
    assert.deepEqual(await ids('access_team_user_ids', id(801)), [id(801), id(802)].sort());
  });
});

describe('access_version and the Admin role', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;

  before(async () => {
    db = await openScratchDatabase('version');
  });

  after(async () => {
    await db?.close();
  });

  it('rises on a role_permissions edit and a role edit, not on assignments', async () => {
    const start = BigInt(await accessVersion(db.client));
    await db.client.query(`insert into users (id, name) values ($1, 'Holder')`, [id(1)]);
    await db.client.query('insert into user_roles (user_id, role_id) values ($1, $2)', [id(1), SEED_ROLE_IDS.budget_staff]);
    await db.client.query('update users set reports_to = null, active = false where id = $1', [id(1)]);
    assert.equal(BigInt(await accessVersion(db.client)), start, 'user_roles, active and reports_to never bump it');

    await db.client.query(`insert into role_permissions values ($1, 'budget.projects.view', 'all')`, [SEED_ROLE_IDS.budget_staff]);
    assert.equal(BigInt(await accessVersion(db.client)), start + 1n);
    await db.client.query(`update roles set description = 'x' where id = $1`, [SEED_ROLE_IDS.budget_staff]);
    assert.equal(BigInt(await accessVersion(db.client)), start + 2n);
  });

  it('refuses permission rows on the Admin role', async () => {
    await assert.rejects(
      db.client.query(`insert into role_permissions values ($1, 'budget.projects.view', 'all')`, [SEED_ROLE_IDS.admin]),
      /Admin role holds every permission automatically/,
    );
  });

  it('refuses a role with holders being deleted, and a stored scope outside the four', async () => {
    await assert.rejects(db.client.query('delete from roles where id = $1', [SEED_ROLE_IDS.budget_staff]), /foreign key/);
    await assert.rejects(
      db.client.query(`insert into role_permissions values ($1, 'budget.projects.view', 'selected_sites')`, [SEED_ROLE_IDS.budget_staff]),
      /invalid input value for enum/,
    );
  });
});
