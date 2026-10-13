"use client"

import * as React from "react"
import { ArrowUpDownIcon, FunnelIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { useKeyboard } from "@/lib/keyboard"
import { BLEED, BLOCK, INSET, INSET_RING } from "@/components/shell/content-area"
import { ShellLink, useOptionalProgress } from "@/components/shell/progress-bar"
import { Count } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { listSearchProps, searchBoxKeys } from "@/components/ui/keyboard-shortcuts"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  // 41.4 rule 10: a swipe that starts this close to a side edge belongs to
  // the phone's own back gesture. One number, sheet.tsx's, for every swipe.
  SIDE_EDGE_PX,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Truncate } from "@/components/ui/truncate"

/**
 * Section 41.5: the phone list - what a list table, a card grid and a
 * board become on phone (41.1). One file holds the screen (PhoneList),
 * its row (PhoneListRow), its add button (PhoneAddButton), its search
 * field (PhoneSearchField) and its skeleton rows (PhoneSkeletonRows), so
 * the pieces cannot drift apart (section 4). The search page draws its
 * field and skeleton from here too.
 *
 * PHONE ONLY, AND DESKTOP CANNOT CHANGE. The caller picks the layout with
 * useLayout() (41.3 rule 4): the list table on desktop, this on phone.
 * In the desktop layout every export here renders NOTHING - no element,
 * no listener - so a page that mounts it on desktop by mistake shows
 * exactly what it would without it. It renders nothing rather than
 * throwing because the kitchen sink shows the phone parts inside a page
 * that the desktop comparison also loads; a throw there would take the
 * whole page down. Both the caller and this file read the same layout
 * snapshot in the same render, so the swap on a foldable is one step.
 *
 * THE SCREEN, TOP TO BOTTOM (41.5 rules 1 to 6), under the page's own app
 * bar (PageHeader draws it; it holds the list's name):
 *
 *   search field - count line with Filter and Sort - list banner -
 *   active filter chips - status chips (a board list) - rows
 *
 * Only the app bar and the tab bar stay put. Search, the count line, the
 * banner and the chips scroll away with the rows and slide back in on a
 * small scroll up (41.5, decision 2): see useScrollAwayHeader.
 *
 * WHAT THE CALLER OWNS (41.5 rule 17, 27.3). Search text, filters, sort
 * and the chosen status chip are the caller's state, kept in the address
 * or wherever the page keeps them, so opening a record and coming back
 * finds them as they were. This file keeps only the scroll position, in
 * sessionStorage under `listKey`. It loads nothing itself either: the
 * caller fetches 25 rows first and 25 more on each onLoadMore (rule 14),
 * gives every request its deadline (14 rule 4), and says which branch
 * the list is in through `state` (14 rule 3).
 *
 * THREE BRANCHES, NEVER ONE (14 rule 3, 13): `state` "loading" draws
 * skeleton rows, "failed" the failed empty state with Try again, "ready"
 * the rows - or, with none, nothing found (a search or filter matched
 * nothing), the status line (a status chip with no records), or the
 * caller's nothing-yet state. A list with no rows yet and a list whose
 * request failed never look the same.
 */

/* ------------------------------------------------------------------
   Limits and measurements.
   ------------------------------------------------------------------ */

/** 41.5 rule 14: 25 rows first, then 25 more as the person nears the end. */
const PHONE_LIST_PAGE = 25
/** 41.5 rule 15: loading stops at 200 rows, which keeps low-cost phones smooth. */
const PHONE_LIST_MAX = 200
/** 35.4 rule 2: a board has at most seven columns, so at most seven status chips. */
const MAX_STATUS_CHIPS = 7
/** 41.1 rule 6 and 41.5 rule 10: two supporting facts on a row, at most. */
const MAX_FACTS = 2

/**
 * 27.1: the search runs this long after typing stops. Not a motion
 * duration (5.6), so not a token; the number is section 27.1's own.
 */
const SEARCH_DELAY_MS = 300

/**
 * "Nears the end" (41.5 rule 14): the next 25 are asked for when the end
 * of the list comes within about five rows of the bottom of the screen,
 * so on a steady scroll they arrive before the person reaches them.
 */
const NEAR_END_PX = 320

/**
 * "A small scroll up" (41.5): this much upward scroll slides the search
 * and chips back in, and this much downward scroll slides them away.
 * Small enough that a deliberate flick up finds them; large enough that
 * the jitter of a finger resting on the screen does not.
 */
const REVEAL_AFTER_PX = 16

/**
 * 41.5 rule 16: how far the finger must pull down at the top of the page
 * before letting go reloads the list. Past the tap-or-drag distance by a
 * clear margin, so an ordinary scroll that starts at the top never
 * reloads by accident.
 */
const PULL_TO_REFRESH_PX = 72

/** Skeleton rows: a screenful on first load, a few while more arrive (14 rule 1). */
const FIRST_LOAD_SKELETONS = 8
const MORE_SKELETONS = 3

/* ------------------------------------------------------------------
   Edge to edge (41.5 rule 8, 41.13 rules 2 and 10).

   The rows, and the header that slides over them, run edge to edge with
   BLEED, put their text back on the content's edge with INSET, and draw
   their focus ring inside with INSET_RING; the rows sit in a BLOCK. All
   four are content-area.tsx's, beside the variables they read, and are
   the one copy record-summary.tsx and more-screen.tsx use too (section 4
   rule 2).
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Words (section 37). In one place, so the product's strings file
   (37.6 rule 2, not built yet) has one place to take them from.
   ------------------------------------------------------------------ */

type Noun = {
  /** "client" */
  one: string
  /** "clients" */
  many: string
}

/**
 * Section 18: Indian digit grouping, 12,45,680, in counts and in "Showing
 * 200 of 1,480". lib/format.ts, where the section 18 formatters are to
 * live, is not built (4.1); until it is, THIS IS THE ONE COUNT FORMATTER
 * IN THE KIT - record-summary.tsx and the other phone parts import it
 * from here - and it moves there when it exists. Digits stay 0 to 9 in
 * every language (37.6 rule 5), so the locale is fixed, not the phone's.
 */
const COUNT_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })
function formatCount(value: number) {
  return COUNT_FORMAT.format(value)
}

const DEFAULT_WORDS = {
  search: (noun: Noun) => `Search ${noun.many}`,
  clearSearch: "Clear search",
  count: (n: number, noun: Noun) => `${formatCount(n)} ${n === 1 ? noun.one : noun.many}`,
  filter: "Filter",
  filters: "Filters",
  sort: "Sort",
  clearAll: "Clear all",
  showResults: (n: number | undefined) =>
    n === undefined ? "Show results" : n === 1 ? "Show 1 result" : `Show ${formatCount(n)} results`,
  removeFilter: (label: string) => `Remove filter: ${label}`,
  activeFilters: "Active filters",
  all: "All",
  capped: (total: number) =>
    `Showing ${formatCount(PHONE_LIST_MAX)} of ${formatCount(total)}. Search or filter to find the rest.`,
  moreFailed: (noun: Noun) =>
    `The next ${noun.many} could not be loaded. Check your connection and try again.`,
  tryAgain: "Try again",
  failedHeading: (noun: Noun) => `The ${noun.many} could not be loaded`,
  failedLine: "Check your connection and try again.",
  noMatchSearch: (noun: Noun, query: string) => `No ${noun.many} match '${query}'`,
  noMatchFilters: (noun: Noun) => `No ${noun.many} match these filters`,
  noMatchLine: {
    search: "Check the spelling, or clear the search.",
    filters: "Change the filters, or clear them.",
    both: "Change the search or the filters, or clear them.",
  },
  clearFound: {
    search: "Clear search",
    filters: "Clear filters",
    both: "Clear search and filters",
  },
  emptyStatus: (noun: Noun, status: string) => `No ${noun.many} in ${status}.`,
  loading: "Loading",
}

