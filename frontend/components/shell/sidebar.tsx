"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  PRODUCT_MARK,
  PRODUCT_NAME,
  activeHref,
  visibleGroups,
  type ModuleDef,
} from "@/components/shell/nav"
import { ShellLink, useProgress } from "@/components/shell/progress-bar"
import { usePermissions } from "@/lib/permissions"
import { useModules } from "@/components/shell/use-module"

/**
 * Section 12.1, restyled to the kit: the sidebar is FILLED WITH PRIMARY,
 * full height. It carries no data, so a strong colour costs nothing in
 * readability (36.1). Items are on-brand at body weight; group labels are
 * meta in on-brand-muted; hover is on-brand-hover and pressed
 * on-brand-pressed. The ACTIVE ITEM INVERTS - surface fill, primary-text,
 * body strong, 8px radius - the three signals always together, and no
 * tint or accent bar (both vanish on a brand ground).
 *
 * One navigation, rendered in two frames: the column beside the content
 * at 1024px and above, and the overlay sheet below it. The markup is
 * identical, which is what stops the two drifting apart.
 *
 * `collapsible` is true only in the desktop column. The rail is a CSS
 * state (`rail:`, driven by <html data-sidebar>), so the labels hide
 * without React re-rendering; `collapsed` exists so the tooltips - which
 * cannot be expressed in CSS - know when they are the only way to read
 * the item.
 *
 * MODULES (CONTRACT section 4). The list shown is the ACTIVE module's
 * (nav.ts, one list per module), and the active module comes from the
 * path. When the user has more than one module, the sidebar header is
 * the module switcher - see ModuleSwitcher below.
 */

/** Section 6.3.2's reasoning: primary-ring vanishes on a brand ground. */
const ON_BRAND_RING =
  "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-on-brand"

function BrandText({ collapsible, module }: { collapsible: boolean; module: ModuleDef | null }) {
  return (
    <span className={cn("flex min-w-0 flex-1 flex-col text-left", collapsible && "rail:hidden")}>
      <span className="truncate text-card-heading font-medium text-on-brand">{PRODUCT_NAME}</span>
      {module ? (
        <span className="truncate text-meta text-on-brand-muted">{module.label}</span>
      ) : null}
    </span>
  )
}

function Mark() {
  const Icon = PRODUCT_MARK
  return (
    <span className="flex size-8 shrink-0 items-center justify-center text-on-brand">
      <Icon aria-hidden="true" className="size-icon-nav" />
    </span>
  )
}

/**
 * THE MODULE SWITCHER (logged in CONTRACT section 9).
 *
 * Shown only when the user has more than one module; otherwise the header
 * is the plain product mark and name. It IS the sidebar header: the whole
 * 56px brand row becomes one button (product mark, "Sadbhavna", the
 * active module's name under it in on-brand-muted, and a chevrons-up-down
 * icon), quiet on the brand ground like every control there. It opens a
 * dropdown-menu (a menu of places, not a form value) holding a labelled
 * radio group of the user's modules with the active one ticked (16.2
 * selected look). Choosing a module navigates to its home, the first item
 * of it this user can use (Budget: /dashboard, Complaints: /complaints),
 * through the progress bar. In the
 * icon rail only the mark shows, with a "Switch module" tooltip.
 */
