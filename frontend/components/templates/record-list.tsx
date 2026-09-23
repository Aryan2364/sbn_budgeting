"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpDownIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { ApiError, type ListResponse, type Matchable } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PrintHeader } from "@/components/ui/print-header"
import {
  Pagination,
  PaginationBar,
  PaginationContent,
  PaginationCount,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { ExportButton } from "@/components/ui/export-button"
import type { ExportColumn, PdfTotalRow } from "@/lib/pdf-export"
import { PageFrame, PageHeader } from "@/components/templates/page"
import {
  ListDataArea,
  ListSearch,
  ListToolbar,
} from "@/components/templates/list-page"
import { formatNumber } from "@/lib/format"

/**
 * A list page with data behind it. Section 11.1's four zones, wired to
 * the API's shared list convention.
 *
 * Defined once and imported by every list screen (section 4 rule 2).
 * Projects, Sites and Expenses differ in their columns and their
 * filters and in nothing else, so those are the only props that vary.
 */

type ColumnPriority = "essential" | "secondary" | "tertiary"

/**
 * A constrained width vocabulary for table columns, in the spirit of
 * section 17's 12-column field-width spans: named sizes, never a raw
 * pixel picked per screen. Values live once, as tokens, in
 * `app/globals.css` (`--spacing-col-*`).
 *
 * **This is for columns with a KNOWN maximum content size — Date,
 * Period, Bill no., Amount — not for free-text columns.** A first
 * version of this feature did the opposite (gave Description and Cost
 * head a fixed 280px each) and that starved the predictable columns:
 * with two 280px columns eating over half a 927px table, Date/Period/
 * Amount were left to split a ~227px remainder three ways and their
 * headers clipped. Fix: pin the columns whose longest possible value
 * is known and give the free-text columns (Description, Cost head,
 * Site) NO declared width at all, so `table-layout:fixed` hands them
 * whatever is left and they truncate — which is the correct outcome
 * for them and the reason `Truncate` exists.
 *
 * OPT-IN. A column that omits `width` keeps its old behaviour: no
 * declared width, sharing whatever space `table-layout:fixed` leaves
 * over after the columns that do declare one. This is what keeps
 * every other `RecordList` caller (Sites, Reports, Dashboard, the
 * Settings master lists) unaffected — none of them sets `width`.
 */
type ColumnWidth = "tight" | "narrow" | "amount"

export interface RecordColumn<T> {
  key: string
  label: string
  /** Section 11.1: numbers right-aligned, text left. */
  numeric?: boolean
  /**
   * Section 10 rule 4: every table declares which columns are
   * essential, which are secondary (hidden below 1024) and which are
   * tertiary (hidden below 768).
   */
  priority?: ColumnPriority
  /**
   * Pins this column to a fixed width because its content has a KNOWN
   * maximum — never on a free-text column (see `ColumnWidth` above).
   * `tight` 110px (Date, Period), `narrow` 140px (Bill no.), `amount`
   * 160px (Amount). Leaving Description/Cost head/Site undeclared is
   * what gives `table-layout:fixed` a bounded remainder to share
   * between them, so a paragraph-length value truncates instead of
   * widening the column or the table past its container (section 1
   * rule 6, section 8). Declaring `width` on any column switches this
   * table to `table-layout:fixed`; columns without it keep sharing the
   * remaining space as before.
   */
  width?: ColumnWidth
  /** Omit to make the column unsortable — section 27.2 says declare which. */
  sortKey?: string
  render: (row: T) => React.ReactNode
}

const PRIORITY_CLASS: Record<ColumnPriority, string> = {
  essential: "",
  secondary: "hidden lg:table-cell",
  tertiary: "hidden md:table-cell",
}

/**
 * Literal class strings, matched by Tailwind's content scan the same
 * way `PRIORITY_CLASS` above already is. A previous attempt built
 * `max-w-[280px]` etc. as arbitrary values scattered in page files;
 * some of those exact bracket values were never scanned and silently
 * did nothing (`getComputedStyle` showed `max-width: none`). These
 * three strings are `w-col-tight` / `w-col-narrow` / `w-col-amount` —
 * ordinary Tailwind utilities generated from the `--spacing-col-*`
 * tokens in `globals.css`, the exact same mechanism that already
 * produces `w-search` and `max-w-field-max` elsewhere in this
 * codebase, so there is no bracket value for the scanner to miss.
 */
const WIDTH_CLASS: Record<ColumnWidth, string> = {
  tight: "w-col-tight",
  narrow: "w-col-narrow",
  amount: "w-col-amount",
}

/**
 * Section 27.3: search, sort AND filter, all owned here. Exported so a
 * caller that wants to control this state (to persist it in the URL,
 * section 27.3's "filters, search and sort persist when the user opens
 * a record and comes back") has a name for the shape it is lifting.
 */
export interface ListState {
  search: string
  sort: string
  direction: "asc" | "desc"
  page: number
  /** Query-string values, e.g. `spentOnFrom: "2026-08-01"`. */
  filters: Record<string, string | undefined>
}

export interface RecordListProps<T> {
  title: string
  /** Section 11.1: the record count as meta text under the title. */
  countLabel: (total: number) => string
  searchLabel: string
  searchPlaceholder: string
  /** Omitted on a read-only screen, which then has no primary button. */
  createHref?: string
  createLabel?: string
  /**
   * Section 27.2: every list declares its default sort. Without this
   * the default was "the first sortable column, descending", which is
   * a guess that happened to suit three screens and does not suit the
   * variance report — its default is variance ASCENDING, so the most
   * overspent site is on screen without anyone touching a control.
   */
  defaultSort?: string
  defaultDirection?: "asc" | "desc"
  columns: RecordColumn<T>[]
  rowHref?: (row: T) => string
  /**
   * `pageSize` is OPTIONAL and additive. Existing callers that ignore it
   * keep using the server's `DEFAULT_PAGE_SIZE` exactly as before — this
   * exists so `RecordList`'s own PDF export (see `exportPdf` below) can
   * ask for the API's `MAX_PAGE_SIZE` (100) instead of paging one screen
   * at a time.
   */
  load: (params: {
    page: number
    search: string
    sort: string
    direction: "asc" | "desc"
    pageSize?: number
    /** Section 27.3's filter panel. Absent for callers with no filters. */
    filters?: Record<string, string | undefined>
  }) => Promise<ListResponse<T & Matchable>>
  /** What "nothing yet" offers. Section 13: never to someone who filtered. */
  emptyHeading: string
  emptyBody: string
  /**
   * Where "nothing yet" sends the user, when that is somewhere other
   * than this screen's own create action.
   *
   * A read-only screen has no create action and would otherwise show
   * an empty state whose button does nothing — a dead end, which
   * section 13 and the "no dead ends" rule both forbid. The variance
   * report cannot create a site; it can send the user to the screen
   * that can.
   */
  emptyActionLabel?: string
  emptyActionHref?: string
  /** Extra controls for the toolbar, between search and the far right. */
  toolbarExtra?: React.ReactNode
  /**
   * Section 33: the optional fifth zone, between the header and the
   * toolbar. Nothing else may come between them.
   */
  sectionTabs?: React.ReactNode
  /**
   * The print-only header line (`PrintHeader`), shown only when this
   * list also exports to PDF via the `exportPdf` prop below. Rendered
   * in the page header, which the print stylesheet never hides —
   * unlike the toolbar the export button itself sits in.
   *
   * Never wire the download button through `toolbarExtra` instead —
   * a button built at the page level closes over whatever `search`/
   * `sort`/`direction` the caller happened to have at that point, and
   * cannot see the live values this component updates as the user
   * types and sorts. That is exactly the bug `exportPdf` exists to
   * rule out: the button it renders is built HERE, from the same
   * state the table below is rendering with, so the PDF and the
   * screen can never disagree.
   */
  printTitle?: string
  /** Bumping this refetches — used after a delete or a save elsewhere. */
  refreshKey?: number
  /**
   * Optional: an aggregate figure joined onto the header meta line,
   * next to the record count (section 11.1 zone 1 — "record count as
   * meta text under the title"). This is a LIST PAGE, not a data entry
   * grid (section 31.3) or a report table (section 34) — neither of
   * those sections' pinned-footer rules apply here, so the total lives
   * in the non-scrolling header instead of costing the data area a row.
   *
   * Reads `result.aggregates`, the same server-computed figure the old
   * footer row read. Joined with the same "·" convention this
   * component already uses for `exportContextDescription` below.
   *
   * Omitted by every existing caller, so nothing else changes.
   */
  metaTotal?: (aggregates: Record<string, string>) => React.ReactNode
  /**
   * Embeds the toolbar/table/pagination WITHOUT the page chrome —
   * `PageFrame`/`PageHeader`, section tabs and the print-only heading.
   *
   * Used exactly once so far: the site detail page's Expenses tab. That
   * screen already has its own title (the Card's `CardTitle`) and sits
   * inside a Card inside a Tabs panel on a DETAIL page — a second page
   * title inside a card would be a bug, not a feature (section 11.2).
   *
   * This ALSO changes scroll ownership (section 10). A list page's data
   * area owns the scroll via `ListDataArea`'s internal
   * `overflow-y-auto`; a detail page's PAGE owns the scroll and its
   * cards do not. Nesting `ListDataArea`'s fixed-height scroller inside
   * a Card on a scrolling detail page would stack two vertical
   * scrollers on the same axis, which section 1 rule 8 forbids — the
   * user's wheel would get trapped in the card. So when `embedded` is
   * true this renders the table and pagination bar as plain flow
   * content with no internal scroll container, and the surrounding
   * page (`PageScroller`) scrolls it like everything else on the page.
   */
  embedded?: boolean
  /**
   * Section 27.3's filter panel, controlled from outside so a caller can
   * persist it (e.g. in the URL, matching how `app/(app)/reports/page.tsx`
   * already reads a `?view=` param via `useSearchParams`). Optional and
   * paired with `onListStateChange` — a caller that supplies neither
   * gets the fully internal search/sort/page state this component has
   * always had, so every existing screen is unaffected.
   *
   * `filters` rides into every `load()` call and into the request cache
   * key, exactly like `search`/`sort`/`direction` already do.
   */
  listState?: ListState
  onListStateChange?: (next: ListState) => void
  /**
   * Section 27.3: active filters appear as removable chips BELOW the
   * toolbar. Driven off `result.appliedFilters` — the server's own
   * record of what it actually applied — never off the request filters
   * a caller may have set but the server rejected or never received, so
   * a chip can never disagree with what is actually on screen.
   *
   * The caller builds the chip nodes (it knows how to label a date or
   * an amount, and which keys are its own to hide — e.g. a site page's
   * own `siteId` scope must never be offered as a removable chip). This
   * component only renders whatever comes back, plus an always-present
   * "Clear all" that resets `listState.filters` to `{}`.
   */
  renderFilterChips?: (appliedFilters: Record<string, string>) => React.ReactNode
  /**
   * The active filters described in plain words, in the same phrasing
   * `renderFilterChips` renders as chips (ideally backed by the exact
   * same labeller — see `expenseFilterLabels` in
   * `components/forms/expense-filter.tsx`) — used to build the PDF
   * export's heading so a filtered report says so. Omitted by a caller
   * with no filters, same as `renderFilterChips`.
   */
  describeFilters?: (appliedFilters: Record<string, string>) => string[]
  /**
   * Embedded mode has no header to carry the record count or the
   * `metaTotal` figure (there is no header at all), so the caller reads
   * them back here instead — e.g. the site page's tab badge and its
   * "Total spent" line. Called whenever the settled result changes.
   */
  onResult?: (info: { total: number; aggregates?: Record<string, string> }) => void
  /**
   * Enables the download toolbar button (PDF and CSV), built and owned by
   * `RecordList` itself — never passed in via `toolbarExtra` — because
   * only `RecordList` knows the CURRENT search/sort/direction. A
   * `fetchPage` built at the page level would silently export
   * unfiltered, default-sorted data while the PDF heading claimed
   * otherwise (a report that lies is worse than no report).
   *
   * `title` and `columns` are what only the caller knows (the PDF's
   * heading and how to render each column's cell text — see
   * `PdfColumn`). `buildTotalRow` is called with the collected rows and,
   * when the caller declared `totals` above, the same `aggregates` the
   * on-screen total row reads, so the PDF's total can reuse the exact
   * `formatAmount`/etc. text as the screen instead of re-deriving it.
   */
  exportPdf?: {
    /** The PDF heading and the downloaded filename's seed. */
    title: string
    /** In the same order as the on-screen columns, formatted the same way. */
    columns: ExportColumn<T>[]
    /**
     * Builds the bold total row. `aggregates` is the same
     * `result.aggregates` the on-screen `totals` footer reads (present
     * only when `totals` above is also supplied) — reuse `totals.render`
     * so the two can never disagree in value or wording.
     */
    buildTotalRow?: (
      rows: T[],
      aggregates?: Record<string, string>,
    ) => PdfTotalRow | undefined
  }
}

export function RecordList<T extends { id: string }>({
  title,
  countLabel,
  searchLabel,
  searchPlaceholder,
  createHref,
  createLabel,
  defaultSort,
  defaultDirection = "desc",
  columns,
  rowHref,
  load,
  emptyHeading,
  emptyBody,
  emptyActionLabel,
  emptyActionHref,
  toolbarExtra,
  sectionTabs,
  printTitle,
  refreshKey = 0,
  metaTotal,
  exportPdf,
  embedded = false,
  onResult,
  listState,
  onListStateChange,
  renderFilterChips,
  describeFilters,
}: RecordListProps<T>) {
  const router = useRouter()

  // Controlled-with-internal-default, the same pattern `HeadPeriodGrid`
  // uses for `measure` (see reports/page.tsx): a caller supplying both
  // `listState` and `onListStateChange` owns this state (typically to
  // persist it in the URL); everyone else gets the internal state this
  // component has always had.
  const isControlled = listState !== undefined && onListStateChange !== undefined
  const [internalState, setInternalState] = React.useState<ListState>(() => ({
    search: "",
    sort: defaultSort ?? columns.find((c) => c.sortKey)?.sortKey ?? "",
    direction: defaultDirection,
    page: 1,
    filters: {},
  }))
  const listStateValue = isControlled ? listState! : internalState
  const updateState = React.useCallback(
    (patch: Partial<ListState>) => {
      const next: ListState = { ...listStateValue, ...patch }
      if (isControlled) onListStateChange!(next)
      else setInternalState(next)
    },
    [listStateValue, isControlled, onListStateChange],
  )

  const { search, sort, direction, page, filters } = listStateValue
  const setPage = (updater: number | ((p: number) => number)) =>
    updateState({ page: typeof updater === "function" ? updater(page) : updater })

  const [searchInput, setSearchInput] = React.useState(search)
  /**
   * The result carries the request it answers, so "loading" is derived
   * rather than set at the top of the effect. Setting a flag there
   * renders the stale list once and then immediately renders again.
   */
  const [answer, setAnswer] = React.useState<{
    result: ListResponse<T & Matchable> | null
    failure: string | null
    request: string
  }>({ result: null, failure: null, request: "" })

  // Section 27.1: search runs about 300ms after the user stops typing,
  // not on every keystroke.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== search) updateState({ search: searchInput, page: 1 })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const [attempt, setAttempt] = React.useState(0)

  const request = JSON.stringify({
    page,
    search,
    sort,
    direction,
    filters,
    refreshKey,
    attempt,
  })

  React.useEffect(() => {
    let cancelled = false
    load({ page, search, sort, direction, filters })
      .then((response) => {
        if (!cancelled) setAnswer({ result: response, failure: null, request })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setAnswer({
          result: null,
          request,
          failure:
            error instanceof ApiError
              ? error.message
              : "The list could not be loaded.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [load, page, search, sort, direction, filters, request])

  const settled = answer.request === request
  const state: "loading" | "ready" | "failed" = !settled
    ? "loading"
    : answer.failure !== null
      ? "failed"
      : "ready"
  const result = settled ? answer.result : null
  const failure = answer.failure ?? ""

  function toggleSort(column: RecordColumn<T>) {
    if (!column.sortKey) return
    if (sort === column.sortKey) {
      updateState({ direction: direction === "asc" ? "desc" : "asc", page: 1 })
    } else {
      updateState({ sort: column.sortKey, direction: "asc", page: 1 })
    }
  }

  const total = result?.total ?? 0
  const rows = result?.data ?? []
  const isFiltered = search.trim() !== ""

  // Embedded mode has no header to read the total/aggregates off of, so
  // the caller gets them here instead (e.g. the site page's tab badge).
  React.useEffect(() => {
    if (!onResult || !result) return
    onResult({ total: result.total, aggregates: result.aggregates })
  }, [onResult, result])

  // ---- PDF export: owned here, never at the page level -----------------
  //
  // `lastAggregatesRef` carries the most recent `result.aggregates` this
  // export run has seen, so the wrapped `buildTotalRow` below can hand
  // the caller the SAME totals the on-screen footer reads even though
  // `ExportButton` itself only ever passes it the collected `rows`.
  const lastAggregatesRef = React.useRef<Record<string, string> | undefined>(
    undefined,
  )

  // Recreated on every render, so it always closes over the CURRENT
  // search/sort/direction state — the critical correctness property:
  // this is the exact same `search`/`sort`/`direction` the table below
  // is rendering with, not a copy captured once at mount.
  const exportFetchPage = exportPdf
    ? async (page: number, pageSize: number) => {
        const response = await load({ page, search, sort, direction, pageSize, filters })
        lastAggregatesRef.current = response.aggregates
        return { data: response.data, total: response.total }
      }
    : undefined

  const exportBuildTotalRow = exportPdf?.buildTotalRow
    ? (rows: T[]) => exportPdf.buildTotalRow!(rows, lastAggregatesRef.current)
    : undefined

  // Section 27: describe the active search/sort in the same words the
  // toolbar and column headers use. A printed report that does not say
  // it was filtered misleads whoever reads it on paper.
  const sortColumn = columns.find((c) => c.sortKey === sort)
  const sortDescription = sortColumn
    ? `Sort: ${sortColumn.label} (${direction === "asc" ? "ascending" : "descending"})`
    : null
  const searchDescription = isFiltered ? `Search: "${search.trim()}"` : null
  const isDefaultSort =
    sort === (defaultSort ?? columns.find((c) => c.sortKey)?.sortKey ?? "") &&
    direction === defaultDirection
  const filterLabels = describeFilters?.(result?.appliedFilters ?? {}) ?? []
  const hasActiveFilters = filterLabels.length > 0
  const filterDescription = hasActiveFilters ? `Filter: ${filterLabels.join(", ")}` : null
  const exportContextDescription =
    !isFiltered && !hasActiveFilters && isDefaultSort
      ? "Showing all records, default sort."
      : [searchDescription, filterDescription, sortDescription].filter(Boolean).join(" · ")

  const toolbar = (
    <ListToolbar className={embedded ? "mt-0" : undefined}>
      <ListSearch
        label={searchLabel}
        placeholder={searchPlaceholder}
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        onClear={() => setSearchInput("")}
      />
      {/* Section 27.1: the result count sits beside the field. */}
      {isFiltered && state === "ready" ? (
        <span className="text-label text-text-secondary">
          {formatNumber(total)} {total === 1 ? "result" : "results"}
        </span>
      ) : null}
      {toolbarExtra}
      {exportPdf ? (
        <ExportButton
          className="ml-auto"
          title={exportPdf.title}
          columns={exportPdf.columns}
          fetchPage={exportFetchPage}
          buildTotalRow={exportBuildTotalRow}
          contextDescription={exportContextDescription}
        />
      ) : null}
    </ListToolbar>
  )

  // Section 27.3: active filters as removable chips below the toolbar,
  // plus an always-available "Clear all". `activeFilterCount` reads the
  // REQUEST side (`listStateValue.filters`) rather than the response, so
  // the zone still shows immediately after the user applies a filter and
  // before the new response has settled, and never counts a page-owned
  // scope (e.g. the site page's `siteId`) that is never put in this bag.
  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "",
  ).length
  const filterChipZone =
    activeFilterCount > 0 ? (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {renderFilterChips?.(result?.appliedFilters ?? {})}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => updateState({ filters: {}, page: 1 })}
        >
          Clear all
        </Button>
      </div>
    ) : null

  const paginationBar = (
    <PaginationBar>
      <PaginationCount>
        {state === "ready" && total > 0
          ? `Showing ${formatNumber((result!.page - 1) * result!.pageSize + 1)} to ${formatNumber(
              Math.min(result!.page * result!.pageSize, total),
            )} of ${formatNumber(total)}`
          : countLabel(total)}
      </PaginationCount>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              aria-disabled={page <= 1}
              className={cn(page <= 1 && "pointer-events-none opacity-50")}
              onClick={(event) => {
                event.preventDefault()
                setPage((p) => Math.max(1, p - 1))
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <span className="px-3 text-label text-text-secondary">
              Page {formatNumber(result?.page ?? 1)} of{" "}
              {formatNumber(result?.totalPages ?? 1)}
            </span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              aria-disabled={page >= (result?.totalPages ?? 1)}
              className={cn(
                page >= (result?.totalPages ?? 1) &&
                  "pointer-events-none opacity-50",
              )}
              onClick={(event) => {
                event.preventDefault()
                setPage((p) => Math.min(result?.totalPages ?? 1, p + 1))
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </PaginationBar>
  )

  // Section 17-in-the-spirit-of: table-fixed only turns on when a
  // caller actually declared a column width. Every other caller
  // (Sites, Reports "By site", the Settings master lists, Dashboard)
  // declares none, so its table keeps today's `table-layout: auto`.
  const hasColumnWidths = columns.some((column) => column.width)

  const tableContent = (
    <>
      {/* Section 13: three empty states, and using the wrong one makes
          the software look unintelligent. */}
      {state === "failed" ? (
          <EmptyState
            variant="failed"
            heading="The list could not be loaded"
            onAction={() => setAttempt((a) => a + 1)}
          >
            {failure}
          </EmptyState>
        ) : state === "ready" && rows.length === 0 && isFiltered ? (
          <EmptyState
            variant="nothing-found"
            heading={`No records match “${search}”`}
            onAction={() => setSearchInput("")}
          >
            Nothing matched that search. Clearing it will widen the list.
          </EmptyState>
        ) : state === "ready" && rows.length === 0 ? (
          <EmptyState
            variant="nothing-yet"
            heading={emptyHeading}
            actionLabel={emptyActionLabel ?? createLabel}
            onAction={
              emptyActionHref
                ? () => router.push(emptyActionHref)
                : createHref
                  ? () => router.push(createHref)
                  : undefined
            }
          >
            {emptyBody}
          </EmptyState>
        ) : (
          <Table className={cn(hasColumnWidths && "table-fixed")}>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    numeric={column.numeric}
                    className={cn(
                      PRIORITY_CLASS[column.priority ?? "essential"],
                      column.width && WIDTH_CLASS[column.width],
                    )}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          "flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-lg text-label text-text-secondary transition-colors hover:text-text-primary",
                          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
                          column.numeric && "flex-row-reverse justify-end",
                        )}
                      >
                        {/* Section 8: the label truncates, the chevron
                            (section 27.2's sort direction indicator) never
                            shrinks and stays visible - a sort control the
                            user cannot see is worse than a clipped word. */}
                        <Truncate className="min-w-0">{column.label}</Truncate>
                        {/* Section 27.2: only the active column shows a
                            chevron, and it shows the direction. */}
                        {sort === column.sortKey ? (
                          direction === "asc" ? (
                            <ChevronUpIcon className="size-4 shrink-0" />
                          ) : (
                            <ChevronDownIcon className="size-4 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDownIcon className="size-4 shrink-0 opacity-0 transition-opacity group-hover/head:opacity-100" />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {state === "loading"
                ? Array.from({ length: 8 }, (_, row) => (
                    <TableRow key={`skeleton-${row}`}>
                      {columns.map((column) => (
                        <TableCell
                          key={column.key}
                          className={cn(
                            PRIORITY_CLASS[column.priority ?? "essential"],
                            column.width && WIDTH_CLASS[column.width],
                          )}
                        >
                          <Skeleton
                            className={cn("h-4 w-3/4", column.numeric && "ml-auto")}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map((row) => (
                    <RecordRow
                      key={row.id}
                      row={row}
                      columns={columns}
                      href={rowHref?.(row)}
                      onOpen={rowHref ? () => router.push(rowHref(row)) : undefined}
                    />
                  ))}
            </TableBody>
          </Table>
        )}
    </>
  )

  if (embedded) {
    // Section 10: the detail page (`PageScroller`) owns the scroll here,
    // not this table — so no `ListDataArea` wrapper (it would add an
    // inner `overflow-y-auto`, stacking two vertical scrollers on the
    // same axis, forbidden by section 1 rule 8). Just the toolbar, the
    // table itself in a plain bordered box, and the pagination bar,
    // all as ordinary flow content the page scrolls along with.
    return (
      <div className="flex flex-col gap-4">
        {toolbar}
        {filterChipZone}
        <div className="overflow-hidden rounded-lg border border-border-light">
          {tableContent}
        </div>
        {paginationBar}
      </div>
    )
  }

  return (
    <PageFrame>
      <PageHeader
        title={title}
        meta={
          state === "loading" && !result
            ? "Loading records"
            : metaTotal && result?.aggregates
              ? [countLabel(total), metaTotal(result.aggregates)]
                  .filter(Boolean)
                  .reduce<React.ReactNode[]>((acc, part, index) => {
                    if (index > 0) acc.push(" · ")
                    acc.push(part)
                    return acc
                  }, [])
              : countLabel(total)
        }
        actions={
          createHref && createLabel ? (
            <Button render={<Link href={createHref} />}>
              <PlusIcon />
              {createLabel}
            </Button>
          ) : undefined
        }
      />

      {printTitle ? <PrintHeader title={printTitle} /> : null}

      {sectionTabs}

      {toolbar}
      {filterChipZone}

      <ListDataArea footer={paginationBar}>{tableContent}</ListDataArea>
    </PageFrame>
  )
}

function RecordRow<T extends { id: string }>({
  row,
  columns,
  href,
  onOpen,
}: {
  row: T & Matchable
  columns: RecordColumn<T>[]
  href?: string
  onOpen?: () => void
}) {
  const content = (
    <>
      {columns.map((column, index) => {
        const rendered = column.render(row)
        return (
          <TableCell
            key={column.key}
            numeric={column.numeric}
            className={cn(
              PRIORITY_CLASS[column.priority ?? "essential"],
              column.width && WIDTH_CLASS[column.width],
            )}
          >
            {index === 0 ? (
              <span className="flex min-w-0 flex-col">
                <span className="min-w-0">
                  {typeof rendered === "string" ? (
                    <Truncate>{rendered}</Truncate>
                  ) : (
                    rendered
                  )}
                </span>
                {/* Section 27.1: when the match is on a field other than
                    the title, the row says where it matched. Without
                    this, results look random. */}
                {row.matchedField ? (
                  <span className="mt-0.5 flex min-w-0 items-center gap-1 text-meta text-text-muted">
                    <Badge variant="neutral">{row.matchedField}</Badge>
                    <Truncate className="min-w-0">{row.matchedValue ?? ""}</Truncate>
                  </span>
                ) : null}
              </span>
            ) : (
              rendered
            )}
          </TableCell>
        )
      })}
    </>
  )

  if (!href || !onOpen) return <TableRow>{content}</TableRow>

  /**
   * Client-side navigation, not a location assignment: a full reload
   * would throw away the shell and re-fetch the session on every row
   * click. Keyboard-reachable, because a row that only responds to a
   * mouse is unreachable for the people who use this software most.
   */
  return (
    <TableRow
      role="link"
      tabIndex={0}
      className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ring"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      {content}
    </TableRow>
  )
}