/**
 * Tracking (plan-phone D7, 37.6 rule 2): every word the list shows, which
 * a product in another language overrides through PhoneList's `text`.
 * Each defaults to the kit's English above. The functions may ignore the
 * noun: a list that is always of one thing names it in its own words.
 */
type PhoneListText = Omit<typeof DEFAULT_WORDS, "noMatchLine" | "clearFound"> & {
  noMatchLine: { search: string; filters: string; both: string }
  clearFound: { search: string; filters: string; both: string }
}

const PhoneListTextContext = React.createContext<PhoneListText>(DEFAULT_WORDS)

/** The list's words, for every part of the list (PhoneList provides them). */
function usePhoneListText(): PhoneListText {
  return React.useContext(PhoneListTextContext)
}

function mergeText(text: Partial<PhoneListText> | undefined): PhoneListText {
  if (!text) return DEFAULT_WORDS
  return {
    ...DEFAULT_WORDS,
    ...text,
    noMatchLine: { ...DEFAULT_WORDS.noMatchLine, ...text.noMatchLine },
    clearFound: { ...DEFAULT_WORDS.clearFound, ...text.clearFound },
  }
}

/* ------------------------------------------------------------------
   Types.
   ------------------------------------------------------------------ */

/** 41.5 rule 14 and 14 rule 3: which branch the list is in. */
type PhoneListState = "loading" | "failed" | "ready"

/**
 * The branch, and the failed branch's "Try again" (13, 14 rule 3). Where
 * `state` can be "failed", `onRetry` is required, so the failed state is
 * never a dead end with a button that does nothing (26 rule 3). A list
 * that never fails (static data) may leave it out.
 */
type PhoneListBranch =
  | { state: "loading" | "ready"; onRetry?: () => void }
  | { state: PhoneListState; onRetry: () => void }

/**
 * The same, for a ready-made screen built on a PhoneList (My work,
 * Notifications) whose `state` is "ready" unless given: `onRetry` is
 * required wherever `state` can be "failed". phoneListBranch() turns it
 * into the list's own.
 */
type PhoneScreenBranch =
  | { state?: "loading" | "ready"; onRetry?: () => void }
  | { state: PhoneListState; onRetry: () => void }

function phoneListBranch(branch: PhoneScreenBranch): PhoneListBranch {
  return branch.state === "failed"
    ? { state: "failed", onRetry: branch.onRetry }
    : { state: branch.state ?? "ready", onRetry: branch.onRetry }
}

/** The search field (41.5 rule 2, 27.1). */
type PhoneListSearch = {
  /** The search that is applied now: the caller's state. */
  value: string
  /**
   * Runs the search: 300ms after typing stops, at once on the keyboard's
   * search key, and with "" when the field is cleared.
   */
  onChange: (value: string) => void
}

/** One applied filter, shown as a removable chip (27.3, 41.5 rule 5). */
type PhoneListFilterChip = {
  key: string
  /** What the chip says: "Overdue", "Owner: Suresh Patel". */
  label: string
  onRemove: () => void
}

/**
 * The filter sheet and the chips (41.5 rules 3, 5 and 18, 27.3).
 *
 * The sheet works on a DRAFT, the caller's: it changes nothing until
 * "Show 12 results" is pressed, and only then does the address change
 * (decision 9 - a sheet that moves the address while open loses its
 * Android-back entry). Start the draft from the applied filters in
 * onOpenChange(true).
 */
type PhoneListFilter = {
  /** The applied filters, one chip each. Their number is the Filter button's count (6.8). */
  active: PhoneListFilterChip[]
  /** The chips' "Clear all": removes every applied filter at once. */
  onClearAll: () => void
  /** Every filter, as the sheet's body. Shows and edits the draft. */
  content: React.ReactNode
  /** How many records the draft would show, as it changes (rule 18). undefined while it is counted. */
  draftCount: number | undefined
  /** The sheet's "Clear all": clears the draft only. */
  onClearDraft: () => void
  /** "Show 12 results": applies the draft. The sheet then closes. */
  onApply: () => void
  /** The sheet opened (start the draft) or closed without applying. */
  onOpenChange?: (open: boolean) => void
}

/** The sort sheet: choices, one tick, closing on a pick (41.5 rule 19, decision 31). */
type PhoneListSort = {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}

/**
 * A board list's status chips (41.5 rules 20 and 21): "All" first with
 * its true count, then each status in the board's column order with its
 * true count. The caller remembers the choice (rule 21).
 */
type PhoneListStatuses = {
  /** Names the chips for screen readers: "Stage". */
  label: string
  /** The board's columns, in order (35.4 rule 1). Seven at most. */
  options: { value: string; label: string; count: number }[]
  /** The count on "All": every record under the current search and filters. */
  allCount: number
  /** The chosen status; null is "All". */
  value: string | null
  onChange: (value: string | null) => void
}

/**
 * Select mode's hooks (41.6 rules 14 to 16). Only the tick boxes live
 * here; the app bar, the action bar, the 50 limit and the toasts are
 * approval-select.tsx's. Passing this puts the list in select mode.
 */
type PhoneListSelection = {
  isSelected: (key: string) => boolean
  toggle: (key: string) => void
  /**
   * Why this row cannot be ticked - the server's record answer (26.5) or
   * "50 is the most at once" - or null when it can.
   */
  reasonFor: (key: string) => string | null
}

/** The round add button (41.5 rule 7). */
type PhoneAddButtonProps = {
  /** Names it for screen readers, verb and record: "Add client" (37.2). */
  label: string
  /** The add form's address: a screen of its own on phone (41.7 rule 3). */
  href: string
  /**
   * May this person add? true shows it; false does not render it at all
   * (41.5 rule 7: "where the person may add", which wins on phone over 26
   * rule 2 - stage 4 decision 13); undefined, not known yet, shows it
   * disabled with no reason (26.1). Required, like PermissionTooltip's, so
   * it is never forgotten.
   */
  allowed: boolean | undefined
  /** Hidden in select mode (41.5 rule 7). PhoneList sets it itself. */
  hidden?: boolean
}

type PhoneListProps<Row> = PhoneListBranch & {
  /** The record, singular and plural: the count line, the search's words, the empty states. */
  noun: Noun
  /** The rows loaded so far: 25, then 25 more each time, up to 200. */
  rows: Row[]
  /** The TRUE total under the current search, filters and status (rule 14). */
  total: number
  /** A stable key per row: the record's id. Select mode ticks by it. */
  rowKey: (row: Row) => string
  /** One <PhoneListRow> per row. */
  renderRow: (row: Row) => React.ReactNode
  /** Loads the next 25. Settles when they are in `rows`; rejects when they could not be loaded. */
  onLoadMore?: () => Promise<void>
  /** Reloads the list, for pull to refresh (rule 16). The caller shows any error. */
  onRefresh?: () => Promise<void>
  search: PhoneListSearch
  filter?: PhoneListFilter
  sort?: PhoneListSort
  statuses?: PhoneListStatuses
  /** The list banner, if any (41.5 rule 4, 11.1 zone 1b): a <Banner layout="line">. */
  banner?: React.ReactNode
  /**
   * The nothing-yet state (13): an <EmptyState variant="nothing-yet"> or,
   * on My work, "nothing-waiting" (41.15 rule 9).
   */
  empty: React.ReactNode
  /** The round add button, where this list has one (rule 7). Hidden in select mode. */
  add?: Omit<PhoneAddButtonProps, "hidden">
  /** Select mode (41.6 rules 14 to 16). */
  selection?: PhoneListSelection
  /**
   * Tracking (plan-phone D7): the list's words in the product's language,
   * over the kit's English (PhoneListText). Reaches every part of the list.
   */
  text?: Partial<PhoneListText>
  /** Keeps the scroll position for coming back (rule 17). Unique per list: "clients". */
  listKey?: string
}

