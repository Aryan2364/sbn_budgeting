import {
  ChartColumnIcon,
  EllipsisIcon,
  InboxIcon,
  FolderIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  MessageSquareWarningIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldIcon,
  TreePineIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import { MODULE_KEYS, type PermissionKey } from "@/lib/permission-keys"
import { GU_PHONE } from "@/components/complaints/gu"

/**
 * Section 12.1. The navigation, defined once - one group list PER MODULE
 * (CONTRACT section 4). Sadbhavna has two modules, Budget and
 * Complaints; the sidebar shows the active module's list, and a module
 * switcher in the sidebar header moves between them (sidebar.tsx).
 *
 * MAXIMUM SEVEN TOP-LEVEL ITEMS PER MODULE. Beyond seven people stop
 * scanning and start hunting. Budget has seven, Complaints four. The
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
 *   receipt · Reports chart-column · Complaints message-square-warning ·
 *   Access shield (kit 23.2, 40.1).
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
  /**
   * 41.11, plan-phone D9: the title screenTitle() uses for this item's
   * computer-only page on phone, where this item's screen is otherwise
   * Gujarati (a Complaints item). Budget, Settings and Access stay
   * English (their own module is English in both layouts), so they
   * leave this unset and screenTitle falls back to `label`.
   */
  phoneTitle?: string
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

/**
 * Kit 40.1: ONE sidebar item, Access, with the shield icon, behind the
 * permission that manages access; everyone else does not see it (kit 26
 * rule 1). Like Settings it is shared by both modules and appears in
 * each (access plan P10). Its four section tabs are app/(app)/access.
 */
const ACCESS_ITEM: NavItem = {
  label: "Access",
  href: "/access",
  icon: ShieldIcon,
  permission: "access.rights.manage",
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
          ACCESS_ITEM,
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
            phoneTitle: GU_PHONE.titles.dashboard,
          },
        ],
      },
      {
        label: "Setup",
        items: [SETTINGS_ITEM, ACCESS_ITEM],
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
 * `/complaints...` is Complaints; `/settings...` and `/access...` belong
 * to whichever module was last active (`remembered`); everything else is
 * Budget.
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
  else if (isSharedPath(pathname)) key = remembered ?? allowed[0] ?? "budget"
  else key = "budget"
  if (!allowed.includes(key) && allowed.length > 0) return allowed[0]
  return key
}

/** /settings and /access are shared by both modules (plan P10: /access is treated like /settings). */
function isSharedPath(pathname: string): boolean {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/access" ||
    pathname.startsWith("/access/")
  )
}

/** The module a path pins (and so is remembered for /settings and /access), if any. */
export function pathPinsModule(pathname: string): ModuleKey | null {
  if (pathname === "/" || isSharedPath(pathname) || pathname.startsWith("/login")) return null
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
  return settingsSections(can)[0]?.href ?? (can("access.rights.manage") === true ? ACCESS_ITEM.href : "/")
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
  // The phone's own addresses (plan-phone D1). My work is the Assigned
  // list and the comments screen is part of the record, so both need
  // View, as the list and the record do. /more needs nothing.
  [/^\/my-work\/?$/, "complaints.complaints.view"],
  [/^\/complaints\/[^/]+\/comments\/?$/, "complaints.complaints.view"],
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

/**
 * Plan-phone 5.8: the title of the screen that owns an address, for the
 * computer-only page on phone (41.11) - the label of the sidebar item
 * that owns it, so the person can tell which screen this is. "Sadbhavna"
 * where no item owns it.
 */
export function screenTitle(pathname: string): string {
  const item = owningItem(MODULES.flatMap((mod) => mod.groups), pathname)
  return item?.phoneTitle ?? item?.label ?? PRODUCT_NAME
}

/**
 * The phone's tab bar (kit 41.4 rules 13 to 17, plan-phone section 6):
 * My work first, More last, the product's own between. Labels are the
 * phone's Gujarati (plan-phone D7). Each tab carries the permission that
 * opens it, filtered in phone-nav.ts phoneDestinations() (plan D4); More
 * needs none. Icons from 23.2: My work inbox, Complaints the module's
 * message-square-warning, More ellipsis (the kit's own demo).
 */
export type PhoneTabDef = {
  label: string
  href: string
  icon: LucideIcon
  permission?: Needs
}

export const PHONE_HOME = "/my-work"

export const PHONE_TABS: readonly PhoneTabDef[] = [
  { label: GU_PHONE.tabs.myWork, href: PHONE_HOME, icon: InboxIcon, permission: "complaints.complaints.view" },
  {
    label: GU_PHONE.tabs.complaints,
    href: "/complaints",
    icon: MessageSquareWarningIcon,
    permission: "complaints.complaints.view",
  },
  { label: GU_PHONE.tabs.more, href: "/more", icon: EllipsisIcon },
]

/**
 * Plan-phone D3 and Q4: the phone's home, My work, for anyone who can
 * open it; null for someone with no phone screen at all (Budget only, or
 * Complaints without View), who then gets the computer-only page on
 * every address with Sign out in place of "Go to home".
 */
export function phoneHomeHref(can: Can): string | null {
  return canAny(can, "complaints.complaints.view") === true ? PHONE_HOME : null
}
