import {
  ChartColumnIcon,
  FolderIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  MessageSquareWarningIcon,
  ReceiptIcon,
  SettingsIcon,
  TreePineIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import { MODULE_KEYS, type PermissionKey } from "@/lib/permission-keys"

/**
 * Section 12.1. The navigation, defined once - one group list PER MODULE
 * (CONTRACT section 4). Sadbhavna has two modules, Budget and
 * Complaints; the sidebar shows the active module's list, and a module
 * switcher in the sidebar header moves between them (sidebar.tsx).
 *
 * MAXIMUM SEVEN TOP-LEVEL ITEMS PER MODULE. Beyond seven people stop
 * scanning and start hunting. Budget has six, Complaints three. The
 * limit counts the full configured list, not what one user sees (kit
 * 12.1).
 *
 * Items are grouped under small section labels in meta style. The
 * groups are presentation only - `href` is what decides which item is
 * active, and the active test is prefix-based (longest match wins) so
 * that drilling into a record leaves the top-level item highlighted.
 *
 * KIT 12.1 AND 26: AN ITEM BELONGS TO A PERMISSION. Each item carries
 * the key, or several meaning "any of", that opens its area. An item the
 * user cannot use is not rendered, and a group whose items are all
 * hidden loses its label too. Nothing here reads a role, a level or an
 * admin flag; the answers come from lib/permissions.ts, passed in as
 * `can` so this file stays free of React.
 *
 * Section 23.2 product rows (one icon per top-level section):
 *   Product mark tree-pine · Budget module wallet · Complaints module
 *   message-square-warning · Projects folder · Sites map-pin · Expenses
 *   receipt · Reports chart-column · Complaints message-square-warning.
 */
export type ModuleKey = "budget" | "complaints"

/** One permission answer: true, false, or undefined while not known (kit 26.1). */
export type Can = (key: PermissionKey) => boolean | undefined

/** A key, or several meaning "any of". */
export type Needs = PermissionKey | readonly PermissionKey[]

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  /** Kit 12.1: the permission that opens this item's area. */
  permission: Needs
}

export type NavGroup = {
  /** Meta-style section label. Hidden when the sidebar is a rail. */
  label: string
  items: NavItem[]
}

export type ModuleDef = {
  key: ModuleKey
  /** Sentence case, shown in the switcher and under the product name. */
  label: string
  icon: LucideIcon
  /**
   * Plan 5.3.5: a module appears when the user holds any key in it
   * other than a Pick. A Pick alone never reveals a module: someone who
   * only raises complaints holds `budget.sites.pick` and sees no Budget.
   */
  permission: readonly PermissionKey[]
  groups: NavGroup[]
}

export const PRODUCT_NAME = "Sadbhavna"
export const PRODUCT_MARK = TreePineIcon

/** "Any of": true when one is held, false when none is, undefined while any is unknown. */
export function canAny(can: Can, needs: Needs): boolean | undefined {
  const keys: readonly PermissionKey[] = typeof needs === "string" ? [needs] : needs
  let unknown = false
  for (const key of keys) {
    const answer = can(key)
    if (answer === true) return true
    if (answer === undefined) unknown = true
  }
  return unknown ? undefined : false
}

/**
 * The Settings sections and the permission that opens each. ONE list:
 * the settings menu, the settings layout's guard and the sidebar's
 * Settings entry all read it, so the sidebar shows Settings exactly when
 * a section here is open to the user.
 *
 * The masters' full lists are their Settings screens, so they need
 * `manage` (intended difference D3); every other screen chooses from a
 * master through its Pick.
 */
export interface SettingsSection {
  label: string
  href: string
  permission: PermissionKey
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { label: "People", href: "/settings/people", permission: "platform.people.view" },
  { label: "Designations", href: "/settings/designations", permission: "platform.designations.manage" },
  { label: "Locations", href: "/settings/locations", permission: "platform.locations.manage" },
  { label: "Cost heads", href: "/settings/cost-heads", permission: "budget.cost_heads.manage" },
  {
    label: "Complaint categories",
    href: "/settings/complaint-categories",
    permission: "complaints.categories.manage",
  },
]

export function settingsSections(can: Can): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => can(section.permission) === true)
}

/**
 * Settings is shared by both modules and appears in each, for anyone
 * with at least one settings section. The /settings pages themselves
 * hide the sections a user may not open.
 */
const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: SettingsIcon,
  permission: SETTINGS_SECTIONS.map((section) => section.permission),
}

export const MODULES: readonly ModuleDef[] = [
  {
    key: "budget",
    label: "Budget",
    icon: WalletIcon,
    permission: MODULE_KEYS.budget,
    groups: [
      {
        label: "Overview",
        items: [
          // The dashboard is variance figures: plan 5.3.1 puts it under Reports › View.
          { label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon, permission: "budget.reports.view" },
        ],
      },
      {
        label: "Records",
        items: [
          { label: "Projects", href: "/projects", icon: FolderIcon, permission: "budget.projects.view" },
          { label: "Sites", href: "/sites", icon: MapPinIcon, permission: "budget.sites.view" },
          { label: "Expenses", href: "/expenses", icon: ReceiptIcon, permission: "budget.expenses.view" },
        ],
      },
      {
        label: "Reporting and setup",
        items: [
          { label: "Reports", href: "/reports", icon: ChartColumnIcon, permission: "budget.reports.view" },
          SETTINGS_ITEM,
        ],
      },
    ],
  },
  {
    key: "complaints",
    label: "Complaints",
    icon: MessageSquareWarningIcon,
    permission: MODULE_KEYS.complaints,
    groups: [
      {
        label: "Complaints",
        items: [
          {
            label: "Complaints",
            href: "/complaints",
            icon: MessageSquareWarningIcon,
            permission: "complaints.complaints.view",
          },
          {
            label: "Dashboard",
            href: "/complaints/dashboard",
            icon: LayoutDashboardIcon,
            permission: "complaints.complaints.view",
          },
        ],
      },
      {
        label: "Setup",
        items: [SETTINGS_ITEM],
      },
    ],
  },
]