type PhoneListRowProps = {
  /** The record's address. The whole row opens it (41.5 rule 12). */
  href: string
  /** Line 1: the record's name, up to two lines (rule 9). */
  name: string
  /** Line 1, on the right: the status <Badge> (rule 9, 11.1). */
  status?: React.ReactNode
  /** Line 2: up to two supporting facts, one line between them (rule 10). */
  facts?: string[]
  /** Line 2, on the right: an amount, already formatted (section 18). */
  amount?: string
  /** Line 3, optional: one meta line, such as the date or the owner (rule 11). */
  meta?: string
  /**
   * Line 3, before the meta: a warning <Badge> naming what happened to
   * the record while the list was open - "Approved by Suresh Patel"
   * (41.6 rule 18). It never pushes past the row: the badge is held to
   * the room on the line and shares it with the meta. Put a long text in
   * a `<span className="min-w-0 truncate">` inside the badge (as
   * approval-select.tsx's skippedBadge does) so it ends in an ellipsis
   * rather than being cut.
   */
  warning?: React.ReactNode
  /**
   * Where the search matched, when it was NOT the name (27.1 on phone).
   * Pass it only for a row the search found through another field:
   * `{ label: "Email", text: "rakesh@halcyon.in", matched: "halcyon" }`.
   * While the list's search is applied it takes line 2's place - "Email ·
   * rakesh@halcyon.in", with `matched` in body strong weight, never a
   * background colour (27.1: every tint already means something) - and
   * the amount, if any, stays on the right. With the search cleared, line
   * 2 shows the facts again whatever is passed. `matched` is found in
   * `text` ignoring case; where it is not found, the text shows plain.
   * Leave it out when the name matched: the name is already on line 1.
   */
  match?: PhoneListMatch
}

/** Where a search matched, for PhoneListRow's `match` (27.1). */
type PhoneListMatch = {
  /** The field's label, as on the record (37.3): "Email", "Contact person". */
  label: string
  /** The field's whole value: "rakesh@halcyon.in". */
  text: string
  /** The part of `text` the search matched: what was typed, "halcyon". */
  matched: string
}

/* ------------------------------------------------------------------
   What a row needs from its list.
   ------------------------------------------------------------------ */

type RowContextValue = {
  rowKey: string
  selection: PhoneListSelection | null
  /** A search is applied, so a row's `match` shows (27.1). */
  searching: boolean
  /** The row is about to open its record: keep the place (rule 17). */
  onOpen: () => void
}

const RowContext = React.createContext<RowContextValue | null>(null)

/* ------------------------------------------------------------------
   Keeping the place - 41.5 rule 17.
   ------------------------------------------------------------------ */

type SavedPlace = { y: number; count: number }

function placeKey(listKey: string) {
  return `kit-phone-list:${listKey}`
}

/** Storage can be refused (a private window, blocked site data); the list then simply starts at the top. */
function readPlace(listKey: string): SavedPlace | null {
  try {
    const raw = window.sessionStorage.getItem(placeKey(listKey))
    window.sessionStorage.removeItem(placeKey(listKey))
    const place = JSON.parse(raw ?? "null") as Partial<SavedPlace> | null
    if (typeof place?.y !== "number" || typeof place.count !== "number") return null
    return { y: place.y, count: place.count }
  } catch {
    return null
  }
}

function writePlace(listKey: string, place: SavedPlace) {
  try {
    window.sessionStorage.setItem(placeKey(listKey), JSON.stringify(place))
  } catch {}
}

/* ------------------------------------------------------------------
   The header that scrolls away and slides back - 41.5, decision 2.
   ------------------------------------------------------------------ */

/**
 * "flow": in the page like any block, scrolling away with the rows.
 * "pinned": slid back in under the app bar after a small scroll up.
 * "leaving": sliding out again on a scroll down; flow once it is out.
 */
type HeaderMode = "flow" | "pinned" | "leaving"

/**
 * The search, count line, banner and chips scroll away with the rows and
 * slide back in on a small scroll up, so the rows get the screen.
 *
 * The page scrolls on the window (content-area.tsx), so this watches the
 * window. `away` is how far the header's place in the page has gone
 * above the line under the app bar, read from a zero-height marker at
 * that place, which never moves with the header. The header:
 *
 *   - comes back (pinned) only once it is wholly out of sight and the
 *     person scrolls up a little. Partly in sight, the scroll itself
 *     brings it back.
 *   - goes (leaving) on a little scroll down, once its own place is out
 *     of sight, so it never leaves a gap; and never while it holds focus,
 *     so the search being typed in stays put.
 *   - is in flow again as soon as its own place comes back into view,
 *     where pinned and in flow look the same.
 *
 * Only transform and opacity move (5.6 rule 1): the slide is the
 * tw-animate keyframes sheets use, so globals.css's reduce-motion rule
 * turns it into a fade at the fast duration (5.6 rule 3), and it
 * reappears without sliding. Nothing above the rows changes size, so the
 * rows never jump.
 */
function useScrollAwayHeader() {
  const markerRef = React.useRef<HTMLDivElement | null>(null)
  const headerRef = React.useRef<HTMLDivElement | null>(null)
  const [mode, setMode] = React.useState<HeaderMode>("flow")
  const modeRef = React.useRef<HeaderMode>("flow")

  React.useLayoutEffect(() => {
    modeRef.current = mode
  })

  React.useEffect(() => {
    const marker = markerRef.current
    const header = headerRef.current
    if (!marker || !header) return

    let last = window.scrollY
    let up = 0
    let down = 0
    let frame = 0

    const change = (next: HeaderMode) => {
      if (modeRef.current === next) return
      modeRef.current = next
      setMode(next)
    }

    const update = () => {
      frame = 0
      const y = window.scrollY
      const dy = y - last
      last = y
      // The header's sticky top: under the app bar and any section tabs.
      // Read from the class, so the two can never disagree.
      const line = parseFloat(getComputedStyle(header).top) || 0
      const away = line - marker.getBoundingClientRect().top
      if (away <= 0) {
        up = 0
        down = 0
        change("flow")
        return
      }
      if (dy < 0) {
        up -= dy
        down = 0
      } else if (dy > 0) {
        down += dy
        up = 0
      }
      const outOfSight = away >= header.offsetHeight
      const typing = header.contains(document.activeElement)
      if (modeRef.current !== "pinned" && up >= REVEAL_AFTER_PX && outOfSight) {
        up = 0
        change("pinned")
      } else if (modeRef.current === "pinned" && down >= REVEAL_AFTER_PX && outOfSight && !typing) {
        down = 0
        change("leaving")
      }
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  /** The slide out has finished: back in the page, out of sight above. */
  const onAnimationEnd = React.useCallback((event: React.AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || modeRef.current !== "leaving") return
    modeRef.current = "flow"
    setMode("flow")
  }, [])

  return { markerRef, headerRef, mode, onAnimationEnd }
}

/* ------------------------------------------------------------------
   Pull to refresh - 41.5 rule 16.
   ------------------------------------------------------------------ */

/**
 * Pulling down at the top of the page reloads the list. The browser's
 * own pull to refresh, which reloads the whole page, is off on phone
 * (globals.css), so the page does not move under the finger; the pull
 * is read from the touches. While the reload runs, the shell's loading
 * bar shows under the app bar (5.6, 41.4 rule 22) and nothing else: no
 * spinner, and no indicator while pulling (5.6's motion table: "the
 * loading bar above, nothing else").
 *
 * Ignored: a pull that starts within 24px of a side edge (41.4 rule 10),
 * one that starts with the page not at its top, one that turns sideways
 * first (the chips scroll sideways), a second finger, and a pull while a
 * reload is still running. Passive listeners: it never holds a scroll up.
 */
function usePullToRefresh(
  rootRef: React.RefObject<HTMLDivElement | null>,
  onRefresh: (() => Promise<void>) | undefined,
  enabled: boolean
) {
  const progress = useOptionalProgress()
  const latest = React.useRef({ onRefresh, progress })
  React.useLayoutEffect(() => {
    latest.current = { onRefresh, progress }
  })
  // Outlives a re-attach of the listeners, so a pull while a reload is
  // still running is ignored whatever re-rendered meanwhile.
  const refreshing = React.useRef(false)
  const hasRefresh = onRefresh !== undefined

  React.useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled || !hasRefresh) return

    let pull: { x: number; y: number; threshold: number; decided: boolean; armed: boolean } | null =
      null

    const onStart = (event: TouchEvent) => {
      pull = null
      if (refreshing.current || event.touches.length !== 1 || window.scrollY > 0) return
      const touch = event.touches[0]
      if (touch.clientX < SIDE_EDGE_PX || touch.clientX > window.innerWidth - SIDE_EDGE_PX) return
      pull = {
        x: touch.clientX,
        y: touch.clientY,
        // The board's tap-or-drag distance (35.6.1): until the finger has
        // moved this far, which way it is going is not yet known.
        threshold:
          parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--drag-threshold")) || 0,
        decided: false,
        armed: false,
      }
    }

    const onMove = (event: TouchEvent) => {
      if (!pull) return
      if (event.touches.length !== 1) {
        pull = null
        return
      }
      const touch = event.touches[0]
      const dx = touch.clientX - pull.x
      const dy = touch.clientY - pull.y
      if (!pull.decided) {
        if (Math.hypot(dx, dy) < pull.threshold) return
        // Up, or more sideways than down: not a pull.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          pull = null
          return
        }
        pull.decided = true
      }
      pull.armed = dy >= PULL_TO_REFRESH_PX
    }

    const onEnd = () => {
      const armed = pull?.armed === true
      pull = null
      const refresh = latest.current.onRefresh
      if (!armed || !refresh || refreshing.current || window.scrollY > 0) return
      refreshing.current = true
      const run = refresh()
      const tracked = latest.current.progress?.track(run) ?? run
      // The caller shows what went wrong (a toast, 7.1); here a failure
      // only ends the reload.
      tracked
        .catch(() => {})
        .finally(() => {
          refreshing.current = false
        })
    }

    const cancel = () => {
      pull = null
    }

    root.addEventListener("touchstart", onStart, { passive: true })
    root.addEventListener("touchmove", onMove, { passive: true })
    root.addEventListener("touchend", onEnd, { passive: true })
    root.addEventListener("touchcancel", cancel, { passive: true })
    return () => {
      root.removeEventListener("touchstart", onStart)
      root.removeEventListener("touchmove", onMove)
      root.removeEventListener("touchend", onEnd)
      root.removeEventListener("touchcancel", cancel)
    }
  }, [rootRef, enabled, hasRefresh])
}

