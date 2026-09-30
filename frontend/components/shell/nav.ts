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

import type { SessionCan } from "@/components/shell/session"

/**
 * Section 12.1. The navigation, defined once - one group list PER MODULE
 * (CONTRACT section 4). Sadbhavna has two modules, Budget and
 * Complaints; the sidebar shows the active module's list, and a module
 * switcher in the sidebar header moves between them (sidebar.tsx).
 *
 * MAXIMUM SEVEN TOP-LEVEL ITEMS PER MODULE. Beyond seven people stop
 * scanning and start hunting. Budget has six, Complaints three.
 *
 * Items are grouped under small section labels in meta style. The
 * groups are presentation only - `href` is what decides which item is
 * active, and the active test is prefix-based (longest match wins) so
 * that drilling into a record leaves the top-level item highlighted.
 *
 * Section 23.2 product rows (one icon per top-level section):
 *   Product mark tree-pine · Budget module wallet · Complaints module
 *   message-square-warning · Projects folder · Sites map-pin · Expenses
 *   receipt · Reports chart-column · Complaints message-square-warning.
 */
export type ModuleKey = "budget" | "complaints"

export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  /**
   * Section 26 rule 1: HIDE an entire area the user has no access to,
   * rather than showing a link that 403s. Absent means everyone in the
   * module sees it. The server enforces access; this only stops the
   * door being drawn.
   */
  visible?: (can: SessionCan) => boolean
  /**
   * Kept for backward compatibility with the old single-list nav:
   * budget admins only. Prefer `visible`.
   */
  adminOnly?: boolean
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
  /** Where the switcher goes when this module is chosen. */
  home: string
  /** Whether this user has the module at all. */
  allowed: (can: SessionCan) => boolean
  groups: NavGroup[]
}

export const PRODUCT_NAME = "Sadbhavna"
export const PRODUCT_MARK = TreePineIcon

/**
 * Settings is shared by both modules and appears in each, for anyone
 * with at least one settings section (fe-platform's `settingsSections`,
 * passed in so this file stays free of React). The /settings pages
 * themselves hide the sections a user may not open.
 */
function settingsItem(hasSettings: (can: SessionCan) => boolean): NavItem {
  return { label: "Settings", href: "/settings", icon: SettingsIcon, visible: hasSettings }
}

export function buildModules(hasSettings: (can: SessionCan) => boolean): ModuleDef[] {
  return [
    {
      key: "budget",
      label: "Budget",
      icon: WalletIcon,
      home: "/dashboard",
      allowed: (can) => can.budget !== null,
      groups: [
        {
          label: "Overview",
          items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon }],
        },
        {
          label: "Records",
          items: [
            { label: "Projects", href: "/projects", icon: FolderIcon },
            { label: "Sites", href: "/sites", icon: MapPinIcon },
            { label: "Expenses", href: "/expenses", icon: ReceiptIcon },
          ],
        },
        {
          label: "Reporting and setup",
          items: [
            { label: "Reports", href: "/reports", icon: ChartColumnIcon },
            settingsItem(hasSettings),
          ],
        },
      ],
    },
    {
      key: "complaints",
      label: "Complaints",
      icon: MessageSquareWarningIcon,
      home: "/complaints",
      allowed: (can) => can.complaints !== null,
      groups: [
        {
          label: "Complaints",
          items: [
            { label: "Complaints", href: "/complaints", icon: MessageSquareWarningIcon },
            { label: "Dashboard", href: "/complaints/dashboard", icon: LayoutDashboardIcon },
          ],
        },
        {
          label: "Setup",
          items: [settingsItem(hasSettings)],
        },
      ],
    },
  ]
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

/** The visible groups of one module for this user, empty groups dropped. */
export function visibleGroups(mod: ModuleDef, can: SessionCan): NavGroup[] {
  return mod.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && can.budget !== "admin") return false
        return item.visible ? item.visible(can) : true
      }),
    }))
    .filter((group) => group.items.length > 0)
}

/**
 * The top-level item that owns the current address: the longest
 * matching href, so /complaints/dashboard lights Dashboard and not
 * Complaints, and /projects/8f3c/edit keeps Projects highlighted.
 * Section 12.1: the sidebar never changes when the user drills into a
 * record; the depth is the breadcrumb's job.
 */
export function activeHref(groups: NavGroup[], pathname: string): string | null {
  let best: string | null = null
  for (const group of groups) {
    for (const item of group.items) {
      if (isNavItemActive(item.href, pathname) && (!best || item.href.length > best.length)) {
        best = item.href
      }
    }
  }
  return best
}

export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Old name, kept so nothing importing it breaks: the budget module's list. */
export const NAV_GROUPS: NavGroup[] = buildModules(() => true)[0].groups
