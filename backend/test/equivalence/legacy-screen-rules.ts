/**
 * TODAY's screen gating, frozen (access plan §6.3.1 part 2, P0).
 *
 * A copy, not an import: these are the pure functions and per-screen
 * checks the frontend uses as of the access baseline. P7 replaces the
 * frontend's versions; this file must NOT follow them. It is what the
 * new `/me` + `useCan` answers are compared against.
 *
 * Copied from (3 Oct 2026, working tree with the security fixes):
 *   frontend/components/shell/session.tsx   canFrom, homeHref, settingsSections, isAdmin
 *   frontend/components/shell/nav.ts        buildModules (labels/hrefs only), visibleGroups
 *   frontend/app/(app)/complaints/layout.tsx and settings/layout.tsx (area guards)
 * and the inventory of controls gated on the session, from every file
 * that reads it (`useSession()`):
 *   app/(app)/projects/[id]/page.tsx              Delete project
 *   app/(app)/sites/[id]/page.tsx                 Delete site
 *   components/forms/expense-form.tsx             Save (edit), Delete
 *   components/forms/site-form.tsx                Manager / Supervisor pickers
 *   components/complaints/raise-form.tsx          "set the site's supervisor" way out
 *   app/(app)/settings/cost-heads/page.tsx        add / edit / delete (master-section canEdit)
 *   app/(app)/settings/designations/page.tsx      add / edit / delete
 *   app/(app)/settings/locations/page.tsx         add / edit / delete
 *   app/(app)/settings/complaint-categories/page.tsx  add / edit / delete
 *   app/(app)/settings/people/page.tsx            add / edit / delete, Import from Excel,
 *                                                 own Platform select, own Delete
 *   app/(app)/settings/people/import/page.tsx     Commit
 *   components/complaints/complaint-detail.tsx    action buttons: server `actions` flags
 *                                                 (recorded by the API matrix, not here)
 * Files that read the session only for status/user/sign-out, with no
 * gate: login/page.tsx (homeHref), app/page.tsx (homeHref),
 * notification-bell.tsx, top-bar.tsx, sidebar.tsx / use-module.ts
 * (visibleGroups / module list, covered below), settings-nav.tsx and
 * settings/page.tsx (settingsSections, covered below).
 */

export interface SessionCan {
  budget: 'admin' | 'staff' | null;
  complaints: 'admin' | 'member' | null;
  platformAdmin: boolean;
}

export interface LegacyModules {
  platform?: string;
  budget?: string;
  complaints?: string;
}

export function canFrom(modules: LegacyModules | null): SessionCan {
  if (!modules) return { budget: null, complaints: null, platformAdmin: false };
  return {
    budget: (modules.budget as SessionCan['budget']) ?? null,
    complaints: (modules.complaints as SessionCan['complaints']) ?? null,
    platformAdmin: modules.platform === 'admin',
  };
}

/** session.tsx: `isAdmin` means budget admin, not "admin of everything". */
export const isAdmin = (can: SessionCan): boolean => can.budget === 'admin';

export function homeHref(can: SessionCan): string {
  if (can.budget) return '/dashboard';
  if (can.complaints) return '/complaints';
  if (can.platformAdmin) return '/settings/people';
  return '/';
}

export function settingsSections(can: SessionCan): Array<{ label: string; href: string }> {
  const sections: Array<{ label: string; href: string }> = [];
  if (can.platformAdmin) {
    sections.push(
      { label: 'People', href: '/settings/people' },
      { label: 'Designations', href: '/settings/designations' },
      { label: 'Locations', href: '/settings/locations' },
    );
  }
  if (can.budget === 'admin') sections.push({ label: 'Cost heads', href: '/settings/cost-heads' });
  if (can.complaints === 'admin') {
    sections.push({ label: 'Complaint categories', href: '/settings/complaint-categories' });
  }
  return sections;
}