/* ------------------------------------------------------------------
   PhoneList.
   ------------------------------------------------------------------ */

/**
 * Section 41.5: the phone list screen, below the page's app bar. See the
 * file's opening comment for what it holds and what the caller owns.
 * Renders nothing in the desktop layout.
 *
 *   const layout = useLayout().layout
 *   return layout === "phone" ? (
 *     <>
 *       <PageHeader title="Clients" />
 *       <PhoneList
 *         noun={{ one: "client", many: "clients" }}
 *         state={state} onRetry={reload}
 *         rows={rows} total={total} rowKey={(c) => c.id}
 *         renderRow={(c) => <PhoneListRow href={`/clients/${c.id}`} name={c.name} ... />}
 *         onLoadMore={loadMore} onRefresh={reload}
 *         search={{ value: q, onChange: setQ }}
 *         empty={<EmptyState variant="nothing-yet" ... />}
 *         add={{ label: "Add client", href: "/clients/new", allowed: canAdd }}
 *         listKey="clients"
 *       />
 *     </>
 *   ) : (
 *     <DesktopListPage />
 *   )
 *
 * Put it straight after the PageHeader: it is the first block under the
 * app bar (and its section tabs), and the header lines itself up with
 * them when it slides back in.
 */
function PhoneList<Row>({ text, ...props }: PhoneListProps<Row>) {
  const { layout } = useLayout()
  const words = React.useMemo(() => mergeText(text), [text])
  if (layout !== "phone") return null
  return (
    <PhoneListTextContext.Provider value={words}>
      <PhoneListOnPhone {...props} />
    </PhoneListTextContext.Provider>
  )
}

