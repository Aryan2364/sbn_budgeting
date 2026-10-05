"use client"

import * as React from "react"

import { pick, type CategoryPick } from "@/lib/api"
import { complaintsApi, type ComplaintSiteOption } from "@/lib/complaints-api"
import { errorMessage } from "@/components/shell/session"

/**
 * The two masters every complaint screen picks from: sites and
 * categories. Loaded whole and once per screen.
 *
 * Sites come from `GET /complaints/sites` (CONTRACT §10), which every
 * complaints user may read, with who each one would route to. Sites
 * have no active flag, so the list is the same everywhere.
 *
 * Categories come from the categories Pick (access plan P7 inventory 9),
 * which every signed-in person holds: the full list is Settings ›
 * Complaint categories, under manage (D3). The Pick carries `isActive`.
 *
 * `activeOnly` is for the raise form, which must not offer a category
 * that has been retired (15.2). The list's filter wants every one,
 * because an old complaint still carries a retired category and has to
 * stay findable: the Pick's `includeInactive`.
 */
export function useComplaintMasters({ activeOnly }: { activeOnly: boolean }) {
  const [state, setState] = React.useState<{
    sites: ComplaintSiteOption[] | null
    categories: CategoryPick[] | null
    error: string | null
    attempt: number
  }>({ sites: null, categories: null, error: null, attempt: -1 })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      complaintsApi.sites(),
      pick.categories({ includeInactive: !activeOnly }),
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
