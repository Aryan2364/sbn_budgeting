import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { can, canAny, canPick, scopesFor, toMyAccess, type AccessContext } from '../../src/access/access-context';
import { assertAuditEntry, permissionsSnapshot, targetTypeOf } from '../../src/access/audit';
import { checkRoutes, type RouteHandler } from '../../src/access/boot-guard';
import { PERMISSION_KEYS, type PermissionKey } from '../../src/access/catalogue';
import type { AccessDeclaration } from '../../src/access/decorators';
import { generatedPath, renderPermissionKeys } from '../../src/access/keys-script';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Public } from '../../src/common/public.decorator';
import { Can, SignedIn } from '../../src/access/decorators';
import { PermissionGuard, UNDECLARED_REASON, decide, reasonFor } from '../../src/access/permission.guard';
import { buildRoleMap, effectivePermissions } from '../../src/access/role-map.service';
import { SEED_ROLE_IDS } from '../../src/access/seed-roles';

/**
 * The access runtime without a database (access plan P2a): the role
 * map, effective permissions, MyAccess, route declarations, the guard's
 * decision, the audit entry rules and the generated keys.
 */

const STAFF = SEED_ROLE_IDS.budget_staff;
const MEMBER = SEED_ROLE_IDS.complaints_member;
const ADMIN = SEED_ROLE_IDS.admin;

const map = buildRoleMap({
  version: '7',
  admin_ids: [ADMIN],
  grants: [
    [STAFF, 'budget.expenses.view', 'all'],
    [STAFF, 'budget.expenses.edit', 'own'],
    [STAFF, 'budget.projects.view', 'team'],
    [MEMBER, 'complaints.complaints.view', 'own'],
    [MEMBER, 'budget.expenses.edit', 'units'],
    [STAFF, 'budget.expenses.retired_key', 'all'],
    [STAFF, 'budget.expenses.view', 'selected_sites'],
  ],
});

function ctx(roleIds: string[]): AccessContext {
  return { userId: 'u', roleIds, version: map.version, perms: effectivePermissions(map, roleIds) };
}

describe('role map', () => {
  it('reads the version as a number', () => {
    assert.equal(map.version, 7);
  });

  it('drops and counts keys and scopes the code does not know (R5)', () => {
    assert.deepEqual([...map.unknownKeys.entries()].sort(), [
      ['budget.expenses.retired_key', 1],
      ['budget.expenses.view', 1],
    ]);
    assert.deepEqual([...map.roles.get(STAFF)!.get('budget.expenses.view')!], ['all']);
  });

  it('computes Admin: every catalogue key at All, access.rights.manage included, with no rows (R4)', () => {
    const admin = map.roles.get(ADMIN)!;
    assert.equal(admin.size, PERMISSION_KEYS.length);
    for (const key of PERMISSION_KEYS) assert.deepEqual([...admin.get(key)!], ['all'], key);
    assert.ok(can(ctx([ADMIN]), 'access.rights.manage'));
  });

  it('takes the union over roles (plan 3.4.3)', () => {
    const c = ctx([STAFF, MEMBER]);
    assert.deepEqual([...scopesFor(c, 'budget.expenses.edit')].sort(), ['own', 'units']);
    assert.ok(can(c, 'complaints.complaints.view'));
  });

  it("adds a viewed section's own Pick at the same scope (3.4.6), and every pick-for-everyone at All", () => {
    const c = ctx([STAFF]);
    assert.deepEqual([...scopesFor(c, 'budget.projects.pick')], ['team']);
    for (const key of ['budget.cost_heads.pick', 'complaints.categories.pick', 'platform.designations.pick', 'platform.locations.pick'] as const) {
      assert.deepEqual([...scopesFor(c, key)], ['all'], key);
    }
    // Viewing expenses gives no Pick: the expenses section has none.
    assert.equal(scopesFor(c, 'budget.sites.pick').size, 0);
  });

  it('a person with no roles holds only the pick-for-everyone Picks', () => {
    const c = ctx([]);
    assert.deepEqual([...c.perms.keys()].sort(), [
      'budget.cost_heads.pick',
      'complaints.categories.pick',
      'platform.designations.pick',
      'platform.locations.pick',
    ]);
    assert.equal(can(c, 'budget.expenses.view'), false);
    assert.equal(canAny(c, ['budget.expenses.view', 'complaints.complaints.view']), false);
    assert.ok(canPick(c, 'budget.cost_heads'));
    assert.equal(canPick(c, 'budget.sites'), false);
  });

  it('an unknown role id grants nothing beyond the everyone Picks', () => {
    assert.equal(ctx(['00000000-0000-4000-8000-00000000ffff']).perms.size, 4);
  });
});