function ModuleSwitcher({
  collapsible,
  collapsed,
  modules,
  active,
  homeOf,
  onNavigate,
}: {
  collapsible: boolean
  collapsed: boolean
  modules: ModuleDef[]
  active: ModuleDef
  homeOf: (mod: ModuleDef) => string
  onNavigate?: () => void
}) {
  const progress = useProgress()
  const label = `Switch module. Current module: ${active.label}`

  const trigger = (
    <DropdownMenuTrigger
      aria-label={label}
      className={cn(
        "tap-area flex w-full cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-on-brand",
        "transition-[background-color] duration-(--duration-fast)",
        "hover:bg-on-brand-hover active:bg-on-brand-pressed data-popup-open:bg-on-brand-hover",
        ON_BRAND_RING,
        collapsible && "rail:justify-center rail:px-0"
      )}
    >
      <Mark />
      <BrandText collapsible={collapsible} module={active} />
      <ChevronsUpDownIcon
        aria-hidden="true"
        className={cn("size-icon shrink-0 text-on-brand-muted", collapsible && "rail:hidden")}
      />
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {collapsible && collapsed ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent side="right">Switch module</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch module</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={active.key}
            onValueChange={(value) => {
              const next = modules.find((mod) => mod.key === value)
              if (!next || next.key === active.key) return
              onNavigate?.()
              progress.navigate(homeOf(next))
            }}
          >
            {modules.map((mod) => {
              const Icon = mod.icon
              return (
                <DropdownMenuRadioItem key={mod.key} value={mod.key}>
                  <Icon aria-hidden="true" />
                  {mod.label}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The brand row, sized to the top bar so the two line up exactly. */
function SidebarHeader({
  collapsible,
  collapsed,
  onNavigate,
  overlay,
}: {
  collapsible: boolean
  collapsed: boolean
  onNavigate?: () => void
  overlay?: boolean
}) {
  const { modules, active, homeOf } = useModules()

  return (
    <div
      className={cn(
        "flex h-topbar shrink-0 items-center px-3",
        // The sheet's close button sits in this row's top-right corner.
        overlay && "pr-12",
        collapsible && "rail:justify-center rail:px-0"
      )}
    >
      {modules.length > 1 ? (
        <ModuleSwitcher
          collapsible={collapsible}
          collapsed={collapsed}
          modules={modules}
          active={active}
          homeOf={homeOf}
          onNavigate={onNavigate}
        />
      ) : (
        <div
          className={cn(
            "flex w-full items-center gap-2 px-1",
            collapsible && "rail:justify-center rail:px-0"
          )}
        >
          <Mark />
          <BrandText collapsible={collapsible} module={null} />
        </div>
      )}
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
  onNavigate,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  collapsible: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  const link = (
    <ShellLink
      href={href}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      onNavigate={() => onNavigate?.()}
      className={cn(
        // Section 23: 18px icons in navigation, 4px from their label.
        "tap-area flex h-control items-center gap-1 rounded-lg px-3 text-body",
        "transition-[background-color,color] duration-(--duration-fast)",
        ON_BRAND_RING,
        active
          ? "bg-surface font-medium text-primary-text"
          : "text-on-brand hover:bg-on-brand-hover active:bg-on-brand-pressed",
        collapsible && "rail:justify-center rail:px-0"
      )}
    >
      <Icon className="size-icon-nav shrink-0" />
      <span className={cn("truncate", collapsible && "rail:hidden")}>{label}</span>
    </ShellLink>
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
  onNavigate,
}: {
  collapsible: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const { can } = usePermissions()
  const { active } = useModules()

  const groups = visibleGroups(active, can)
  const current = activeHref(groups, pathname)

  return (
    <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {groups.map((group, index) => (
        <div key={group.label} className={cn(index > 0 && "mt-6")}>
          {index > 0 && collapsible ? (
            // In the rail there is no room for the section label, so the
            // grouping is carried by a divider instead of vanishing.
            <div aria-hidden="true" className="mb-4 hidden h-px bg-on-brand-hover rail:block" />
          ) : null}
          <p className={cn("px-3 pb-2 text-meta text-on-brand-muted", collapsible && "rail:hidden")}>
            {group.label}
          </p>
          <ul className="flex flex-col gap-2">
            {group.items.map((item) => (
              <li key={item.href}>
                <SidebarLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={item.href === current}
                  collapsible={collapsible}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
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
  onNavigate,
}: {
  collapsible: boolean
  collapsed: boolean
  /** The overlay passes this so following a link closes it. */
  onNavigate?: () => void
}) {
  return (
    <>
      <SidebarHeader
        collapsible={collapsible}
        collapsed={collapsed}
        onNavigate={onNavigate}
        overlay={onNavigate !== undefined}
      />
      <SidebarNav collapsible={collapsible} collapsed={collapsed} onNavigate={onNavigate} />
    </>
  )
}

export { SidebarBody }
