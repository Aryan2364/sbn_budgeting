import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import type { AccessContext } from '../../src/access/access-context';
import {
  AMOUNT_RULES,
  amountRefusal,
  rulesFor,
  stripAmounts,
  type AmountRule,
} from '../../src/access/amounts.interceptor';
import { PERMISSION_KEYS, deriveRoleRows, type PermissionKey, type Scope } from '../../src/access/catalogue';
import { buildRoleMap, effectivePermissions } from '../../src/access/role-map.service';
import { SEED_ROLES } from '../../src/access/seed-roles';
import { BudgetsController } from '../../src/budgets/budgets.controller';
import { CostHeadsController } from '../../src/cost-heads/cost-heads.controller';
import { ExpensesController } from '../../src/expenses/expenses.controller';
import { BudgetPickController } from '../../src/pick/budget-pick.controller';
import { ProjectsController } from '../../src/projects/projects.controller';
import { ReportsController } from '../../src/reports/reports.controller';
import { SitesController } from '../../src/sites/sites.controller';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P4, "Done when" (6.1.6; DECISIONS 9; R10; O9):
 *   - for a role WITHOUT budget.amounts.see, every budget endpoint (list,
 *     detail, report, dashboard, Pick, and the lists the browser builds
 *     its exports from) carries no amount field: no `*Paise` key and no
 *     declared key, aggregates included, and no null or zero in its
 *     place (the key is absent);
 *   - a sort or filter on an amount is refused (403); a search skips
 *     amount fields;
 *   - Budgets and Reports are unreachable without it (403), and so is
 *     anything else whose key needs see amounts;
 *   - the mapped roles all hold see amounts, so nothing changes today.
 */

const BUDGET_RULES = AMOUNT_RULES.filter((r) => r.module === 'budget');

/** Every path in `value` whose key is an amount under the budget rule. */
function amountPaths(value: unknown, rules: readonly AmountRule[] = BUDGET_RULES, at = '$'): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => amountPaths(v, rules, `${at}[${i}]`));
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (rules.some((r) => r.keys.has(k) || r.suffixes.some((s) => k.endsWith(s)))) out.push(`${at}.${k}`);
    out.push(...amountPaths(v, rules, `${at}.${k}`));
  }
  return out;
}

const BUDGET_KEYS = PERMISSION_KEYS.filter((k) => k.startsWith('budget.'));
const BLIND_KEYS: PermissionKey[] = [
  ...BUDGET_KEYS.filter((k) => k !== 'budget.amounts.see'),
  'platform.people.pick',
];
const SEER_KEYS: PermissionKey[] = [...BLIND_KEYS, 'budget.amounts.see'];

function ctxOf(keys: readonly PermissionKey[], userId = 'u'): AccessContext {
  return { userId, roleIds: [], version: 0, perms: new Map(keys.map((k) => [k, new Set<Scope>(['all'])])) };
}

// ---------------------------------------------------------------------
// The budget routes, from the controllers' own metadata
// ---------------------------------------------------------------------

const CONTROLLERS = [
  ProjectsController,
  SitesController,
  BudgetsController,
  ExpensesController,
  CostHeadsController,
  ReportsController,
  BudgetPickController,
] as const;
const METHOD = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