describe('MyAccess (R3, backend kit 8.1)', () => {
  it('is exactly version, permissions and units, with scopes in R1 order and no role, label or reason', () => {
    const me = toMyAccess(ctx([STAFF, MEMBER]), ['b', 'a']);
    assert.deepEqual(Object.keys(me).sort(), ['permissions', 'units', 'version']);
    assert.equal(me.version, 7);
    assert.deepEqual(me.units, ['a', 'b']);
    assert.deepEqual(me.permissions['budget.expenses.edit'], ['own', 'units']);
    const text = JSON.stringify(me);
    for (const word of ['Budget staff', 'Complaints member', 'Admin', 'role', 'label', 'reason', STAFF, MEMBER]) {
      assert.ok(!text.includes(word), `MyAccess must not carry "${word}"`);
    }
    for (const key of Object.keys(me.permissions)) assert.ok(PERMISSION_KEYS.includes(key as PermissionKey), key);
  });
});

describe('route declarations (boot validation, plan 6.1.3)', () => {
  const h = (route: string, declarations: AccessDeclaration[], isPublic = false): RouteHandler => ({
    route,
    isPublic,
    declarations,
  });
  const lenient = { requireDeclarations: false, requirePickRoutes: false };
  const strict = { requireDeclarations: true, requirePickRoutes: true };

  it('refuses several declarations on one handler', () => {
    const r = checkRoutes(
      [
        h('GET /a', [{ kind: 'signedIn' }, { kind: 'can', keys: ['budget.expenses.view'] }]),
        h('POST /login', [{ kind: 'signedIn' }], true),
      ],
      lenient,
    );
    assert.equal(r.errors.length, 2);
    assert.match(r.errors[0]!, /GET \/a carries 2 access declarations/);
    assert.match(r.errors[1]!, /POST \/login carries 2/);
  });

  it('refuses a key or a Pick no catalogue declares', () => {
    const r = checkRoutes(
      [
        h('GET /a', [{ kind: 'can', keys: ['budget.expnses.view' as PermissionKey] }]),
        h('GET /b', [{ kind: 'pickOf', section: 'budget.expenses' as 'budget.sites' }]),
      ],
      lenient,
    );
    assert.equal(r.errors.length, 2);
    assert.match(r.errors[0]!, /budget\.expnses\.view/);
    assert.match(r.errors[1]!, /@PickOf\('budget\.expenses'\)/);
  });

  it('lists a handler with none, and refuses it only in strict mode (from P2b)', () => {
    const handlers = [h('GET /a', []), h('POST /login', [], true)];
    assert.deepEqual(checkRoutes(handlers, lenient), { errors: [], warnings: [], undeclared: ['GET /a'] });
    const r = checkRoutes(handlers, strict);
    assert.ok(r.errors.some((e) => /GET \/a carries none/.test(e)));
    // Strict also wants every needed Pick to have a route, and warns about unused actions.
    assert.ok(r.errors.some((e) => /The Pick of "budget.sites" is needed/.test(e)));
    assert.ok(r.warnings.some((w) => /"budget.expenses.edit" is used by no route/.test(w)));
  });
});

describe('the route guard decision', () => {
  it('allows signed-in, and decides Can, CanAny and PickOf from the context', () => {
    const c = ctx([STAFF]);
    assert.deepEqual(decide({ kind: 'signedIn' }, c), { allowed: true });
    assert.deepEqual(decide({ kind: 'can', keys: ['budget.expenses.edit'] }, c), { allowed: true });
    assert.deepEqual(decide({ kind: 'can', keys: ['budget.expenses.delete'] }, c), {
      allowed: false,
      permission: 'budget.expenses.delete',
      reason: 'Only people allowed to delete expenses can do this.',
    });
    assert.equal(decide({ kind: 'canAny', keys: ['budget.expenses.delete', 'budget.expenses.view'] }, c).allowed, true);
    assert.equal(decide({ kind: 'pickOf', section: 'budget.projects' }, c).allowed, true);
    assert.equal(decide({ kind: 'pickOf', section: 'budget.sites' }, c).allowed, false);
  });

  it('builds the reason from the label, never a role (kit 26.2)', () => {
    assert.equal(reasonFor('budget.sites.pick'), 'Only people allowed to pick sites can do this.');
    assert.equal(reasonFor('access.rights.manage'), "Only people allowed to manage roles and people's access can do this.");
  });

});

