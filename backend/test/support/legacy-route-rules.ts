/**
 * A FROZEN copy of the route rules the old ModuleAccessGuard applied
 * (the @ModuleAccess / @ModuleRole decorators), as they stood at the
 * last commit before the switch-over (3afca2c, access plan P9). P9
 * deleted the guard and the decorators; this file keeps their answer
 * so the route tests can still prove that the permission guard, with
 * today's levels mapped to the seed roles (plan 5.4), answers exactly
 * as they did, apart from the intended differences (plan 6.3.3).
 *
 * Like legacy-screen-rules.ts, it is never edited to match new code. It
 * was extracted from that commit's compiled metadata, one entry per
 * route that existed before roles (the /pick and /access routes never
 * had an old rule). Every requirement must pass: the class-level one
 * ("budget users only") and the handler-level one ("budget admins only").
 * An empty list means the old guard let any signed-in user in.
 */

export type LegacyModule = 'platform' | 'budget' | 'complaints';

export interface ModuleRequirement {
  module: LegacyModule;
  /** Empty = any level in the module is enough. */
  roles: string[];
}

/** "METHOD /path" (no /api prefix) -> the old requirements. */
export const LEGACY_ROUTE_RULES: Readonly<Record<string, readonly ModuleRequirement[]>> = {
  'DELETE /complaint-categories/:id': [{ module: 'complaints', roles: [] }, { module: 'complaints', roles: ['admin'] }],
  'DELETE /cost-heads/:id': [{ module: 'budget', roles: [] }, { module: 'budget', roles: ['admin'] }],
  'DELETE /designations/:id': [{ module: 'platform', roles: ['admin'] }],
  'DELETE /expenses/:id': [{ module: 'budget', roles: [] }, { module: 'budget', roles: ['admin'] }],
  'DELETE /locations/:id': [{ module: 'platform', roles: ['admin'] }],
  'DELETE /projects/:id': [{ module: 'budget', roles: [] }, { module: 'budget', roles: ['admin'] }],
  'DELETE /site-locations/:id': [{ module: 'platform', roles: ['admin'] }],
  'DELETE /sites/:id': [{ module: 'budget', roles: [] }, { module: 'budget', roles: ['admin'] }],
  'DELETE /sites/:id/project': [{ module: 'budget', roles: [] }],
  'DELETE /users/:id': [{ module: 'platform', roles: ['admin'] }],
  'GET /auth/me': [],
  'GET /complaint-categories': [{ module: 'complaints', roles: [] }],
  'GET /complaint-categories/:id': [{ module: 'complaints', roles: [] }],
  'GET /complaints': [{ module: 'complaints', roles: [] }],
  'GET /complaints/:id': [{ module: 'complaints', roles: [] }],
  'GET /complaints/:id/photos/:photoId': [{ module: 'complaints', roles: [] }],
  'GET /complaints/counts': [{ module: 'complaints', roles: [] }],
  'GET /complaints/sites': [{ module: 'complaints', roles: [] }],
  'GET /complaints/summary': [{ module: 'complaints', roles: [] }],
  'GET /cost-heads': [{ module: 'budget', roles: [] }],
  'GET /cost-heads/:id': [{ module: 'budget', roles: [] }],
  'GET /designations': [],
  'GET /designations/:id': [],
  'GET /expenses': [{ module: 'budget', roles: [] }],
  'GET /expenses/:id': [{ module: 'budget', roles: [] }],
  'GET /locations': [],
  'GET /locations/:id': [],
  'GET /notifications': [],
  'GET /projects': [{ module: 'budget', roles: [] }],
  'GET /projects/:id': [{ module: 'budget', roles: [] }],
  'GET /reports/variance': [{ module: 'budget', roles: [] }],
  'GET /reports/variance/head-periods': [{ module: 'budget', roles: [] }],
  'GET /reports/variance/periods': [{ module: 'budget', roles: [] }],
  'GET /reports/variance/periods-summary': [{ module: 'budget', roles: [] }],
  'GET /reports/variance/sites/:siteId': [{ module: 'budget', roles: [] }],
  'GET /reports/variance/summary': [{ module: 'budget', roles: [] }],
  'GET /site-locations': [],
  'GET /site-locations/:id': [],
  'GET /sites': [{ module: 'budget', roles: [] }],
  'GET /sites/:id': [{ module: 'budget', roles: [] }],
  'GET /sites/:siteId/budget': [{ module: 'budget', roles: [] }],
  'GET /users': [{ module: 'platform', roles: ['admin'] }],
  'GET /users/:id': [{ module: 'platform', roles: ['admin'] }],
  'GET /users/picker': [],
  'PATCH /complaint-categories/:id': [{ module: 'complaints', roles: [] }, { module: 'complaints', roles: ['admin'] }],
  'PATCH /cost-heads/:id': [{ module: 'budget', roles: [] }, { module: 'budget', roles: ['admin'] }],
  'PATCH /designations/:id': [{ module: 'platform', roles: ['admin'] }],
  'PATCH /expenses/:id': [{ module: 'budget', roles: [] }],
  'PATCH /locations/:id': [{ module: 'platform', roles: ['admin'] }],
  'PATCH /projects/:id': [{ module: 'budget', roles: [] }],
  'PATCH /site-locations/:id': [{ module: 'platform', roles: ['admin'] }],
  'PATCH /sites/:id': [{ module: 'budget', roles: [] }],
  'PATCH /users/:id': [{ module: 'platform', roles: ['admin'] }],
  'POST /auth/login': [],
  'POST /complaint-categories': [{ module: 'complaints', roles: [] }, { module: 'complaints', roles: ['admin'] }],
  'POST /complaints': [{ module: 'complaints', roles: [] }],
  'POST /complaints/:id/approve': [{ module: 'complaints', roles: [] }],
  'POST /complaints/:id/comments': [{ module: 'complaints', roles: [] }],
  'POST /complaints/:id/reassign': [{ module: 'complaints', roles: [] }],
  'POST /complaints/:id/resolve': [{ module: 'complaints', roles: [] }],
  'POST /complaints/:id/send-back': [{ module: 'complaints', roles: [] }],
  'POST /complaints/:id/start': [{ module: 'complaints', roles: [] }],
  'POST /cost-heads': [{ module: 'budget', roles: [] }, { module: 'budget', roles: ['admin'] }],
  'POST /designations': [{ module: 'platform', roles: ['admin'] }],
  'POST /expenses': [{ module: 'budget', roles: [] }],
  'POST /locations': [{ module: 'platform', roles: ['admin'] }],
  'POST /notifications/:id/read': [],
  'POST /notifications/read-all': [],
  'POST /projects': [{ module: 'budget', roles: [] }],
  'POST /projects/:id/unlink-sites': [{ module: 'budget', roles: [] }],
  'POST /site-locations': [{ module: 'platform', roles: ['admin'] }],
  'POST /sites': [{ module: 'budget', roles: [] }],
  'POST /users': [{ module: 'platform', roles: ['admin'] }],
  'POST /users/import/commit': [{ module: 'platform', roles: ['admin'] }],
  'POST /users/import/preview': [{ module: 'platform', roles: ['admin'] }],
  'PUT /sites/:siteId/budget': [{ module: 'budget', roles: [] }, { module: 'budget', roles: ['admin', 'staff'] }],
};

/** Today's rule, exactly as ModuleAccessGuard applied it. */
export function legacyAllows(
  user: { modules?: Partial<Record<LegacyModule, string>> } | undefined,
  requirements: readonly ModuleRequirement[],
): boolean {
  return requirements.every((req) => {
    const role = user?.modules?.[req.module];
    return Boolean(role) && (req.roles.length === 0 || req.roles.includes(role!));
  });
}

/** The old rule for one route, or a thrown error when the route did not exist before roles. */
export function legacyRuleFor(route: string): readonly ModuleRequirement[] {
  const rule = LEGACY_ROUTE_RULES[route];
  if (!rule) throw new Error(`${route} has no frozen legacy rule: it did not exist before roles.`);
  return rule;
}
