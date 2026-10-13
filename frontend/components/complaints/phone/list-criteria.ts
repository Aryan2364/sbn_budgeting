"use client"

import * as React from "react"

import type { Matchable } from "@/lib/api"
import { useListAddress, queryOf, type AddressParams } from "@/lib/list-address"
import {
  complaintsApi,
  type ComplaintRow,
  type ComplaintTab,
} from "@/lib/complaints-api"
import { guError } from "@/components/complaints/gu"

/**
 * Plan-phone 5.1 and 5.2: the search, filters and sort shared by the My
 * work and Complaints phone screens, kept in the address (lib/list-address,
 * 41.5 rule 17) exactly like the desktop list — so opening a record and
 * coming back finds the screen as it was, and the two screens cannot
 * drift into different query-parameter names.
 *
 * `tab` is NOT part of this criteria: My work fixes it to "assigned" and
 * never writes it to the address, and Complaints carries it separately
 * (its own ComplaintTabs, already wired to the `tab` param) because a
 * tab switch clears the rest of the toolbar (desktop's own rule, kept on
 * phone). `read` and `query` are module-level functions, as
 * lib/list-address.ts requires.
 */

export type SortKey = "number" | "raisedAt" | "site"
export const SORT_KEYS: SortKey[] = ["number", "raisedAt", "site"]
export const DEFAULT_SORT: SortKey = "raisedAt"

export interface ListCriteria {
  q: string
  status?: string
  siteId?: string
  categoryId?: string
  sort: SortKey
  direction: "asc" | "desc"
}

export const EMPTY_CRITERIA: ListCriteria = { q: "", sort: DEFAULT_SORT, direction: "desc" }

export function readListCriteria(params: AddressParams): ListCriteria {
  const sort = params.get("sort")
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? undefined,
    siteId: params.get("siteId") ?? undefined,
    categoryId: params.get("categoryId") ?? undefined,
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULT_SORT,
    direction: params.get("dir") === "asc" ? "asc" : "desc",
  }
}

export function listCriteriaQuery(c: ListCriteria): string {
  return queryOf([
    ["q", c.q.trim()],
    ["status", c.status],
    ["siteId", c.siteId],
    ["categoryId", c.categoryId],
    ["sort", c.sort !== DEFAULT_SORT && c.sort],
    ["dir", c.direction !== "desc" && c.direction],
  ])
}

/** For Complaints, which also carries the tab in the address. */
export interface ComplaintsCriteria extends ListCriteria {
  tab: ComplaintTab
}

const TAB_VALUES: ComplaintTab[] = ["assigned", "raised", "all"]

export function readComplaintsCriteria(params: AddressParams): ComplaintsCriteria {
  const tab = params.get("tab") as ComplaintTab | null
  return {
    tab: tab && TAB_VALUES.includes(tab) ? tab : "all",
    ...readListCriteria(params),
  }
}

export function complaintsCriteriaQuery(c: ComplaintsCriteria): string {
  return queryOf([
    ["tab", c.tab],
    ["q", c.q.trim()],
    ["status", c.status],
    ["siteId", c.siteId],
    ["categoryId", c.categoryId],
    ["sort", c.sort !== DEFAULT_SORT && c.sort],
    ["dir", c.direction !== "desc" && c.direction],
  ])
}

export function useComplaintListAddress() {
  return useListAddress<ListCriteria>({ read: readListCriteria, query: listCriteriaQuery })
}

export function useComplaintsTabListAddress() {
  return useListAddress<ComplaintsCriteria>({
    read: readComplaintsCriteria,
    query: complaintsCriteriaQuery,
  })
}

/* ------------------------------------------------------------------
   Loading rows 25 at a time, up to 200 (41.5 rules 14 and 15).
   ------------------------------------------------------------------ */

const PAGE_SIZE = 25

export interface PhoneComplaintList {
  state: "loading" | "failed" | "ready"
  rows: (ComplaintRow & Matchable)[]
  total: number
  error: string | null
  onLoadMore: () => Promise<void>
  onRefresh: () => Promise<void>
  onRetry: () => void
}

/**
 * Fetches the rows for `tab` under `criteria`, 25 at a time
 * (PhoneList's onLoadMore), and exposes the three branches a phone list
 * needs (14 rule 3). A new tab, search, filter or sort starts over at
 * page 1; onLoadMore and onRefresh act on the request that is current
 * when they are called, never a stale one.
 */
export function useComplaintPhoneList(
  tab: ComplaintTab,
  criteria: ListCriteria,
): PhoneComplaintList {
  const key = React.useMemo(() => JSON.stringify({ tab, criteria }), [tab, criteria])
  const [attempt, setAttempt] = React.useState(0)
  const loadedPages = React.useRef(0)

  const [state, setState] = React.useState<{
    key: string
    status: "loading" | "failed" | "ready"
    rows: (ComplaintRow & Matchable)[]
    total: number
    error: string | null
  }>({ key: "", status: "loading", rows: [], total: 0, error: null })

  const fetchPage = React.useCallback(
    (page: number) =>
      complaintsApi.list({
        tab,
        page,
        pageSize: PAGE_SIZE,
        search: criteria.q.trim() || undefined,
        sort: criteria.sort,
        direction: criteria.direction,
        status: criteria.status,
        siteId: criteria.siteId,
        categoryId: criteria.categoryId,
      }),
    [tab, criteria.q, criteria.sort, criteria.direction, criteria.status, criteria.siteId, criteria.categoryId],
  )

  React.useEffect(() => {
    let cancelled = false
    fetchPage(1)
      .then((result) => {
        if (cancelled) return
        loadedPages.current = 1
        setState({ key, status: "ready", rows: result.data, total: result.total, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          loadedPages.current = 0
          setState({ key, status: "failed", rows: [], total: 0, error: guError(caught) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [key, attempt, fetchPage])

  const onLoadMore = React.useCallback(async () => {
    const nextPage = loadedPages.current + 1
    const result = await fetchPage(nextPage)
    loadedPages.current = nextPage
    setState((s) => (s.key === key ? { ...s, rows: [...s.rows, ...result.data], total: result.total } : s))
  }, [fetchPage, key])

  const onRefresh = React.useCallback(async () => {
    const result = await fetchPage(1)
    loadedPages.current = 1
    setState((s) => (s.key === key ? { ...s, rows: result.data, total: result.total, error: null } : s))
  }, [fetchPage, key])

  const settled = state.key === key
  return {
    state: settled ? state.status : "loading",
    rows: settled ? state.rows : [],
    total: settled ? state.total : 0,
    error: settled ? state.error : null,
    onLoadMore,
    onRefresh,
    onRetry: () => setAttempt((a) => a + 1),
  }
}