function PhoneListOnPhone<Row>({
  noun,
  state,
  onRetry,
  rows: allRows,
  total,
  rowKey,
  renderRow,
  onLoadMore,
  onRefresh,
  search,
  filter,
  sort,
  statuses,
  banner,
  empty,
  add,
  selection,
  listKey,
}: PhoneListProps<Row>) {
  const WORDS = usePhoneListText()
  if (statuses && statuses.options.length > MAX_STATUS_CHIPS) {
    throw new Error(
      `A phone list was given ${statuses.options.length} status chips. A board has at most ${MAX_STATUS_CHIPS} columns (FRONTEND_RULES_VIEWS.md section 35.4 rule 2), and the chips are its columns (FRONTEND_RULES_PHONE.md section 41.5 rule 20).`
    )
  }

  // Rule 15: never more than 200 rows on the page, whatever is passed.
  const rows = allRows.length > PHONE_LIST_MAX ? allRows.slice(0, PHONE_LIST_MAX) : allRows
  const trueTotal = Math.max(total, rows.length)
  const capped = rows.length >= PHONE_LIST_MAX && trueTotal > PHONE_LIST_MAX
  const canLoadMore =
    state === "ready" && onLoadMore !== undefined && rows.length < Math.min(trueTotal, PHONE_LIST_MAX)

  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const { markerRef, headerRef, mode, onAnimationEnd } = useScrollAwayHeader()
  // Off while loading, and in select mode (decision 16): a pull there
  // would reload the rows being ticked.
  usePullToRefresh(rootRef, onRefresh, state !== "loading" && selection === undefined)

  /* -- Loading more (rules 14 and 15) ------------------------------ */

  const [more, setMore] = React.useState<"idle" | "loading" | "failed">("idle")
  const moreRef = React.useRef(more)
  React.useLayoutEffect(() => {
    moreRef.current = more
  })

  // A fresh load (a new search, filter or sort, a reload) starts the
  // next-25 state afresh: a failure under the old search says nothing
  // about the new one. Adjusted while rendering, not in an effect.
  const [lastState, setLastState] = React.useState(state)
  if (lastState !== state) {
    setLastState(state)
    if (state === "loading" && more !== "idle") setMore("idle")
  }

  // The caller's latest onLoadMore, so a new function each render does
  // not make a new observer each render.
  const latestLoadMore = React.useRef(onLoadMore)
  React.useLayoutEffect(() => {
    latestLoadMore.current = onLoadMore
  })

  const loadMore = React.useCallback(() => {
    const load = latestLoadMore.current
    if (!load || moreRef.current === "loading") return
    moreRef.current = "loading"
    setMore("loading")
    load().then(
      () => setMore("idle"),
      () => setMore("failed")
    )
  }, [])

  const endRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const end = endRef.current
    if (!end || !canLoadMore || more !== "idle") return
    // A new observer each time the rows change: it reports at once, so
    // rows that still do not fill the screen ask for the next 25 too.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: `0px 0px ${NEAR_END_PX}px 0px` }
    )
    observer.observe(end)
    return () => observer.disconnect()
  }, [canLoadMore, more, rows.length, loadMore])

  /* -- Keeping the place (rule 17) --------------------------------- */

  const placeRef = React.useRef<SavedPlace | null | undefined>(undefined)

  React.useLayoutEffect(() => {
    if (!listKey || state !== "ready") return
    // Read once, and taken out of storage at once: it is for this one
    // return to the list, not for every later visit.
    if (placeRef.current === undefined) placeRef.current = readPlace(listKey)
    const place = placeRef.current
    if (!place) return
    const room = document.documentElement.scrollHeight - window.innerHeight
    if (room >= place.y) {
      window.scrollTo(0, place.y)
      placeRef.current = null
      return
    }
    // Not enough rows yet to reach the place: ask for the next 25 and
    // wait for them, unless no more can come; then go as far as the rows
    // reach. The end of the list need not be in view yet, so the observer
    // below cannot be relied on to ask.
    if (place.count > rows.length && canLoadMore && more !== "failed") {
      if (more === "idle") loadMore()
      return
    }
    window.scrollTo(0, place.y)
    placeRef.current = null
  }, [listKey, state, rows.length, canLoadMore, more, loadMore])

  const openRow = React.useCallback(() => {
    if (listKey) writePlace(listKey, { y: window.scrollY, count: rows.length })
  }, [listKey, rows.length])

  /* -- The branch (14 rule 3, 13) ---------------------------------- */

  const query = search.value.trim()
  const searching = query !== ""
  const filtering = (filter?.active.length ?? 0) > 0
  const chosenStatus =
    statuses && statuses.value !== null
      ? statuses.options.find((option) => option.value === statuses.value)
      : undefined

  let body: React.ReactNode
  if (state === "loading") {
    body = <PhoneSkeletonRows count={FIRST_LOAD_SKELETONS} />
  } else if (state === "failed") {
    body = (
      <EmptyState variant="failed" heading={WORDS.failedHeading(noun)} onAction={onRetry}>
        {WORDS.failedLine}
      </EmptyState>
    )
  } else if (rows.length === 0 && (searching || filtering)) {
    const which = searching && filtering ? "both" : searching ? "search" : "filters"
    body = (
      <EmptyState
        variant="nothing-found"
        heading={searching ? WORDS.noMatchSearch(noun, query) : WORDS.noMatchFilters(noun)}
        actionLabel={WORDS.clearFound[which]}
        onAction={() => {
          if (searching) search.onChange("")
          if (filtering) filter?.onClearAll()
        }}
      >
        {WORDS.noMatchLine[which]}
      </EmptyState>
    )
  } else if (rows.length === 0 && chosenStatus && (statuses?.allCount ?? 0) > 0) {
    // 35.9: an empty column says it is empty in one line, and nothing
    // else. The chips above are the way out.
    body = (
      <p className={cn("py-6 text-body text-text-muted", INSET)}>
        {WORDS.emptyStatus(noun, chosenStatus.label)}
      </p>
    )
  } else if (rows.length === 0) {
    body = empty
  } else {
    body = (
      <>
        <ul data-slot="phone-list-rows" className={BLOCK}>
          {rows.map((row) => {
            const key = rowKey(row)
            return (
              <li key={key}>
                <RowContext.Provider
                  value={{ rowKey: key, selection: selection ?? null, searching, onOpen: openRow }}
                >
                  {renderRow(row)}
                </RowContext.Provider>
              </li>
            )
          })}
        </ul>
        {more === "loading" ? <PhoneSkeletonRows count={MORE_SKELETONS} continues /> : null}
        {more === "failed" ? (
          <div className={cn("flex flex-col items-start gap-3 py-4", INSET)}>
            <p className="text-body text-text-secondary">{WORDS.moreFailed(noun)}</p>
            <Button variant="secondary" onClick={loadMore}>
              {WORDS.tryAgain}
            </Button>
          </div>
        ) : null}
        {capped ? (
          <p className={cn("py-4 text-label text-text-secondary", INSET)}>{WORDS.capped(trueTotal)}</p>
        ) : null}
        {/* Where "nears the end" is measured from. */}
        <div ref={endRef} aria-hidden />
      </>
    )
  }

  const pinned = mode !== "flow"

  return (
    <div
      ref={rootRef}
      data-slot="phone-list"
      className={cn(
        // The first block under the app bar: pulled up 12px, which the
        // header gives back as its own top padding, so the search sits
        // 16px under the bar in the page (41.4 rule 20) and, slid back
        // in, 12px under it on the page's ground rather than touching it.
        "-mt-3 flex min-w-0 flex-col",
        BLEED,
        // Rule 7: the list ends with 88px, so its last row stays clear
        // of the add button - while there is one to clear.
        add && add.allowed !== false && !selection && "pb-list-end"
      )}
    >
      <div ref={markerRef} aria-hidden />
      <div
        ref={headerRef}
        data-slot="phone-list-header"
        data-mode={mode}
        className={cn(
          // The line it pins to: under the app bar (56px plus the top
          // safe area, 41.4 rule 1), or under the section tabs where the
          // page has them (41.4 rule 21: one control and its 1px line,
          // directly after the page's app bar). Only read while pinned.
          "top-[calc(var(--spacing-topbar)_+_var(--safe-top))]",
          "[html:has([data-slot=app-bar]+[data-slot=tabs])_&]:top-[calc(var(--spacing-topbar)_+_var(--safe-top)_+_var(--h-control)_+_1px)]",
          // Pinned, it sits on the sticky layer, below the app bar and
          // the section tabs (5.5), and clips its own slide so the slide
          // never passes over them.
          pinned && "sticky z-(--z-sticky) overflow-clip"
        )}
      >
        <div
          onAnimationEnd={onAnimationEnd}
          className={cn(
            "flex flex-col gap-3 bg-surface-sunken pt-3 pb-4",
            // A line under it while it is over the rows.
            pinned && "relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border-light",
            // 5.6: in at medium with the enter easing; out at the next
            // shorter, fast, with the exit easing, staying out until it
            // is back in the page. Reduce motion: a fade (globals.css
            // zeroes the slide).
            mode === "pinned" &&
              "animate-in slide-in-from-top animation-duration-(--duration-medium) ease-enter motion-reduce:fade-in-0",
            mode === "leaving" &&
              "animate-out slide-out-to-top fill-mode-forwards animation-duration-(--duration-fast) ease-exit motion-reduce:fade-out-0"
          )}
        >
          <div className={INSET}>
            <ListSearchField noun={noun} search={search} />
          </div>

          <div className={cn("flex flex-wrap items-center gap-2", INSET)}>
            {/* Rule 3 and 14: the TRUE total, announced as it changes. */}
            <div role="status" className="min-w-0 text-label text-text-secondary tabular-nums">
              {state === "loading" ? (
                <>
                  <Skeleton aria-hidden className="h-4 w-24" />
                  <span className="sr-only">{WORDS.loading}</span>
                </>
              ) : state === "failed" ? null : (
                WORDS.count(trueTotal, noun)
              )}
            </div>
            {filter || sort ? (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {filter ? <FilterSheet filter={filter} /> : null}
                {sort ? <SortMenu sort={sort} /> : null}
              </div>
            ) : null}
          </div>

          {banner ? <div className={INSET}>{banner}</div> : null}

          {filter && filter.active.length > 0 ? (
            <ChipRow label={WORDS.activeFilters}>
              {filter.active.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  aria-label={WORDS.removeFilter(chip.label)}
                  onClick={chip.onRemove}
                  className={cn(CHIP, CHIP_RESTING)}
                >
                  {chip.label}
                  <XIcon aria-hidden className="size-4 text-text-secondary" />
                </button>
              ))}
              <Button variant="secondary" className="shrink-0" onClick={filter.onClearAll}>
                {WORDS.clearAll}
              </Button>
            </ChipRow>
          ) : null}

          {statuses ? <StatusChips statuses={statuses} /> : null}
        </div>
      </div>

      {body}

      {add ? <PhoneAddButton {...add} hidden={selection !== undefined} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------
   The search field - 41.5 rule 2, 27.1, 41.7 rule 5.
   ------------------------------------------------------------------ */

type PhoneSearchFieldProps = {
  /** What the field shows: the text being typed. */
  value: string
  /** Each keystroke. The caller runs the search 300ms after typing stops (27.1). */
  onValueChange: (value: string) => void
  /**
   * Runs the search at once: the keyboard's Search key (41.5 rule 2), and
   * Escape and the x, which clear the field and pass "".
   */
  onSearchNow: (value: string) => void
  /** Names what can be found (27.1): "Search clients". Never the label (1 rule 12). */
  placeholder: string
  /** The field's name for screen readers. The placeholder unless given. */
  label?: string
  /** The x's name for screen readers. "Clear search" unless given. */
  clearLabel?: string
}

/**
 * The phone's search field, one for the phone list and the phone search
 * page (section 4 rule 2): full width (41.7 rule 1 lifts the 480px cap on
 * phone), a search icon, the search keyboard with a Search key (41.7 rule
 * 5), and an x inside once there is text (27.1). "/" finds it (39.5).
 *
 *   - The Search key runs the search at once and closes the keyboard so
 *     the results have the screen. Escape clears (39.2), and so does the
 *     x, which keeps the keyboard as it was - open while typing, shut if
 *     it was shut.
 *   - Controlled: `value` is the text typed; the caller runs the search,
 *     300ms after typing stops and at once on onSearchNow.
 *   - The label is for screen readers; the placeholder only names what
 *     can be found (27.1, 1 rule 12). No tooltip listing the searchable
 *     fields: a phone has no hover (41.8 rule 16).
 *   - FOCUS. It never takes focus by itself and takes no autoFocus: on
 *     phone no screen opens with a field in focus (41.7 rule 17). The one
 *     screen that does, the search page, focuses it through the ref after
 *     hydration, so the server and the browser draw the same field.
 *
 * The ref is the input. Renders nothing on desktop, like every export of
 * this file.
 */
const PhoneSearchField = React.forwardRef<HTMLInputElement, PhoneSearchFieldProps>(
  function PhoneSearchField(props, ref) {
    const { layout } = useLayout()
    if (layout !== "phone") return null
    return <PhoneSearchFieldOnPhone {...props} forwardedRef={ref} />
  }
)

function PhoneSearchFieldOnPhone({
  value,
  onValueChange,
  onSearchNow,
  placeholder,
  label,
  clearLabel: clearLabelProp,
  forwardedRef,
}: PhoneSearchFieldProps & { forwardedRef: React.ForwardedRef<HTMLInputElement> }) {
  const WORDS = usePhoneListText()
  const clearLabel = clearLabelProp ?? WORDS.clearSearch
  const id = React.useId()
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  React.useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement, [])

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        onSearchNow(value)
        inputRef.current?.blur()
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label ?? placeholder}
      </label>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          {...listSearchProps}
          ref={inputRef}
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) =>
            searchBoxKeys({
              value,
              onClear: () => onSearchNow(""),
              onSearch: () => {
                onSearchNow(value)
                event.currentTarget.blur()
              },
            })(event)
          }
          // Section 1 rule 5: the browser's own clear button and search
          // decoration are hidden; the kit's x below is the one clear.
          className="[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />
        {value ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={clearLabel}
              // Keeps focus where it was: the keyboard stays open while
              // typing, and does not open if it was shut.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onSearchNow("")}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    </form>
  )
}