/** The modules this user has, in product order. */
export function allowedModules(can: Can): ModuleDef[] {
  return MODULES.filter((mod) => canAny(can, mod.permission) === true)
}

/**
 * CONTRACT section 4: the active module comes from the path.
 * `/complaints...` is Complaints; `/settings...` belongs to whichever
 * module was last active (`remembered`); everything else is Budget.
 * A module the user does not have is never returned while they have
 * another: a complaints-only user on /settings is in Complaints.
 */
export function moduleForPath(
  pathname: string,
  remembered: ModuleKey | null,
  allowed: ModuleKey[]
): ModuleKey {
  let key: ModuleKey
  if (pathname === "/complaints" || pathname.startsWith("/complaints/")) key = "complaints"
  else if (pathname === "/settings" || pathname.startsWith("/settings/")) key = remembered ?? allowed[0] ?? "budget"
  else key = "budget"
  if (!allowed.includes(key) && allowed.length > 0) return allowed[0]
  return key
}

/** The module a path pins (and so is remembered for /settings), if any. */
export function pathPinsModule(pathname: string): ModuleKey | null {
  if (pathname === "/" || pathname.startsWith("/settings") || pathname.startsWith("/login")) return null
  return pathname === "/complaints" || pathname.startsWith("/complaints/") ? "complaints" : "budget"
}

/** The visible groups of one module for this user, empty groups dropped (kit 12.1). */
export function visibleGroups(mod: ModuleDef, can: Can): NavGroup[] {
  return mod.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAny(can, item.permission) === true),
    }))
    .filter((group) => group.items.length > 0)
}

/** Where a module opens for this user: its first item they can use. */
export function moduleHome(mod: ModuleDef, can: Can): string | null {
  return visibleGroups(mod, can)[0]?.items[0]?.href ?? null
}

/**
 * The first place this user can open (CONTRACT §4: `/` goes there).
 * Budget first, because it is the older module and its dashboard is
 * where everyone who has it already lands. `/` itself means "none":
 * app/page.tsx shows the no-access state there.
 */
export function homeHref(can: Can): string {
  for (const mod of allowedModules(can)) {
    const home = moduleHome(mod, can)
    if (home) return home
  }
  return settingsSections(can)[0]?.href ?? "/"
}

/**
 * The top-level item that owns the current address: the longest
 * matching href, so /complaints/dashboard lights Dashboard and not
 * Complaints, and /projects/8f3c/edit keeps Projects highlighted.
 * Section 12.1: the sidebar never changes when the user drills into a
 * record; the depth is the breadcrumb's job.
 */
export function activeHref(groups: NavGroup[], pathname: string): string | null {
  return owningItem(groups, pathname)?.href ?? null
}

function owningItem(groups: readonly NavGroup[], pathname: string): NavItem | null {
  let best: NavItem | null = null
  for (const group of groups) {
    for (const item of group.items) {
      if (isNavItemActive(item.href, pathname) && (!best || item.href.length > best.href.length)) {
        best = item
      }
    }
  }
  return best
}

/**
 * The pages whose purpose is one action rather than the area's list,
 * checked before the item that owns them. Opening "New expense" by its
 * address needs Add expenses, not just View expenses. An expense's own
 * page needs only View: it opens read-only for someone who cannot edit
 * it, with the reason on Save.
 */
const PAGE_PERMISSIONS: ReadonlyArray<readonly [RegExp, Needs]> = [
  [/^\/projects\/new\/?$/, "budget.projects.create"],
  [/^\/projects\/[^/]+\/edit\/?$/, "budget.projects.edit"],
  [/^\/sites\/new\/?$/, "budget.sites.create"],
  [/^\/sites\/[^/]+\/edit\/?$/, "budget.sites.edit"],
  [/^\/sites\/[^/]+\/budget\/?$/, "budget.budgets.view"],
  [/^\/expenses\/new\/?$/, "budget.expenses.create"],
  [/^\/complaints\/new\/?$/, "complaints.complaints.raise"],
]

/**
 * Kit 26.6: the permission that opens the area an address belongs to,
 * read off the same items the sidebar draws, so a typed or shared link
 * is refused by exactly the rule that hides its sidebar item. Null for
 * an address no item owns. /settings and /complaints have their own
 * layouts, which check their own sections.
 */
export function areaPermission(pathname: string): Needs | null {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return null
  const page = PAGE_PERMISSIONS.find(([pattern]) => pattern.test(pathname))
  if (page) return page[1]
  const groups = MODULES.flatMap((mod) => mod.groups)
  return owningItem(groups, pathname)?.permission ?? null
}

export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
