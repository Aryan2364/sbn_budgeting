"use client"

import * as React from "react"

import {
  categoriesApi,
  complaintsApi,
  fetchAllPages,
  type ComplaintCategory,
  type ComplaintSiteOption,
} from "@/lib/complaints-api"
import { errorMessage } from "@/components/shell/session"

/**
 * The two masters every complaint screen picks from: sites and
 * categories. Loaded whole (every page, never a silent first 100) and
 * once per screen.
 *
 * Sites come from `GET /complaints/sites` (CONTRACT §10), which every
 * complaints user may read, with who each one would route to. Sites
 * have no active flag, so the list is the same everywhere.
 *
 * `activeOnly` is for the raise form, which must not offer a category
 * that has been retired (15.2). The list's filter wants every one,
 * because an old complaint still carries a retired category and has to
 * stay findable.
 */
export function useComplaintMasters({ activeOnly }: { activeOnly: boolean }) {
  const [state, setState] = React.useState<{
    sites: ComplaintSiteOption[] | null
    categories: ComplaintCategory[] | null
    error: string | null
    attempt: number
  }>({ sites: null, categories: null, error: null, attempt: -1 })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      complaintsApi.sites(),
      fetchAllPages((page) =>
        categoriesApi.list({
          page,
          pageSize: 100,
          sort: "name",
          direction: "asc",
          isActive: activeOnly ? true : undefined,
        }),
      ),
    ])
      .then(([sites, categories]) => {
        if (!cancelled) setState({ sites: sites.data, categories, error: null, attempt })
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState({ sites: null, categories: null, error: errorMessage(caught), attempt })
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeOnly, attempt])

  const settled = state.attempt === attempt
  return {
    sites: settled ? state.sites : null,
    categories: settled ? state.categories : null,
    error: settled ? state.error : null,
    loading: !settled,
    retry: React.useCallback(() => setAttempt((a) => a + 1), []),
  }
}
