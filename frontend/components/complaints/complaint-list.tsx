"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatDate, formatNumber } from "@/lib/format"
import type { ListResponse, Matchable } from "@/lib/api"
import {
  complaintPlace,
  complaintsApi,
  type ComplaintCounts,
  type ComplaintRow,
  type ComplaintTab,
} from "@/lib/complaints-api"
import { errorMessage } from "@/components/shell/session"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardLink, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowLink,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { PageFrame, PageHeader } from "@/components/templates/page"
import {
  ListDataArea,
  ListPagination,
  ListSearch,
  ListToolbar,
} from "@/components/templates/list-page"
import { ComplaintTabs, COMPLAINT_TABS } from "@/components/complaints/complaint-tabs"
import {
  ComplaintFilterButton,
  ComplaintFilterChips,
  countFilters,
  type ComplaintFilters,
} from "@/components/complaints/complaint-filter"
import { ageLabel, ComplaintStatusBadge } from "@/components/complaints/status"
import { useComplaintMasters } from "@/components/complaints/use-masters"

/**
 * `/complaints` — section 11.1's list page with section 33 tabs.
 *
 *   1  header     title, the active tab's count as meta, ONE primary
 *                 action: Raise complaint
 *   1a tabs       Assigned to me / Raised by me / All, each with its
 *                 count from /complaints/counts
 *   2  toolbar    search (27.1) and Filter (27.3)
 *   3  data       a table from 768px, record cards below it (the agreed
 *                 phone exception); the only scrolling zone
 *   4  pagination "1–25 of 148"
 *
 * All of it lives in the URL (27.3: filters, search and sort persist
 * when the user opens a complaint and comes back), and each tab has its
 * own toolbar state (33.4): switching tab clears search and filters.
 *
 * Search covers what the API's runListQuery searches for complaints
 * (reference, title, description, complainant, site, location, category
 * and the people on it). Long free text is the API's to exclude, not ours.
 *
 * A complaint's main line is its title (owner, 6 Oct 2026), so the title
 * is the row's link (11.1.2); the description, which is optional, sits
 * under it only when there is one.
 *
 * A complaint is filed against a site (CONTRACT §10); one raised before
 * sites has none and shows its location in the Site column instead.
 */

const TAB_VALUES = COMPLAINT_TABS.map((t) => t.value)
const DEFAULT_SORT = "raisedAt"

type SortKey = "number" | "raisedAt" | "site"
const SORT_KEYS: SortKey[] = ["number", "raisedAt", "site"]

interface ListUrlState {
  tab: ComplaintTab
  search: string
  filters: ComplaintFilters
  page: number
  sort: SortKey
  direction: "asc" | "desc"
}

function readState(params: URLSearchParams): ListUrlState {
  const tab = params.get("tab") as ComplaintTab | null
  const sort = params.get("sort")
  return {
    tab: tab && TAB_VALUES.includes(tab) ? tab : "all",
    search: params.get("q") ?? "",
    filters: {
      status: params.get("status") ?? undefined,
      siteId: params.get("siteId") ?? undefined,
      categoryId: params.get("categoryId") ?? undefined,
    },
    page: Math.max(1, Number(params.get("page") ?? "1") || 1),
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_SORT,
    direction: params.get("dir") === "asc" ? "asc" : "desc",
  }
}

function writeState(state: ListUrlState): string {
  const params = new URLSearchParams()
  params.set("tab", state.tab)
  if (state.search) params.set("q", state.search)
  if (state.filters.status) params.set("status", state.filters.status)
  if (state.filters.siteId) params.set("siteId", state.filters.siteId)
  if (state.filters.categoryId) params.set("categoryId", state.filters.categoryId)
  if (state.page !== 1) params.set("page", String(state.page))
  if (state.sort !== DEFAULT_SORT) params.set("sort", state.sort)
  if (state.direction !== "desc") params.set("dir", state.direction)
  return `?${params.toString()}`
}

/** Which tab a person most likely wants when they arrive with none chosen. */
function defaultTab(counts: ComplaintCounts): ComplaintTab {
  if (counts.assigned > 0) return "assigned"
  return "all"
}

const EMPTY_COPY: Record<
  ComplaintTab,
  { heading: string; body: string; action: "raise" | "all" }
> = {
  assigned: {
    heading: "Nothing is assigned to you",
    body: "Complaints raised at a site you supervise appear here until you resolve them.",
    action: "all",
  },
  raised: {
    heading: "You have not raised a complaint yet",
    body: "Complaints you raise appear here, so you can follow them until they close.",
    action: "raise",
  },
  all: {
    heading: "No complaints yet",
    body: "Complaints you raise, or that are sent to you, appear here.",
    action: "raise",
  },
}

