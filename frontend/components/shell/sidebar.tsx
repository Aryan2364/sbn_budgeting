"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { TreePineIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { NAV_GROUPS, isNavItemActive } from "@/components/shell/nav"
import { useSession } from "@/components/shell/session"

/**
 * Section 12.1.
 *
 * One navigation, rendered in two frames: the column beside the
 * content at 1024px and above, and the overlay sheet below it. The
 * markup is identical, which is what stops the two drifting apart.
 *
 * `collapsible` is true only in the desktop column. The rail is a CSS
 * state (`rail:`, driven by <html data-sidebar>), so the labels hide
 * without React re-rendering; `collapsed` exists so the tooltips -
 * which cannot be expressed in CSS - know when they are the only way
 * to read the item.
 */

/** The brand block, sized to the top bar so the two line up exactly. */
function SidebarBrand({ collapsible }: { collapsible: boolean }) {
  return (
    <div
      className={cn(
        "flex h-topbar shrink-0 items-center gap-2 border-b border-border-light px-4",
        collapsible && "rail:justify-center rail:px-0"
      )}
    >
      <TreePineIcon
        aria-hidden="true"
        className="size-icon-nav shrink-0 text-primary"
      />
      <span
        className={cn(
          "truncate text-card-heading font-medium text-text-primary",
          collapsible && "rail:hidden"
        )}
      >
        Sadbhavna
      </span>
    </div>
  )
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  collapsible,
  collapsed,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  collapsible: boolean
  collapsed: boolean
}) {
  const link = (
    <Link
      href={href}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        // Section 23: icons sit 4px from their label, 18px in navigation.
        "relative flex h-control items-center gap-1 rounded-lg px-3 text-body text-text-secondary transition-colors",
        "hover:bg-surface-control hover:text-text-primary",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
        // Section 12.1: THREE signals together on the active item -
        // primary-subtle background, body-strong weight, and a 3px
        // accent bar in primary on the left edge. One or two of them is
        // not the rule.
        "data-active:bg-primary-subtle data-active:font-medium data-active:text-primary-pressed",
        "before:absolute before:inset-y-1 before:left-0 before:w-accent-bar before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity",
        "data-active:before:opacity-100",
        collapsible && "rail:justify-center rail:px-0"
      )}
    >
      <Icon className="size-icon-nav shrink-0" />
      <span className={cn("truncate", collapsible && "rail:hidden")}>
        {label}
      </span>
    </Link>
  )

  // Section 12.1: when collapsed, each icon shows a tooltip with its
  // label. Section 19 forbids a tooltip that repeats visible text, so
  // there is none while the label is on screen.
  if (!collapsible || !collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarNav({
  collapsible,
  collapsed,
}: {
  collapsible: boolean
  collapsed: boolean
}) {
  const pathname = usePathname()
  const { isAdmin } = useSession()

  // A group whose every item is hidden must not leave its section
  // label behind with nothing under it.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((group) => group.items.length > 0)

  return (
    <nav
      aria-label="Main"
      className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
    >
      {groups.map((group, index) => (
        <div key={group.label} className={cn(index > 0 && "mt-6")}>
          {index > 0 && collapsible ? (
            // In the rail there is no room for the section label, so
            // the grouping is carried by a divider instead of vanishing.
            <Separator className="mb-4 hidden rail:block" />
          ) : null}
          <p
            className={cn(
              "px-3 pb-2 text-meta text-text-muted",
              collapsible && "rail:hidden"
            )}
          >
            {group.label}
          </p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.href}>
                <SidebarLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={isNavItemActive(item.href, pathname)}
                  collapsible={collapsible}
                  collapsed={collapsed}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarBody({
  collapsible,
  collapsed,
}: {
  collapsible: boolean
  collapsed: boolean
}) {
  return (
    <>
      <SidebarBrand collapsible={collapsible} />
      <SidebarNav collapsible={collapsible} collapsed={collapsed} />
    </>
  )
}

export { SidebarBody }
