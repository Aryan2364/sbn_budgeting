import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import type { AccessContext } from '../../src/access/access-context';
import { checkRoutes, type RouteHandler } from '../../src/access/boot-guard';
import { deriveRoleRows } from '../../src/access/catalogue';
import { declarationsOf, type AccessDeclaration } from '../../src/access/decorators';
import { decide } from '../../src/access/permission.guard';
import { buildRoleMap, effectivePermissions } from '../../src/access/role-map.service';
import { SEED_ROLES, type LegacyModule } from '../../src/access/seed-roles';
import { AuthController } from '../../src/auth/auth.controller';
import type { AuthUser } from '../../src/common/current-user';
import { IS_PUBLIC } from '../../src/common/public.decorator';
import { DesignationsController } from '../../src/designations/designations.controller';
import { LocationsController } from '../../src/locations/locations.controller';
import { UsersImportController } from '../../src/users/users-import.controller';
import { UsersController } from '../../src/users/users.controller';
import { LEGACY_ROUTE_RULES, legacyAllows, type ModuleRequirement } from '../support/legacy-route-rules';

/**
 * P2b, platform lane (access plan 5.3.3, 5.3.5, 6.1.3), and P9: every
 * platform handler carries its one declaration, which the permission
 * guard decides, and it agrees with the old guard's rule (frozen in
 * test/support/legacy-route-rules.ts since P9 deleted the old guard)
 * for every one of today's level combinations, apart from the intended
 * differences D3 and D4 (plan 6.3.3), which take effect at P9 and are
 * listed here exactly so a new disagreement fails.
 */

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD'];
type Ctor = new (...args: never[]) => unknown;

interface Handler {
  route: string;
  isPublic: boolean;
  declarations: readonly AccessDeclaration[];
  legacy: ModuleRequirement[];
}

