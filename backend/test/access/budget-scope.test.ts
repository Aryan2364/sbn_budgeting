import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Pool } from 'pg';

import type { AccessContext } from '../../src/access/access-context';
import type { PermissionKey, Scope } from '../../src/access/catalogue';
import { checkRoutes, collectRouteHandlers } from '../../src/access/boot-guard';
import { SEED_ROLE_IDS } from '../../src/access/seed-roles';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P3b, budget lane, "Done when": the scope filter through
 * the REAL budget routes, on a fixture graph, with the query guard in
 * 'throw' mode (any statement of these routes reading a guarded table
 * without a scope marker fails the request):
 *   - lists, details, report rows and dashboard figures return exactly
 *     the records each scope reaches (Own strict, Team, Selected sites,
 *     All; decision 26: a project through any visible site);
 *   - a project's totals cover its visible sites only;
 *   - out of view scope is 404 with the not-found wording; visible but
 *     outside the action's scope is 403 with the reason (R7);
 *   - creates on a site follow O5; a site's people need change_people
 *     (O7), and changing them writes `unit.lead_changed` (R9);
 *   - rows and details carry `can`, from the same SQL as the action;
 *   - the Picks: scoped, searched, declared fields only, cost heads for
 *     everyone; 403 without the Pick.
 *
 * The graph:
 *   ceo
 *    └ hod
 *       ├ mgrA ─ supA        S1: manager mgrA, supervisor supA, project P1
 *       └ mgrB               S2: manager mgrB,                  project P1
 *   office (ticked S3)       S3: nobody,                        project P2
 *   staffy, outsider, nobody S4: nobody, created by mgrA,       no project
 *                            P3: no sites, created by office
 *   E1 S1 by supA · E2 S2 by mgrB · E3 S3 by office · E4 S1 legacy (no creator) · E5 S3 by staffy
 *
 * Roles: own (mgrA, supA, outsider), team (hod), units (office), all
 * (ceo): budget view/create/edit at that scope, plus change_people.
 * staffy holds the seed "Budget staff" role (view at All, expense edit
 * at Own). nobody holds no role. Nobody has a user_module_access row:
 * from P9 the permission guard decides the routes from the roles alone,
 * and the scope is what narrows them.
 */

