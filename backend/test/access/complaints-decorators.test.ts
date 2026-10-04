import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { METHOD_METADATA } from '@nestjs/common/constants';

import { checkRoutes, type RouteHandler } from '../../src/access/boot-guard';
import { declarationsOf, type AccessDeclaration } from '../../src/access/decorators';
import { ComplaintCategoriesController } from '../../src/complaint-categories/complaint-categories.controller';
import { ComplaintsController } from '../../src/complaints/complaints.controller';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { SKIP_REASON, dbTestsEnabled, openScratchDatabase, type ScratchDb } from './support';

/**
 * Access plan P2b, complaints lane ("Done when"):
 *   - every complaints, complaint-categories and notifications handler
 *     carries its new declaration beside the old one, with the key the
 *     plan's route column (5.3.2, corrected by RESOLUTIONS C1) names;
 *   - boot validation passes for those handlers, strictly;
 *   - across the equivalence matrix on these routes, with the decision
 *     23 mapping applied (plan 6.3.1), the shadow guard disagrees with
 *     the old guard ONLY where the plan names the difference: D2
 *     (a platform-admin-only person maps to Admin) and D3 (the full
 *     category list needs `manage`; everyone else uses the Pick).
 */

const can = (key: string): AccessDeclaration => ({ kind: 'can', keys: [key] }) as AccessDeclaration;
const signedIn: AccessDeclaration = { kind: 'signedIn' };

/** handler -> its one declaration (plan 5.3.2; C1: approve covers approve and send back, work covers start and resolve). */
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
  [ComplaintsController, 'approve', can('complaints.complaints.approve')],
  [ComplaintsController, 'sendBack', can('complaints.complaints.approve')],
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

/** The complaints lane's route prefixes, as the harness discovers them. */
const LANE_PREFIXES = ['/api/complaints', '/api/complaint-categories', '/api/notifications'];
const isLaneRoute = (path: string): boolean =>
  LANE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

/** A shadow line: "GET /api/x/<uuid> user=<id> old=allow new=deny permission=<key>". */
interface ShadowLine {
  method: string;
  path: string;
  user: string;
  old: string;
  next: string;
  permission?: string;
}
function parseShadow(line: string): ShadowLine {
  const m = /^(\S+) (\S+) user=(\S+) old=(\S+) new=(\S+)(?: permission=(\S+))?$/.exec(line);
  assert.ok(m, `unparseable shadow line: ${line}`);
  return { method: m[1]!, path: m[2]!, user: m[3]!, old: m[4]!, next: m[5]!, permission: m[6] };
}

describe('complaints lane: shadow guard agrees with the old guard (P2b)', { skip: dbTestsEnabled ? false : SKIP_REASON }, () => {
  let db: ScratchDb;
  let harness: import('../support/app').HarnessApp;

  before(async () => {
    db = await openScratchDatabase('p2b_complaints', { fixtures: true });
    const { resyncAccessMapping } = await import('../../src/db/map-access-levels');
    await resyncAccessMapping(db.client, { apply: true });
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.pathname = `/${db.name}`;
    process.env.TEST_DATABASE_URL = url.toString();
    const { startHarnessApp } = await import('../support/app');
    harness = await startHarnessApp();
  });

  after(async () => {
    await harness?.close();
    await db?.close();
  });

  it('every disagreement on a complaints-lane route is D2 or D3, and nothing else', async () => {
    const { discoverRoutes } = await import('../support/app');
    const { runMatrix } = await import('../equivalence/matrix');
    const { U } = await import('../equivalence/fixtures');
    const { shadowDisagreements } = await import('../../src/access/permission.guard');

    const routes = discoverRoutes(harness.app).filter((r) => isLaneRoute(r.path));
    assert.ok(routes.length >= 21, `expected the lane's 21 routes, found ${routes.length}`);

    shadowDisagreements.length = 0;
    const run = await runMatrix(harness, routes, db.client);
    const problems = Object.entries(run.cases).filter(([, c]) => c.status === 'NO-CASE' || c.status === 'ERROR');
    assert.deepEqual(problems, [], 'every lane route ran');

    const lines = shadowDisagreements.map(parseShadow).filter((l) => isLaneRoute(l.path));
    assert.ok(shadowDisagreements.length < 1000, 'the shadow log did not overflow its cap');

    // Complaints admins (directly, or through all_admin) manage categories today.
    const categoryManagers = new Set([U.complaints_admin, U.all_admin]);
    const unexplained = lines.filter((l) => {
      // D2: the platform-admin-only person maps to Admin and gains Complaints.
      if (l.user === U.platform_admin && l.old === 'deny' && l.next === 'allow') return false;
      // D3: reading the full category list needs manage from P9.
      if (
        l.method === 'GET' &&
        /^\/api\/complaint-categories(\/[^/]+)?$/.test(l.path) &&
        l.old === 'allow' &&
        l.next === 'deny' &&
        l.permission === 'complaints.categories.manage' &&
        !categoryManagers.has(l.user)
      ) {
        return false;
      }
      return true;
    });
    assert.deepEqual(unexplained, []);
  });
});