function handlersOf(controller: Ctor): Handler[] {
  const raw = Reflect.getMetadata(PATH_METADATA, controller) as string | string[];
  const base = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const proto = controller.prototype as Record<string, unknown>;
  const out: Handler[] = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    const fn = proto[name];
    if (name === 'constructor' || typeof fn !== 'function') continue;
    const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
    const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
    if (method === undefined || path === undefined) continue;
    const route = `${METHODS[method]} /${[base, path].map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
    assert.ok(Reflect.getMetadata('moduleAccess', fn) === undefined, `${route} still carries old module metadata`);
    out.push({
      route,
      isPublic: Reflect.getMetadata(IS_PUBLIC, fn) === true,
      declarations: declarationsOf(fn),
      legacy: [...(LEGACY_ROUTE_RULES[route] ?? [])],
    });
  }
  return out;
}

const PLATFORM_CONTROLLERS: Ctor[] = [
  UsersController,
  UsersImportController,
  DesignationsController,
  LocationsController,
  AuthController,
];
const HANDLERS = PLATFORM_CONTROLLERS.flatMap(handlersOf);

/** What each platform route declares (plan 5.3.3, 5.3.5; auth from P2a). */
const EXPECTED: Record<string, string> = {
  'GET /users/picker': 'pickOf platform.people',
  'GET /users': 'can platform.people.view',
  'GET /users/:id': 'can platform.people.view',
  'POST /users': 'can platform.people.create',
  'PATCH /users/:id': 'can platform.people.edit',
  'DELETE /users/:id': 'can platform.people.delete',
  'POST /users/import/preview': 'can platform.people.create',
  'POST /users/import/commit': 'can platform.people.create',
  'GET /designations': 'can platform.designations.manage',
  'GET /designations/:id': 'can platform.designations.manage',
  'POST /designations': 'can platform.designations.manage',
  'PATCH /designations/:id': 'can platform.designations.manage',
  'DELETE /designations/:id': 'can platform.designations.manage',
  'GET /locations': 'can platform.locations.manage',
  'GET /locations/:id': 'can platform.locations.manage',
  'POST /locations': 'can platform.locations.manage',
  'PATCH /locations/:id': 'can platform.locations.manage',
  'DELETE /locations/:id': 'can platform.locations.manage',
  'POST /auth/login': 'public',
  'GET /auth/me': 'signedIn',
};

function describeDeclaration(h: Handler): string {
  if (h.isPublic) return 'public';
  const d = h.declarations[0];
  if (!d) return 'none';
  if (d.kind === 'signedIn') return 'signedIn';
  if (d.kind === 'pickOf') return `pickOf ${d.section}`;
  return `${d.kind} ${d.keys.join(',')}`;
}

/** Today's level combinations, as the equivalence fixtures hold them. */
const PEOPLE: Record<string, Partial<Record<LegacyModule, string>>> = {
  platform_admin: { platform: 'admin' },
  all_admin: { platform: 'admin', budget: 'admin', complaints: 'admin' },
  budget_admin: { budget: 'admin' },
  budget_staff: { budget: 'staff' },
  staff_member: { budget: 'staff', complaints: 'member' },
  complaints_admin: { complaints: 'admin' },
  member: { complaints: 'member' },
  no_module: {},
};

const map = buildRoleMap({
  version: '1',
  admin_ids: SEED_ROLES.filter((r) => r.systemKey === 'admin').map((r) => r.id),
  grants: SEED_ROLES.flatMap((r) =>
    deriveRoleRows(r.grants.map(([key, scope]) => ({ key, scope }))).rows.map(
      (g) => [r.id, g.key, g.scope] as [string, string, string],
    ),
  ),
});

/** The roles the decision 23 mapping gives these levels. */
function contextFor(levels: Partial<Record<LegacyModule, string>>): AccessContext {
  const roleIds = SEED_ROLES.filter((r) => levels[r.heldBy.module] === r.heldBy.role).map((r) => r.id);
  return { userId: 'u', roleIds, version: map.version, perms: effectivePermissions(map, roleIds) };
}

describe('P2b platform lane: declarations', () => {
  it('finds every platform route', () => {
    assert.deepEqual(HANDLERS.map((h) => h.route).sort(), Object.keys(EXPECTED).sort());
  });

  it('gives every handler exactly its planned declaration', () => {
    const actual = Object.fromEntries(HANDLERS.map((h) => [h.route, describeDeclaration(h)]));
    assert.deepEqual(actual, EXPECTED);
  });

  it('the frozen old rule restricted exactly these routes (platform admin only)', () => {
    const before = HANDLERS.filter((h) => h.legacy.length > 0).map((h) => h.route).sort();
    assert.deepEqual(before, [
      'DELETE /designations/:id', 'DELETE /locations/:id', 'DELETE /users/:id',
      'GET /users', 'GET /users/:id',
      'PATCH /designations/:id', 'PATCH /locations/:id', 'PATCH /users/:id',
      'POST /designations', 'POST /locations', 'POST /users',
      'POST /users/import/commit', 'POST /users/import/preview',
    ]);
  });

  it('passes boot validation in strict mode', () => {
    const routes: RouteHandler[] = HANDLERS.map((h) => ({
      route: h.route,
      isPublic: h.isPublic,
      declarations: h.declarations,
    }));
    const result = checkRoutes(routes, { requireDeclarations: true, requirePickRoutes: false });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.undeclared, []);
  });
});

describe('P9 platform lane: the permission guard agrees with the old rule', () => {
  it('agrees for every level combination except D3 and D4', () => {
    const disagreements: string[] = [];
    for (const [person, levels] of Object.entries(PEOPLE)) {
      const user = { modules: levels } as unknown as AuthUser;
      const ctx = contextFor(levels);
      for (const h of HANDLERS) {
        if (h.isPublic) continue;
        const old = legacyAllows(user, h.legacy);
        const now = decide(h.declarations[0]!, ctx).allowed;
        if (old !== now) disagreements.push(`${h.route} ${person} old=${old ? 'allow' : 'deny'}`);
      }
    }

    // D3: the full master lists need manage; today anyone signed in reads them.
    const d3 = ['GET /designations', 'GET /designations/:id', 'GET /locations', 'GET /locations/:id'].flatMap(
      (route) =>
        Object.keys(PEOPLE)
          .filter((p) => !PEOPLE[p]!.platform)
          .map((p) => `${route} ${p} old=allow`),
    );
    // D4: the people picker needs platform.people.pick; only people with no role lose it.
    const d4 = ['GET /users/picker no_module old=allow'];

    assert.deepEqual(disagreements.sort(), [...d3, ...d4].sort());
  });
});