function budgetRoutes(): Array<{ route: string; handler: object }> {
  const out: Array<{ route: string; handler: object }> = [];
  for (const controller of CONTROLLERS) {
    const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const proto = controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (method === undefined || path === undefined) continue;
      out.push({
        route: `${METHOD[method]} /${[base, path].filter((p) => p && p !== '/').join('/')}`,
        handler,
      });
    }
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** The routes whose key needs see amounts (O9 and the catalogue's needs). */
const AMOUNT_ONLY_ROUTES = [
  'GET /reports/variance',
  'GET /reports/variance/head-periods',
  'GET /reports/variance/periods-summary',
  'GET /reports/variance/summary',
  'GET /sites/:siteId/budget',
  'PATCH /expenses/:id',
  'POST /expenses',
  'PUT /sites/:siteId/budget',
];

describe('P4 see amounts: the rules', () => {
  it('Budget declares see amounts; the rule strips *Paise and the declared and derived keys', () => {
    assert.equal(BUDGET_RULES.length, 1);
    const rule = BUDGET_RULES[0]!;
    assert.equal(rule.key, 'budget.amounts.see');
    assert.deepEqual([...rule.suffixes], ['Paise']);
    for (const k of ['spentPct', 'variancePct', 'overBudget', 'sitesOverBudget', 'attention']) {
      assert.ok(rule.keys.has(k), k);
    }
    assert.deepEqual(AMOUNT_RULES.map((r) => r.module), ['budget'], 'only Budget has amounts');
  });

  it('every mapped role that holds any Budget key holds budget.amounts.see (switch day changes nothing)', () => {
    const map = buildRoleMap({
      version: 1,
      admin_ids: SEED_ROLES.filter((r) => r.systemKey === 'admin').map((r) => r.id),
      grants: SEED_ROLES.flatMap((r) =>
        deriveRoleRows(r.grants.map(([key, scope]) => ({ key, scope }))).rows.map(
          (g) => [r.id, g.key, g.scope] as [string, string, string],
        ),
      ),
    });
    const checked: string[] = [];
    for (const role of SEED_ROLES) {
      const perms = effectivePermissions(map, [role.id]);
      const budgetNonPick = [...perms.keys()].filter((k) => k.startsWith('budget.') && !k.endsWith('.pick'));
      if (budgetNonPick.length === 0) continue;
      checked.push(role.seed);
      assert.deepEqual([...(perms.get('budget.amounts.see') ?? [])], ['all'], role.seed);
    }
    assert.deepEqual(checked.sort(), ['admin', 'budget_admin', 'budget_staff']);
  });

  it('table: without see amounts, exactly the amount-only routes are refused; every route is stripped', () => {
    const blind = ctxOf(BLIND_KEYS);
    const seer = ctxOf(SEER_KEYS);
    const routes = budgetRoutes();
    assert.equal(routes.length, 31, 'a new budget route needs a row in this table');
    const refused = routes.filter((r) => amountRefusal(r.handler, blind)).map((r) => r.route);
    assert.deepEqual(refused, AMOUNT_ONLY_ROUTES);
    for (const r of routes) {
      if (AMOUNT_ONLY_ROUTES.includes(r.route)) assert.equal(amountRefusal(r.handler, blind), 'budget.amounts.see');
      assert.equal(amountRefusal(r.handler, seer), null, r.route);
      assert.deepEqual(rulesFor(r.handler, blind).map((x) => x.module), ['budget'], r.route);
      assert.deepEqual(rulesFor(r.handler, seer), [], `${r.route}: a caller with see amounts is untouched`);
    }
  });

  it('a complaints or platform route is never stripped; a route with no module is, defensively', () => {
    const blind = ctxOf(BLIND_KEYS);
    const complaints = { kind: 'can', keys: ['complaints.complaints.view'] };
    const handler = (): void => undefined;
    Reflect.defineMetadata('accessDeclarations', [complaints], handler);
    assert.deepEqual(rulesFor(handler, blind), []);
    const signedIn = (): void => undefined;
    Reflect.defineMetadata('accessDeclarations', [{ kind: 'signedIn' }], signedIn);
    assert.deepEqual(rulesFor(signedIn, blind).map((r) => r.module), ['budget']);
  });

  it('stripAmounts removes the keys at any depth, aggregates included; never null, never zero; input untouched', () => {
    const spentOn = new Date('2025-02-01T00:00:00Z');
    const list = {
      data: [
        { id: 'e1', amountPaise: '1000', spentOn, can: { edit: true }, nested: { budgetPaise: null, x: 1 } },
      ],
      total: 1,
      aggregates: { amountPaise: '1000' },
    };
    const dashboard = {
      projectCount: 1, siteCount: 2, plannedTrees: 30,
      budgetPaise: null, actualPaise: '0', variancePaise: null, sitesOverBudget: 0,
      spendThisMonthPaise: '0', spendLastMonthPaise: '0',
      attention: [{ siteId: 's', budgetPaise: '1', actualPaise: '2', variancePaise: '-1' }],
      recent: [{ id: 'e', siteName: 'S', amountPaise: '5' }],
      variancePct: '1.0', spentPct: '2', overBudget: true,
    };
    const before = JSON.stringify({ list, dashboard });
    const strippedList = stripAmounts(list, BUDGET_RULES) as typeof list;
    const strippedDash = stripAmounts(dashboard, BUDGET_RULES) as Record<string, unknown>;
    assert.equal(JSON.stringify({ list, dashboard }), before, 'the input is not mutated');
    assert.deepEqual(amountPaths(strippedList), []);
    assert.deepEqual(amountPaths(strippedDash), []);
    assert.deepEqual(strippedList.aggregates, {});
    assert.equal(strippedList.data[0]!.spentOn, spentOn, 'a Date passes through');
    assert.deepEqual(strippedList.data[0]!.nested, { x: 1 });
    assert.deepEqual(Object.keys(strippedDash).sort(), ['plannedTrees', 'projectCount', 'recent', 'siteCount']);
    assert.deepEqual(strippedDash.recent, [{ id: 'e', siteName: 'S' }]);
    assert.equal(stripAmounts(list, []), list, 'no rules: the same object, untouched');
    assert.equal(stripAmounts('text', BUDGET_RULES), 'text');
  });
});

// ---------------------------------------------------------------------
// Through the real routes
// ---------------------------------------------------------------------

const id = (n: number): string => `b4000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const P = { seer: id(1), blind: id(2) } as const;
type Who = keyof typeof P;
const PROJECT = id(101);
const SITE = id(201);
const HEAD = id(301);
const EXPENSE = id(401);
const ROLE = { seer: id(501), blind: id(502) } as const;

async function seed(db: ScratchDb['client']): Promise<void> {
  await db.query('begin');
  for (const who of Object.keys(P) as Who[]) {
    await db.query(
      `insert into users (id, name, email, password_hash, can_login, active) values ($1, $2, $3, 'x', true, true)`,
      [P[who], `Amounts ${who}`, `${who}@p4-amounts.test`],
    );
    await db.query('insert into roles (id, name) values ($1, $2)', [ROLE[who], `P4 ${who}`]);
    for (const key of who === 'seer' ? SEER_KEYS : BLIND_KEYS) {
      await db.query(`insert into role_permissions (role_id, permission_key, scope) values ($1, $2, 'all')`, [ROLE[who], key]);
    }
    await db.query('insert into user_roles (user_id, role_id) values ($1, $2)', [P[who], ROLE[who]]);
  }
  await db.query(
    `insert into projects (id, donor_name, name, planned_trees) values ($1, 'Donor', 'Amounts project', 100)`,
    [PROJECT],
  );
  await db.query(
    `insert into sites (id, project_id, name, planned_trees, plantation_start_date, manager_id)
     values ($1, $2, 'Amounts site', 10, '2025-01-01', $3)`,
    [SITE, PROJECT, P.seer],
  );
  await db.query(`insert into cost_heads (id, name, sort_order, is_active) values ($1, 'Amounts head', 951, true)`, [HEAD]);
  await db.query('insert into site_budgets (site_id, cost_head_id, period, per_tree_paise) values ($1, $2, 0, 100)', [SITE, HEAD]);
  await db.query(
    `insert into expenses (id, site_id, cost_head_id, spent_on, period, amount_paise, bill_number, created_by)
     values ($1, $2, $3, current_date, 0, 5000, 'BILL-77', $4)`,
    [EXPENSE, SITE, HEAD, P.seer],
  );
  await db.query('commit');
}

/**
 * One case per budget GET route. `amountOnly`: refused without see
 * amounts. `seerSees`: with see amounts the response does carry amounts,
 * so the blind scan is proved to be looking at a real amount field.
 */
const GET_CASES: Record<string, { path: string; amountOnly?: true; seerSees?: true }> = {
  'GET /projects': { path: '/projects?pageSize=100' },
  'GET /projects/:id': { path: `/projects/${PROJECT}` },
  'GET /sites': { path: '/sites?pageSize=100' },
  'GET /sites/:id': { path: `/sites/${SITE}` },
  'GET /sites/:siteId/budget': { path: `/sites/${SITE}/budget`, amountOnly: true, seerSees: true },
  // The list the browser's Excel and PDF exports are built from (plan 6.1.6).
  'GET /expenses': { path: '/expenses?pageSize=100', seerSees: true },
  'GET /expenses/:id': { path: `/expenses/${EXPENSE}`, seerSees: true },
  'GET /cost-heads': { path: '/cost-heads?pageSize=100' },
  'GET /cost-heads/:id': { path: `/cost-heads/${HEAD}` },
  'GET /reports/variance': { path: '/reports/variance?pageSize=100', amountOnly: true, seerSees: true },
  'GET /reports/variance/summary': { path: '/reports/variance/summary', amountOnly: true, seerSees: true },
  'GET /reports/variance/periods-summary': {
    path: `/reports/variance/periods-summary?projectId=${PROJECT}`,
    amountOnly: true,
    seerSees: true,
  },
  'GET /reports/variance/head-periods': {
    path: `/reports/variance/head-periods?projectId=${PROJECT}`,
    amountOnly: true,
    seerSees: true,
  },
  'GET /pick/budget/projects': { path: '/pick/budget/projects' },
  'GET /pick/budget/sites': { path: '/pick/budget/sites' },
  'GET /pick/budget/cost_heads': { path: '/pick/budget/cost_heads' },
};

describe('P4 see amounts through the real routes', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
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

  before(async () => {
    db = await openScratchDatabase('p4_amounts');
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

  it('every budget GET route has a case', async () => {
    const { discoverRoutes } = await import('../support/app');
    const gets = discoverRoutes(harness.app)
      .filter((r) => r.declaredModule === 'budget' && r.method === 'GET')
      .map((r) => `GET ${r.path.replace(/^\/api/, '')}`)
      .sort();
    assert.deepEqual(gets, Object.keys(GET_CASES).sort());
  });

  for (const [route, c] of Object.entries(GET_CASES)) {
    it(`${route}: no amount field without see amounts${c.amountOnly ? ' (refused: amount-only)' : ''}`, async () => {
      const blind = await call(c.path, 'blind');
      if (c.amountOnly) {
        assert.equal(blind.status, 403, JSON.stringify(blind.body));
        assert.equal(blind.body.error, 'forbidden');
        assert.equal(blind.body.permission, 'budget.amounts.see');
        assert.equal(blind.body.reason, 'Only people allowed to see amounts (cost, budgets) can do this.');
      } else {
        assert.equal(blind.status, 200, JSON.stringify(blind.body));
      }
      assert.deepEqual(amountPaths(blind.body), [], `${route} leaked amounts`);

      const seer = await call(c.path, 'seer');
      assert.equal(seer.status, 200, JSON.stringify(seer.body));
      if (c.seerSees) assert.ok(amountPaths(seer.body).length > 0, `${route}: the case must exercise an amount`);
    });
  }

  it('expenses: the row is there, its amount absent (not null, not zero); aggregates absent', async () => {
    const blind = await call('/expenses?pageSize=100', 'blind');
    const row = blind.body.data.find((r: { id: string }) => r.id === EXPENSE);
    assert.ok(row, 'the record itself stays visible');
    assert.equal('amountPaise' in row, false);
    assert.equal('aggregates' in blind.body, false);
    const seer = await call('/expenses?pageSize=100', 'seer');
    assert.equal(seer.body.data.find((r: { id: string }) => r.id === EXPENSE).amountPaise, '5000');
    assert.equal(seer.body.aggregates.amountPaise, '5000');
    const detail = await call(`/expenses/${EXPENSE}`, 'blind');
    assert.equal('amountPaise' in detail.body, false);
    assert.equal(detail.body.billNumber, 'BILL-77');
  });

  const REFUSALS: Array<[string, string, string]> = [
    ['sort', '/expenses?sort=amountPaise', 'Sorting by amount needs see amounts.'],
    ['sort, descending', '/expenses?sort=amountPaise&direction=desc', 'Sorting by amount needs see amounts.'],
    ['filter, minimum', '/expenses?amountMin=1', 'Filtering by amount needs see amounts.'],
    ['filter, maximum', '/expenses?amountMax=999999', 'Filtering by amount needs see amounts.'],
  ];
  for (const [what, path, reason] of REFUSALS) {
    it(`an amount ${what} is refused without see amounts, allowed with it`, async () => {
      const blind = await call(path, 'blind');
      assert.equal(blind.status, 403, JSON.stringify(blind.body));
      assert.deepEqual(
        { error: blind.body.error, permission: blind.body.permission, reason: blind.body.reason },
        { error: 'forbidden', permission: 'budget.amounts.see', reason },
      );
      assert.equal((await call(path, 'seer')).status, 200);
    });
  }

  it('a search still works without see amounts, over the text fields', async () => {
    const blind = await call('/expenses?search=BILL-77', 'blind');
    assert.equal(blind.status, 200);
    assert.deepEqual(blind.body.data.map((r: { id: string }) => r.id), [EXPENSE]);
    assert.deepEqual(amountPaths(blind.body), []);
  });

  it('writes whose key needs see amounts are refused without it', async () => {
    const expense = { siteId: SITE, costHeadId: HEAD, spentOn: '2025-02-01', period: 0, amountPaise: '100' };
    const writes: Array<[string, string, unknown]> = [
      ['POST', '/expenses', expense],
      ['PATCH', `/expenses/${EXPENSE}`, expense],
      ['PUT', `/sites/${SITE}/budget`, { cells: [{ costHeadId: HEAD, period: 1, perTreePaise: '5' }] }],
    ];
    for (const [method, path, body] of writes) {
      const res = await call(path, 'blind', { method, body });
      assert.equal(res.status, 403, `${method} ${path}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.permission, 'budget.amounts.see');
      assert.ok((await call(path, 'seer', { method, body })).status < 300, `${method} ${path} as seer`);
    }
    // A write that needs no amounts is untouched, and its answer carries none.
    const project = await call(`/projects/${PROJECT}`, 'blind', {
      method: 'PATCH',
      body: { donorName: 'Donor', name: 'Amounts project', plannedTrees: 100 },
    });
    assert.equal(project.status, 200, JSON.stringify(project.body));
  });

  it('second line: the reports, if ever reached without see amounts, are stripped and refuse an amount sort', async () => {
    const { runInRequestTx } = await import('../support/test-tx');
    const { VarianceService } = await import('../../src/reports/variance.service');
    const variance = harness.app.get(VarianceService);
    const blind = ctxOf(BLIND_KEYS, P.blind);
    const handler = ReportsController.prototype.summary as unknown as object;
    const rules = rulesFor(handler, blind);
    const results = await runInRequestTx(async () => ({
      dashboard: await variance.dashboard(blind),
      sites: await variance.sites(blind, { pageSize: 100 }),
      periods: await variance.periods(blind, { projectId: PROJECT }),
      heads: await variance.headPeriods(blind, { projectId: PROJECT }),
    }));
    for (const [name, raw] of Object.entries(results)) {
      assert.ok(amountPaths(raw).length > 0, `${name}: the raw figures carry amounts`);
      assert.deepEqual(amountPaths(stripAmounts(raw, rules)), [], `${name} leaked after stripping`);
    }
    const dash = stripAmounts(results.dashboard, rules) as Record<string, unknown>;
    assert.equal('attention' in dash, false, 'the overspent-sites list is amount-derived');
    assert.equal('sitesOverBudget' in dash, false);
    assert.equal(results.sites.data.length, 1, 'the default sort no longer needs amounts');

    for (const sort of ['variance', 'budget', 'actual', 'variancePct']) {
      await assert.rejects(
        runInRequestTx(() => variance.sites(blind, { sort })),
        (e: unknown) => e instanceof ForbiddenException && JSON.stringify(e.getResponse()).includes('Sorting by amount'),
        sort,
      );
    }
    const seer = ctxOf(SEER_KEYS, P.seer);
    const sorted = await runInRequestTx(() => variance.sites(seer, { sort: 'budget' }));
    assert.equal(sorted.data.length, 1);
  });
});