/**
 * The phone list's search: PhoneSearchField, running the caller's search
 * 300ms after typing stops (27.1), and at once on the Search key, Escape
 * and the x.
 *
 * The text being typed is local; the search that runs is the caller's
 * `value`. When the caller changes it (Clear search, a restored address)
 * the field follows.
 *
 * Not in focus when the screen opens (41.7 rule 17).
 */
function ListSearchField({ noun, search }: { noun: Noun; search: PhoneListSearch }) {
  const WORDS = usePhoneListText()
  const [text, setText] = React.useState(search.value)
  const latest = React.useRef(search.onChange)
  React.useLayoutEffect(() => {
    latest.current = search.onChange
  })

  // The last search the field ran, or was given.
  const [sent, setSent] = React.useState(search.value)
  const send = (value: string) => {
    setSent(value)
    latest.current(value)
  }

  // The caller's search changed. From outside the field (Clear search, a
  // restored address) the field shows it; the echo of a search the field
  // ran itself is left alone, so a caller that updates the address a
  // moment later never wipes what was typed since. Adjusted while
  // rendering, the documented way to follow a prop.
  const [shown, setShown] = React.useState(search.value)
  if (shown !== search.value) {
    setShown(search.value)
    if (search.value !== sent) {
      setSent(search.value)
      setText(search.value)
    }
  }

  // 300ms after typing stops (27.1). A timer only while the text differs
  // from the search that ran.
  React.useEffect(() => {
    if (text === sent) return
    const timer = window.setTimeout(() => {
      setSent(text)
      latest.current(text)
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [text, sent])

  /** At once: the Search key, Escape, the x. */
  const runNow = (value: string) => {
    setText(value)
    if (value !== sent) send(value)
  }

  return (
    <PhoneSearchField
      value={text}
      onValueChange={setText}
      onSearchNow={runNow}
      placeholder={WORDS.search(noun)}
    />
  )
}

/* ------------------------------------------------------------------
   Filter and sort - 41.5 rules 3, 18 and 19.
   ------------------------------------------------------------------ */

/**
 * Filter, a secondary button with its count (6.8) when filters are
 * applied, opening a bottom sheet (41.8) that holds every filter.
 * Footer: "Clear all" on the left, a primary "Show 12 results" on the
 * right whose number follows the draft (rule 18). Only "Show N results"
 * applies, and closes the sheet; any other close leaves the applied
 * filters as they were.
 */
function FilterSheet({ filter }: { filter: PhoneListFilter }) {
  const WORDS = usePhoneListText()
  const [open, setOpen] = React.useState(false)
  const count = filter.active.length
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        filter.onOpenChange?.(next)
      }}
    >
      <SheetTrigger render={<Button variant="secondary" />}>
        <FunnelIcon aria-hidden />
        {WORDS.filter}
        {/* 6.8: 8px from the label. Count adds the button's missing 4px
            only inside data-slot="button", and the sheet trigger's own
            data-slot replaces the button's here, so it is added by hand. */}
        {count > 0 ? <Count value={count} className="ml-1" /> : null}
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{WORDS.filters}</SheetTitle>
        </SheetHeader>
        {filter.content}
        <SheetFooter>
          <Button variant="secondary" onClick={filter.onClearDraft}>
            {WORDS.clearAll}
          </Button>
          <Button
            onClick={() => {
              filter.onApply()
              setOpen(false)
            }}
          >
            {WORDS.showResults(filter.draftCount)}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Sort, a secondary button opening a bottom sheet of choices with one
 * tick (rule 19). It is the dropdown menu's radio group, which on phone
 * is that sheet and closes on a pick (decision 31); the sheet takes its
 * title from the button, "Sort".
 */
function SortMenu({ sort }: { sort: PhoneListSort }) {
  const WORDS = usePhoneListText()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="secondary">
            <ArrowUpDownIcon aria-hidden />
            {WORDS.sort}
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={sort.value} onValueChange={(value) => sort.onChange(String(value))}>
          {sort.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------------------------------------------
   Chips - 41.5 rules 5, 20 and 21, 27.3.
   ------------------------------------------------------------------ */

/*
 * A chip is a control (41.9 rule 2): the control height, at least 44px
 * on phone and growing with the text-size setting, the 8px control
 * radius (5.3), body text. Pressed is the pressed fill; no hover (41.9
 * rule 1). Chips sit 8px apart (41.9 rule 4).
 */
const CHIP = cn(
  "tap-area inline-flex h-control shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-body whitespace-nowrap",
  "transition-[background-color] duration-(--duration-fast)",
  "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
)
/** 41.5 rule 21: the chips not chosen - surface with a border. */
const CHIP_RESTING = "border-border bg-surface text-text-primary active:bg-surface-control-pressed"
/**
 * 41.5 rule 21 and 27.4: the chosen chip - primary-subtle, a primary-border
 * edge, primary-text at 500. It is still a button, so a tap on it shows a
 * pressed state like every control (6.4, 41.14 rule 2: a tap shows its
 * pressed state at once). The pressed fill stays in the chosen chip's own
 * hue - the primary-border shade, one step deeper than primary-subtle -
 * so the press never looks like the choice being taken away, which a
 * neutral surface-control fill would. primary-text on it measures about
 * 7.7 to 1 for the current brand (section 2.2's values).
 */
const CHIP_CHOSEN =
  "border-primary-border bg-primary-subtle font-medium text-primary-text active:bg-primary-border"

/**
 * One row of chips that scrolls sideways when it does not fit (41.5
 * rules 5 and 20; section 1 rule 8 allows a sideways scroller inside the
 * page's vertical one). It runs edge to edge, so a chip cut at the edge
 * shows there is more; the inset padding lines the first chip up with
 * the content. Its scrollbar is hidden rather than left to the browser
 * (1 rule 5): the cut chip is the cue. 4px above and below so a focus
 * ring is not clipped by the scroller.
 */
function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-my-1 flex gap-2 overflow-x-auto overscroll-x-contain py-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        INSET
      )}
    >
      {children}
    </div>
  )
}

