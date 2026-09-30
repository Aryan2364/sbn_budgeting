import * as React from "react"

import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/ui/empty-state"
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
 */
type ErrorPageProps = {
  dashboardHref: string
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
  const { dashboardHref, inShell = false, product, className } = props

  const content =
    props.variant === "failed" ? (
      <EmptyState
        variant="failed"
        dashboardHref={dashboardHref}
        reference={props.reference}
        onAction={props.onRetry}
      />
    ) : (
      <EmptyState variant={props.variant} dashboardHref={dashboardHref} />
    )

  if (inShell) {
    return (
      <div
        data-slot="error-page"
        className={cn("flex flex-1 items-center justify-center py-12", className)}
      >
        {content}
      </div>
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
