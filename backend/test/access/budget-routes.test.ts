import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import type { AccessContext } from '../../src/access/access-context';
import { deriveRoleRows } from '../../src/access/catalogue';
import { declarationsOf } from '../../src/access/decorators';
import { decide } from '../../src/access/permission.guard';
import { buildRoleMap, effectivePermissions } from '../../src/access/role-map.service';
import { SEED_ROLES } from '../../src/access/seed-roles';
import { BudgetsController } from '../../src/budgets/budgets.controller';
import type { AuthModules, AuthUser } from '../../src/common/current-user';
import { CostHeadsController } from '../../src/cost-heads/cost-heads.controller';
import { ExpensesController } from '../../src/expenses/expenses.controller';
import { ProjectsController } from '../../src/projects/projects.controller';
import { ReportsController } from '../../src/reports/reports.controller';
import { SitesController } from '../../src/sites/sites.controller';
import { legacyAllows, legacyRuleFor, type ModuleRequirement } from '../support/legacy-route-rules';

/**
 * P2b, budget lane (access plan P2b, 6.5), and P9: every budget route
 * carries its one declaration, which the permission guard decides, and
 * it agrees with the old guard's rule (frozen in
 * test/support/legacy-route-rules.ts since P9 deleted the old guard)
 * for every combination of today's levels once the levels are mapped to
 * the seed roles (plan 5.4) -- except the intended differences the plan
 * lists:
 *
 *   D2  every platform admin maps to Admin and gains what they lacked;
 *   D3  the full cost-head list (GET /cost-heads[/:id]) needs manage.
 *
 * This is the comparison the equivalence harness makes per request,
 * run exhaustively over the levels instead of over the harness's people.
 */

const CONTROLLERS = [
  ProjectsController,
  SitesController,
  BudgetsController,
  ExpensesController,
  CostHeadsController,
  ReportsController,
] as const;

const METHOD = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

interface BudgetRoute {
  route: string;
  handler: object;
  requirements: ModuleRequirement[];
}

