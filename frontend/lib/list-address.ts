"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * A list's search, filters and sort, kept in the address - 41.5 rule 17,
 * 27.3 (they survive opening a record and coming back), 33.4 (a view can
 * be linked to), and decision 9 in _kit-only/OVERNIGHT_DECISIONS.md.
 *
 * The phone list (phone-list.tsx) owns none of this: the page does, and
 * this is the one helper every page uses to do it, so no screen writes
 * the history by hand.
 *
 *   function readCriteria(params: AddressParams): Criteria { ... }
 *   function criteriaQuery(c: Criteria): string { ... }   // "?q=..." or ""
 *
 *   const { criteria, apply } = useListAddress({ read: readCriteria, query: criteriaQuery })
 *   <PhoneList
 *     search={{ value: criteria.q, onChange: (q) => apply({ ...criteria, q }, "replace") }}
 *     filter={{ ..., onApply: () => apply(draft, "push") }}
 *     sort={{ ..., onChange: (sort) => apply({ ...criteria, sort }, "push") }}
 *   />
 *
 * WHEN IT WRITES
 *
 *   - Only once a change is CONFIRMED (decision 9): "Show 12 results" in
 *     the filter sheet, a sort picked, a chip removed, a status chip, the
 *     banner's action. Never live while a sheet's draft is being edited -
 *     the sheet keeps its draft itself until it is applied.
 *   - "push" for those: Back then returns to the list as it was before
 *     (lib/back.ts counts a push that changes only the search part of the
 *     address as a screen, decision 35).
 *   - "replace" for the search, which PhoneList sends 300ms after typing
 *     stops (27.1), so each pause is not a step of Back.
 *   - NEVER WHILE A SHEET IS OPEN. An open bottom sheet owns the current
 *     history entry (history.state.kitLayer, sheet.tsx, 41.4 rule 9);
 *     writing the address then drops that entry's mark and its Android
 *     back. So a write waits while a sheet's entry is current: "Show 12
 *     results" closes the sheet, the sheet steps back off its entry, and
 *     the write lands on the list's own entry a moment later.
 *
 * WHILE A WRITE WAITS, `criteria` is already the new one, so the list
 * changes at once; once the address has caught up, the address is the
 * source again - Back and Forward included.
 *
 * HOW. The history API with a url, which is the documented way to change
 * the address without a trip to the server (Next.js keeps
 * useSearchParams in step with it). Where a list's filtering runs on the
 * server, the page reads the new search params as usual. One write at a
 * time: a newer one cancels an older one still waiting, and so does
 * leaving the page.
 *
 * `read` and `query` are module-level functions (stable), and `query`
 * writes the parameters in one fixed order and leaves out defaults, so
 * one set of criteria always gives one address. queryOf() below does
 * both. A page that calls useSearchParams needs a Suspense boundary above
 * it (Next.js), as section-tabs.tsx does.
 */

type AddressWrite = "push" | "replace"

/** What `read` is given: the address's search parameters. */
type AddressParams = { get: (name: string) => string | null }

/**
 * How often a waiting write looks again for the sheet to have gone. Not a
 * motion duration (5.6), so not a token.
 */
const RETRY_MS = 50

/** True while an open sheet's own history entry is the current one. */
function layerEntryIsCurrent(): boolean {
  const state = window.history.state as { kitLayer?: unknown } | null
  return state?.kitLayer === true
}

/**
 * Writes `url` (path and search) into the address, now or as soon as no
 * sheet's entry is current. `token` holds the latest write: a newer write,
 * or calling the returned cleanup, cancels one still waiting. Browser
 * only. useListAddress uses it; call it directly only where the hook does
 * not fit.
 */
function writeListAddress(url: string, how: AddressWrite, token: { current: number }): () => void {
  const mine = ++token.current
  let timer = 0
  const attempt = () => {
    if (mine !== token.current) return
    if (layerEntryIsCurrent()) {
      timer = window.setTimeout(attempt, RETRY_MS)
      return
    }
    if (url === `${window.location.pathname}${window.location.search}`) return
    if (how === "push") window.history.pushState(null, "", url)
    else window.history.replaceState(null, "", url)
  }
  attempt()
  return () => {
    window.clearTimeout(timer)
    if (token.current === mine) token.current++
  }
}

/**
 * The address's search part from a list of parameters, in the order
 * given, leaving out any that are empty, null, undefined or false: "" when
 * none is left, otherwise "?q=...&sort=...". An array is joined with
 * commas.
 *
 *   queryOf([
 *     ["q", c.q.trim()],
 *     ["status", c.status],
 *     ["sort", c.sort !== DEFAULT_SORT && c.sort],
 *   ])
 */
function queryOf(entries: [name: string, value: string | string[] | null | undefined | false][]): string {
  const params = new URLSearchParams()
  for (const [name, value] of entries) {
    const text = Array.isArray(value) ? value.join(",") : value
    if (text) params.set(name, text)
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

/** `query`'s answer as a search part: "" or starting with "?". */
function asSearch(query: string): string {
  if (query === "" || query === "?") return ""
  return query.startsWith("?") ? query : `?${query}`
}

/**
 * The list's criteria, read from the address, and `apply` to change them
 * (see the file's opening comment).
 *
 *   criteria   the criteria now: the address's, or a confirmed change
 *              still waiting to be written.
 *   apply      apply(next, "push") for a confirmed change, (next,
 *              "replace") for the search. A change that gives the same
 *              address as now does nothing.
 *   waiting    a write is waiting for a sheet to close.
 */
function useListAddress<Criteria>({
  read,
  query,
}: {
  /** The criteria in the address. Stable (module-level). */
  read: (params: AddressParams) => Criteria
  /** The address's search part for criteria: "" or "?...", one fixed order. Stable. */
  query: (criteria: Criteria) => string
}): {
  criteria: Criteria
  apply: (next: Criteria, how: AddressWrite) => void
  waiting: boolean
} {
  const params = useSearchParams()
  const pathname = usePathname()

  const fromAddress = React.useMemo(() => read(params), [params, read])

  const [pending, setPending] = React.useState<{ criteria: Criteria; how: AddressWrite } | null>(null)
  // The address has caught up: it is the source again. Adjusted while
  // rendering, the documented way to follow a changed input.
  if (pending && asSearch(query(pending.criteria)) === asSearch(query(fromAddress))) setPending(null)
  const criteria = pending?.criteria ?? fromAddress

  const token = React.useRef(0)
  React.useEffect(() => {
    if (!pending) return
    return writeListAddress(`${pathname}${asSearch(query(pending.criteria))}`, pending.how, token)
  }, [pending, pathname, query])

  const apply = React.useCallback(
    (next: Criteria, how: AddressWrite) => {
      if (asSearch(query(next)) === asSearch(query(criteria))) return
      setPending({ criteria: next, how })
    },
    [criteria, query]
  )

  return { criteria, apply, waiting: pending !== null }
}

export { useListAddress, writeListAddress, queryOf }
export type { AddressWrite, AddressParams }