/**
 * 41.5 rules 20 and 21: "All" with its true count first, then each
 * status in the board's order with its true count. One is chosen at a
 * time; the caller remembers which. Each chip says its count in figures
 * (section 18 grouping), not in a Count pill: the rule asks for the true
 * count, and a pill stops at "99+" (6.8).
 */
function StatusChips({ statuses }: { statuses: PhoneListStatuses }) {
  const WORDS = usePhoneListText()
  const chips = [
    { value: null as string | null, label: WORDS.all, count: statuses.allCount },
    ...statuses.options,
  ]
  return (
    <ChipRow label={statuses.label}>
      {chips.map((chip) => {
        const chosen = chip.value === statuses.value
        return (
          <button
            key={chip.value ?? "all"}
            type="button"
            aria-pressed={chosen}
            onClick={() => statuses.onChange(chip.value)}
            className={cn(CHIP, chosen ? CHIP_CHOSEN : CHIP_RESTING)}
          >
            {chip.label}
            <span className={cn("tabular-nums", chosen ? undefined : "text-text-secondary")}>
              {formatCount(chip.count)}
            </span>
          </button>
        )
      })}
    </ChipRow>
  )
}

/* ------------------------------------------------------------------
   Rows - 41.5 rules 8 to 13.
   ------------------------------------------------------------------ */

/**
 * The row's ground and padding: edge to edge on surface (the list draws
 * the 1px border-light lines between rows), at least 64px tall and a
 * minimum (41.9 rule 7), 12px above and below, 16px at the sides plus
 * the safe areas (INSET). Pressed is a surface-control fill; there is no
 * hover (41.9 rule 1).
 */
const LIST_ROW = cn(
  "flex min-h-16 w-full gap-3 py-3 text-left",
  INSET,
  "transition-[background-color] duration-(--duration-fast)",
  INSET_RING
)

/**
 * One record in a phone list (41.5 rules 8 to 13):
 *
 *   Line 1  the name, body strong, up to two lines     [status badge]
 *   Line 2  fact · fact, label style, one line              [amount]
 *           (while a search is applied and `match` is passed:
 *            Email · rakesh@halcyon.in, the matched part in body strong)
 *   Line 3  [warning badge] one meta line                (optional)
 *
 * The WHOLE row is one link to the record (rule 12), through ShellLink so
 * the loading bar shows while the record loads (5.6). No tick box, no
 * three-dot menu, no swipe (rule 13): every action is on the record.
 * Cut text needs no tooltip, which a phone does not have: the record the
 * row opens holds every value in full (rule 10, 41.8 rule 18).
 *
 * SEARCH (27.1 on phone). Where the search matched a field other than the
 * name, pass `match` and line 2 says where: see the prop.
 *
 * SELECT MODE (41.6 rules 14 and 16), when the list has `selection`: a
 * tick box at the start of the row, and tapping anywhere on the row ticks
 * it instead of opening the record (41.7 rule 10). A ticked row is tinted
 * primary-subtle, the selected colour (16.2, 22.1). A row that cannot be
 * ticked shows its tick disabled, and a tap ANYWHERE on the row opens the
 * reason (41.6 rules 14 and 16: the row is the tap target, so the reason
 * cannot hide behind a 16px tick): permission-tooltip.tsx's reason is laid
 * over the whole row (see ROW_REASON). The disabled tick keeps the row's
 * name as its own (aria-labelledby the name), and the reason is a note
 * after the row's text, so a screen reader hears the record, then why.
 *
 * Use it inside a PhoneList (renderRow). Renders nothing on desktop.
 */
function PhoneListRow(props: PhoneListRowProps) {
  const { layout } = useLayout()
  if (layout !== "phone") return null
  return <PhoneListRowOnPhone {...props} />
}

function PhoneListRowOnPhone({
  href,
  name,
  status,
  facts,
  amount,
  meta,
  warning,
  match,
}: PhoneListRowProps) {
  if (facts && facts.length > MAX_FACTS) {
    throw new Error(
      `A phone list row was given ${facts.length} supporting facts. FRONTEND_RULES_PHONE.md section 41.5 rule 10 and 41.1 rule 6 allow two at most; the rest are on the record.`
    )
  }
  const row = React.useContext(RowContext)
  const nameId = React.useId()

  // Outside a PhoneList (no list to ask) the caller decides, by passing it.
  const shownMatch = match && (row ? row.searching : true) ? match : undefined
  const hasFacts = facts !== undefined && facts.length > 0

  const content = (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
      <div className="flex items-start gap-2">
        <Truncate id={nameId} phoneLines={2} className="min-w-0 flex-1 text-body font-medium text-text-primary">
          {name}
        </Truncate>
        {status ? <div className="flex shrink-0 items-center">{status}</div> : null}
      </div>
      {shownMatch || hasFacts || amount ? (
        <div className="flex items-baseline gap-2">
          {shownMatch ? (
            <MatchLine match={shownMatch} />
          ) : (
            <Truncate className="min-w-0 flex-1 text-label text-text-secondary">
              {(facts ?? []).join(" · ")}
            </Truncate>
          )}
          {amount ? (
            <span className="shrink-0 text-right text-label text-text-primary tabular-nums">{amount}</span>
          ) : null}
        </div>
      ) : null}
      {warning || meta ? (
        <div className="flex min-w-0 items-center gap-2">
          {warning ? (
            // Held to the line (section 8): the wrapper shrinks with the
            // meta, in proportion to each one's length, and the badge is
            // capped at the wrapper and cut inside it - never past the row.
            <div className={WARNING_SLOT}>{warning}</div>
          ) : null}
          {meta ? <Truncate className="min-w-0 flex-auto text-meta text-text-muted">{meta}</Truncate> : null}
        </div>
      ) : null}
    </div>
  )

  const selection = row?.selection ?? null
  if (selection && row) {
    const key = row.rowKey
    const reason = selection.reasonFor(key)
    const ticked = reason === null && selection.isSelected(key)
    return (
      <div
        data-slot="phone-list-row"
        data-selected={ticked || undefined}
        onClick={(event) => {
          // The tick answers its own tap, and a row that cannot be ticked
          // is wholly covered by its reason; the rest of the row ticks.
          const target = event.target as Element
          if (target.closest("[data-slot=checkbox], [role=note]")) return
          if (reason === null) selection.toggle(key)
        }}
        className={cn(
          LIST_ROW,
          "relative items-center",
          ticked ? "bg-primary-subtle" : "bg-surface",
          reason === null && "cursor-pointer active:bg-surface-control",
          reason !== null && ROW_REASON
        )}
      >
        <div className="flex shrink-0 items-center">
          {reason === null ? (
            <Checkbox
              checked={ticked}
              onCheckedChange={() => selection.toggle(key)}
              aria-labelledby={nameId}
            />
          ) : (
            <Checkbox checked={false} disabled aria-labelledby={nameId} />
          )}
        </div>
        {content}
        {reason !== null ? (
          // Last, so it paints over the row (ROW_REASON) and is read after it.
          <PermissionTooltip allowed={false} reason={reason}>
            {null}
          </PermissionTooltip>
        ) : null}
      </div>
    )
  }

  return (
    <ShellLink
      href={href}
      data-slot="phone-list-row"
      onClick={row?.onOpen}
      className={cn(LIST_ROW, "bg-surface active:bg-surface-control")}
    >
      {content}
    </ShellLink>
  )
}