function budgetRoutes(): BudgetRoute[] {
  const out: BudgetRoute[] = [];
  for (const controller of CONTROLLERS) {
    const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const proto = controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (method === undefined || path === undefined) continue;
      const route = `${METHOD[method]} /${[base, path].filter((p) => p && p !== '/').join('/')}`;
      out.push({ route, handler, requirements: [...legacyRuleFor(route)] });
    }
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** The role map exactly as the mapping script stores the seed roles. */
const map = buildRoleMap({
  version: 1,
  admin_ids: SEED_ROLES.filter((r) => r.systemKey === 'admin').map((r) => r.id),
  grants: SEED_ROLES.flatMap((r) =>
    deriveRoleRows(r.grants.map(([key, scope]) => ({ key, scope }))).rows.map(
      (g) => [r.id, g.key, g.scope] as [string, string, string],
    ),
  ),
});

/** Every combination of today's levels, including none at all. */
function levelCombinations(): AuthModules[] {
  const out: AuthModules[] = [];
  for (const platform of [undefined, 'admin'] as const) {
    for (const budget of [undefined, 'admin', 'staff'] as const) {
      for (const complaints of [undefined, 'admin', 'member'] as const) {
        out.push({ platform, budget, complaints });
      }
    }
  }
  return out;
}

function mappedContext(modules: AuthModules): AccessContext {
  const roleIds = SEED_ROLES.filter(
    (r) => (modules as Record<string, string | undefined>)[r.heldBy.module] === r.heldBy.role,
  )
    .map((r) => r.id)
    .sort();
  return { userId: 'u', roleIds, version: map.version, perms: effectivePermissions(map, roleIds) };
}

function describeLevels(m: AuthModules): string {
  return Object.entries(m)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${v}`)
    .join(',') || 'none';
}

const D3_ROUTES = ['GET /cost-heads', 'GET /cost-heads/:id'];

describe('P2b budget lane: route declarations', () => {
  const routes = budgetRoutes();

  it('finds every budget route', () => {
    assert.equal(routes.length, 28);
  });

  it('every budget handler carries exactly one new declaration, a Budget key', () => {
    for (const r of routes) {
      const declarations = declarationsOf(r.handler);
      assert.equal(declarations.length, 1, `${r.route} carries ${declarations.length} declarations`);
      const d = declarations[0]!;
      assert.equal(d.kind, 'can', `${r.route} should be @Can`);
      if (d.kind === 'can') assert.match(d.keys[0], /^budget\./, r.route);
    }
  });

  it('every budget route existed before roles, behind the old budget rule (frozen)', () => {
    for (const r of routes) {
      assert.ok(r.requirements.some((q) => q.module === 'budget'), `${r.route} had no budget rule`);
    }
  });

  it('P9: no handler or controller carries the old module metadata any more', () => {
    for (const controller of CONTROLLERS) {
      assert.deepEqual(Reflect.getMetadataKeys(controller).filter((k) => k === 'moduleAccess'), [], controller.name);
    }
    for (const r of routes) {
      assert.deepEqual(Reflect.getMetadataKeys(r.handler).filter((k) => k === 'moduleAccess'), [], r.route);
    }
  });
});

describe('P9 budget lane: the permission guard agrees with the old rule, except D2 and D3', () => {
  const routes = budgetRoutes();
  const disagreements: Array<{ route: string; levels: AuthModules; old: boolean; now: boolean }> = [];
  for (const levels of levelCombinations()) {
    const user: AuthUser = { id: 'u', name: 'U', email: null, phone: null, designation: null, modules: levels };
    const ctx = mappedContext(levels);
    for (const r of routes) {
      const old = legacyAllows(user, r.requirements);
      const now = decide(declarationsOf(r.handler)[0]!, ctx).allowed;
      if (old !== now) disagreements.push({ route: r.route, levels, old, now });
    }
  }

  const isD2 = (d: (typeof disagreements)[number]): boolean => d.levels.platform === 'admin' && !d.old && d.now;
  const isD3 = (d: (typeof disagreements)[number]): boolean =>
    D3_ROUTES.includes(d.route) && d.old && !d.now && d.levels.budget === 'staff' && d.levels.platform !== 'admin';

  it('has no disagreement outside the intended differences D2 and D3', () => {
    const unexplained = disagreements
      .filter((d) => !isD2(d) && !isD3(d))
      .map((d) => `${d.route} [${describeLevels(d.levels)}] old=${d.old} new=${d.now}`);
    assert.deepEqual(unexplained, []);
  });

  it('D3 is exactly the two cost-head GETs, for budget staff', () => {
    const d3 = disagreements.filter(isD3);
    assert.deepEqual([...new Set(d3.map((d) => d.route))].sort(), D3_ROUTES);
    // budget staff x (complaints none, admin, member) x the two routes.
    assert.equal(d3.length, 6);
  });

  it('D2 is only a platform admin gaining Budget', () => {
    for (const d of disagreements.filter(isD2)) assert.notEqual(d.levels.budget, 'admin', d.route);
    // Admin covers every budget route a budget admin has, so a platform
    // admin who is also a budget admin disagrees nowhere.
    assert.equal(
      disagreements.filter((d) => d.levels.platform === 'admin' && d.levels.budget === 'admin').length,
      0,
    );
  });

  it('staff are refused exactly the admin-only routes, by both guards', () => {
    const staff = mappedContext({ budget: 'staff' });
    const refused = routes
      .filter((r) => !decide(declarationsOf(r.handler)[0]!, staff).allowed)
      .map((r) => r.route);
    assert.deepEqual(refused, [
      'DELETE /cost-heads/:id',
      'DELETE /expenses/:id',
      'DELETE /projects/:id',
      'DELETE /sites/:id',
      'GET /cost-heads',
      'GET /cost-heads/:id',
      'PATCH /cost-heads/:id',
      'POST /cost-heads',
    ]);
  });

  it('a budget admin is allowed every route', () => {
    const ctx = mappedContext({ budget: 'admin' });
    for (const r of routes) assert.ok(decide(declarationsOf(r.handler)[0]!, ctx).allowed, r.route);
  });
});