describe('PermissionGuard decides every route (P9)', () => {
  class Routes {
    @Can('budget.expenses.view')
    view(): void {}

    @Can('budget.expenses.delete')
    remove(): void {}

    // Any signed-in user: the caller's own data.
    @SignedIn()
    me(): void {}

    @Public()
    login(): void {}

    undeclared(): void {}

    @Can('budget.expenses.view')
    @SignedIn()
    twice(): void {}
  }
  const guard = new PermissionGuard(new Reflector());
  const staff = ctx([STAFF]);

  function run(name: keyof Routes, access: AccessContext | undefined): boolean {
    const handler = Routes.prototype[name] as unknown as () => void;
    const context = {
      getHandler: () => handler,
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => ({ access }) }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context);
  }

  function refusal(name: keyof Routes, access: AccessContext | undefined): unknown {
    try {
      run(name, access);
    } catch (error) {
      assert.ok(error instanceof ForbiddenException, `${name}: expected a 403`);
      return error.getResponse();
    }
    assert.fail(`${name}: expected a 403`);
  }

  it('allows a held key, signed-in routes and public routes', () => {
    assert.equal(run('view', staff), true);
    assert.equal(run('me', staff), true);
    assert.equal(run('login', undefined), true);
  });

  it('refuses a key not held with 403 naming the permission, never a role (R7, kit 26.2)', () => {
    assert.deepEqual(refusal('remove', staff), {
      error: 'forbidden',
      permission: 'budget.expenses.delete',
      reason: 'Only people allowed to delete expenses can do this.',
      message: 'Only people allowed to delete expenses can do this.',
    });
  });

  it('fails closed: no declaration, several declarations, or no access context', () => {
    assert.equal((refusal('undeclared', staff) as { reason: string }).reason, UNDECLARED_REASON);
    assert.equal((refusal('twice', staff) as { reason: string }).reason, UNDECLARED_REASON);
    assert.equal((refusal('view', undefined) as { reason: string }).reason, 'Sign in to continue.');
  });
});

describe('access/audit.ts', () => {
  it('records each action against its target type', () => {
    assert.equal(targetTypeOf('role.permissions_changed'), 'role');
    assert.equal(targetTypeOf('user.role_added'), 'user');
    assert.equal(targetTypeOf('unit.lead_changed'), 'unit');
  });

  it('refuses an entry History could not read', () => {
    const base = { actor: { id: null, name: 'System' }, target: { id: 'x', name: 'X' } };
    assert.throws(() => assertAuditEntry({ ...base, action: 'user.role_added' }), /needs the role/);
    assert.throws(() => assertAuditEntry({ ...base, action: 'user.renamed' as 'user.activated' }), /Unknown/);
    assert.throws(
      () => assertAuditEntry({ ...base, actor: { id: null, name: ' ' }, action: 'user.activated' }),
      /actor's name/,
    );
    assert.doesNotThrow(() => assertAuditEntry({ ...base, action: 'user.activated' }));
  });

  it('snapshots a full permission set, keys sorted, scopes in R1 order', () => {
    assert.deepEqual(
      permissionsSnapshot([
        { key: 'budget.sites.pick', scope: 'all' },
        { key: 'budget.expenses.edit', scope: 'all' },
        { key: 'budget.sites.pick', scope: 'own' },
      ]),
      { permissions: { 'budget.expenses.edit': ['all'], 'budget.sites.pick': ['own', 'all'] } },
    );
  });
});

describe('npm run access:keys (R3, self-check A6)', () => {
  it('frontend/lib/permission-keys.ts is current', () => {
    const onDisk = readFileSync(generatedPath(), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(onDisk, renderPermissionKeys(), 'run `npm run access:keys` in backend/');
  });

  it('carries every key and its label, in catalogue order', () => {
    const text = renderPermissionKeys();
    let last = -1;
    for (const key of PERMISSION_KEYS) {
      const at = text.indexOf(`  | '${key}'`);
      assert.ok(at > last, `${key} missing or out of order`);
      last = at;
    }
    assert.match(text, /'budget\.expenses\.edit': 'edit expenses',/);
    assert.match(text, /'budget\.sites\.change_people': 'change a site\\'s manager or supervisor',/);
  });
});
