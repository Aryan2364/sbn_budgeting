import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import type { AccessContext } from '../../src/access/access-context';
import { deriveRoleRows } from '../../src/access/catalogue';
import { decide } from '../../src/access/permission.guard';
import { buildRoleMap, effectivePermissions } from '../../src/access/role-map.service';
import { SEED_ROLES, type LegacyModule } from '../../src/access/seed-roles';
import { legacyAllows, legacyRuleFor } from '../support/legacy-route-rules';

import { checkRoutes, type RouteHandler } from '../../src/access/boot-guard';
import { declarationsOf, type AccessDeclaration } from '../../src/access/decorators';
import { ComplaintCategoriesController } from '../../src/complaint-categories/complaint-categories.controller';
import { ComplaintsController } from '../../src/complaints/complaints.controller';
import { NotificationsController } from '../../src/notifications/notifications.controller';

/**
 * Access plan P2b, complaints lane ("Done when"), and P9:
 *   - every complaints, complaint-categories and notifications handler
 *     carries its one declaration, with the key the plan's route column
 *     (5.3.2, corrected by RESOLUTIONS C1) names;
 *   - boot validation passes for those handlers, strictly;
 *   - for every one of today's level combinations, mapped to the seed
 *     roles (plan 5.4), the permission guard disagrees with the old
 *     guard's rule (frozen in test/support/legacy-route-rules.ts) ONLY
 *     where the plan names the difference: D2 (a platform-admin-only
 *     person maps to Admin) and D3 (the full category list needs
 *     `manage`; everyone else uses the Pick). The equivalence harness
 *     proves the same over the fixtures' real requests.
 */

const can = (key: string): AccessDeclaration => ({ kind: 'can', keys: [key] }) as AccessDeclaration;
const signedIn: AccessDeclaration = { kind: 'signedIn' };

/** handler -> its one declaration (plan 5.3.2; C1: work covers start and resolve; A1: no approve or send back). */
const EXPECTED: ReadonlyArray<readonly [object, string, AccessDeclaration]> = [
  [ComplaintsController, 'list', can('complaints.complaints.view')],
  [ComplaintsController, 'counts', can('complaints.complaints.view')],
  [ComplaintsController, 'summary', can('complaints.complaints.view')],
  [ComplaintsController, 'detail', can('complaints.complaints.view')],
  [ComplaintsController, 'photo', can('complaints.complaints.view')],
  [ComplaintsController, 'sites', can('complaints.complaints.raise')],
  [ComplaintsController, 'raise', can('complaints.complaints.raise')],
  [ComplaintsController, 'comment', can('complaints.complaints.comment')],
  [ComplaintsController, 'start', can('complaints.complaints.work')],
  [ComplaintsController, 'resolve', can('complaints.complaints.work')],
  [ComplaintsController, 'reassign', can('complaints.complaints.reassign')],
  [ComplaintCategoriesController, 'list', can('complaints.categories.manage')],
  [ComplaintCategoriesController, 'get', can('complaints.categories.manage')],
  [ComplaintCategoriesController, 'create', can('complaints.categories.manage')],
  [ComplaintCategoriesController, 'update', can('complaints.categories.manage')],
  [ComplaintCategoriesController, 'remove', can('complaints.categories.manage')],
  [NotificationsController, 'list', signedIn],
  [NotificationsController, 'readAll', signedIn],
  [NotificationsController, 'read', signedIn],
];

const CONTROLLERS = [ComplaintsController, ComplaintCategoriesController, NotificationsController] as const;

/** Every method of the three controllers that Nest routes. */
function routedHandlers(): RouteHandler[] {
  const out: RouteHandler[] = [];
  for (const c of CONTROLLERS) {
    const proto = c.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const fn = proto[name];
      if (name === 'constructor' || typeof fn !== 'function') continue;
      if (Reflect.getMetadata(METHOD_METADATA, fn) === undefined) continue;
      out.push({ route: `${c.name}.${name}`, isPublic: false, declarations: declarationsOf(fn) });
    }
  }
  return out;
}

