"use client"

import * as React from "react"

import { api, type Site } from "@/lib/api"
import { errorMessage } from "@/components/shell/session"
import { EmptyState } from "@/components/ui/empty-state"
import { PageScroller } from "@/components/templates/page"
import { BudgetGrid } from "@/components/forms/budget-grid"

/**
 * Per-tree budget entry, on its own page rather than a tab.
 *
 * AGENTS.md 31.5 puts the grid's one Save in a FIXED footer, and a tab
 * inside a scrolling detail page has nowhere to fix one. A page of its
 * own also gives the grid the full content width, which is what decides
 * whether it scrolls sideways at 1024 (31.4).
 */
export default function SiteBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)
  const [site, setSite] = React.useState<Site | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    api
      .get<Site>(`/sites/${id}`)
      .then((found) => {
        if (!cancelled) setSite(found)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <PageScroller>
        <EmptyState variant="failed" heading="This site could not be loaded">
          {error}
        </EmptyState>
      </PageScroller>
    )
  }

  if (!site) return null

  return (
    <BudgetGrid
      siteId={site.id}
      siteName={site.name}
      plannedTrees={site.plannedTrees}
    />
  )
}