export function ComplaintList() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hadTab = React.useRef(searchParams.has("tab"))

  const [state, setState] = React.useState<ListUrlState>(() => readState(searchParams))
  const [searchInput, setSearchInput] = React.useState(state.search)

  // The URL follows the state, never the other way round, so typing is
  // never fought by a re-read. Replace, not push (33.4).
  React.useEffect(() => {
    router.replace(`${pathname}${writeState(state)}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // 27.1: search runs 300ms after typing stops.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setState((s) => (s.search === searchInput ? s : { ...s, search: searchInput, page: 1 }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // ---- counts, once per visit -------------------------------------
  const [counts, setCounts] = React.useState<ComplaintCounts | null>(null)
  React.useEffect(() => {
    let cancelled = false
    complaintsApi
      .counts()
      .then((next) => {
        if (cancelled) return
        setCounts(next)
        // Arriving from the sidebar with no tab: open the one that has
        // work in it, rather than a long "All" list.
        if (!hadTab.current) {
          hadTab.current = true
          const tab = defaultTab(next)
          setState((s) => (s.tab === tab ? s : { ...s, tab }))
        }
      })
      .catch(() => {
        // The counts are a convenience. The list below reports its own
        // failure; the tab pills simply stay absent.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ---- the masters for the filter -----------------------------------
  const masters = useComplaintMasters({ activeOnly: false })
  const siteOptions = React.useMemo(
    () => (masters.sites ?? []).map((s) => ({ value: s.id, label: s.name })),
    [masters.sites],
  )
  const categoryOptions = React.useMemo(
    () => (masters.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    [masters.categories],
  )

  // ---- the rows ----------------------------------------------------
  const [attempt, setAttempt] = React.useState(0)
  const request = JSON.stringify({ ...state, attempt })
  const [answer, setAnswer] = React.useState<{
    request: string
    result: ListResponse<ComplaintRow & Matchable> | null
    error: string | null
  }>({ request: "", result: null, error: null })
  /**
   * The last good result, kept on screen while the next loads (5.6) —
   * but ONLY within the tab it came from. A new page, sort or search on
   * the same tab keeps the old rows steady; a different tab is different
   * data, and showing the previous tab's rows under it (then swapping
   * them for that tab's empty state) is a flicker that lies about what
   * the tab contains. A new tab shows its skeleton instead.
   */
  const [shown, setShown] = React.useState<{
    tab: ComplaintTab
    result: ListResponse<ComplaintRow & Matchable>
  } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    complaintsApi
      .list({
        tab: state.tab,
        page: state.page,
        pageSize: 25,
        search: state.search || undefined,
        sort: state.sort,
        direction: state.direction,
        ...state.filters,
      })
      .then((result) => {
        if (cancelled) return
        setAnswer({ request, result, error: null })
        setShown({ tab: state.tab, result })
        // An unfiltered first page's total IS the tab's count (CONTRACT
        // §3). Counts load once per visit, so keep the pill in step with
        // what the list just said rather than letting the two disagree.
        const unfiltered = state.search.trim() === "" && countFilters(state.filters) === 0
        if (unfiltered) {
          setCounts((c) =>
            c && c[state.tab] !== result.total ? { ...c, [state.tab]: result.total } : c,
          )
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setAnswer({ request, result: null, error: errorMessage(caught) })
      })
    return () => {
      cancelled = true
    }
    // `request` already encodes every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  const settled = answer.request === request
  const phase: "loading" | "ready" | "failed" = !settled
    ? "loading"
    : answer.error !== null
      ? "failed"
      : "ready"
  const result =
    phase === "ready" ? answer.result : shown?.tab === state.tab ? shown.result : null
  const rows = result?.data ?? []
  const total = result?.total ?? 0
  const filtered = state.search.trim() !== "" || countFilters(state.filters) > 0
  /**
   * The tab's own count already says it is empty, and nothing narrows it.
   * Show the empty state at once instead of a table-shaped skeleton that
   * then collapses into it (14.1: the page does not jump when data
   * lands). The request still runs; if the count was stale the rows
   * arrive and replace this, and the count is corrected above.
   */
  const knownEmpty =
    phase === "loading" && !result && !filtered && counts !== null && counts[state.tab] === 0
  const showsNothingYet = (phase === "ready" && rows.length === 0 && !filtered) || knownEmpty

  const switchTab = (tab: ComplaintTab) => {
    setSearchInput("")
    setState({ tab, search: "", filters: {}, page: 1, sort: DEFAULT_SORT, direction: "desc" })
  }
  const setFilters = (filters: ComplaintFilters) => setState((s) => ({ ...s, filters, page: 1 }))
  const toggleSort = (key: SortKey) =>
    setState((s) =>
      s.sort === key
        ? { ...s, direction: s.direction === "asc" ? "desc" : "asc", page: 1 }
        : // A name reads A to Z first; a number or a date, newest first.
          { ...s, sort: key, direction: key === "site" ? "asc" : "desc", page: 1 },
    )

  const copy = EMPTY_COPY[state.tab]
  const noun = (n: number) => `${formatNumber(n)} ${n === 1 ? "complaint" : "complaints"}`

  let body: React.ReactNode
  if (phase === "failed") {
    body = (
      <EmptyState
        variant="failed"
        heading="The complaints could not be loaded"
        onAction={() => setAttempt((a) => a + 1)}
      >
        {answer.error}
      </EmptyState>
    )
  } else if (phase === "ready" && rows.length === 0 && filtered) {
    body = (
      <EmptyState
        variant="nothing-found"
        heading={
          state.search.trim()
            ? `No complaints match “${state.search.trim()}”`
            : "No complaints match these filters"
        }
        onAction={() => {
          setSearchInput("")
          setState((s) => ({ ...s, search: "", filters: {}, page: 1 }))
        }}
      >
        Clearing the search and filters will show the whole tab again.
      </EmptyState>
    )
  } else if (showsNothingYet) {
    body = (
      <EmptyState
        variant="nothing-yet"
        heading={copy.heading}
        actionLabel={copy.action === "raise" ? "Raise complaint" : "Show all complaints"}
        onAction={() =>
          copy.action === "raise" ? router.push("/complaints/new") : switchTab("all")
        }
      >
        {copy.body}
      </EmptyState>
    )
  } else if (!result) {
    body = <ListSkeleton />
  } else {
    body = (
      <>
        <ComplaintTable
          rows={rows}
          sort={state.sort}
          direction={state.direction}
          onSort={toggleSort}
        />
        <ComplaintCards rows={rows} />
      </>
    )
  }

  const page = result?.page ?? state.page
  const pageSize = result?.pageSize ?? 25

  return (
    <PageFrame className="max-sm:px-4">
      <PageHeader
        title="Complaints"
        meta={result ? noun(total) : knownEmpty ? noun(0) : "Loading complaints"}
        actions={
          <Button render={<Link href="/complaints/new" />} nativeButton={false}>
            <PlusIcon />
            Raise complaint
          </Button>
        }
      />

      <ComplaintTabs value={state.tab} counts={counts} onValueChange={switchTab} />

      <ListToolbar className="max-sm:flex-col max-sm:items-stretch">
        <ListSearch
          label="Search complaints"
          placeholder="Search complaints"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onClear={() => setSearchInput("")}
          className="max-sm:w-full [&_input]:max-sm:text-base"
        />
        {state.search.trim() && phase === "ready" ? (
          <span className="text-label text-text-secondary">
            {formatNumber(total)} {total === 1 ? "result" : "results"}
          </span>
        ) : null}
        <ComplaintFilterButton
          filters={state.filters}
          sites={siteOptions}
          categories={categoryOptions}
          onApply={setFilters}
        />
      </ListToolbar>

      <ComplaintFilterChips
        filters={state.filters}
        sites={siteOptions}
        categories={categoryOptions}
        onChange={setFilters}
      />

      <ListDataArea
        aria-busy={phase === "loading" || undefined}
        footer={
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={result ? total : knownEmpty ? 0 : phase === "loading" ? null : 0}
            onPageChange={(next) => setState((s) => ({ ...s, page: next }))}
            emptyLabel={noun(0)}
            loadingLabel="Loading complaints"
          />
        }
      >
        {body}
      </ListDataArea>
    </PageFrame>
  )
}

function SortHeader({
  label,
  sortKey,
  sort,
  direction,
  onSort,
  numeric,
}: {
  label: string
  sortKey: SortKey
  sort: SortKey
  direction: "asc" | "desc"
  onSort: (key: SortKey) => void
  numeric?: boolean
}) {
  const active = sort === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label.toLowerCase()}`}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-lg text-label",
        "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-on-brand",
        numeric && "justify-end",
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      {active ? (
        direction === "asc" ? (
          <ChevronUpIcon className="size-4 shrink-0" />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0" />
        )
      ) : null}
    </button>
  )
}