interface NavItem {
  label: string;
  href: string;
  visible?: (can: SessionCan) => boolean;
  adminOnly?: boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}
interface ModuleDef {
  key: 'budget' | 'complaints';
  home: string;
  allowed: (can: SessionCan) => boolean;
  groups: NavGroup[];
}

function buildModules(hasSettings: (can: SessionCan) => boolean): ModuleDef[] {
  const settings: NavItem = { label: 'Settings', href: '/settings', visible: hasSettings };
  return [
    {
      key: 'budget',
      home: '/dashboard',
      allowed: (can) => can.budget !== null,
      groups: [
        { label: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard' }] },
        {
          label: 'Records',
          items: [
            { label: 'Projects', href: '/projects' },
            { label: 'Sites', href: '/sites' },
            { label: 'Expenses', href: '/expenses' },
          ],
        },
        { label: 'Reporting and setup', items: [{ label: 'Reports', href: '/reports' }, settings] },
      ],
    },
    {
      key: 'complaints',
      home: '/complaints',
      allowed: (can) => can.complaints !== null,
      groups: [
        {
          label: 'Complaints',
          items: [
            { label: 'Complaints', href: '/complaints' },
            { label: 'Dashboard', href: '/complaints/dashboard' },
          ],
        },
        { label: 'Setup', items: [settings] },
      ],
    },
  ];
}

const MODULES = buildModules((can) => settingsSections(can).length > 0);

export function visibleGroups(mod: ModuleDef, can: SessionCan): NavGroup[] {
  return mod.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && can.budget !== 'admin') return false;
        return item.visible ? item.visible(can) : true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/** What one person sees, as plain data that two builds can compare. */
export interface ScreenMatrix {
  home: string;
  modules: string[];
  nav: Record<string, string[]>;
  settingsSections: string[];
  areas: Record<string, boolean>;
  /** Control -> enabled. Record-level ones are listed per relation. */
  actions: Record<string, boolean>;
}

export function screenMatrix(modules: LegacyModules | null): ScreenMatrix {
  const can = canFrom(modules);
  const allowed = MODULES.filter((m) => m.allowed(can));
  const sections = settingsSections(can);
  return {
    home: homeHref(can),
    modules: allowed.map((m) => m.key),
    nav: Object.fromEntries(
      allowed.map((m) => [m.key, visibleGroups(m, can).flatMap((g) => g.items.map((i) => i.href))]),
    ),
    settingsSections: sections.map((s) => s.href),
    areas: {
      // complaints/layout.tsx: no complaints access -> no-access page.
      complaints: can.complaints !== null,
      // settings/layout.tsx: no section -> no-access page.
      settings: sections.length > 0,
    },
    actions: {
      'projects/[id]: Delete project': isAdmin(can),
      'sites/[id]: Delete site': isAdmin(can),
      'site-form: Manager and Supervisor pickers': isAdmin(can),
      'expense-form: Save, new expense': true,
      'expense-form: Save, own expense': true,
      'expense-form: Save, someone else’s expense': isAdmin(can),
      'expense-form: Save, legacy expense (no creator)': isAdmin(can),
      'expense-form: Delete': isAdmin(can),
      'raise-form: offer to set the site’s supervisor': can.budget === 'admin',
      'settings/cost-heads: add, edit, delete': isAdmin(can),
      'settings/designations: add, edit, delete': can.platformAdmin,
      'settings/locations: add, edit, delete': can.platformAdmin,
      'settings/complaint-categories: add, edit, delete': can.complaints === 'admin',
      'settings/people: add, edit, delete': can.platformAdmin,
      'settings/people: Import from Excel': can.platformAdmin,
      // Today nobody can change their own platform access or delete
      // themselves: admins are refused for self, everyone else cannot
      // edit people at all. D5 changes the first of these.
      'settings/people: change own Platform access': false,
      'settings/people: delete own account': false,
      'settings/people/import: Commit': can.platformAdmin,
    },
  };
}
