import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { Pool } from 'pg';

import type { AccessContext } from '../../src/access/access-context';
import type { PermissionKey, RecordType, Scope } from '../../src/access/catalogue';
import { assertRecordAccess, createSiteWhere, recordReason, scopeWhere, type Param } from '../../src/access/scope';
import { runListQuery, type ListSpec } from '../../src/common/list-query';
import { runPickQuery } from '../../src/pick/pick-query';
import { QueryGuardError, checkStatement, installQueryGuard } from '../support/query-guard';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P3a "Done when": table-driven tests on a fixture graph
 * return the exact expected id sets for each record type x scope,
 * including O4 (led sites under Team and Selected sites), O5 (the
 * create rules), a legacy complaint with no site, and a null-creator
 * expense. Plus the one-record check, runListQuery's scope, `can`,
 * totals and see-amounts refusals, the Pick query and the query guard.
 *
 * The graph (every id fixed):
 *
 *   ceo
 *    └ hod
 *       ├ mgrA ─ supA        team A
 *       └ mgrB ─ supB        team B
 *   office, outsider          report to nobody
 *
 *   S1  manager mgrA, supervisor supA, project P1
 *   S2  manager mgrB, supervisor supB, project P1
 *   S3  nobody,                      project P2   ticked for office
 *   S4  nobody, created_by mgrA,     no project
 *   S5  nobody,                      project P4
 *   ticks (user_units): office -> S3; supA -> S2
 *   P3  no sites, created_by office
 *
 *   E1 S1 by supA · E2 S2 by supB · E3 S3 by office
 *   E4 S1 by NOBODY (legacy null creator) · E5 S5 by mgrA
 *
 *   K1 S1   raised outsider; supA, mgrA, hod, ceo
 *   K2 S2   raised office;   supB, mgrB, hod, ceo
 *   K3 —    LEGACY, no site; raised supB; supB, mgrB
 *   K4 S3   raised outsider; supervisor outsider
 *   K5 S5   raised supA;     supervisor outsider
 *
 *   budgets on S1, S2, S3, S5
 */

