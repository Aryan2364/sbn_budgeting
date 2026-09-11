import * as React from "react"
import Link from "next/link"
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Section 11.4. Four zones, top to bottom, and then it ENDS:
 *
 *   1. Metric tiles - a row of four. Label, one large number, a change
 *                     indicator against the previous period.
 *   2. Main chart   - one chart, full width.
 *   3. Two panels   - side by side. Usually items needing attention on
 *                     the left, recent activity on the right.
 *   4. Nothing.       Dashboards do not scroll for three screens.
 *
 * A dashboard is READ-ONLY. No editing, no forms.
 *
 * Every tile links to the list page that explains its number, and
 * every number states its period - a number with no stated period is
 * meaningless.
 */
function MetricTileRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="metric-tile-row"
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * The change indicator carries a direction word as well as an arrow
 * and a colour (section 7.2 rule 1): colour alone is invisible to
 * colour-blind users. `direction` says which way the number moved;
 * whether that is good or bad is the caller's to word, because a fall
 * in spend and a fall in trees planted are not the same news.
 */
function MetricTile({
  label,
  period,
  value,
  change,
  direction,
  href,
  className,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & {
  label: React.ReactNode
  /** "This month", "Last 30 days". Never omitted. */
  period: React.ReactNode
  value: React.ReactNode
  change?: React.ReactNode
  direction?: "up" | "down"
  /** Section 11.4: every tile links to the list that explains it. */
  href: string
}) {
  const Arrow =
    direction === "down"
      ? TrendingDownIcon
      : direction === "up"
        ? TrendingUpIcon
        : null

  return (
    <Link
      href={href}
      data-slot="metric-tile"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border border-border-light bg-surface p-4 transition-colors",
        "hover:border-border hover:bg-surface-sunken",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
        className
      )}
      {...props}
    >
      <span className="truncate text-label text-text-secondary">{label}</span>
      {/*
        NEVER truncated. Section 31.1: a truncated number is worse than
        truncated text, because three dots read as "there is more text"
        and nothing reads as "there are more digits" — "₹20,00,00,000…"
        is not a big number, it is a different number.

        So it wraps instead. A large amount takes two lines in the tile
        and every digit survives; the tiles sit in a grid, so they all
        take the height of the tallest and stay aligned.
      */}
      <span className="min-w-0 text-page-title font-medium tabular-nums break-words text-text-primary">
        {value}
      </span>
      {/*
        The change and the period both name a span of time, so they need
        separating or they read as one run-on phrase — "100.0% on last
        month This month". The middot is the separator, and it is hidden
        from screen readers, which get the two as separate phrases
        anyway.
      */}
      <span className="flex flex-wrap items-center gap-1 text-meta text-text-muted">
        {change ? (
          <>
            <span className="inline-flex items-center gap-1 text-text-secondary">
              {Arrow ? <Arrow aria-hidden="true" className="size-icon" /> : null}
              {change}
            </span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <span>{period}</span>
      </span>
    </Link>
  )
}

/** Zone 3. Two equal fractions of the available space, never two fixed boxes. */
function DashboardPanels({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-panels"
      className={cn("grid grid-cols-1 gap-6 lg:grid-cols-2", className)}
      {...props}
    />
  )
}

export { MetricTileRow, MetricTile, DashboardPanels }
