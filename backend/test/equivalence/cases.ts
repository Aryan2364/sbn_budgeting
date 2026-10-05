import type { Client } from 'pg';

import { FIXTURE_PASSWORD, TINY_PNG } from './fixtures';
import type { RecordType } from './sampling';

/**
 * One case per route variant, per person, per sampled record.
 *
 * Every discovered route must have an entry in ROUTES. A route with no
 * entry is reported (status "NO-CASE") rather than skipped, so a route
 * that exists in only one build shows up as a difference (plan §6.3.1).
 *
 * Write cases send ONE VALID BODY built from the target record, so a
 * refusal can be told apart from a validation error (Nest runs guards
 * before pipes, but record-level checks run inside handlers, after
 * validation: plan §7). PATCH bodies resend the record's current
 * values, so an allowed edit changes nothing and is still a 200. Every
 * request is rolled back (test-tx.ts), so nothing a case writes is seen
 * by the next one.
 */

export interface Person {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface BodyContext {
  world: World;
  user: Person | null;
  /** Path param name -> id. */
  params: Record<string, string>;
}

export interface Multipart {
  fields: Record<string, string>;
  files: Array<{ field: string; filename: string; type: string; data: Buffer }>;
}

export interface Variant {
  /** '' for the plain case. */
  name: string;
  query?: Record<string, string>;
  /** A paginated list: every page is fetched at pageSize=100. */
  list?: boolean;
  json?: (ctx: BodyContext) => Promise<unknown> | unknown;
  multipart?: (ctx: BodyContext) => Promise<Multipart> | Multipart;
}

export interface RouteSpec {
  /** Path param -> what it identifies. `photo` fills both :id and :photoId. */
  params?: Record<string, RecordType>;
  variants: Variant[];
}

/** Read-only lookups on the test database, for building bodies. Cached. */
export class World {
  private cache = new Map<string, unknown>();

  constructor(readonly db: Client) {}

  async one<T>(sql: string, values: unknown[] = []): Promise<T | null> {
    const key = `${sql}\u0000${JSON.stringify(values)}`;
    if (this.cache.has(key)) return this.cache.get(key) as T | null;
    const { rows } = await this.db.query(sql, values);
    const row = (rows[0] as T | undefined) ?? null;
    this.cache.set(key, row);
    return row;
  }

  async id(sql: string, values: unknown[] = []): Promise<string> {
    const row = await this.one<{ id: string }>(sql, values);
    // A missing reference still makes a well-formed body; the route then
    // answers 404/422 the same way in both builds.
    return row?.id ?? '00000000-0000-4000-8000-000000000000';
  }

