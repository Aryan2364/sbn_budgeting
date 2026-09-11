import {
  FolderIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  ReceiptIcon,
  SettingsIcon,
  ChartColumnIcon,
  type LucideIcon,
} from "lucide-react"

/**
 * Section 12.1. The navigation, defined once.
 *
 * MAXIMUM SEVEN TOP-LEVEL ITEMS. Beyond seven people stop scanning and
 * start hunting. There are six. A seventh needs a reason; an eighth
 * needs the structure rethinking, not the list extending.
 *
 * Items are grouped under small section labels in meta style. The
 * groups are presentation only - `href` is what decides which item is
 * active, and the active test is prefix-based so that drilling into a
 * record leaves the top-level item highlighted (section 12.1).
 */
export type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  /**
   * Section 26: HIDE an entire area the user has no access to, rather
   * than showing a link that 403s. Staff do not see Settings at all.
   * The server enforces it; this only stops the door being drawn.
   */
  adminOnly?: boolean
}

export type NavGroup = {
  /** Meta-style section label. Hidden when the sidebar is a rail. */
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
    ],
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
      { label: "Settings", href: "/settings", icon: SettingsIcon, adminOnly: true },
    ],
  },
]

/**
 * Section 12.1: the sidebar never changes when the user drills into a
 * record. /projects/8f3c/edit keeps Projects highlighted; the depth is
 * the breadcrumb's job, not the sidebar's. Navigation that shifts under
 * the user is what makes people feel lost.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
