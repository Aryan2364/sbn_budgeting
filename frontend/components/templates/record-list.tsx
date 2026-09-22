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
import { ExportPdfButton } from "@/components/ui/export-pdf-button"
import type { PdfColumn, PdfTotalRow } from "@/lib/pdf-export"
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
  /** Omit to make the column unsortable — section 27.2 says declare which. */
  sortKey?: string
  render: (row: T) => React.ReactNode
}

const PRIORITY_CLASS: Record<ColumnPriority, string> = {
  essential: "",
  secondary: "hidden lg:table-cell",
  tertiary: "hidden md:table-cell",
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
   * Never wire `<ExportPdfButton />` through `toolbarExtra` instead —
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
   * Enables the "Export PDF" toolbar button, built and owned by
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
    columns: PdfColumn<T>[]
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
}: RecordListProps<T>) {
  const router = useRouter()
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [sort, setSort] = React.useState(
    () => defaultSort ?? columns.find((c) => c.sortKey)?.sortKey ?? "",
  )
  const [direction, setDirection] = React.useState<"asc" | "desc">(
    defaultDirection,
  )
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
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const [attempt, setAttempt] = React.useState(0)

  const request = JSON.stringify({ page, search, sort, direction, refreshKey, attempt })

  React.useEffect(() => {
    let cancelled = false
    load({ page, search, sort, direction })
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
  }, [load, page, search, sort, direction, request])

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
      setDirection((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSort(column.sortKey)
      setDirection("asc")
    }
    setPage(1)
  }

  const total = result?.total ?? 0
  const rows = result?.data ?? []
  const isFiltered = search.trim() !== ""

  // ---- PDF export: owned here, never at the page level -----------------
  //
  // `lastAggregatesRef` carries the most recent `result.aggregates` this
  // export run has seen, so the wrapped `buildTotalRow` below can hand
  // the caller the SAME totals the on-screen footer reads even though
  // `ExportPdfButton` itself only ever passes it the collected `rows`.
  const lastAggregatesRef = React.useRef<Record<string, string> | undefined>(
    undefined,
  )

  // Recreated on every render, so it always closes over the CURRENT
  // search/sort/direction state — the critical correctness property:
  // this is the exact same `search`/`sort`/`direction` the table below
  // is rendering with, not a copy captured once at mount.
  const exportFetchPage = exportPdf
    ? async (page: number, pageSize: number) => {
        const response = await load({ page, search, sort, direction, pageSize })
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
  const exportContextDescription =
    !isFiltered && isDefaultSort
      ? "Showing all records, default sort."
      : [searchDescription, sortDescription].filter(Boolean).join(" · ")

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

      <ListToolbar>
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
          <ExportPdfButton
            className="ml-auto"
            title={exportPdf.title}
            columns={exportPdf.columns}
            fetchPage={exportFetchPage}
            buildTotalRow={exportBuildTotalRow}
            contextDescription={exportContextDescription}
          />
        ) : null}
      </ListToolbar>

      <ListDataArea
        footer={
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
        }
      >
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
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    numeric={column.numeric}
                    className={cn(PRIORITY_CLASS[column.priority ?? "essential"])}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-lg text-label text-text-secondary transition-colors hover:text-text-primary",
                          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
                          column.numeric && "flex-row-reverse",
                        )}
                      >
                        {column.label}
                        {/* Section 27.2: only the active column shows a
                            chevron, and it shows the direction. */}
                        {sort === column.sortKey ? (
                          direction === "asc" ? (
                            <ChevronUpIcon className="size-4" />
                          ) : (
                            <ChevronDownIcon className="size-4" />
                          )
                        ) : (
                          <ArrowUpDownIcon className="size-4 opacity-0 transition-opacity group-hover/head:opacity-100" />
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
      </ListDataArea>
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
      {columns.map((column, index) => (
        <TableCell
          key={column.key}
          numeric={column.numeric}
          className={cn(PRIORITY_CLASS[column.priority ?? "essential"])}
        >
          {index === 0 ? (
            <span className="flex min-w-0 flex-col">
              <span className="min-w-0">{column.render(row)}</span>
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
            column.render(row)
          )}
        </TableCell>
      ))}
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