const id = (head: string, n: number): string => `${head}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const USERS = {
  ceo: id('a1000000', 1),
  hod: id('a1000000', 2),
  mgrA: id('a1000000', 3),
  supA: id('a1000000', 4),
  mgrB: id('a1000000', 5),
  supB: id('a1000000', 6),
  office: id('a1000000', 7),
  outsider: id('a1000000', 8),
} as const;
type UserName = keyof typeof USERS;

const SITES = { S1: id('e1000000', 1), S2: id('e1000000', 2), S3: id('e1000000', 3), S4: id('e1000000', 4), S5: id('e1000000', 5) };
const PROJECTS = { P1: id('d1000000', 1), P2: id('d1000000', 2), P3: id('d1000000', 3), P4: id('d1000000', 4) };
const EXPENSES = { E1: id('11000000', 1), E2: id('11000000', 2), E3: id('11000000', 3), E4: id('11000000', 4), E5: id('11000000', 5) };
const COMPLAINTS = { K1: id('31000000', 1), K2: id('31000000', 2), K3: id('31000000', 3), K4: id('31000000', 4), K5: id('31000000', 5) };
const LOCATION = id('c1000000', 1);
const COST_HEAD = id('f1000000', 1);
const CATEGORY = id('21000000', 1);

/** id -> its fixture label, for readable assertions. */
const LABEL: Record<string, string> = Object.fromEntries(
  [USERS, SITES, PROJECTS, EXPENSES, COMPLAINTS].flatMap((group) => Object.entries(group).map(([k, v]) => [v, k])),
);
const labels = (ids: string[]): string[] => ids.map((i) => LABEL[i] ?? i).sort();

const EXPENSE_AMOUNT: Record<keyof typeof EXPENSES, number> = { E1: 1000, E2: 2000, E3: 3000, E4: 400, E5: 500 };

async function seedGraph(db: ScratchDb['client']): Promise<void> {
  await db.query('begin');
  const people: Array<[UserName, UserName | null]> = [
    ['ceo', null], ['hod', 'ceo'], ['mgrA', 'hod'], ['supA', 'mgrA'], ['mgrB', 'hod'], ['supB', 'mgrB'],
    ['office', null], ['outsider', null],
  ];
  for (const [name] of people) {
    await db.query('insert into users (id, name, can_login) values ($1, $2, false)', [USERS[name], name]);
  }
  for (const [name, boss] of people) {
    if (boss) await db.query('update users set reports_to = $2 where id = $1', [USERS[name], USERS[boss]]);
  }
  await db.query(`insert into locations (id, name) values ($1, 'Scope location')`, [LOCATION]);
  await db.query(
    `insert into projects (id, donor_name, name, planned_trees, created_by) values
       ($1, 'D', 'P1', 10, null), ($2, 'D', 'P2', 10, null), ($3, 'D', 'P3', 10, $5), ($4, 'D', 'P4', 10, null)`,
    [PROJECTS.P1, PROJECTS.P2, PROJECTS.P3, PROJECTS.P4, USERS.office],
  );
  const site = async (key: keyof typeof SITES, project: string | null, manager: string | null, supervisor: string | null, createdBy: string | null): Promise<void> => {
    await db.query(
      `insert into sites (id, project_id, name, planned_trees, plantation_start_date, manager_id, supervisor_id, created_by)
       values ($1, $2, $3, 10, '2025-01-01', $4, $5, $6)`,
      [SITES[key], project, key, manager, supervisor, createdBy],
    );
  };
  await site('S1', PROJECTS.P1, USERS.mgrA, USERS.supA, null);
  await site('S2', PROJECTS.P1, USERS.mgrB, USERS.supB, null);
  await site('S3', PROJECTS.P2, null, null, null);
  await site('S4', null, null, null, USERS.mgrA);
  await site('S5', PROJECTS.P4, null, null, null);
  await db.query('insert into user_units (user_id, unit_id) values ($1, $2), ($3, $4)', [
    USERS.office, SITES.S3, USERS.supA, SITES.S2,
  ]);

  await db.query(`insert into cost_heads (id, name, sort_order, is_active) values ($1, 'Scope head', 1, true)`, [COST_HEAD]);
  for (const s of ['S1', 'S2', 'S3', 'S5'] as const) {
    await db.query('insert into site_budgets (site_id, cost_head_id, period, per_tree_paise) values ($1, $2, 0, 100)', [
      SITES[s], COST_HEAD,
    ]);
  }
  const expense = async (key: keyof typeof EXPENSES, s: keyof typeof SITES, by: string | null): Promise<void> => {
    await db.query(
      `insert into expenses (id, site_id, cost_head_id, spent_on, period, amount_paise, description, created_by, created_at)
       values ($1, $2, $3, '2025-04-01', 0, $4, $5, $6, $7)`,
      [EXPENSES[key], SITES[s], COST_HEAD, EXPENSE_AMOUNT[key], `expense ${key}`, by,
       `2025-04-0${Object.keys(EXPENSES).indexOf(key) + 1}T00:00:00Z`],
    );
  };
  await expense('E1', 'S1', USERS.supA);
  await expense('E2', 'S2', USERS.supB);
  await expense('E3', 'S3', USERS.office);
  await expense('E4', 'S1', null);
  await expense('E5', 'S5', USERS.mgrA);

  await db.query(
    `insert into complaint_categories (id, name, sort_order, is_active, requires_approval) values ($1, 'Scope', 1, true, false)`,
    [CATEGORY],
  );
  const complaint = async (
    key: keyof typeof COMPLAINTS,
    n: number,
    s: keyof typeof SITES | null,
    raisedBy: string,
    people: [string, string | null, string | null, string | null],
  ): Promise<void> => {
    await db.query(
      `insert into complaints (id, number, site_id, location_id, category_id, complainant_name, complainant_phone,
         description, status, requires_approval, raised_by, supervisor_id, manager_id, hod_id, ceo_id, approver_id)
       values ($1, $2, $3, $4, $5, 'C', '9825012345', $6, 'open', false, $7, $8, $9, $10, $11, null)`,
      [COMPLAINTS[key], 900 + n, s ? SITES[s] : null, s ? null : LOCATION, CATEGORY, `complaint ${key}`, raisedBy, ...people],
    );
  };
  await complaint('K1', 1, 'S1', USERS.outsider, [USERS.supA, USERS.mgrA, USERS.hod, USERS.ceo]);
  await complaint('K2', 2, 'S2', USERS.office, [USERS.supB, USERS.mgrB, USERS.hod, USERS.ceo]);
  await complaint('K3', 3, null, USERS.supB, [USERS.supB, USERS.mgrB, null, null]);
  await complaint('K4', 4, 'S3', USERS.outsider, [USERS.outsider, null, null, null]);
  await complaint('K5', 5, 'S5', USERS.supA, [USERS.outsider, null, null, null]);
  await db.query('commit');
}

/** An access context holding exactly these keys at these scopes. */
function ctxOf(user: UserName, grants: Array<[PermissionKey, Scope]>): AccessContext {
  const perms = new Map<PermissionKey, Set<Scope>>();
  for (const [key, scope] of grants) {
    if (!perms.has(key)) perms.set(key, new Set());
    perms.get(key)!.add(scope);
  }
  return { userId: USERS[user], roleIds: [], version: 1, perms };
}

interface RecordCase {
  record: RecordType;
  key: PermissionKey;
  /** select <alias>.id ... from <from>, scoped over <alias>. */
  from: string;
  alias: string;
  idSql: string;
  all: string[];
}

const CASES = {
  site: { record: 'site', key: 'budget.sites.view', from: 'sites s', alias: 's', idSql: 's.id', all: ['S1', 'S2', 'S3', 'S4', 'S5'] },
  project: { record: 'project', key: 'budget.projects.view', from: 'projects p', alias: 'p', idSql: 'p.id', all: ['P1', 'P2', 'P3', 'P4'] },
  // Budgets are rows per site; the id set is the sites they belong to.
  site_budget: { record: 'site_budget', key: 'budget.budgets.view', from: 'site_budgets sb', alias: 'sb', idSql: 'sb.site_id', all: ['S1', 'S2', 'S3', 'S5'] },
  variance: { record: 'variance', key: 'budget.reports.view', from: 'variance v', alias: 'v', idSql: 'v.site_id', all: ['S1', 'S2', 'S3', 'S4', 'S5'] },
  expense: { record: 'expense', key: 'budget.expenses.view', from: 'expenses e', alias: 'e', idSql: 'e.id', all: ['E1', 'E2', 'E3', 'E4', 'E5'] },
  complaint: { record: 'complaint', key: 'complaints.complaints.view', from: 'complaints c', alias: 'c', idSql: 'c.id', all: ['K1', 'K2', 'K3', 'K4', 'K5'] },
  // Reassign's Own is "I am the manager or HOD" (ownColumns, O6).
  reassign: { record: 'complaint', key: 'complaints.complaints.reassign', from: 'complaints c', alias: 'c', idSql: 'c.id', all: ['K1', 'K2', 'K3', 'K4', 'K5'] },
  person: { record: 'person', key: 'platform.people.view', from: 'users u', alias: 'u', idSql: 'u.id', all: Object.keys(USERS) },
} satisfies Record<string, RecordCase>;
type CaseName = keyof typeof CASES;

type Expected = Record<'own' | 'team' | 'units', Partial<Record<UserName, string[]>>>;

/** The exact id sets, per record type x scope x person (worked by hand from the graph above). */
const EXPECTED: Record<CaseName, Expected> = {
  site: {
    own: { supA: ['S1'], mgrA: ['S1', 'S4'], hod: [], office: [], outsider: [], mgrB: ['S2'] },
    // O4: Team includes the sites I lead (supA: S1).
    team: { supA: ['S1'], mgrA: ['S1', 'S4'], hod: ['S1', 'S2', 'S4'], office: [], outsider: [], mgrB: ['S2'] },
    // O4: Selected sites includes the sites I lead (supA ticked only S2, leads S1).
    units: { supA: ['S1', 'S2'], mgrA: ['S1', 'S4'], hod: [], office: ['S3'], outsider: [], mgrB: ['S2'] },
  },
  project: {
    own: { supA: ['P1'], mgrA: ['P1'], hod: [], office: ['P3'], outsider: [], mgrB: ['P1'] },
    team: { supA: ['P1'], mgrA: ['P1'], hod: ['P1'], office: ['P3'], outsider: [], mgrB: ['P1'] },
    units: { supA: ['P1'], mgrA: ['P1'], hod: [], office: ['P2', 'P3'], outsider: [], mgrB: ['P1'] },
  },
  site_budget: {
    own: { supA: ['S1'], mgrA: ['S1'], hod: [], office: [], outsider: [], mgrB: ['S2'] },
    team: { supA: ['S1'], mgrA: ['S1'], hod: ['S1', 'S2'], office: [], outsider: [], mgrB: ['S2'] },
    units: { supA: ['S1', 'S2'], mgrA: ['S1'], hod: [], office: ['S3'], outsider: [], mgrB: ['S2'] },
  },
  variance: {
    own: { supA: ['S1'], mgrA: ['S1', 'S4'], hod: [], office: [], outsider: [], mgrB: ['S2'] },
    team: { supA: ['S1'], mgrA: ['S1', 'S4'], hod: ['S1', 'S2', 'S4'], office: [], outsider: [], mgrB: ['S2'] },
    units: { supA: ['S1', 'S2'], mgrA: ['S1', 'S4'], hod: [], office: ['S3'], outsider: [], mgrB: ['S2'] },
  },
  expense: {
    // E4 has no creator: it is nobody's Own, and reached only through its site.
    own: { supA: ['E1'], mgrA: ['E5'], hod: [], office: ['E3'], outsider: [], mgrB: [] },
    team: { supA: ['E1', 'E4'], mgrA: ['E1', 'E4', 'E5'], hod: ['E1', 'E2', 'E4', 'E5'], office: ['E3'], outsider: [], mgrB: ['E2'] },
    units: { supA: ['E1', 'E2', 'E4'], mgrA: ['E1', 'E4', 'E5'], hod: [], office: ['E3'], outsider: [], mgrB: ['E2'] },
  },
  complaint: {
    own: { supA: ['K1', 'K5'], mgrA: ['K1'], hod: ['K1', 'K2'], office: ['K2'], outsider: ['K1', 'K4', 'K5'], mgrB: ['K2', 'K3'] },
    // K3 has no site: Team reaches it only through its people (supB, mgrB are in hod's team).
    team: { supA: ['K1', 'K5'], mgrA: ['K1', 'K5'], hod: ['K1', 'K2', 'K3', 'K5'], office: ['K2'], outsider: ['K1', 'K4', 'K5'], mgrB: ['K2', 'K3'] },
    // Site-less K3 is reached by Selected sites only through Own (O10 Q9): supA ticks S2 but never sees K3.
    units: { supA: ['K1', 'K2', 'K5'], mgrA: ['K1'], hod: ['K1', 'K2'], office: ['K2', 'K4'], outsider: ['K1', 'K4', 'K5'], mgrB: ['K2', 'K3'] },
  },
  reassign: {
    own: { supA: [], mgrA: ['K1'], hod: ['K1', 'K2'], office: [], outsider: [], mgrB: ['K2', 'K3'] },
    team: { supA: ['K1', 'K5'], mgrA: ['K1', 'K5'], hod: ['K1', 'K2', 'K3', 'K5'], office: ['K2'], outsider: ['K1', 'K4', 'K5'], mgrB: ['K2', 'K3'] },
    units: { supA: ['K1', 'K2'], mgrA: ['K1'], hod: ['K1', 'K2'], office: ['K4'], outsider: [], mgrB: ['K2', 'K3'] },
  },
  person: {
    own: { supA: ['supA'], mgrA: ['mgrA'], hod: ['hod'], office: ['office'], outsider: ['outsider'], mgrB: ['mgrB'] },
    team: {
      supA: ['supA'], mgrA: ['mgrA', 'supA'], hod: ['hod', 'mgrA', 'mgrB', 'supA', 'supB'],
      office: ['office'], outsider: ['outsider'], mgrB: ['mgrB', 'supB'],
    },
    // The people who lead my selected or led sites.
    units: {
      supA: ['mgrA', 'mgrB', 'supA', 'supB'], mgrA: ['mgrA', 'supA'], hod: ['hod'],
      office: ['office'], outsider: ['outsider'], mgrB: ['mgrB', 'supB'],
    },
  },
};

describe('scope filter: fixture graph (P3a)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let pool: Pool;

  before(async () => {
    db = await openScratchDatabase('p3a_scope');
    await seedGraph(db.client);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    pool = new Pool({ connectionString: url.toString(), max: 2 });
    // Every statement these tests send through the pool must carry a marker.
    installQueryGuard(pool, 'throw');
  });

  after(async () => {
    await pool?.end();
    await db?.close();
  });

  async function idsWhere(c: RecordCase, ctx: AccessContext): Promise<string[]> {
    const values: unknown[] = [];
    const param: Param = (v) => {
      values.push(v);
      return `$${values.length}`;
    };
    const where = scopeWhere(ctx, c.key, c.record, c.alias, param);
    const { rows } = await pool.query<{ id: string }>(`select distinct ${c.idSql} as id from ${c.from} where ${where}`, values);
    return labels(rows.map((r) => r.id));
  }

  for (const [name, c] of Object.entries(CASES) as Array<[CaseName, RecordCase]>) {
    for (const scope of ['own', 'team', 'units'] as const) {
      it(`${name} at ${scope}: exact id sets`, async () => {
        for (const [user, expected] of Object.entries(EXPECTED[name][scope])) {
          const got = await idsWhere(c, ctxOf(user as UserName, [[c.key, scope]]));
          assert.deepEqual(got, [...expected].sort(), `${name} ${scope} for ${user}`);
        }
      });
    }

    it(`${name} at all: everything, for anyone; not held: nothing`, async () => {
      for (const user of ['outsider', 'supA'] as const) {
        assert.deepEqual(await idsWhere(c, ctxOf(user, [[c.key, 'all']])), [...c.all].sort());
        assert.deepEqual(await idsWhere(c, ctxOf(user, [])), []);
      }
    });
  }

  it('scopes combine as a union; All short-circuits (plan 3.4.3)', async () => {
    assert.deepEqual(await idsWhere(CASES.site, ctxOf('supA', [['budget.sites.view', 'team'], ['budget.sites.view', 'units']])), ['S1', 'S2']);
    assert.deepEqual(await idsWhere(CASES.expense, ctxOf('office', [['budget.expenses.view', 'own'], ['budget.expenses.view', 'team']])), ['E3']);
    assert.deepEqual(
      await idsWhere(CASES.expense, ctxOf('office', [['budget.expenses.view', 'own'], ['budget.expenses.view', 'all']])),
      ['E1', 'E2', 'E3', 'E4', 'E5'],
    );
  });

  it('the predicate carries its marker and takes the user id as a parameter, never inline', () => {
    const values: unknown[] = [];
    const sql = scopeWhere(ctxOf('supA', [['budget.expenses.view', 'team']]), 'budget.expenses.view', 'expense', 'e', (v) => {
      values.push(v);
      return `$${values.length}`;
    });
    assert.match(sql, /^\(\/\*scope:budget\.expenses\.view\*\/ /);
    assert.ok(!sql.includes(USERS.supA), 'the user id is not in the SQL text');
    assert.deepEqual(values, [USERS.supA]);
    assert.match(scopeWhere(ctxOf('supA', []), 'budget.expenses.view', 'expense', 'e', () => '$1'), /\*\/ false\)$/);
  });

  // ----- O5: creates and writes that set a site ----------------------

  async function creatableSites(ctx: AccessContext, key: PermissionKey): Promise<string[]> {
    const values: unknown[] = [];
    const param: Param = (v) => {
      values.push(v);
      return `$${values.length}`;
    };
    const { rows } = await pool.query<{ id: string }>(
      `select s.id from sites s where ${createSiteWhere(ctx, key, 's.id', param)}`,
      values,
    );
    return labels(rows.map((r) => r.id));
  }

  it('O5: Own creates only on sites I lead, never on one I merely created', async () => {
    const key = 'budget.expenses.create';
    assert.deepEqual(await creatableSites(ctxOf('supA', [[key, 'own']]), key), ['S1']);
    // mgrA created S4 but does not lead it.
    assert.deepEqual(await creatableSites(ctxOf('mgrA', [[key, 'own']]), key), ['S1']);
    assert.deepEqual(await creatableSites(ctxOf('office', [[key, 'own']]), key), []);
  });

  it('O5: Team creates on the team\'s sites, Selected sites on ticked or led sites, All anywhere', async () => {
    const key = 'budget.expenses.create';
    assert.deepEqual(await creatableSites(ctxOf('hod', [[key, 'team']]), key), ['S1', 'S2']);
    assert.deepEqual(await creatableSites(ctxOf('supA', [[key, 'team']]), key), ['S1']);
    assert.deepEqual(await creatableSites(ctxOf('supA', [[key, 'units']]), key), ['S1', 'S2']);
    assert.deepEqual(await creatableSites(ctxOf('office', [[key, 'units']]), key), ['S3']);
    assert.deepEqual(await creatableSites(ctxOf('hod', [[key, 'units']]), key), []);
    assert.deepEqual(await creatableSites(ctxOf('outsider', [[key, 'all']]), key), ['S1', 'S2', 'S3', 'S4', 'S5']);
    assert.deepEqual(await creatableSites(ctxOf('supA', []), key), []);
  });

  it('O5 exception: raise checks the site against the sites Pick it needs at All, so any site', async () => {
    const raise = 'complaints.complaints.raise';
    // A complaints member: raise at Own, and the derived budget.sites.pick at All.
    assert.deepEqual(
      await creatableSites(ctxOf('outsider', [[raise, 'own'], ['budget.sites.pick', 'all']]), raise),
      ['S1', 'S2', 'S3', 'S4', 'S5'],
    );
    // Without the Pick there is nowhere to raise; without raise, nothing.
    assert.deepEqual(await creatableSites(ctxOf('outsider', [[raise, 'own']]), raise), []);
    assert.deepEqual(await creatableSites(ctxOf('outsider', [['budget.sites.pick', 'all']]), raise), []);
  });

  // ----- the one-record check (plan 6.1.4 steps 3 and 4) -------------

  const NOT_FOUND = "That expense doesn't exist.";
  const expenseCheck = (recordId: string, forUpdate = false) => ({
    table: 'expenses',
    alias: 'e',
    record: 'expense' as const,
    id: recordId,
    view: 'budget.expenses.view' as const,
    action: 'budget.expenses.edit' as const,
    notFound: NOT_FOUND,
    forUpdate,
  });

  it('one record: visible and allowed passes; visible but not allowed is 403 with the reason; out of scope is 404', async () => {
    const supA = ctxOf('supA', [['budget.expenses.view', 'team'], ['budget.expenses.edit', 'own']]);
    await assertRecordAccess(pool, supA, expenseCheck(EXPENSES.E1));

    // E4 is on supA's site (visible through Team) but nobody created it (edit at Own).
    await assert.rejects(assertRecordAccess(pool, supA, expenseCheck(EXPENSES.E4)), (e: unknown) => {
      const err = e as { getStatus(): number; getResponse(): Record<string, string> };
      assert.equal(err.getStatus(), 403);
      assert.equal(err.getResponse().error, 'forbidden');
      assert.equal(err.getResponse().permission, 'budget.expenses.edit');
      assert.equal(err.getResponse().reason, 'You can edit expenses only if you added them.');
      return true;
    });

    for (const missing of [EXPENSES.E2, id('11000000', 99), 'not-a-uuid']) {
      await assert.rejects(assertRecordAccess(pool, supA, expenseCheck(missing)), (e: unknown) => {
        const err = e as { getStatus(): number; message: string };
        assert.equal(err.getStatus(), 404);
        assert.equal(err.message, NOT_FOUND);
        return true;
      });
    }
  });

  it('one record: runs inside the write transaction, locking the row', async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await assertRecordAccess(client, ctxOf('supA', [['budget.expenses.view', 'own'], ['budget.expenses.edit', 'own']]), expenseCheck(EXPENSES.E1, true));
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('one record: reassign at Own reaches only the manager or HOD (O6), with its own reason', async () => {
    const check = {
      table: 'complaints',
      alias: 'c',
      record: 'complaint' as const,
      id: COMPLAINTS.K1,
      view: 'complaints.complaints.view' as const,
      action: 'complaints.complaints.reassign' as const,
      notFound: 'No such complaint.',
    };
    const grants: Array<[PermissionKey, Scope]> = [['complaints.complaints.view', 'own'], ['complaints.complaints.reassign', 'own']];
    await assertRecordAccess(pool, ctxOf('mgrA', grants), check);
    await assert.rejects(assertRecordAccess(pool, ctxOf('supA', grants), check), (e: unknown) => {
      const err = e as { getStatus(): number; getResponse(): Record<string, string> };
      assert.equal(err.getStatus(), 403);
      assert.equal(err.getResponse().reason, 'You can reassign complaints only if you are their manager or HOD.');
      return true;
    });
  });

  it('the record-level reason names the reach held, never a role (plan 6.1.10)', () => {
    const key = 'budget.expenses.edit';
    assert.equal(recordReason(ctxOf('supA', [[key, 'team']]), key, 'expense'), 'You can edit expenses only for your team and the sites it runs.');
    assert.equal(
      recordReason(ctxOf('supA', [[key, 'units']]), key, 'expense'),
      'You can edit expenses only on your selected sites and the sites you lead.',
    );
    assert.equal(
      recordReason(ctxOf('supA', [[key, 'own'], [key, 'units']]), key, 'expense'),
      'You can edit expenses only if you added them, or on your selected sites and the sites you lead.',
    );
  });

  // ----- runListQuery: scope, can, totals, see amounts -----------------

  const expenseList = (extra: Partial<ListSpec> = {}): ListSpec => ({
    scope: { key: 'budget.expenses.view', record: 'expense', alias: 'e' },
    from: 'expenses e',
    select: 'e.id, e.amount_paise as "amountPaise"',
    titleField: { sql: 'e.description', label: 'Description' },
    searchFields: [{ sql: 'e.amount_paise::text', label: 'Amount', key: 'amount' }],
    sortable: { createdAt: 'e.created_at', amount: 'e.amount_paise' },
    defaultSort: { key: 'createdAt', direction: 'asc' },
    filters: { minAmount: (v, param) => `e.amount_paise >= ${param(Number(v))}` },
    aggregates: { totalPaise: 'sum(e.amount_paise)' },
    can: { edit: 'budget.expenses.edit', delete: 'budget.expenses.delete' },
    amountKeys: ['amount', 'minAmount'],
    ...extra,
  });

  it('runListQuery: the page, total and aggregates cover the scoped rows only, each with its can', async () => {
    const supA = ctxOf('supA', [['budget.expenses.view', 'team'], ['budget.expenses.edit', 'own']]);
    const result = await runListQuery<{ id: string; can: Record<string, true | string> }>(pool, expenseList(), {}, supA);
    assert.deepEqual(labels(result.data.map((r) => r.id)), ['E1', 'E4']);
    assert.equal(result.total, 2);
    assert.deepEqual(result.aggregates, { totalPaise: String(EXPENSE_AMOUNT.E1 + EXPENSE_AMOUNT.E4) });
    const byLabel = Object.fromEntries(result.data.map((r) => [LABEL[r.id], r.can]));
    // delete is not held at any scope, so it is absent (kit 8.3).
    assert.deepEqual(byLabel.E1, { edit: true });
    assert.deepEqual(byLabel.E4, { edit: 'You can edit expenses only if you added them.' });

    // Paging past the end still gives the scoped total and aggregates.
    const past = await runListQuery(pool, expenseList(), { page: 9 }, supA);
    assert.deepEqual([past.total, past.aggregates], [2, { totalPaise: '1400' }]);
  });

  it('runListQuery: without see amounts, sorting or filtering by an amount is 403; search skips amount fields', async () => {
    const supA = ctxOf('supA', [['budget.expenses.view', 'all']]);
    for (const params of [{ sort: 'amount' }, { filters: { minAmount: '1' } }]) {
      await assert.rejects(runListQuery(pool, expenseList(), params, supA), (e: unknown) => {
        const err = e as { getStatus(): number; getResponse(): Record<string, string> };
        assert.equal(err.getStatus(), 403);
        assert.equal(err.getResponse().permission, 'budget.amounts.see');
        return true;
      });
    }
    // "2000" is E2's amount: it matches only through the amount field.
    assert.equal((await runListQuery(pool, expenseList(), { search: '2000' }, supA)).total, 0);

    const sees = ctxOf('supA', [['budget.expenses.view', 'all'], ['budget.amounts.see', 'all']]);
    const sorted = await runListQuery<{ id: string }>(pool, expenseList(), { sort: 'amount', direction: 'desc' }, sees);
    assert.deepEqual(sorted.data.map((r) => LABEL[r.id]), ['E3', 'E2', 'E1', 'E5', 'E4']);
    assert.equal((await runListQuery(pool, expenseList(), { search: '2000' }, sees)).total, 1);
  });

  it('runListQuery: a scoped list refuses to run without the caller\'s access; a master list needs none', async () => {
    await assert.rejects(runListQuery(pool, expenseList(), {}), /access context/);
    const master = await runListQuery(
      pool,
      {
        scope: { unscoped: 'master', why: 'test' },
        from: 'cost_heads ch',
        select: 'ch.id',
        titleField: { sql: 'ch.name', label: 'Name' },
        sortable: { name: 'ch.name' },
        defaultSort: { key: 'name', direction: 'asc' },
      },
      {},
    );
    assert.equal(master.total, 1);
  });

  // ----- the Pick query ----------------------------------------------

  it('Pick: declared fields only, scoped by the Pick scopes held, searched, ordered by name', async () => {
    const spec = { section: 'budget.sites' as const, from: 'sites s', alias: 's', select: 's.id, s.name', nameSql: 's.name' };
    const own = await runPickQuery<{ id: string; name: string }>(pool, ctxOf('supA', [['budget.sites.pick', 'units']]), spec);
    assert.deepEqual(own, [{ id: SITES.S1, name: 'S1' }, { id: SITES.S2, name: 'S2' }]);
    const all = await runPickQuery<{ name: string }>(pool, ctxOf('outsider', [['budget.sites.pick', 'all']]), spec, '5');
    assert.deepEqual(all.map((r) => r.name), ['S5']);
    await assert.rejects(runPickQuery(pool, ctxOf('outsider', []), spec), (e: unknown) => {
      assert.equal((e as { getStatus(): number }).getStatus(), 403);
      return true;
    });
  });

  // ----- the query guard ---------------------------------------------

  it('query guard: an unmarked read of a guarded table fails with the SQL; marked and unguarded ones pass', async () => {
    await assert.rejects(pool.query('select id from sites'), QueryGuardError);
    await assert.rejects(pool.query('select u.name from users u where u.id = $1', [USERS.supA]), /users/);
    await assert.rejects(pool.query(`update expenses set description = 'x' where false`), QueryGuardError);
    await pool.query(`select u.name from users u /*scope-exempt: the signed-in user's own row*/ where u.id = $1`, [USERS.supA]);
    await pool.query('select count(*) from cost_heads');
    await pool.query('select count(*) from user_units');
  });
});

describe('query guard: the statement check (no database)', () => {
  it('names every guarded table, users included, through from, join and update', () => {
    for (const sql of [
      'select * from sites',
      'select * from budgeting.sites s',
      'select 1 from x join projects p on true',
      'update expenses set a = 1',
      'delete from complaint_photos where id = $1',
      'select * from complaint_events',
      'select * from variance_cell',
      'select * from variance v',
      'select * from site_budgets',
      'select * from complaints.complaints c',
      'select name from users',
    ]) {
      assert.ok(checkStatement(sql), sql);
    }
  });

  it('passes markers, other tables and look-alike names', () => {
    for (const sql of [
      'select * from sites s where (/*scope:budget.sites.view*/ true)',
      'select * from users u /*scope-exempt: the mapping script*/',
      'select * from user_units',
      'select * from complaint_categories',
      'select * from cost_heads',
      'select * from complaints.complaint_categories',
      'select * from user_roles',
      'select 1 for update of e',
      'begin',
    ]) {
      assert.equal(checkStatement(sql), null, sql);
    }
  });

  it('an exemption needs a reason', () => {
    assert.ok(checkStatement('select * from users /*scope-exempt:*/'));
  });
});
