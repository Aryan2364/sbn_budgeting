import * as React from "react"
import { CircleCheckIcon, CircleDotIcon, ClockIcon, HourglassIcon } from "lucide-react"

import type { ComplaintStatus } from "@/lib/complaints-api"
import { formatNumber } from "@/lib/format"
import { Badge } from "@/components/ui/badge"

/**
 * The complaint status-to-colour map, defined ONCE (FRONTEND_RULES 2.4:
 * "A product's status-to-colour map is defined once and imported").
 * Every list row, card, detail header and dashboard tile reads it.
 *
 * | Status            | Colour  | Why                                        |
 * |-------------------|---------|--------------------------------------------|
 * | Open              | warning | Waiting for the supervisor — "Pending".    |
 * | In progress       | neutral | EXCEPTION, recorded below.                 |
 * | Awaiting approval | warning | "Needs review", the 2.4 column verbatim.   |
 * | Closed            | success | "Completed", the 2.4 column verbatim.      |
 *
 * **Recorded exception (2.4), fe-complaints, 30 Sep 2026.** Label
 * "In progress"; colour role neutral; reason: work has started and
 * nothing needs anyone else's attention, so it is neither pending nor
 * done, and the system has no blue information colour (2.4 "There is
 * no blue information colour. Use neutral grey"). The icon (a clock)
 * and the words carry the difference from Open.
 *
 * Locked statuses (38.3): Closed. A closed complaint takes no further
 * action; the detail page shows every action disabled with the
 * server's reason.
 */
export const STATUS_META: Record<
  ComplaintStatus,
  { label: string; variant: "warning" | "neutral" | "success"; icon: React.ReactNode }
> = {
  open: { label: "Open", variant: "warning", icon: <CircleDotIcon /> },
  in_progress: { label: "In progress", variant: "neutral", icon: <ClockIcon /> },
  awaiting_approval: {
    label: "Awaiting approval",
    variant: "warning",
    icon: <HourglassIcon />,
  },
  closed: { label: "Closed", variant: "success", icon: <CircleCheckIcon /> },
}

/** In the order the work moves. Filters and the dashboard use it. */
export const STATUS_ORDER: ComplaintStatus[] = [
  "open",
  "in_progress",
  "awaiting_approval",
  "closed",
]

export function statusLabel(status: string): string {
  return STATUS_META[status as ComplaintStatus]?.label ?? status
}

export function ComplaintStatusBadge({ status }: { status: ComplaintStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.open
  return (
    <Badge variant={meta.variant}>
      {meta.icon}
      {meta.label}
    </Badge>
  )
}

/**
 * The age of a complaint, in words. The server computes the days
 * (raised to now, or raised to closed); this only phrases them.
 */
export function ageLabel(days: number): string {
  if (days <= 0) return "Today"
  return `${formatNumber(days)} ${days === 1 ? "day" : "days"}`
}
