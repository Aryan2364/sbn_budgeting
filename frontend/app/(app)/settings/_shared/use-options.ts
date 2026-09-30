"use client"

import * as React from "react"

import { api, query, type ListResponse } from "@/lib/api"
import { errorMessage } from "@/components/shell/session"

/**
 * Every row of a master list, for a picker (designations, locations,
 * people). Pages through at the API's 100-row maximum until it has the
 * total, so a picker never silently stops at the hundredth option —
 * the same cliff `useMasterRows` exists to avoid.
 *
 * A picker, not a list: it renders inside a searchable menu capped at
 * seven rows (section 16.2), so the full set is what it needs.
 */
export async function fetchAll<T>(
  path: string,
  params: Record<string, string | number | undefined | null> = {},
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; page < 1000; page += 1) {
    const result = await api.get<ListResponse<T>>(
      `${path}${query({ ...params, page, pageSize: 100 })}`,
    )
    rows.push(...result.data)
    if (rows.length >= result.total || result.data.length === 0) break
  }
  return rows
}

/** `path` null means "not yet": nothing is fetched and rows stay null. */
export function useOptions<T>(
  path: string | null,
  params: Record<string, string | number | undefined | null> = {},
): { rows: T[] | null; error: string | null; reload: () => void } {
  const key = path === null ? "" : `${path}${query(params)}`
  const [state, setState] = React.useState<{
    key: string
    tick: number
    rows: T[] | null
    error: string | null
  }>({ key: "", tick: -1, rows: null, error: null })
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (key === "") return
    let cancelled = false
    const [base, search = ""] = key.split("?")
    const parsed = Object.fromEntries(new URLSearchParams(search))
    fetchAll<T>(base, parsed)
      .then((rows) => {
        if (!cancelled) setState({ key, tick, rows, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState({ key, tick, rows: null, error: errorMessage(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [key, tick])

  const settled = key !== "" && state.key === key && state.tick === tick
  return {
    rows: settled ? state.rows : null,
    error: settled ? state.error : null,
    reload: React.useCallback(() => setTick((t) => t + 1), []),
  }
}
