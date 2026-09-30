"use client"

import * as React from "react"
import { LogOutIcon, PanelLeftIcon, SearchIcon } from "lucide-react"

import { NotificationBell } from "@/components/complaints/notification-bell"
import { useSession } from "@/components/shell/session"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Section 12.2. 56px tall (--spacing-topbar), neutral, spanning the
 * content area beside the primary-filled sidebar, and it contains FOUR
 * things:
 *
 *   1. the sidebar toggle, at the far left
 *   2. global search
 *   3. the notification bell with an unread dot in primary
 *   4. the user menu
 *
 * Nothing else. Page actions belong to the page header, because every
 * extra control here appears on every screen whether it is relevant or
 * not.
 *
 * The bell is `components/complaints/notification-bell.tsx`, owned by
 * fe-complaints: the kit's notification panel over `/notifications`.
 * It renders nothing until that file replaces fe-kit's stub.
 */

function SidebarToggle({
  onToggle,
  label,
}: {
  onToggle: () => void
  label: string
}) {
  return (
    <Tooltip>
      {/* Section 6.3: an icon-only button carries a text label for
          screen readers as well as a tooltip on hover. An icon alone is
          a guess, and a tooltip is invisible to touch. */}
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onToggle}
          />
        }
      >
        <PanelLeftIcon />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function GlobalSearch() {
  return (
    <InputGroup className="w-search max-w-full">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      {/*
        Section 27.1: the placeholder names the record type; the field
        LIST belongs in a tooltip on the field. "Search projects, sites
        and expenses" is the list, and it also grows every time the
        product does — a placeholder nobody remembers to update.
      */}
      <Tooltip>
        <TooltipTrigger
          render={
            <InputGroupInput
              type="search"
              aria-label="Search Sadbhavna"
              placeholder="Search"
            />
          }
        />
        <TooltipContent side="bottom">
          Searches projects, sites and expenses
        </TooltipContent>
      </Tooltip>
    </InputGroup>
  )
}

function UserMenu() {
  const { user, signOut } = useSession()

  const initials = (user?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="secondary" className="gap-2 px-2">
            <Avatar size="sm">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden truncate md:block">{user?.name}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        {/* Base UI requires GroupLabel to sit inside a Group - without
            one it throws MenuGroupContext is missing the moment the
            menu opens. Settings is not repeated here: it is in the
            sidebar of every module, for everyone allowed there, and one
            action lives in one place. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-body font-medium text-text-primary">
              {user?.name}
            </span>
            {user?.email || user?.phone ? (
              <span className="truncate text-meta text-text-muted">
                {user.email ?? user.phone}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TopBar({
  onToggle,
  toggleLabel,
  children,
}: {
  onToggle: () => void
  toggleLabel: string
  /** The progress bar (5.6), which hangs off the bottom edge. */
  children?: React.ReactNode
}) {
  return (
    <header
      data-slot="top-bar"
      className="no-print relative z-(--z-shell) flex h-topbar shrink-0 items-center gap-3 border-b border-border-light bg-surface px-4"
    >
      <SidebarToggle onToggle={onToggle} label={toggleLabel} />
      <GlobalSearch />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <NotificationBell />
        <UserMenu />
      </div>
      {children}
    </header>
  )
}

export { TopBar }
