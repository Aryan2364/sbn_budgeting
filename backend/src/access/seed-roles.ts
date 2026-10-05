import type { ClientBase } from 'pg';

import type { PermissionKey, Scope } from './catalogue';

/**
 * The seed roles and the mapping from today's levels (decision 23,
 * access plan section 5.4, corrected by RESOLUTIONS PQ1, C1, C2).
 *
 * The ids are FIXED and inserted by migrations/0012_access.sql (C2).
 * Admin also carries system_key 'admin'; the four mapped roles carry no
 * system_key and are found by these ids alone. The mapping re-sync
 * (src/db/map-access-levels.ts) never touches a role whose id is not
 * one of these. The people import's default role is COMPLAINTS_MEMBER
 * (C3). Names are O2's; the owner renames the roles later, and the
 * re-sync never renames them back.
 *
 * Only ticked permissions are listed. Picks, and see amounts where a
 * permission needs it, are derived by deriveRoleRows exactly as a role
 * save derives them, so the stored rows are what the role editor would
 * store.
 */

export const SEED_ROLE_IDS = {
  admin: '5eed0000-0000-4000-8000-000000000001',
  budget_admin: '5eed0000-0000-4000-8000-000000000002',
  budget_staff: '5eed0000-0000-4000-8000-000000000003',
  complaints_admin: '5eed0000-0000-4000-8000-000000000004',
  complaints_member: '5eed0000-0000-4000-8000-000000000005',
} as const;

export type SeedRoleId = keyof typeof SEED_ROLE_IDS;

/** Today's levels, as rows of user_module_access. */
export type LegacyModule = 'platform' | 'budget' | 'complaints';
export interface LegacyLevel {
  module: LegacyModule;
  role: string;
}

export interface SeedRole {
  seed: SeedRoleId;
  id: string;
  /** The name and description the migration inserts. */
  name: string;
  description: string;
  /** 'admin' on Admin only (R4, C2). */
  systemKey: 'admin' | null;
  /** Who holds it: everyone with this user_module_access row. */
  heldBy: LegacyLevel;
  /** Ticked permissions. Empty for Admin, which is computed and holds no rows. */
  grants: ReadonlyArray<readonly [PermissionKey, Scope]>;
}

const all = (...keys: PermissionKey[]): Array<readonly [PermissionKey, Scope]> =>
  keys.map((k) => [k, 'all'] as const);
const own = (...keys: PermissionKey[]): Array<readonly [PermissionKey, Scope]> =>
  keys.map((k) => [k, 'own'] as const);
const team = (...keys: PermissionKey[]): Array<readonly [PermissionKey, Scope]> =>
  keys.map((k) => [k, 'team'] as const);

export const SEED_ROLES: readonly SeedRole[] = [
  {
    seed: 'admin',
    id: SEED_ROLE_IDS.admin,
    name: 'Admin',
    description:
      'Everything, everywhere, including managing access. Holds every permission automatically.',
    systemKey: 'admin',
    // Revised O1: every platform admin maps to Admin.
    heldBy: { module: 'platform', role: 'admin' },
    grants: [],
  },
  {
    seed: 'budget_admin',
    id: SEED_ROLE_IDS.budget_admin,
    name: 'Budget administrator',
    description:
      'What a budget admin could do before roles: all of Budget, including deleting and cost heads.',
    systemKey: null,
    // PQ1: a budget admin who is not a platform admin lands here. One
    // who is also a platform admin gets Admin AND this role (plan 5.4,
    // "people with several levels get several roles").
    heldBy: { module: 'budget', role: 'admin' },
    grants: all(
      'budget.projects.view',
      'budget.projects.create',
      'budget.projects.edit',
      'budget.projects.delete',
      'budget.sites.view',
      'budget.sites.create',
      'budget.sites.edit',
      'budget.sites.change_people',
      'budget.sites.delete',
      'budget.budgets.view',
      'budget.budgets.edit',
      'budget.expenses.view',
      'budget.expenses.create',
      'budget.expenses.edit',
      'budget.expenses.delete',
      'budget.cost_heads.manage',
      'budget.reports.view',
      'budget.amounts.see',
    ),
  },
  {
    seed: 'budget_staff',
    id: SEED_ROLE_IDS.budget_staff,
    name: 'Budget staff',
    description:
      'What budget staff could do before roles: projects, sites, budgets and expenses, editing only their own expenses.',
    systemKey: null,
    heldBy: { module: 'budget', role: 'staff' },
    grants: [
      ...all(
        'budget.projects.view',
        'budget.projects.create',
        'budget.projects.edit',
        'budget.sites.view',
        'budget.sites.create',
        'budget.sites.edit',
        'budget.budgets.view',
        'budget.budgets.edit',
        'budget.expenses.view',
        'budget.expenses.create',
        'budget.reports.view',
        'budget.amounts.see',
      ),
      // O10 Q1: staff edit only their own expenses (security fix 3).
      ...own('budget.expenses.edit'),
    ],
  },
  {
    seed: 'complaints_admin',
    id: SEED_ROLE_IDS.complaints_admin,
    name: 'Complaints administrator',
    description:
      'What a complaints admin could do before roles: every complaint, and the complaint categories.',
    systemKey: null,
    heldBy: { module: 'complaints', role: 'admin' },
    grants: all(
      'complaints.complaints.view',
      'complaints.complaints.raise',
      'complaints.complaints.comment',
      'complaints.complaints.work',
      'complaints.complaints.reassign',
      'complaints.categories.manage',
    ),
  },
  {
    seed: 'complaints_member',
    id: SEED_ROLE_IDS.complaints_member,
    name: 'Complaints member',
    description:
      'What a complaints member could do before roles: raise complaints, and work on the ones that name them.',
    systemKey: null,
    heldBy: { module: 'complaints', role: 'member' },
    // Owner decision, 5 Oct 2026 (migration 0013): view and comment at
    // Team, so who sees a complaint follows the reports_to chain; work
    // and reassign stay at Own (C1). Raise still reaches every site
    // through its declared Pick at All (O5); reassign at Own is the
    // complaint's manager. There is no approve key.
    grants: [
      ...team('complaints.complaints.view', 'complaints.complaints.comment'),
      ...own('complaints.complaints.raise', 'complaints.complaints.work', 'complaints.complaints.reassign'),
    ],
  },
];

export const SEED_ROLE_ID_SET: ReadonlySet<string> = new Set(Object.values(SEED_ROLE_IDS));

/** The people import's default role (C3), looked up by id. */
export const IMPORT_DEFAULT_ROLE_ID = SEED_ROLE_IDS.complaints_member;

/**
 * Inserts a missing seed role exactly as migration 0012 does, for the
 * mapping re-sync. Kept here so system_key is written only inside
 * src/access (backend kit 13, check 2).
 */
export async function insertSeedRole(db: Pick<ClientBase, 'query'>, seed: SeedRole): Promise<void> {
  await db.query('insert into roles (id, name, description, system_key) values ($1, $2, $3, $4)', [
    seed.id,
    seed.name,
    seed.description,
    seed.systemKey,
  ]);
}
