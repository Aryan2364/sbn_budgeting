"use client"

import * as React from "react"
import Link from "next/link"
import { BellIcon, LogOutIcon, PanelLeftIcon, SearchIcon, UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"
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
 * Section 12.2. 52 to 56px tall, spanning the content area, and it
 * contains FOUR things:
 *
 *   1. the sidebar toggle, at the far left
 *   2. global search
 *   3. the notification bell with an unread dot in primary
 *   4. the user menu
 *
 * Nothing else. Page actions belong to the page header, because every
 * extra control here appears on every screen whether it is relevant or
 * not.
 */

/**
 * Placeholder rows until the notification feed arrives with the API in
 * Phase 3. They are here rather than omitted because section 7.3 has
 * real styling to build and check: a notification is NEUTRAL - grey
 * text on a plain surface - and the brand colour appears only as the
 * unread dot and a faint row tint. A status colour would only appear
 * as a badge inside a row that is genuinely a success or a failure.
 */
const NOTIFICATIONS = [
  {
    id: "n1",
    text: "Rakesh Nair assigned you a site",
    when: "2 hours ago",
    unread: true,
  },
  {
    id: "n2",
    text: "Budget updated for Ranthambore East",
    when: "Yesterday",
    unread: false,
  },
]

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

function NotificationBell() {
  const unread = NOTIFICATIONS.filter((item) => item.unread).length

  const label =
    unread > 0 ? `Notifications, ${unread} unread` : "Notifications"

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label={label}
                />
              }
            />
          }
        >
          <BellIcon />
          {unread > 0 && (
            // Section 12.2: the unread dot is the one place the brand
            // colour appears in the notification area.
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 size-2 rounded-full bg-primary"
            />
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-notifications max-w-full p-0">
        <p className="border-b border-border-light px-3 py-3 text-body font-medium text-text-primary">
          Notifications
        </p>
        <ul className="max-h-menu-max overflow-y-auto">
          {NOTIFICATIONS.map((item) => (
            <li
              key={item.id}
              data-unread={item.unread || undefined}
              className={cn(
                "flex items-start gap-2 border-b border-border-light px-3 py-3 last:border-b-0",
                // Section 7.3: the row container stays neutral. A faint
                // primary tint is the only brand signal on an unread row.
                "data-unread:bg-primary-subtle"
              )}
            >
              <span
                aria-hidden="true"
                className="mt-2 flex size-2 shrink-0 items-center justify-center"
              >
                {item.unread ? (
                  <span className="size-2 rounded-full bg-primary" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-body text-text-primary">
                  {item.text}
                </span>
                {/* Section 18: relative time is allowed in a feed and
                    nowhere else. */}
                <span className="block text-meta text-text-muted">
                  {item.when}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <DropdownMenuContent align="end">
        {/* Base UI requires GroupLabel to sit inside a Group - without
            one it throws MenuGroupContext is missing the moment the
            menu opens. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Signed in as {user?.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user?.role === "admin" ? (
            <DropdownMenuItem render={<Link href="/settings" />}>
              <UserIcon />
              Settings
            </DropdownMenuItem>
          ) : null}
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
}: {
  onToggle: () => void
  toggleLabel: string
}) {
  return (
    <header className="flex h-topbar shrink-0 items-center gap-3 border-b border-border-light bg-surface px-4">
      <SidebarToggle onToggle={onToggle} label={toggleLabel} />
      <GlobalSearch />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}

export { TopBar }
