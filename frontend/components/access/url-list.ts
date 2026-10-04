"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { errorMessage } from "@/components/shell/session"

/**
 * The list state of the People and History tabs, kept in the address
 * (kit 27.3: filters, search and sort persist when the user opens a
 * record and comes back; kit 40.2 rule 2 and 40.7 rule 1: the Roles
 * list and a person's page link here with a filter already set, and it
 * shows as a chip). Every change REPLACES the history entry, so paging
 * and filtering never make the back button walk through each step.
 *
 * Reads `useSearchParams`, so the page renders it inside a Suspense
 * boundary (kit 33, section-tabs.tsx).
 */
export function useUrlListState<F extends string>(filterKeys: readonly F[]) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const search = params.get("q") ?? ""
  const page = Math.max(1, Number(params.get("page")) || 1)
  const filtersKey = filterKeys
    .map((key) => `${key}=${encodeURIComponent(params.get(key) ?? "")}`)
    .join("&")
  const filters = React.useMemo(() => {
    const out: Partial<Record<F, string>> = {}
    for (const pair of filtersKey.split("&")) {
      const [key, value] = pair.split("=") as [F, string]
      if (value) out[key] = decodeURIComponent(value)
    }
    return out
  }, [filtersKey])

  /** Writes the given keys (null or "" removes one) and keeps the rest. */
  const write = React.useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "" || (key === "page" && value === 1)) {
          next.delete(key)
        } else {
          next.set(key, String(value))
        }
      }
      const text = next.toString()
      router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )

  const setSearch = React.useCallback((q: string) => write({ q, page: null }), [write])
  const setPage = React.useCallback((p: number) => write({ page: p }), [write])
  const setFilters = React.useCallback(
    (next: Partial<Record<F, string | undefined>>) => {
      const patch: Record<string, string | null> = { page: null }
      for (const key of filterKeys) patch[key] = next[key] ?? null
      write(patch)
    },
    [filterKeys, write],
  )

  return { search, page, filters, params, write, setSearch, setPage, setFilters }
}

/**
 * Kit 27.1: the search box's own text, written to the address 300ms
 * after typing stops. Follows the address when it changes from outside
 * (a chip's "Clear all", a link).
 */
export function useSearchInput(search: string, setSearch: (q: string) => void) {
  const [input, setInput] = React.useState(search)
  const [seen, setSeen] = React.useState(search)
  if (seen !== search) {
    setSeen(search)
    setInput(search)
  }
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (input.trim() !== search) setSearch(input.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [input, search, setSearch])
  return [input, setInput] as const
}

/**
 * One request's answer, with loading and failed as separate branches
 * (kit 14 rule 3). The answer carries the request it answers, so a new
 * request reads as loading without a flag being set first, and a stale
 * answer never lands on a newer request.
 *
 * `request` is a string naming what is asked (the URL); `refresh` asks
 * again for the same thing, keeping the rows on screen meanwhile so a
 * row the user just acted on never blinks out (kit 26.1 rule 6's spirit:
 * no flicker on a refresh).
 */
export function useAnswer<T>(request: string | null, load: () => Promise<T>) {
  const [answer, setAnswer] = React.useState<{
    request: string | null
    attempt: number
    value: T | null
    error: string | null
  }>({ request: null, attempt: -1, value: null, error: null })
  const [attempt, setAttempt] = React.useState(0)
  const loadRef = React.useRef(load)
  React.useEffect(() => {
    loadRef.current = load
  })

  React.useEffect(() => {
    if (request === null) return
    let cancelled = false
    loadRef
      .current()
      .then((value) => {
        if (!cancelled) setAnswer({ request, attempt, value, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setAnswer({ request, attempt, value: null, error: errorMessage(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [request, attempt])

  const sameRequest = answer.request === request
  const settled = sameRequest && answer.attempt === attempt
  // A refresh of the same request keeps the last value on screen.
  const value = sameRequest ? answer.value : null
  const state: "loading" | "ready" | "failed" =
    request === null
      ? "loading"
      : !sameRequest || (!settled && answer.value === null)
        ? "loading"
        : answer.error !== null && settled
          ? "failed"
          : "ready"

  const refresh = React.useCallback(() => setAttempt((n) => n + 1), [])
  return { value, error: answer.error, state, refresh }
}
