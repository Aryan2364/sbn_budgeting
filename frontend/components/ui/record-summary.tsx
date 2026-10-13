"use client"

import * as React from "react"
import { format, isValid } from "date-fns"
import { ChevronRightIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { BLEED, BLOCK, INSET, INSET_RING, ROW } from "@/components/shell/content-area"
import { ShellLink } from "@/components/shell/progress-bar"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { formatCount } from "@/components/ui/phone-list"
import { Skeleton } from "@/components/ui/skeleton"
import { SHOW_MORE_LINK } from "@/components/ui/truncate"

/**
 * Section 41.6 - the parts of a record page on phone, below the app bar
 * and above the action bar (action-bar.tsx):
 *
 *   RecordSummary  the top of the record: full name, badges, meta line,
 *                  and its key facts (rule 2).
 *   KeyFacts       up to four label-value pairs, two wide (rules 2, 4).
 *   RelatedRows    one row per related list, "Invoices · 4" (rule 5).
 *   RelatedRow
 *   ActivityList   activity and comments, 10 at a time up to 100, with
 *                  "Add comment" at the top (rule 5).
 *
 * NOTHING HERE TRUNCATES (rule 6, section 8). The record is where the
 * full text lives, so every name, value and line wraps, breaking inside
 * a long word or number where it must (9 rule 3).
 *
 * DESKTOP: every part renders nothing. The desktop record has its own
 * form of each - the record header with badges beside the title (11.2
 * zone 2), the summary sidebar (zone 3), tabs for related records and
 * the paginated Activity tab (zone 4, 38.2, 1 rule 7) - and these phone
 * forms break desktop rules (rows run edge to edge, activity loads with
 * "Show more" rather than pagination). A page writes one tree; these show
 * only in the phone layout, so they can never change a desktop pixel.
 * They ask useLayout() (41.3 rule 4), which answers with the server's
 * guess while hydrating, so the phone's first paint already has them.
 */

/* ------------------------------------------------------------------
   Edge-to-edge rows - 41.5 rule 8, as More draws them.

   BLEED, INSET, BLOCK, ROW and INSET_RING are content-area.tsx's, the one
   copy every phone block of rows shares (section 4 rule 2); the count
   format is phone-list.tsx's formatCount (section 18, until lib/format.ts
   exists); "Show more" is truncate.tsx's SHOW_MORE_LINK.
   ------------------------------------------------------------------ */

/**
 * A group label above a block of rows: label style, as More and personal
 * settings group theirs (41.18 rule 1). At the content's edge, not bled.
 */
const GROUP_LABEL = "text-label text-text-secondary"

/* ------------------------------------------------------------------
   The top of the record - rules 2 and 4.
   ------------------------------------------------------------------ */

/** Section 41.1 rule 6: four key facts on a record, at most. */
const MAX_KEY_FACTS = 4

/**
 * Tracking (plan-phone D7, 37.6 rule 2): the words these parts show, which
 * a product in another language overrides through `text`. Each defaults
 * to the kit's English, so a caller that passes nothing is unchanged.
 */
type RecordSummaryText = {
  /** An empty key fact. */
  notSet: string
  addComment: string
  showMore: string
  /** Past 100 items: a sentence, or one built from the 100 and the true total. */
  capped: string | ((shown: number, total: number) => string)
  /**
   * "2 hours ago" for an activity item. The product's own formatter, so
   * the words and the date format are its own (section 18, lib/format.ts).
   */
  timeAgo: (when: Date, now: Date) => string
}

const RECORD_TEXT: RecordSummaryText = {
  notSet: "Not set",
  addComment: "Add comment",
  showMore: "Show more",
  capped: (shown, total) =>
    `Showing the latest ${shown} of ${formatCount(total)}. Open this record on a computer to see older activity.`,
  timeAgo: (when, now) => timeAgo(when, now.getTime()),
}

function recordText(text: Partial<RecordSummaryText> | undefined): RecordSummaryText {
  return text ? { ...RECORD_TEXT, ...text } : RECORD_TEXT
}

type KeyFact = {
  /** A short noun (37.3): "Client", "Amount", "Due date". */
  label: string
  /**
   * The value, already formatted (18). Empty reads "Not set". A value
   * the person may not see (an amount without see-amounts, 26.7) is
   * never passed as empty: leave the fact out.
   */
  value: React.ReactNode
}

/**
 * Section 41.6 rules 2 and 4: up to four facts the record type names as
 * its most important (an invoice: client, amount, due date, owner), in a
 * grid two wide, each label above its value - label style over body
 * strong, as a form stacks them. More than four throws (41.1 rule 6): the
 * rest of the record follows below, or is one tap away.
 */
function KeyFacts({
  facts,
  className,
  text,
}: {
  facts: KeyFact[]
  className?: string
  text?: Partial<RecordSummaryText>
}) {
  if (facts.length > MAX_KEY_FACTS) {
    throw new Error(
      `KeyFacts was given ${facts.length} facts. FRONTEND_RULES_PHONE.md section 41.1 rule 6 allows four key facts on a record; the rest of the record follows below them (41.6 rule 2).`
    )
  }
  const { layout } = useLayout()
  if (layout !== "phone" || facts.length === 0) return null

  return (
    <dl data-slot="key-facts" className={cn("grid grid-cols-2 gap-4", className)}>
      {facts.map((fact) => {
        const empty = fact.value === null || fact.value === undefined || fact.value === ""
        return (
          // min-w-0 (9 rule 3): a long value wraps inside its half.
          <div key={fact.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-label wrap-break-word text-text-secondary">{fact.label}</dt>
            <dd
              className={cn(
                "text-body font-medium wrap-break-word",
                empty ? "text-text-secondary" : "text-text-primary"
              )}
            >
              {empty ? recordText(text).notSet : fact.value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * Section 41.6 rule 2: the top of the content on a phone record.
 *
 *   1. The record's FULL name, in card heading style, wrapping. The app
 *      bar holds it too, truncated, as the screen's one h1 (41.4 rule 3);
 *      this is where it is read whole. A <p>, not a heading, so the page
 *      keeps one h1 and the name is not a second heading for itself.
 *   2. The status badges (badge.tsx), 8px below, wrapping onto a second
 *      line rather than squeezing.
 *   3. The meta line, in meta style.
 *   4. The key facts (KeyFacts), 16px below.
 *
 * Space sits above each part, not below (5.2). The rest of the record
 * follows it on the page.
 */
function RecordSummary({
  name,
  badges,
  meta,
  facts,
  className,
  text,
}: {
  name: string
  /** The status badges, each a <Badge> with its icon (7.2 rule 1). */
  badges?: React.ReactNode
  /** One meta line: "Raised 12 Aug 2026 by Rakesh Mehta". */
  meta?: React.ReactNode
  /** Up to four (41.1 rule 6). */
  facts?: KeyFact[]
  className?: string
  text?: Partial<RecordSummaryText>
}) {
  const { layout } = useLayout()
  if (layout !== "phone") return null

  return (
    <div data-slot="record-summary" className={cn("flex min-w-0 flex-col", className)}>
      <p className="text-card-heading font-medium wrap-break-word text-text-primary">{name}</p>
      {badges ? <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
      {meta ? <p className="mt-2 text-meta wrap-break-word text-text-muted">{meta}</p> : null}
      {facts && facts.length > 0 ? <KeyFacts facts={facts} className="mt-4" text={text} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------
   Related records - rule 5.
   ------------------------------------------------------------------ */

/**
 * The block that holds RelatedRow: one list, edge to edge, with lines
 * between the rows. `label` names the group in label style above it.
 */
function RelatedRows({
  label,
  children,
  className,
}: {
  label?: string
  children: React.ReactNode
  className?: string
}) {
  const id = React.useId()
  const { layout } = useLayout()
  if (layout !== "phone") return null

  return (
    <section
      data-slot="related-rows"
      aria-labelledby={label ? id : undefined}
      className={cn("flex flex-col gap-2", className)}
    >
      {label ? (
        <h2 id={id} className={GROUP_LABEL}>
          {label}
        </h2>
      ) : null}
      <ul className={cn(BLOCK, BLEED)}>{children}</ul>
    </section>
  )
}

/**
 * Section 41.6 rule 5 and 41.1: a related list (11.2 zone 4's tabs on
 * desktop) as one row, "Invoices · 4", with a chevron, opening that list
 * filtered to this record - `href` carries the filter. The whole row is
 * the link, a ShellLink, so the loading bar runs while the list loads
 * (5.6). Inside <RelatedRows>; it renders an <li>.
 *
 * The count is the true total, in section 18's grouping, and is read as
 * "Invoices, 4": the middle dot is for the eye only. A count of 0 still
 * shows - the list it opens says so, and offers the way to add one (13).
 */
function RelatedRow({
  label,
  count,
  href,
}: {
  /** The related list's name, plural: "Invoices". */
  label: string
  /** How many there are. Left out, the row shows the label alone. */
  count?: number
  /** The list, filtered to this record. */
  href: string
}) {
  const { layout } = useLayout()
  if (layout !== "phone") return null

  return (
    <li>
      <ShellLink href={href} className={ROW}>
        <span className="min-w-0 flex-1 wrap-break-word">
          {label}
          {count !== undefined ? (
            <span className="text-text-secondary">
              <span aria-hidden> · </span>
              <span className="sr-only">, </span>
              {formatCount(count)}
            </span>
          ) : null}
        </span>
        <ChevronRightIcon aria-hidden className="ml-2" />
      </ShellLink>
    </li>
  )
}

/* ------------------------------------------------------------------
   Activity and comments - rule 5.
   ------------------------------------------------------------------ */

/** Rule 5: activity loads 10 at a time... */
const ACTIVITY_PAGE = 10
/** ...up to 100. Older activity is on the computer. */
const ACTIVITY_MAX = 100
/** Skeleton rows shown while a page loads (14 rule 1): enough to show the shape. */
const ACTIVITY_SKELETONS = 3

type ActivityItem = {
  id: string
  /** Who did it, by name: "Rakesh Mehta". */
  who: string
  /** What they did, following the name: "changed Status from Draft to Sent". */
  what: React.ReactNode
  /** When. A Date, or an ISO string as the server sends it. */
  when: Date | string
  /** A comment's own text, shown whole under the line. Line breaks kept. */
  detail?: React.ReactNode
}

const MINUTE = 60_000

/** The current time, to the minute. A primitive, so a snapshot stays equal within its minute. */
function currentMinute() {
  return Math.floor(Date.now() / MINUTE) * MINUTE
}

function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, MINUTE)
  return () => window.clearInterval(timer)
}

/**
 * The time to measure "2 hours ago" from, moving on each minute so the
 * words stay true while the record is open. On the server and while
 * hydrating it is the time of that render; the two can fall either side
 * of a minute, so the <time> element suppresses that one text mismatch.
 */
function useCurrentMinute() {
  return React.useSyncExternalStore(subscribeMinute, currentMinute, currentMinute)
}

function plural(n: number, one: string) {
  return `${n} ${one}${n === 1 ? "" : "s"}`
}

/**
 * Section 18: "2 hours ago" is allowed in activity feeds. Within the last
 * week it reads that way; older, it is the full date, DD Mon YYYY, the
 * format used everywhere else.
 *
 * A small local formatter, because lib/format.ts - where section 18's
 * formatters belong, written once (41.3 rule 1) - is not built yet
 * (FRONTEND_RULES.md 4.1, "not yet in this kit") and is not this part's
 * to start. When it is built, this moves there and the notification
 * centre (7.4) uses the same one. Its words are English until the
 * product's strings file exists (37.6).
 */
function timeAgo(when: Date, now: number): string {
  // A time a moment ahead (clocks a little apart) reads as now.
  const minutes = Math.floor(Math.max(0, now - when.getTime()) / MINUTE)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${plural(minutes, "minute")} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${plural(hours, "hour")} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${plural(days, "day")} ago`
  return format(when, "dd MMM yyyy")
}

/**
 * Section 41.6 rule 5: a record's activity and comments, on the record
 * itself, newest first.
 *
 *   - "Add comment" is the first row, linking to the comments screen the
 *     product owns (`addCommentHref`): the record holds no message box.
 *     That screen has its message box fixed above the keyboard and no
 *     action bar, and back returns here. Pass `addCommentPermission` when
 *     commenting is a permission: while it is not known the row is
 *     disabled with no reason (26.1), and when it is refused the row is
 *     disabled with its reason on a tap (26 rule 2, 41.8 rule 17).
 *   - `items` arrive newest first, as the server sends them; this list
 *     does not reorder them. 10 show, and "Show more" shows 10 more, up
 *     to 100. `total` is the true count on the record.
 *   - Two ways to page. Given every item up to 100 and no `onShowMore`,
 *     it reveals them 10 at a time itself. Given `onShowMore`, it asks
 *     for the next 10 whenever it has shown all it holds, and the caller
 *     appends them to `items`. If `onShowMore` returns a promise, skeleton
 *     rows stand in the list until it settles (14 rule 1); if it fails,
 *     "Show more" comes back to try again (14 rule 3) and the caller shows
 *     the error toast.
 *   - Past 100, one line says older activity is on the computer.
 *   - After "Show more", focus moves to the first new item (39.3), so a
 *     keyboard or screen reader user lands on what arrived, and is never
 *     left on a button that has gone.
 *   - Each item: who, in body strong, then what, wrapping; a comment's
 *     text whole below it; then when, "2 hours ago" (18), in meta style.
 */
function ActivityList({
  items,
  total,
  onShowMore,
  addCommentHref,
  addCommentPermission,
  title = "Activity",
  className,
  text,
}: {
  items: ActivityItem[]
  /** How many items the record has in all. */
  total: number
  /** Loads the next 10 into `items`. Leave out when `items` holds them all. */
  onShowMore?: () => void | Promise<unknown>
  /** The product's comments screen for this record (41.6 rule 5). */
  addCommentHref?: string
  /** Where commenting is a permission (26): `allowed` from useCan, its reason from reasonFor. */
  addCommentPermission?: { allowed: boolean | undefined; reason: string }
  /** The heading above the list. */
  title?: string
  className?: string
  text?: Partial<RecordSummaryText>
}) {
  const t = recordText(text)
  const { layout } = useLayout()
  const now = useCurrentMinute()
  const headingId = React.useId()

  const [limit, setLimit] = React.useState(ACTIVITY_PAGE)
  const [pending, setPending] = React.useState(false)
  const list = React.useRef<HTMLUListElement | null>(null)
  const focusFrom = React.useRef<number | null>(null)

  const cap = Math.min(total, ACTIVITY_MAX)
  const visible = items.slice(0, Math.min(limit, ACTIVITY_MAX))
  const canLoad = onShowMore !== undefined && items.length < cap
  const more = !pending && visible.length < cap && (visible.length < items.length || canLoad)
  const past = total > ACTIVITY_MAX && visible.length >= ACTIVITY_MAX

  // 39.3: once the new items are on screen, focus the first of them.
  React.useLayoutEffect(() => {
    const from = focusFrom.current
    if (from === null || visible.length <= from) return
    focusFrom.current = null
    list.current?.querySelector<HTMLElement>(`[data-activity-index="${from}"]`)?.focus()
  }, [visible.length])

  const showMore = () => {
    // From what is shown, not from the last limit: after a failed load,
    // pressing again asks for the same 10 again.
    const next = Math.min(visible.length + ACTIVITY_PAGE, ACTIVITY_MAX)
    focusFrom.current = visible.length
    setLimit(next)
    if (!onShowMore || items.length >= Math.min(next, cap)) return
    const loading = onShowMore()
    if (loading instanceof Promise) {
      setPending(true)
      loading.then(
        () => setPending(false),
        () => {
          focusFrom.current = null
          setPending(false)
        }
      )
    }
  }

  if (layout !== "phone") return null
  if (items.length === 0 && !addCommentHref) return null

  const commentAllowed = addCommentPermission ? addCommentPermission.allowed : true

  return (
    <section
      data-slot="activity-list"
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-2", className)}
    >
      <h2 id={headingId} className={GROUP_LABEL}>
        {title}
      </h2>
      <ul ref={list} className={cn(BLOCK, BLEED)} aria-busy={pending || undefined}>
        {addCommentHref ? (
          <li>
            {commentAllowed === true ? (
              <ShellLink href={addCommentHref} className={ROW}>
                <PlusIcon aria-hidden />
                <span className="min-w-0 flex-1 wrap-break-word">{t.addComment}</span>
                <ChevronRightIcon aria-hidden className="ml-2" />
              </ShellLink>
            ) : (
              // Disabled: not a link, nowhere to go (6.6 rule 4), in the
              // muted form of a disabled control. The reason's wrapper
              // (role="note") runs the full row; it renders nothing of its
              // own until the answer is a definite no (26.1).
              <div className="[&>[role=note]]:flex [&>[role=note]]:w-full [&>[role=note]]:rounded-none [&>[role=note]]:focus-visible:-outline-offset-2">
                <PermissionTooltip
                  allowed={commentAllowed}
                  reason={addCommentPermission?.reason ?? ""}
                >
                  <div
                    role="link"
                    aria-disabled="true"
                    className={cn(ROW, "text-text-muted active:bg-transparent")}
                  >
                    <PlusIcon aria-hidden />
                    <span className="min-w-0 flex-1 wrap-break-word">{t.addComment}</span>
                    <ChevronRightIcon aria-hidden className="ml-2" />
                  </div>
                </PermissionTooltip>
              </div>
            )}
          </li>
        ) : null}
        {visible.map((item, index) => {
          const when = typeof item.when === "string" ? new Date(item.when) : item.when
          const valid = isValid(when)
          return (
            <li
              key={item.id}
              data-activity-index={index}
              // Focusable by script only (39.3), never a Tab stop.
              tabIndex={-1}
              className={cn("flex min-w-0 flex-col gap-1 py-3", INSET, INSET_RING)}
            >
              <p className="text-body wrap-break-word text-text-primary">
                <span className="font-medium">{item.who}</span> {item.what}
              </p>
              {item.detail ? (
                <div className="text-body wrap-break-word whitespace-pre-line text-text-primary">
                  {item.detail}
                </div>
              ) : null}
              {valid ? (
                <p className="text-meta text-text-muted">
                  <time dateTime={when.toISOString()} suppressHydrationWarning>
                    {t.timeAgo(when, new Date(now))}
                  </time>
                </p>
              ) : null}
            </li>
          )
        })}
        {pending
          ? Array.from(
              { length: Math.min(ACTIVITY_SKELETONS, cap - visible.length) },
              (_, i) => (
                <li key={`skeleton-${i}`} aria-hidden className={cn("flex flex-col gap-2 py-3", INSET)}>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/4" />
                </li>
              )
            )
          : null}
      </ul>
      {more ? (
        <button type="button" className={cn(SHOW_MORE_LINK, "self-start")} onClick={showMore}>
          {t.showMore}
        </button>
      ) : null}
      {past ? (
        <p className="text-label text-text-secondary">
          {typeof t.capped === "function" ? t.capped(ACTIVITY_MAX, total) : t.capped}
        </p>
      ) : null}
    </section>
  )
}

export {
  RecordSummary,
  KeyFacts,
  RelatedRows,
  RelatedRow,
  ActivityList,
  MAX_KEY_FACTS,
  ACTIVITY_PAGE,
  ACTIVITY_MAX,
}
export type { KeyFact, ActivityItem, RecordSummaryText }
