"use client"

import * as React from "react"

import { api, query, type ListResponse, type Location } from "@/lib/api"
import { categoriesApi, fetchAllPages, type ComplaintCategory } from "@/lib/complaints-api"
import { errorMessage } from "@/components/shell/session"

/**
 * The two masters every complaint screen picks from: locations and
 * categories. Loaded whole (every page, never a silent first 100) and
 * once per screen.
 *
 * `activeOnly` is for the raise form, which must not offer a location
 * or category that has been retired (15.2). The list's filter wants
 * every one, because an old complaint still sits at a retired
 * location and has to stay findable.
 */
export function useComplaintMasters({ activeOnly }: { activeOnly: boolean }) {
  const [state, setState] = React.useState<{
    locations: Location[] | null
    categories: ComplaintCategory[] | null
    error: string | null
    attempt: number
  }>({ locations: null, categories: null, error: null, attempt: -1 })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    const isActive = activeOnly ? "true" : undefined
    Promise.all([
      fetchAllPages((page) =>
        api.get<ListResponse<Location>>(
          `/locations${query({ page, pageSize: 100, sort: "name", direction: "asc", isActive })}`,
        ),
      ),
      fetchAllPages((page) =>
        categoriesApi.list({
          page,
          pageSize: 100,
          sort: "sortOrder",
          direction: "asc",
          isActive: activeOnly ? true : undefined,
        }),
      ),
    ])
      .then(([locations, categories]) => {
        if (!cancelled) setState({ locations, categories, error: null, attempt })
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState({ locations: null, categories: null, error: errorMessage(caught), attempt })
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeOnly, attempt])

  const settled = state.attempt === attempt
  return {
    locations: settled ? state.locations : null,
    categories: settled ? state.categories : null,
    error: settled ? state.error : null,
    loading: !settled,
    retry: React.useCallback(() => setAttempt((a) => a + 1), []),
  }
}