describe('complaints lane: route declarations (P2b)', () => {
  it('every handler carries exactly the declaration the plan names', () => {
    for (const [controller, name, expected] of EXPECTED) {
      const fn = (controller as { prototype: Record<string, object> }).prototype[name]!;
      assert.deepEqual(declarationsOf(fn), [expected], `${(controller as { name: string }).name}.${name}`);
    }
  });

  it('no routed handler of the three controllers is left out of the table', () => {
    const listed = new Set(EXPECTED.map(([c, n]) => `${(c as { name: string }).name}.${n}`));
    assert.deepEqual(
      routedHandlers().map((h) => h.route).filter((r) => !listed.has(r)),
      [],
    );
  });

  it('boot validation passes for them, strictly (none and several are both errors)', () => {
    const result = checkRoutes(routedHandlers(), { requireDeclarations: true, requirePickRoutes: false });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.undeclared, []);
  });
});

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];

/** "GET /complaints/:id" -> the handler, for the three controllers. */
function laneRoutes(): Array<{ route: string; handler: object }> {
  const out: Array<{ route: string; handler: object }> = [];
  for (const c of CONTROLLERS) {
    const base = Reflect.getMetadata(PATH_METADATA, c) as string;
    const proto = c.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const fn = proto[name];
      if (name === 'constructor' || typeof fn !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
      const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
      if (method === undefined || path === undefined) continue;
      const route = `${METHODS[method]} /${[base, path].map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
      out.push({ route, handler: fn });
    }
  }
  return out;
}

const map = buildRoleMap({
  version: '1',
  admin_ids: SEED_ROLES.filter((r) => r.systemKey === 'admin').map((r) => r.id),
  grants: SEED_ROLES.flatMap((r) =>
    deriveRoleRows(r.grants.map(([key, scope]) => ({ key, scope }))).rows.map(
      (g) => [r.id, g.key, g.scope] as [string, string, string],
    ),
  ),
});

function contextFor(levels: Partial<Record<LegacyModule, string>>): AccessContext {
  const roleIds = SEED_ROLES.filter((r) => levels[r.heldBy.module] === r.heldBy.role).map((r) => r.id);
  return { userId: 'u', roleIds, version: map.version, perms: effectivePermissions(map, roleIds) };
}

describe('complaints lane: the permission guard agrees with the old rule, except D2 and D3 (P9)', () => {
  it('disagrees only where D2 and D3 say, for every level combination', () => {
    const unexplained: string[] = [];
    let d2 = 0;
    let d3 = 0;
    for (const platform of [undefined, 'admin']) {
      for (const budget of [undefined, 'admin', 'staff']) {
        for (const complaints of [undefined, 'admin', 'member']) {
          const levels: Partial<Record<LegacyModule, string>> = {};
          if (platform) levels.platform = platform;
          if (budget) levels.budget = budget;
          if (complaints) levels.complaints = complaints;
          const ctx = contextFor(levels);
          for (const r of laneRoutes()) {
            const old = legacyAllows({ modules: levels }, legacyRuleFor(r.route));
            const now = decide(declarationsOf(r.handler)[0]!, ctx).allowed;
            if (old === now) continue;
            // D2: a platform admin maps to Admin and gains what they lacked.
            if (platform && !old && now && complaints !== 'admin') {
              d2 += 1;
              continue;
            }
            // D3: reading the full category list needs manage; complaints admins have it.
            if (/^GET \/complaint-categories(\/:id)?$/.test(r.route) && old && !now && complaints !== 'admin') {
              d3 += 1;
              continue;
            }
            unexplained.push(`${r.route} ${JSON.stringify(levels)} old=${old} new=${now}`);
          }
        }
      }
    }
    assert.deepEqual(unexplained, []);
    assert.ok(d2 > 0, 'D2 appears');
    assert.ok(d3 > 0, 'D3 appears');
  });
});
