"use client"

import * as React from "react"
import { BellIcon, CheckIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Tooltip, TooltipContent } from "@/components/ui/tooltip"
import { ShellLink, useProgress } from "@/components/shell/progress-bar"

type Notification = {
  id: string
  /** What happened, in plain words: "Rakesh assigned you a task". */
  text: string
  at: Date
  read: boolean
  /** The item it is about. Clicking the row opens it. */
  href: string
  /**
   * Only when the event genuinely is a success, a warning or a failure
   * (7.3). It shows as a small badge; the row itself stays neutral.
   */
  status?: "success" | "warning" | "danger"
}

/** Section 7.4: the latest 25, newest first. */
const PANEL_LIMIT = 25

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * Section 18: "2 hours ago" is allowed in activity feeds and
 * notifications only. Past a week it is no longer a glance, so it becomes
 * the full DD Mon YYYY date.
 */
function timeAgo(at: Date, now: Date) {
  const diff = Math.max(0, now.getTime() - at.getTime())
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`
  if (diff < MINUTE) return "Just now"
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), "minute")
  if (diff < DAY) return plural(Math.floor(diff / HOUR), "hour")
  if (diff < 7 * DAY) return plural(Math.floor(diff / DAY), "day")
  const d = String(at.getDate()).padStart(2, "0")
  return `${d} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`
}

const STATUS_BADGE = {
  success: { icon: <CheckIcon />, label: "Done" },
  warning: { icon: <TriangleAlertIcon />, label: "Needs review" },
  danger: { icon: <OctagonXIcon />, label: "Failed" },
} as const

/**
 * Sections 7.3 and 7.4. The bell on the top bar, with an unread dot in
 * primary, opening a 360px panel. Controlled: the product owns the list
 * and the read state, and is told when a row is opened or everything is
 * marked read.
 */
function NotificationBell({
  notifications,
  onRead,
  onMarkAllRead,
  viewAllHref,
}: {
  notifications: Notification[]
  onRead: (id: string) => void
  onMarkAllRead: () => void
  viewAllHref: string
}) {
  const [open, setOpen] = React.useState(false)
  const progress = useProgress()
  const listRef = React.useRef<HTMLUListElement>(null)
  const unread = notifications.filter((n) => !n.read).length
  const latest = React.useMemo(
    () => [...notifications].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, PANEL_LIMIT),
    [notifications]
  )
  const [now, setNow] = React.useState(() => new Date())

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications"

  const openItem = (n: Notification) => {
    onRead(n.id)
    setOpen(false)
    progress.navigate(n.href)
  }

  // Section 7.4: arrow keys move between notifications. Enter opens one
  // because each row is a button; Escape is the popover's own.
  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-slot=notification-row]") ?? [])]
    const i = rows.indexOf(document.activeElement as HTMLButtonElement)
    const go = (j: number) => {
      event.preventDefault()
      rows[Math.max(0, Math.min(rows.length - 1, j))]?.focus()
    }
    if (event.key === "ArrowDown") go(i + 1)
    else if (event.key === "ArrowUp") go(i - 1)
    else if (event.key === "Home") go(0)
    else if (event.key === "End") go(rows.length - 1)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setNow(new Date())
        setOpen(next)
      }}
    >
      {/* Two Base UI triggers on one button: the popover's and the icon
          button's tooltip (6.3). The primitives are used directly because
          they forward refs through the chain; the kit's wrappers are plain
          function components, which React 18 would drop the ref at (4.2). */}
      <Tooltip>
        <TooltipPrimitive.Trigger
          data-slot="tooltip-trigger"
          delay={400}
          render={
            <PopoverPrimitive.Trigger
              data-slot="popover-trigger"
              render={
                <Button variant="ghost" size="icon" aria-label={label} className="relative">
                  <BellIcon className="size-icon-nav!" />
                  {unread > 0 ? (
                    <span
                      data-slot="notification-dot"
                      aria-hidden
                      className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-surface"
                    />
                  ) : null}
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom">Notifications</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={8}
        data-notification-panel=""
        className="w-notification-panel gap-0 p-0"
        initialFocus={() => listRef.current?.querySelector<HTMLElement>("[data-slot=notification-row]") ?? true}
      >
        <PopoverHeader className="mx-0 mt-0">
          <PopoverTitle>Notifications</PopoverTitle>
          {unread > 0 ? (
            <button
              type="button"
              onClick={onMarkAllRead}
              className={cn(
                // A standing link on a brand band (6.6): on-brand, always
                // underlined. It does something rather than going
                // somewhere, so it is a button styled as a link, as 6.6
                // rule 5 does for "Show more".
                "tap-area ml-auto cursor-pointer rounded-sm text-label text-on-brand underline underline-offset-2",
                "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-on-brand"
              )}
            >
              Mark all as read
            </button>
          ) : null}
        </PopoverHeader>

        {latest.length === 0 ? (
          <p className="px-4 py-6 text-body text-text-muted">You are all caught up.</p>
        ) : (
          <ul ref={listRef} onKeyDown={onListKeyDown} className="flex flex-col divide-y divide-border-light">
            {latest.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  data-slot="notification-row"
                  data-unread={!n.read || undefined}
                  onClick={() => openItem(n)}
                  className={cn(
                    "tap-area flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left",
                    "transition-[background-color] duration-(--duration-fast)",
                    "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:-outline-offset-2 focus-visible:outline-primary-ring",
                    // 7.3: the brand appears only as the unread dot and a
                    // faint row tint; everything else is neutral.
                    n.read ? "bg-surface" : "bg-primary-subtle/50",
                    "hover:bg-surface-control active:bg-surface-control-pressed"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 text-body text-text-primary">
                      {n.read ? null : <span className="sr-only">Unread: </span>}
                      {n.text}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-meta text-text-muted">{timeAgo(n.at, now)}</span>
                      {n.status ? (
                        <Badge variant={n.status}>
                          {STATUS_BADGE[n.status].icon}
                          {STATUS_BADGE[n.status].label}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border-light px-4 py-3">
          <ShellLink
            href={viewAllHref}
            onNavigate={() => setOpen(false)}
            className="rounded-sm text-body text-primary-text outline-none hover:underline focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
          >
            View all
          </ShellLink>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { NotificationBell, timeAgo, PANEL_LIMIT }
export type { Notification }