/**
 * A row that cannot be ticked in select mode lays permission-tooltip.tsx's
 * reason over its whole area, so a tap anywhere on it opens the reason,
 * and the next tap anywhere closes it (41.8 rule 17), the row included.
 * The reason's own wrapper (role="note", focusable, so an attached
 * keyboard reaches it too) is stretched over the row from here, the row
 * being its parent: no second wrapper is written (26). Its focus ring is
 * drawn inside, because the row runs to the screen's edges, and its
 * corners are square like the row's. The reason opens below the row.
 */
const ROW_REASON = cn(
  "[&>[role=note]]:absolute [&>[role=note]]:inset-0 [&>[role=note]]:rounded-none",
  "[&>[role=note]]:focus-visible:-outline-offset-2"
)

/**
 * Line 3's warning slot (41.6 rule 18). It shrinks with the meta beside it
 * (both from their own length), and the badge inside is capped at the
 * slot's width and clips there, so a long "Approved by ..." never pushes
 * past the row at 320px (section 8, 41.13 rule 7).
 */
const WARNING_SLOT = cn(
  "flex max-w-full min-w-0 shrink items-center",
  "[&>[data-slot=badge]]:max-w-full [&>[data-slot=badge]]:min-w-0 [&>[data-slot=badge]]:overflow-hidden"
)

/**
 * Line 2 while a search is applied and matched a field other than the
 * name (27.1): "Email · rakesh@halcyon.in", in label style, one line, with
 * the matched part in body strong weight and text-primary (section 3) -
 * never a background colour. A screen reader hears "Email, rakesh@..."
 * (the dot is for the eye). The full value is on the record (41.5 rule 10).
 */
function MatchLine({ match }: { match: PhoneListMatch }) {
  const needle = match.matched.trim()
  const at = needle === "" ? -1 : match.text.toLowerCase().indexOf(needle.toLowerCase())
  return (
    <span
      data-slot="phone-list-match"
      className="block min-w-0 flex-1 truncate text-label text-text-secondary"
    >
      {match.label}
      <span aria-hidden> · </span>
      <span className="sr-only">, </span>
      {at < 0 ? (
        match.text
      ) : (
        <>
          {match.text.slice(0, at)}
          <span className="font-medium text-text-primary">{match.text.slice(at, at + needle.length)}</span>
          {match.text.slice(at + needle.length)}
        </>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------
   Skeleton rows - section 14.
   ------------------------------------------------------------------ */

/**
 * Rows in the shape of the rows to come: the first load, and the next 25
 * on their way (41.5 rule 14). Never a spinner. Hidden from screen
 * readers; the caller's count line says "Loading" (or "Searching").
 *
 * The phone list's own, exported so every phone screen of rows - the
 * search page's results too - shows the same skeleton (section 4 rule 2).
 * `continues` drops the top line below rows already loaded, whose line it
 * is. Outside a PhoneList, which runs its rows edge to edge, pass
 * content-area.tsx's BLEED as `className`. Renders nothing on desktop.
 */
function PhoneSkeletonRows({
  count,
  continues = false,
  className,
}: {
  count: number
  continues?: boolean
  className?: string
}) {
  const { layout } = useLayout()
  if (layout !== "phone") return null
  return (
    <ul
      aria-hidden
      data-slot="phone-list-skeleton"
      className={cn(
        "divide-y divide-border-light border-b border-border-light bg-surface",
        // Below loaded rows, the line above is theirs.
        !continues && "border-t",
        className
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={cn("flex min-h-16 flex-col justify-center gap-2 py-3", INSET)}>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------
   The add button - 41.5 rule 7.
   ------------------------------------------------------------------ */

/**
 * The round primary add button: 56px (--spacing-fab), at the bottom
 * right, 16px above the bar at the bottom of the screen (the tab bar, or
 * nothing below the top level: --bottom-bar) plus the bottom safe area,
 * and 16px in from the side plus the side safe area - or, held sideways,
 * the edge of the centred column the rows sit in (41.13 rule 10), read
 * from the content area's own padding. On the shell layer (5.5). The
 * plus icon at 22px, as the bars' icons (41.9 rule 8), and a
 * screen-reader label naming it, "Add client"; the plus needs no
 * tooltip (41.9 rule 9).
 *
 * It is the screen's one primary action (41.5 rule 7, 6.1 rule 1). Round
 * because rule 7 says so - the one control outside 5.3's radii. It floats
 * above the list, so it takes --shadow-menu (5.4, decision 14).
 *
 * Hidden while the keyboard is open and in select mode (rule 7); not
 * animated, since 5.6's list of motion has nothing for it.
 *
 * Permissions (26.1, decision 13): `allowed` true is the link to the add
 * form; undefined, not known yet, is disabled with no reason; false is
 * not rendered at all - 41.5 rule 7 puts it only "where the person may
 * add", which wins on phone over 26 rule 2.
 *
 * PhoneList renders it from its `add` prop; use it alone only on a phone
 * screen that is not a PhoneList. Renders nothing on desktop.
 */
function PhoneAddButton({ label, href, allowed, hidden = false }: PhoneAddButtonProps) {
  const { layout } = useLayout()
  const keyboard = useKeyboard()
  if (layout !== "phone" || hidden || keyboard.open || allowed === false) return null

  const look = "size-fab rounded-full p-0 shadow-menu"
  // On the icon itself: the button's own 16px rule for an icon without a
  // size class is the more specific selector, so a [&_svg] class here
  // would lose to it.
  const icon = <PlusIcon aria-hidden className="size-icon-empty" />
  return (
    <div
      data-slot="phone-add-button"
      className={cn(
        "fixed z-(--z-shell)",
        "bottom-[calc(var(--bottom-bar)_+_var(--safe-bottom)_+_var(--spacing)_*_4)]",
        "right-[var(--content-pad-right,calc(var(--spacing)_*_4_+_var(--safe-right)))]"
      )}
    >
      {allowed === true ? (
        <Button
          size={null}
          nativeButton={false}
          render={<ShellLink href={href} />}
          aria-label={label}
          className={look}
        >
          {icon}
        </Button>
      ) : (
        // Not known yet (26.1): disabled, with no reason - a reason shown
        // before the answer lands is a guess.
        <Button size={null} disabled aria-label={label} className={look}>
          {icon}
        </Button>
      )}
    </div>
  )
}

export {
  PhoneList,
  PhoneListRow,
  PhoneAddButton,
  PhoneSearchField,
  PhoneSkeletonRows,
  phoneListBranch,
  formatCount,
  PHONE_LIST_PAGE,
  PHONE_LIST_MAX,
}
export type {
  Noun,
  PhoneListProps,
  PhoneListRowProps,
  PhoneAddButtonProps,
  PhoneListState,
  PhoneListBranch,
  PhoneScreenBranch,
  PhoneSearchFieldProps,
  PhoneListSearch,
  PhoneListFilter,
  PhoneListFilterChip,
  PhoneListSort,
  PhoneListStatuses,
  PhoneListSelection,
  PhoneListMatch,
  PhoneListText,
}