  firstSite(): Promise<string> {
    return this.id('select id from sites order by id limit 1');
  }
  activeCostHead(): Promise<string> {
    return this.id('select id from cost_heads where is_active order by sort_order, id limit 1');
  }
  /** A site whose supervisor can sign in, so routing can succeed. */
  routableSite(): Promise<string> {
    return this.id(
      `select s.id from sites s join users u on u.id = s.supervisor_id
       where u.can_login order by s.id limit 1`,
    );
  }
  /**
   * An active category. Before migration 0013 this preferred one that
   * needed no approver (raising another could fail for want of one); with
   * approvals gone (A1) any active category raises, and the fixture's
   * "Information" is still the one chosen, so the case is unchanged.
   */
  raisableCategory(): Promise<string> {
    return this.id(
      `select id from complaint_categories where is_active and name = 'Information'
       union all (select id from complaint_categories where is_active order by id limit 1)
       limit 1`,
    );
  }
  anyPerson(): Promise<string> {
    return this.id('select id from users order by id limit 1');
  }
}

const NOTE = 'Harness note';

const nameOnly = (table: string) => async ({ world, params }: BodyContext) => {
  const row = await world.one<{ name: string; is_active: boolean }>(
    `select name, is_active from ${table} where id = $1`,
    [params.id],
  );
  return { name: row?.name ?? 'Harness', isActive: row?.is_active ?? true };
};

const master = (table: string, create: string): Record<string, RouteSpec> => ({
  [`GET /api/${table}`]: { variants: [{ name: '', list: true }] },
  [`POST /api/${table}`]: { variants: [{ name: '', json: () => ({ name: create }) }] },
});

const masterById = (route: string, table: string, type: RecordType): Record<string, RouteSpec> => ({
  [`GET /api/${route}/:id`]: { params: { id: type }, variants: [{ name: '' }] },
  [`PATCH /api/${route}/:id`]: { params: { id: type }, variants: [{ name: '', json: nameOnly(table) }] },
  [`DELETE /api/${route}/:id`]: { params: { id: type }, variants: [{ name: '' }] },
});

/** A role as it stands: its name, description and ticks (stored rows other than Picks). */
async function sameRole(world: World, id: string): Promise<unknown> {
  const row = await world.one<{ name: string; description: string; permissions: Record<string, string> | null }>(
    `select r.name, r.description,
            (select json_object_agg(rp.permission_key, rp.scope) from role_permissions rp
             where rp.role_id = r.id and rp.permission_key not like '%.pick') as permissions
     from roles r where r.id = $1`,
    [id],
  );
  return { name: row?.name ?? 'Harness Role', description: row?.description ?? '', permissions: row?.permissions ?? {} };
}

export const ROUTES: Record<string, RouteSpec> = {
  // ---- auth ---------------------------------------------------------
  'POST /api/auth/login': {
    variants: [
      {
        name: 'own-credentials',
        json: ({ user }) => ({
          login: user?.email ?? user?.phone ?? 'nobody@harness.test',
          password: user ? FIXTURE_PASSWORD : 'wrong-password',
        }),
      },
    ],
  },
  'GET /api/auth/me': { variants: [{ name: '' }] },

  // ---- budget -------------------------------------------------------
  'GET /api/projects': { variants: [{ name: '', list: true }] },
  'POST /api/projects': {
    variants: [{ name: '', json: () => ({ donorName: 'Harness Donor', name: 'Harness Project', plannedTrees: 10 }) }],
  },
  'GET /api/projects/:id': { params: { id: 'project' }, variants: [{ name: '' }] },
  'PATCH /api/projects/:id': {
    params: { id: 'project' },
    variants: [
      {
        name: 'same-values',
        json: async ({ world, params }) => {
          const p = await world.one<{ donor_name: string; name: string; planned_trees: number }>(
            'select donor_name, name, planned_trees from projects where id = $1',
            [params.id],
          );
          return { donorName: p?.donor_name ?? 'x', name: p?.name ?? 'x', plannedTrees: p?.planned_trees ?? 1 };
        },
      },
    ],
  },
  'POST /api/projects/:id/unlink-sites': { params: { id: 'project' }, variants: [{ name: '' }] },
  'DELETE /api/projects/:id': { params: { id: 'project' }, variants: [{ name: '' }] },

  'GET /api/sites': { variants: [{ name: '', list: true }] },
  'POST /api/sites': {
    variants: [
      {
        name: 'no-people',
        json: () => ({ name: 'Harness Site', plannedTrees: 10, plantationStartDate: '2025-08-01' }),
      },
      {
        // Security fix 3: only a budget admin may name a site's people.
        name: 'with-people',
        json: async ({ world }) => ({
          name: 'Harness Site',
          plannedTrees: 10,
          plantationStartDate: '2025-08-01',
          supervisorId: await world.anyPerson(),
        }),
      },
    ],
  },
  'GET /api/sites/:id': { params: { id: 'site' }, variants: [{ name: '' }] },
  'PATCH /api/sites/:id': {
    params: { id: 'site' },
    variants: [
      { name: 'same-people', json: async (ctx) => siteBody(ctx, false) },
      { name: 'change-supervisor', json: async (ctx) => siteBody(ctx, true) },
    ],
  },
  'DELETE /api/sites/:id/project': { params: { id: 'site' }, variants: [{ name: '' }] },
  'DELETE /api/sites/:id': { params: { id: 'site' }, variants: [{ name: '' }] },

  'GET /api/sites/:siteId/budget': { params: { siteId: 'site' }, variants: [{ name: '' }] },
  'PUT /api/sites/:siteId/budget': {
    params: { siteId: 'site' },
    variants: [
      {
        name: '',
        json: async ({ world }) => ({
          cells: [{ costHeadId: await world.activeCostHead(), period: 0, perTreePaise: '100' }],
        }),
      },
    ],
  },

  'GET /api/expenses': { variants: [{ name: '', list: true }] },
  'POST /api/expenses': {
    variants: [
      {
        name: '',
        json: async ({ world }) => ({
          siteId: await world.firstSite(),
          costHeadId: await world.activeCostHead(),
          spentOn: '2025-08-01',
          period: 0,
          amountPaise: '100',
        }),
      },
    ],
  },
  'GET /api/expenses/:id': { params: { id: 'expense' }, variants: [{ name: '' }] },
  'PATCH /api/expenses/:id': {
    params: { id: 'expense' },
    variants: [
      {
        // Security fix 2: the creator or a budget admin.
        name: 'same-values',
        json: async ({ world, params }) => {
          const e = await world.one<Record<string, string | number | null>>(
            `select site_id, cost_head_id, to_char(spent_on, 'YYYY-MM-DD') as spent_on, period,
                    amount_paise::text as amount_paise, bill_number, approved_by, description
             from expenses where id = $1`,
            [params.id],
          );
          if (!e) return { siteId: '00000000-0000-4000-8000-000000000000' };
          return {
            siteId: e.site_id,
            costHeadId: e.cost_head_id,
            spentOn: e.spent_on,
            period: e.period,
            amountPaise: e.amount_paise,
            billNumber: e.bill_number,
            approvedBy: e.approved_by,
            description: e.description,
          };
        },
      },
    ],
  },
  'DELETE /api/expenses/:id': { params: { id: 'expense' }, variants: [{ name: '' }] },

  ...master('cost-heads', 'Harness Cost Head'),
  ...masterById('cost-heads', 'cost_heads', 'cost_head'),

  'GET /api/reports/variance': {
    variants: [
      { name: '', list: true },
      {
        name: 'by-project',
        list: true,
        query: {},
      },
    ],
  },
  'GET /api/reports/variance/summary': { variants: [{ name: '' }] },
  'GET /api/reports/variance/periods': { variants: [{ name: '' }] },
  'GET /api/reports/variance/periods-summary': {
    variants: [{ name: '' }, { name: 'one-site', query: {} }],
  },
  'GET /api/reports/variance/head-periods': {
    variants: [{ name: '' }, { name: 'one-site', query: {} }],
  },
  'GET /api/reports/variance/sites/:siteId': { params: { siteId: 'site' }, variants: [{ name: '' }] },

  // ---- budget Picks (P3b; new-system routes, D7) ---------------------
  'GET /api/pick/budget/projects': {
    variants: [{ name: '' }, { name: 'q', query: { q: 'a' } }],
  },
  'GET /api/pick/budget/sites': {
    variants: [{ name: '' }, { name: 'q', query: { q: 'a' } }],
  },
  'GET /api/pick/budget/cost_heads': {
    variants: [{ name: '' }, { name: 'include-inactive', query: { includeInactive: 'true' } }],
  },

  // ---- platform masters ---------------------------------------------
  ...master('designations', 'Harness Designation'),
  ...masterById('designations', 'designations', 'designation'),
  ...master('locations', 'Harness Location'),
  ...masterById('locations', 'locations', 'location'),
  ...master('site-locations', 'Harness Location'),
  ...masterById('site-locations', 'locations', 'location'),

  // ---- people -------------------------------------------------------
  'GET /api/users': { variants: [{ name: '', list: true }] },
  'GET /api/users/picker': { variants: [{ name: '', list: true }] },

  // ---- platform Picks (P3b; new-system routes, D7) -------------------
  'GET /api/pick/platform/people': {
    variants: [{ name: '' }, { name: 'q', query: { q: 'a' } }, { name: 'can-receive', query: { canReceive: 'true' } }],
  },
  'GET /api/pick/platform/designations': {
    variants: [{ name: '' }, { name: 'include-inactive', query: { includeInactive: 'true' } }],
  },
  'GET /api/pick/platform/locations': {
    variants: [{ name: '' }, { name: 'include-inactive', query: { includeInactive: 'true' } }],
  },
  'POST /api/users': {
    variants: [{ name: '', json: () => ({ name: 'Harness New Person', canLogin: false }) }],
  },
  'GET /api/users/:id': { params: { id: 'user' }, variants: [{ name: '' }] },
  'PATCH /api/users/:id': {
    params: { id: 'user' },
    variants: [
      {
        name: 'same-name',
        json: async ({ world, params }) => {
          const u = await world.one<{ name: string }>('select name from users where id = $1', [params.id]);
          return { name: u?.name ?? 'Harness' };
        },
      },
      {
        // Today's "you can't remove your own platform admin" (422, D5).
        name: 'remove-platform-admin',
        json: () => ({ modules: { platform: null } }),
      },
    ],
  },
  'DELETE /api/users/:id': { params: { id: 'user' }, variants: [{ name: '' }] },
  'POST /api/users/import/preview': {
    variants: [{ name: '', json: () => ({ rows: [{ name: 'Harness Import', phone: '9000000099' }] }) }],
  },
  'POST /api/users/import/commit': {
    variants: [{ name: '', json: () => ({ rows: [{ name: 'Harness Import', phone: '9000000099' }] }) }],
  },

  // ---- the access API (P6; new-system routes, D7) ---------------------
  // Writes resend the record's current state, so an allowed save changes
  // nothing; every request is rolled back all the same.
  'GET /api/access/roles': { variants: [{ name: '', list: true }] },
  'GET /api/access/roles/:id': { params: { id: 'role' }, variants: [{ name: '' }] },
  'POST /api/access/roles': {
    variants: [
      { name: '', json: () => ({ name: 'Harness Role', permissions: { 'budget.expenses.create': 'own' } }) },
    ],
  },
  'PUT /api/access/roles/:id': {
    params: { id: 'role' },
    variants: [{ name: 'same', json: ({ world, params }) => sameRole(world, params.id!) }],
  },
  'DELETE /api/access/roles/:id': { params: { id: 'role' }, variants: [{ name: '' }] },
  'GET /api/access/people': {
    variants: [{ name: '', list: true }, { name: 'active', list: true, query: { status: 'active' } }],
  },
  'GET /api/access/people/:id': { params: { id: 'user' }, variants: [{ name: '' }] },
  'GET /api/access/people/:id/effective': { params: { id: 'user' }, variants: [{ name: '' }] },
  'PUT /api/access/people/:id/access': {
    params: { id: 'user' },
    variants: [
      {
        name: 'same',
        json: async ({ world, params }) => {
          const row = await world.one<{ roleIds: string[]; unitIds: string[]; reportsToId: string | null }>(
            `select coalesce((select array_agg(role_id::text) from user_roles where user_id = $1), '{}') as "roleIds",
                    coalesce((select array_agg(unit_id::text) from user_units where user_id = $1), '{}') as "unitIds",
                    (select reports_to::text from users where id = $1) as "reportsToId"`,
            [params.id],
          );
          return { roleIds: row?.roleIds ?? [], unitIds: row?.unitIds ?? [], reportsToId: row?.reportsToId ?? null };
        },
      },
    ],
  },
  'PUT /api/access/people/:id/active': {
    params: { id: 'user' },
    variants: [
      {
        name: 'same',
        json: async ({ world, params }) => {
          const u = await world.one<{ active: boolean }>('select active from users where id = $1', [params.id]);
          return { active: u?.active ?? true };
        },
      },
    ],
  },
  'GET /api/access/units': { variants: [{ name: '' }] },
  'GET /api/access/history': { variants: [{ name: '', list: true }] },

  // ---- complaints ---------------------------------------------------
  'GET /api/complaints': {
    variants: [
      { name: 'tab-all', list: true, query: { tab: 'all' } },
      { name: 'tab-assigned', list: true, query: { tab: 'assigned' } },
      { name: 'tab-approval', list: true, query: { tab: 'approval' } },
      { name: 'tab-raised', list: true, query: { tab: 'raised' } },
    ],
  },
  'GET /api/complaints/sites': { variants: [{ name: '' }] },
  // The complaints Pick (P3b; a new-system route, D7). Pick for everyone.
  'GET /api/pick/complaints/categories': {
    variants: [
      { name: '' },
      { name: 'q', query: { q: 'approval' } },
      { name: 'include-inactive', query: { includeInactive: 'true' } },
    ],
  },
  'GET /api/complaints/counts': { variants: [{ name: '' }] },
  'GET /api/complaints/summary': { variants: [{ name: '' }] },
  'POST /api/complaints': {
    variants: [
      {
        name: '',
        json: async ({ world }) => ({
          siteId: await world.routableSite(),
          categoryId: await world.raisableCategory(),
          complainantName: 'Harness Complainant',
          complainantPhone: '9825012345',
          description: 'Raised by the access harness',
        }),
      },
    ],
  },
  'GET /api/complaints/:id': { params: { id: 'complaint' }, variants: [{ name: '' }] },
  'GET /api/complaints/:id/photos/:photoId': { params: { id: 'photo' }, variants: [{ name: '' }] },
  'POST /api/complaints/:id/start': { params: { id: 'complaint' }, variants: [{ name: '', json: () => ({}) }] },
  'POST /api/complaints/:id/resolve': {
    params: { id: 'complaint' },
    variants: [
      {
        name: 'note-and-photo',
        multipart: () => ({
          fields: { resolutionNote: NOTE },
          files: [{ field: 'photos', filename: 'fixed.png', type: 'image/png', data: TINY_PNG }],
        }),
      },
    ],
  },
  // POST /:id/approve and /:id/send-back: gone with A1 (migration 0013,
  // intended difference D8). Their baseline cases are matched there.
  'POST /api/complaints/:id/reassign': {
    params: { id: 'complaint' },
    variants: [
      {
        name: 'to-another-supervisor',
        json: async ({ world, params }) => ({
          note: NOTE,
          supervisorId: await world.id(
            `select u.id from users u
               join designations d on d.id = u.designation_id
             where d.seed_key = 'supervisor' and u.can_login
               and u.id <> coalesce((select supervisor_id from complaints where id = $1),
                                    '00000000-0000-4000-8000-000000000000')
             order by u.id limit 1`,
            [params.id],
          ),
        }),
      },
    ],
  },
  'POST /api/complaints/:id/comments': {
    params: { id: 'complaint' },
    variants: [{ name: '', json: () => ({ note: NOTE }) }],
  },

  'GET /api/complaint-categories': { variants: [{ name: '', list: true }] },
  'POST /api/complaint-categories': {
    variants: [{ name: '', json: () => ({ name: 'Harness Category' }) }],
  },
  'GET /api/complaint-categories/:id': { params: { id: 'complaint_category' }, variants: [{ name: '' }] },
  'PATCH /api/complaint-categories/:id': {
    params: { id: 'complaint_category' },
    variants: [
      {
        name: 'same-values',
        json: async ({ world, params }) => {
          // requiresApproval and the approver designation went with A1
          // (migration 0013); the whitelist strips them if sent.
          const c = await world.one<{ name: string; is_active: boolean }>(
            `select name, is_active from complaint_categories where id = $1`,
            [params.id],
          );
          return { name: c?.name ?? 'Harness', isActive: c?.is_active ?? true };
        },
      },
    ],
  },
  'DELETE /api/complaint-categories/:id': { params: { id: 'complaint_category' }, variants: [{ name: '' }] },

  // ---- notifications ------------------------------------------------
  'GET /api/notifications': { variants: [{ name: '' }] },
  'POST /api/notifications/read-all': { variants: [{ name: '' }] },
  'POST /api/notifications/:id/read': { params: { id: 'notification' }, variants: [{ name: '' }] },
};

/** Query strings that need an id from the database. Filled at run time. */
export async function resolveQueries(world: World): Promise<void> {
  const site = await world.firstSite();
  const project = await world.id('select id from projects order by id limit 1');
  const variance = ROUTES['GET /api/reports/variance']!.variants.find((v) => v.name === 'by-project')!;
  variance.query = { projectId: project };
  for (const key of ['GET /api/reports/variance/periods-summary', 'GET /api/reports/variance/head-periods']) {
    const v = ROUTES[key]!.variants.find((x) => x.name === 'one-site')!;
    v.query = { siteId: site };
  }
}

async function siteBody({ world, params }: BodyContext, changeSupervisor: boolean): Promise<unknown> {
  const s = await world.one<Record<string, string | number | null>>(
    `select project_id, name, location_id, donor_name, planned_trees,
            to_char(plantation_start_date, 'YYYY-MM-DD') as start,
            to_char(plantation_complete_date, 'YYYY-MM-DD') as complete,
            manager_id, supervisor_id
     from sites where id = $1`,
    [params.id],
  );
  if (!s) return { name: 'x', plannedTrees: 1, plantationStartDate: '2025-01-01' };
  let supervisorId = s.supervisor_id;
  if (changeSupervisor) {
    supervisorId = await world.id(
      'select id from users where id is distinct from $1::uuid order by id limit 1',
      [s.supervisor_id],
    );
  }
  return {
    projectId: s.project_id,
    name: s.name,
    siteLocationId: s.location_id,
    donorName: s.donor_name,
    plannedTrees: s.planned_trees,
    plantationStartDate: s.start,
    plantationCompleteDate: s.complete,
    managerId: s.manager_id,
    supervisorId,
  };
}