const id = (n: number): string => `b3000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const P = {
  ceo: id(1), hod: id(2), mgrA: id(3), supA: id(4), mgrB: id(5),
  office: id(6), staffy: id(7), outsider: id(8), nobody: id(9),
} as const;
type Who = keyof typeof P;

const S = { S1: id(101), S2: id(102), S3: id(103), S4: id(104) } as const;
const PR = { P1: id(201), P2: id(202), P3: id(203) } as const;
const E = { E1: id(301), E2: id(302), E3: id(303), E4: id(304), E5: id(305) } as const;
const CH = { active: id(401), retired: id(402) } as const;
const ROLE = { own: id(501), team: id(502), units: id(503), all: id(504) } as const;

const LABEL: Record<string, string> = Object.fromEntries(
  [P, S, PR, E, CH].flatMap((g) => Object.entries(g).map(([k, v]) => [v, k])),
);
const labels = (ids: string[]): string[] => ids.map((i) => LABEL[i] ?? `other:${i}`).sort();

const SCOPED_KEYS: PermissionKey[] = [
  'budget.projects.view', 'budget.projects.create', 'budget.projects.edit',
  'budget.sites.view', 'budget.sites.create', 'budget.sites.edit', 'budget.sites.change_people',
  'budget.budgets.view', 'budget.budgets.edit',
  'budget.expenses.view', 'budget.expenses.create', 'budget.expenses.edit',
  'budget.reports.view',
];

async function seed(db: ScratchDb['client']): Promise<void> {
  await db.query('begin');
  const people: Array<[Who, Who | null]> = [
    ['ceo', null], ['hod', 'ceo'], ['mgrA', 'hod'], ['supA', 'mgrA'], ['mgrB', 'hod'],
    ['office', null], ['staffy', null], ['outsider', null], ['nobody', null],
  ];
  for (const [who] of people) {
    await db.query(
      `insert into users (id, name, email, password_hash, can_login, active) values ($1, $2, $3, 'x', true, true)`,
      [P[who], `Budget ${who}`, `${who}@p3b-budget.test`],
    );
  }
  for (const [who, boss] of people) {
    if (boss) await db.query('update users set reports_to = $2 where id = $1', [P[who], P[boss]]);
  }
  await db.query(
    `insert into projects (id, donor_name, name, planned_trees, created_by) values
       ($1, 'Donor One', 'Scope P1', 100, null), ($2, 'Donor Two', 'Scope P2', 100, null),
       ($3, 'Donor Three', 'Scope P3', 100, $4)`,
    [PR.P1, PR.P2, PR.P3, P.office],
  );
  const site = async (s: keyof typeof S, project: string | null, mgr: string | null, sup: string | null, by: string | null, trees: number) => {
    await db.query(
      `insert into sites (id, project_id, name, planned_trees, plantation_start_date, manager_id, supervisor_id, created_by)
       values ($1, $2, $3, $4, '2025-01-01', $5, $6, $7)`,
      [S[s], project, `Scope ${s}`, trees, mgr, sup, by],
    );
  };
  await site('S1', PR.P1, P.mgrA, P.supA, null, 10);
  await site('S2', PR.P1, P.mgrB, null, null, 20);
  await site('S3', PR.P2, null, null, null, 30);
  await site('S4', null, null, null, P.mgrA, 40);
  await db.query('insert into user_units (user_id, unit_id) values ($1, $2)', [P.office, S.S3]);

  await db.query(
    `insert into cost_heads (id, name, sort_order, is_active) values ($1, 'Scope head', 901, true), ($2, 'Scope retired', 902, false)`,
    [CH.active, CH.retired],
  );
  for (const s of [S.S1, S.S2]) {
    await db.query('insert into site_budgets (site_id, cost_head_id, period, per_tree_paise) values ($1, $2, 0, 100)', [s, CH.active]);
  }
  const expense = async (e: keyof typeof E, s: string, by: string | null) => {
    await db.query(
      `insert into expenses (id, site_id, cost_head_id, spent_on, period, amount_paise, created_by)
       values ($1, $2, $3, '2025-02-01', 0, 1000, $4)`,
      [E[e], s, CH.active, by],
    );
  };
  await expense('E1', S.S1, P.supA);
  await expense('E2', S.S2, P.mgrB);
  await expense('E3', S.S3, P.office);
  await expense('E4', S.S1, null);
  await expense('E5', S.S3, P.staffy);

  for (const [scope, roleId] of Object.entries(ROLE)) {
    await db.query('insert into roles (id, name) values ($1, $2)', [roleId, `P3b budget ${scope}`]);
    for (const key of SCOPED_KEYS) {
      await db.query('insert into role_permissions (role_id, permission_key, scope) values ($1, $2, $3)', [roleId, key, scope]);
    }
    // P4 (O9): budgets, reports and expense writes need see amounts; a role save derives it at All.
    await db.query("insert into role_permissions (role_id, permission_key, scope) values ($1, 'budget.amounts.see', 'all')", [roleId]);
  }
  // The seed "Budget staff" role (the migration inserts it), with the rows the mapping writes.
  const { SEED_ROLES } = await import('../../src/access/seed-roles');
  const { deriveRoleRows } = await import('../../src/access/catalogue');
  const staff = SEED_ROLES.find((r) => r.id === SEED_ROLE_IDS.budget_staff)!;
  await db.query('delete from role_permissions where role_id = $1', [staff.id]);
  for (const g of deriveRoleRows(staff.grants.map(([key, scope]) => ({ key, scope }))).rows) {
    await db.query('insert into role_permissions (role_id, permission_key, scope) values ($1, $2, $3)', [staff.id, g.key, g.scope]);
  }

  const give: Array<[Who, string]> = [
    ['mgrA', ROLE.own], ['supA', ROLE.own], ['outsider', ROLE.own], ['hod', ROLE.team],
    ['office', ROLE.units], ['ceo', ROLE.all], ['staffy', staff.id],
  ];
  for (const [who, roleId] of give) {
    await db.query('insert into user_roles (user_id, role_id) values ($1, $2)', [P[who], roleId]);
  }
  await db.query('commit');
}

describe('budget scope through the real routes (P3b)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;

  async function call(
    path: string,
    as: Who,
    init: { method?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: any }> {
    const { testTxIdle } = await import('../support/test-tx');
    const headers: Record<string, string> = { authorization: `Bearer ${harness.mintToken({ id: P[as], name: as })}` };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${harness.baseUrl}/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    await testTxIdle();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** Every row of a paginated list, at the largest page size. */
  async function list(path: string, as: Who, idKey = 'id'): Promise<{ ids: string[]; rows: any[]; body: any }> {
    const sep = path.includes('?') ? '&' : '?';
    const res = await call(`${path}${sep}page=1&pageSize=100`, as);
    assert.equal(res.status, 200, `${path} as ${as}: ${JSON.stringify(res.body)}`);
    return { ids: labels(res.body.data.map((r: Record<string, string>) => r[idKey])), rows: res.body.data, body: res.body };
  }

  const siteBody = (s: keyof typeof S, people: { managerId?: string | null; supervisorId?: string | null } = {}) => ({
    name: `Scope ${s}`,
    plannedTrees: s === 'S1' ? 10 : 20,
    plantationStartDate: '2025-01-01',
    projectId: s === 'S1' || s === 'S2' ? PR.P1 : null,
    managerId: s === 'S1' ? P.mgrA : s === 'S2' ? P.mgrB : null,
    supervisorId: s === 'S1' ? P.supA : null,
    ...people,
  });

  before(async () => {
    db = await openScratchDatabase('p3b_budget');
    await seed(db.client);
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

  // ---- lists ----------------------------------------------------------

  it('sites: Own (led or created), Team (team sites, team-created), Selected sites, All', async () => {
    assert.deepEqual((await list('/sites', 'mgrA')).ids, ['S1', 'S4']);
    assert.deepEqual((await list('/sites', 'supA')).ids, ['S1']);
    assert.deepEqual((await list('/sites', 'hod')).ids, ['S1', 'S2', 'S4']);
    assert.deepEqual((await list('/sites', 'office')).ids, ['S3']);
    assert.deepEqual((await list('/sites', 'ceo')).ids, ['S1', 'S2', 'S3', 'S4']);
    assert.deepEqual((await list('/sites', 'outsider')).ids, []);
    const { body } = await list('/sites', 'hod');
    assert.equal(body.total, 3, 'the total covers the scoped set only');
  });

  it('projects: visible through any visible site, or created by you; totals over visible sites only', async () => {
    assert.deepEqual((await list('/projects', 'mgrA')).ids, ['P1']);
    assert.deepEqual((await list('/projects', 'hod')).ids, ['P1']);
    assert.deepEqual((await list('/projects', 'office')).ids, ['P2', 'P3']);
    assert.deepEqual((await list('/projects', 'ceo')).ids, ['P1', 'P2', 'P3']);
    const p1 = async (as: Who) => (await list('/projects', as)).rows.find((r) => r.id === PR.P1);
    assert.deepEqual([(await p1('mgrA')).siteCount, (await p1('mgrA')).allocatedTrees], [1, 10]);
    assert.deepEqual([(await p1('ceo')).siteCount, (await p1('ceo')).allocatedTrees], [2, 30]);
  });

  it('expenses: Own is strictly "I entered it"; Team and Selected sites add the sites; legacy rows only wider', async () => {
    assert.deepEqual((await list('/expenses', 'mgrA')).ids, []);
    assert.deepEqual((await list('/expenses', 'supA')).ids, ['E1']);
    assert.deepEqual((await list('/expenses', 'hod')).ids, ['E1', 'E2', 'E4']);
    assert.deepEqual((await list('/expenses', 'office')).ids, ['E3', 'E5']);
    assert.deepEqual((await list('/expenses', 'ceo')).ids, ['E1', 'E2', 'E3', 'E4', 'E5']);
    const { body } = await list('/expenses', 'hod');
    assert.equal(body.aggregates.amountPaise, '3000', 'aggregates cover the scoped set only');
  });

  it('rows carry `can` from the same SQL as the action', async () => {
    const { rows } = await list('/expenses', 'staffy');
    const byId = Object.fromEntries(rows.map((r) => [LABEL[r.id], r.can]));
    assert.equal(byId.E5.edit, true);
    assert.equal(byId.E4.edit, 'You can edit expenses only if you added them.');
    assert.equal('delete' in byId.E5, false, 'an action not held at all is left out');
    const sites = await list('/sites', 'mgrA');
    for (const r of sites.rows) assert.deepEqual(Object.keys(r.can).sort(), ['change_people', 'edit']);
  });

  // ---- one record -----------------------------------------------------

  it('a record outside the view scope is the same 404 as a missing one; inside, it carries `can`', async () => {
    const out = await call(`/sites/${S.S2}`, 'mgrA');
    assert.equal(out.status, 404);
    assert.equal(out.body.message, 'That site no longer exists. It may have been deleted.');
    const inside = await call(`/sites/${S.S1}`, 'mgrA');
    assert.equal(inside.status, 200);
    assert.deepEqual(inside.body.can, { edit: true, change_people: true });
    assert.equal((await call(`/projects/${PR.P2}`, 'mgrA')).status, 404);
    assert.equal((await call(`/projects/${PR.P1}`, 'mgrA')).status, 200);
    assert.equal((await call(`/expenses/${E.E2}`, 'supA')).status, 404);
    assert.equal((await call(`/sites/${S.S2}/budget`, 'mgrA')).status, 404);
    const grid = await call(`/sites/${S.S1}/budget`, 'mgrA');
    assert.equal(grid.status, 200);
    assert.equal(grid.body.cells.length, 1);
  });

  it('edit: out of view scope 404; visible but outside the edit scope 403 with the reason', async () => {
    const body = { siteId: S.S1, costHeadId: CH.active, spentOn: '2025-02-01', period: 0, amountPaise: '1000' };
    assert.equal((await call(`/expenses/${E.E1}`, 'supA', { method: 'PATCH', body })).status, 200);
    assert.equal((await call(`/expenses/${E.E4}`, 'supA', { method: 'PATCH', body })).status, 404);
    const legacy = await call(`/expenses/${E.E4}`, 'staffy', { method: 'PATCH', body });
    assert.equal(legacy.status, 403);
    assert.equal(legacy.body.reason, 'You can edit expenses only if you added them.');
    assert.equal(legacy.body.permission, 'budget.expenses.edit');
    const own = await call(`/expenses/${E.E5}`, 'staffy', { method: 'PATCH', body: { ...body, siteId: S.S3 } });
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal((await call(`/expenses/${E.E4}`, 'hod', { method: 'PATCH', body })).status, 200, 'Team reaches a legacy row on a team site');
  });

  it('O5: a create (or a move) at Own only onto a site you lead; wider scopes onto their reach', async () => {
    const body = (siteId: string) => ({ siteId, costHeadId: CH.active, spentOn: '2025-02-01', period: 0, amountPaise: '500' });
    assert.equal((await call('/expenses', 'mgrA', { method: 'POST', body: body(S.S1) })).status, 201);
    const refused = await call('/expenses', 'mgrA', { method: 'POST', body: body(S.S2) });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.reason, 'You can add expenses only on the sites you lead.');
    assert.equal((await call('/expenses', 'office', { method: 'POST', body: body(S.S3) })).status, 201);
    assert.equal((await call('/expenses', 'office', { method: 'POST', body: body(S.S1) })).status, 403);
    assert.equal((await call('/expenses', 'staffy', { method: 'POST', body: body(S.S2) })).status, 201, 'staff create at All');
    // Moving supA's own E1 to a site supA does not lead.
    const move = await call(`/expenses/${E.E1}`, 'supA', { method: 'PATCH', body: body(S.S2) });
    assert.equal(move.status, 403);
  });

  it("O7: a site's people need change_people; the rest of the form only edit", async () => {
    // staffy (the seed Budget staff role) has edit at All but no change_people.
    assert.equal((await call(`/sites/${S.S1}`, 'staffy', { method: 'PATCH', body: siteBody('S1') })).status, 200);
    const refused = await call(`/sites/${S.S1}`, 'staffy', { method: 'PATCH', body: siteBody('S1', { supervisorId: P.mgrB }) });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.permission, 'budget.sites.change_people');
    const create = await call('/sites', 'staffy', { method: 'POST', body: { ...siteBody('S3'), name: 'New', supervisorId: P.supA } });
    assert.equal(create.status, 403);
    assert.equal((await call('/sites', 'staffy', { method: 'POST', body: { ...siteBody('S3'), name: 'New' } })).status, 201);
    // mgrA holds change_people at Own: on S1, which they lead, yes.
    const changed = await call(`/sites/${S.S1}`, 'mgrA', { method: 'PATCH', body: siteBody('S1', { supervisorId: P.mgrB }) });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.site.supervisorId, P.mgrB);
    // A new site is the creator's own: change_people at Own covers it.
    const mine = await call('/sites', 'mgrA', { method: 'POST', body: { ...siteBody('S3'), name: 'Mine', supervisorId: P.supA } });
    assert.equal(mine.status, 201, JSON.stringify(mine.body));
  });

  it('a lead change writes unit.lead_changed with name snapshots, in the same transaction', async () => {
    const { runInRequestTx } = await import('../support/test-tx');
    const { SitesController } = await import('../../src/sites/sites.controller');
    const pool = harness.app.get<Pool>('PG_POOL');
    const sites = harness.app.get(SitesController);
    const ctx: AccessContext = {
      userId: P.ceo,
      roleIds: [],
      version: 0,
      perms: new Map(SCOPED_KEYS.map((k) => [k, new Set<Scope>(['all'])])),
    };
    const user = { id: P.ceo, name: 'Budget ceo', email: null, phone: null, designation: null, modules: {} };
    const rows = await runInRequestTx(async () => {
      await sites.update(S.S1, siteBody('S1', { supervisorId: P.mgrB }) as never, user as never, ctx);
      await sites.update(S.S2, siteBody('S2') as never, user as never, ctx); // no people change: no row
      const { rows } = await pool.query(
        `select actor_id, actor_name, action, target_type, target_id, target_name, before, after from access_audit where action = 'unit.lead_changed'`,
      );
      return rows;
    });
    assert.equal(rows.length, 1);
    assert.deepEqual(
      { ...rows[0], before: rows[0].before, after: rows[0].after },
      {
        actor_id: P.ceo,
        actor_name: 'Budget ceo',
        action: 'unit.lead_changed',
        target_type: 'unit',
        target_id: S.S1,
        target_name: 'Scope S1',
        before: { manager: { id: P.mgrA, name: 'Budget mgrA' }, supervisor: { id: P.supA, name: 'Budget supA' } },
        after: { manager: { id: P.mgrA, name: 'Budget mgrA' }, supervisor: { id: P.mgrB, name: 'Budget mgrB' } },
      },
    );
  });

  it('budgets: the grid is edited only on a site within the edit scope', async () => {
    const cells = { cells: [{ costHeadId: CH.active, period: 1, perTreePaise: '50' }] };
    assert.equal((await call(`/sites/${S.S1}/budget`, 'mgrA', { method: 'PUT', body: cells })).status, 200);
    assert.equal((await call(`/sites/${S.S2}/budget`, 'mgrA', { method: 'PUT', body: cells })).status, 404);
  });

  it('projects: unlinking reaches only the sites within the edit scope', async () => {
    const res = await call(`/projects/${PR.P1}/unlink-sites`, 'mgrA', { method: 'POST', body: {} });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, { unlinked: 1 });
    const all = await call(`/projects/${PR.P1}/unlink-sites`, 'ceo', { method: 'POST', body: {} });
    assert.deepEqual(all.body, { unlinked: 2 });
  });

  // ---- reports --------------------------------------------------------

  it('reports: rows, totals and the dashboard cover the sites in reach only', async () => {
    assert.deepEqual((await list('/reports/variance', 'mgrA', 'siteId')).ids, ['S1', 'S4']);
    assert.deepEqual((await list('/reports/variance', 'ceo', 'siteId')).ids, ['S1', 'S2', 'S3', 'S4']);
    const dash = async (as: Who) => (await call('/reports/variance/summary', as)).body;
    const mine = await dash('mgrA');
    assert.deepEqual(
      [mine.projectCount, mine.siteCount, mine.plannedTrees, mine.recent.length],
      [1, 2, 50, 2],
    );
    const everything = await dash('ceo');
    assert.deepEqual([everything.projectCount, everything.siteCount, everything.plannedTrees], [3, 4, 100]);
    // One site's report (the site page's Variance tab): outside reach it is
    // as if the site had nothing in it.
    const outside = await call(`/reports/variance/head-periods?siteId=${S.S2}`, 'mgrA');
    assert.equal(outside.status, 200);
    assert.deepEqual([outside.body.total.budgetPaise, outside.body.total.actualPaise], [null, '0'], 'outside: as if empty');
    const inside = await call(`/reports/variance/head-periods?siteId=${S.S1}`, 'mgrA');
    assert.equal(inside.body.total.budgetPaise, '1000');
    const periods = await call(`/reports/variance/periods-summary?projectId=${PR.P1}`, 'mgrA');
    assert.equal(periods.body.total.budgetPaise, '1000', 'S1 only: 100 paise x 10 trees');
  });

  // ---- Picks ----------------------------------------------------------

  it('Picks: scoped by the Pick scopes held, searched, declared fields only', async () => {
    const pick = async (path: string, as: Who) => {
      const res = await call(path, as);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body as Array<Record<string, unknown>>;
    };
    assert.deepEqual(labels((await pick('/pick/budget/sites', 'mgrA')).map((r) => r.id as string)), ['S1', 'S4']);
    assert.deepEqual(labels((await pick('/pick/budget/sites', 'office')).map((r) => r.id as string)), ['S3']);
    assert.deepEqual(labels((await pick('/pick/budget/sites?q=s1', 'ceo')).map((r) => r.id as string)), ['S1']);
    const [site] = await pick('/pick/budget/sites?q=S1', 'ceo');
    assert.deepEqual(Object.keys(site!).sort(), ['id', 'name', 'plantationCompleteDate', 'plantationStartDate', 'projectId']);
    assert.deepEqual(labels((await pick('/pick/budget/projects', 'office')).map((r) => r.id as string)), ['P2', 'P3']);
    const [project] = await pick('/pick/budget/projects?q=P3', 'office');
    assert.deepEqual(project, { id: PR.P3, name: 'Scope P3', donorName: 'Donor Three' });
  });

  it('Picks: sites narrow by projectId (a project, or none), never widen; bad ids are 400 (P8)', async () => {
    const ids = async (path: string, as: Who) => {
      const res = await call(path, as);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return labels((res.body as Array<{ id: string }>).map((r) => r.id));
    };
    assert.deepEqual(await ids(`/pick/budget/sites?projectId=${PR.P1}&q=Scope`, 'ceo'), ['S1', 'S2']);
    assert.deepEqual(await ids(`/pick/budget/sites?projectId=${PR.P1}`, 'mgrA'), ['S1'], 'still scoped');
    assert.deepEqual(await ids('/pick/budget/sites?projectId=none&q=Scope', 'ceo'), ['S4']);
    assert.deepEqual(await ids(`/pick/budget/sites?projectId=${PR.P1}&q=S2`, 'ceo'), ['S2']);
    assert.equal((await call('/pick/budget/sites?projectId=nonsense', 'ceo')).status, 400);
  });

  it('Picks: cost heads for everyone, active unless asked; others 403 without the Pick', async () => {
    const heads = await call('/pick/budget/cost_heads?q=Scope', 'nobody');
    assert.equal(heads.status, 200);
    assert.deepEqual(heads.body, [{ id: CH.active, name: 'Scope head', sortOrder: 901, isActive: true }]);
    const withRetired = await call('/pick/budget/cost_heads?q=Scope&includeInactive=true', 'nobody');
    assert.deepEqual(labels(withRetired.body.map((r: { id: string }) => r.id)), ['active', 'retired']);
    const refused = await call('/pick/budget/sites', 'nobody');
    assert.equal(refused.status, 403);
    assert.equal(refused.body.permission, 'budget.sites.pick');
    assert.equal((await call('/pick/budget/sites?q=a&q=b', 'ceo')).status, 400);
  });

  // ---- boot -----------------------------------------------------------

  it('boot: change_people is checked inside POST and PATCH /sites, so no "used by no route" warning', async () => {
    const { DiscoveryService } = await import('@nestjs/core');
    const handlers = collectRouteHandlers(harness.app.get(DiscoveryService, { strict: false }));
    const result = checkRoutes(handlers, { requireDeclarations: true, requirePickRoutes: false });
    assert.deepEqual(result.errors, []);
    assert.ok(!result.warnings.some((w) => w.includes('budget.')), result.warnings.join('\n'));
    // Ready for REQUIRE_PICK_ROUTES: every budget Pick some permission needs has its route.
    const strict = checkRoutes(handlers, { requireDeclarations: true, requirePickRoutes: true });
    assert.deepEqual(strict.errors.filter((e) => e.includes('"budget.')), []);
    const budgetPicks = handlers.filter((h) => h.route.startsWith('GET /pick/budget/')).map((h) => h.route.split(' (')[0]);
    assert.deepEqual(budgetPicks.sort(), ['GET /pick/budget/cost_heads', 'GET /pick/budget/projects', 'GET /pick/budget/sites']);
  });
});
