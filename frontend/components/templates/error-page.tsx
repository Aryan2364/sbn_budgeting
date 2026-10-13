"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { useAppBarState } from "@/components/shell/app-bar"
import { PageHeader } from "@/components/templates/page"
import { EmptyState, emptyStateWords } from "@/components/ui/empty-state"
import type { Product } from "@/components/templates/sign-in-page"

/**
 * Section 11.8, the three error pages, built from empty-state.tsx. The
 * wording is fixed by the rulebook, so the variants carry it; a page
 * passes only where "Go to dashboard" leads and, for a failure, the
 * reference and the retry.
 *
 * Two forms (11.8 rules 1 and 2):
 *   inShell   - a signed-in user. The application shell already frames
 *               the page with the sidebar and top bar, so this renders
 *               the content only, centred in the content area.
 *   otherwise - a signed-out user. Centred on surface, with the product
 *               mark and name above it.
 *
 * ON PHONE (useLayout(), 41.3 rule 4):
 *   - "Go to dashboard" reads "Go to home" and opens `homeHref`, My work
 *     (11.8 rule 6, 41.15), in both forms; EmptyState switches it.
 *   - In the shell, the page draws the phone app bar through PageHeader
 *     like any screen: the error's heading as its title, and the
 *     product's home as its parent, so it sits below the top level with
 *     the back arrow and no tab bar (41.4 rules 6, 7 and 11). The title
 *     in the bar is the page's one h1 (3 rule 3, 41.4 rule 3), so the
 *     empty state's own heading drops to h2. Without this, the shell's
 *     fallback bar would show the product name over an h1 in the content.
 *     PageHeader's bar must be a direct child of the page's top level
 *     (sticky holds only within its parent), so this returns a fragment.
 * On desktop both forms render exactly as before: `homeHref` is unused.
 */
type ErrorPageProps = {
  dashboardHref: string
  /**
   * Phone only: the product's home, My work (11.8 rule 6). "Go to home"
   * opens it, and in the shell the back arrow returns to it when there is
   * no earlier screen. Falls back to `dashboardHref`.
   */
  homeHref?: string
  /** Signed in: the page sits inside the application shell (12). */
  inShell?: boolean
  /** Required when not in the shell, where the mark and name show. */
  product?: Product
  className?: string
} & (
  | { variant: "not-found" | "no-access" }
  | {
      variant: "failed"
      /** 11.8 rule 3: the code recorded with the error on the server. */
      reference?: string
      onRetry: () => void
    }
)

function ErrorPage(props: ErrorPageProps) {
  const { dashboardHref, homeHref, inShell = false, product, className } = props
  const { layout } = useLayout()
  const appBar = useAppBarState()
  // The phone app bar is drawn only where the phone shell is really
  // around the page; PageHeader keeps its desktop form anywhere else.
  const phoneInShell = inShell && layout === "phone" && appBar.inShell
  const headingLevel = phoneInShell ? 2 : undefined

  const content =
    props.variant === "failed" ? (
      <EmptyState
        variant="failed"
        dashboardHref={dashboardHref}
        homeHref={homeHref}
        reference={props.reference}
        onAction={props.onRetry}
        headingLevel={headingLevel}
      />
    ) : (
      <EmptyState
        variant={props.variant}
        dashboardHref={dashboardHref}
        homeHref={homeHref}
        headingLevel={headingLevel}
      />
    )

  if (inShell) {
    const page = (
      <div
        data-slot="error-page"
        className={cn("flex flex-1 items-center justify-center py-12", className)}
      >
        {content}
      </div>
    )
    if (!phoneInShell) return page
    return (
      <>
        <PageHeader
          title={emptyStateWords(props.variant)?.heading ?? ""}
          parent={homeHref ?? dashboardHref}
        />
        {page}
      </>
    )
  }

  return (
    <main
      data-slot="error-page"
      className={cn(
        "flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-surface px-4 py-12",
        className
      )}
    >
      {product ? (
        <div className="flex items-center gap-2 text-text-primary">
          <span aria-hidden="true" className="flex [&_svg]:size-icon-empty">
            {product.mark}
          </span>
          <span className="text-section font-medium">{product.name}</span>
        </div>
      ) : null}
      {content}
    </main>
  )
}

export { ErrorPage }