/**
 * From 768px. Column widths come from the col-* tokens (17.1); the
 * free-text columns (the complaint, the site) take what is left and
 * truncate. The complaint is its title (the row's link), with the
 * description under it when there is one, or where a search matched. The
 * category sits under the site; the supervisor is secondary and drops
 * below 1024.
 */
function ComplaintTable({
  rows,
  sort,
  direction,
  onSort,
}: {
  rows: Array<ComplaintRow & Matchable>
  sort: SortKey
  direction: "asc" | "desc"
  onSort: (key: SortKey) => void
}) {
  return (
    <Table className="hidden table-fixed md:table">
      <TableHeader>
        <TableRow>
          <TableHead className="w-col-ref">
            <SortHeader label="Reference" sortKey="number" sort={sort} direction={direction} onSort={onSort} />
          </TableHead>
          <TableHead>Complaint</TableHead>
          <TableHead>
            <SortHeader label="Site" sortKey="site" sort={sort} direction={direction} onSort={onSort} />
          </TableHead>
          <TableHead className="hidden lg:table-cell">Supervisor</TableHead>
          <TableHead className="w-col-status">Status</TableHead>
          <TableHead numeric className="w-col-date">
            <SortHeader label="Raised" sortKey="raisedAt" sort={sort} direction={direction} onSort={onSort} numeric />
          </TableHead>
          <TableHead numeric className="w-col-count">Age</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="tabular-nums">{row.reference}</TableCell>
            <TableCell>
              <span className="flex min-w-0 flex-col">
                {/* 11.1.2: the record's name is a real link, and the row opens it. */}
                <TableRowLink render={<Link href={`/complaints/${row.id}`} />} className="block min-w-0 font-medium">
                  <Truncate>{row.title}</Truncate>
                </TableRowLink>
                {row.matchedField ? (
                  <span className="flex min-w-0 gap-1 text-meta text-text-secondary">
                    <span className="shrink-0">{row.matchedField}:</span>
                    <Truncate className="min-w-0 font-medium text-text-primary">
                      {row.matchedValue ?? ""}
                    </Truncate>
                  </span>
                ) : row.description ? (
                  <Truncate className="text-meta text-text-secondary">{row.description}</Truncate>
                ) : null}
              </span>
            </TableCell>
            <TableCell>
              {/* Where, then what: the category rides under the site
                  rather than taking a column the description needs. */}
              <span className="flex min-w-0 flex-col">
                <Truncate>{complaintPlace(row)}</Truncate>
                <Truncate className="text-meta text-text-secondary">{row.category.name}</Truncate>
              </span>
            </TableCell>
            <TableCell className="hidden lg:table-cell">{row.supervisor.name}</TableCell>
            <TableCell>
              <ComplaintStatusBadge status={row.status} />
            </TableCell>
            <TableCell numeric>{formatDate(row.raisedAt)}</TableCell>
            <TableCell numeric>{ageLabel(row.ageDays)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Below 768px: one record card per complaint, the whole card a link.
 * Five pieces of information at most (11.6): title and status, the
 * description clamped to two lines (only when there is one), where and
 * what, and reference, raised date and age.
 */
function ComplaintCards({ rows }: { rows: Array<ComplaintRow & Matchable> }) {
  const router = useRouter()
  return (
    <ul className="flex flex-col gap-3 p-3 md:hidden">
      {rows.map((row) => {
        const href = `/complaints/${row.id}`
        return (
          <li key={row.id}>
            <Card variant="record">
              <CardHeader>
                <CardTitle className="min-w-0">
                  <CardLink
                    href={href}
                    onClick={(event) => {
                      // Client-side, so the shell and session survive:
                      // a plain anchor would reload the whole app.
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                      event.preventDefault()
                      router.push(href)
                    }}
                  >
                    <span className="line-clamp-2 break-words">{row.title}</span>
                  </CardLink>
                </CardTitle>
                <ComplaintStatusBadge status={row.status} />
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-0">
                {row.description ? (
                  <p className="line-clamp-2 text-body text-text-primary">{row.description}</p>
                ) : null}
                <p className="min-w-0 truncate text-label text-text-secondary">
                  {complaintPlace(row)} · {row.category.name}
                </p>
                <p className="text-meta text-text-muted">
                  <span className="tabular-nums">{row.reference}</span> · Raised {formatDate(row.raisedAt)} · Age{" "}
                  {ageLabel(row.ageDays).toLowerCase()}
                </p>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  )
}
