import * as React from "react"
import {
  CircleAlertIcon,
  FileQuestionMarkIcon,
  InboxIcon,
  LockIcon,
  SearchIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Sections 13 and 11.8. There are three empty states, not one, and
 * using the wrong one makes the software look unintelligent - never
 * offer "Add your first record" to someone whose filter simply matched
 * nothing. The error pages of 11.8 are built from the same component.
 *
 * The variant is the whole point of this component, so it is a closed
 * set rather than free-form props. Each variant fixes its own icon and
 * the shape of its actions; the caller supplies the words and the
 * handler. A component that can be used wrongly will be.
 *
 *   nothing-yet   - what would normally be here. Secondary: create. The
 *                   page header's Add stays the one primary (13, 6.1).
 *   nothing-found - the filters matched no records. Clear filters.
 *   failed        - what went wrong. Retry.
 *   not-found     - the 11.8 "Page not found" page. Primary: dashboard.
 *   no-access     - the 11.8 no-access page (26). Primary: dashboard.
 *
 * `failed` has two forms. In a list or a card (13) it offers one
 * secondary "Try again". As the 11.8 "Something went wrong" PAGE - given
 * a `dashboardHref` - "Try again" becomes primary, "Go to dashboard"
 * sits beside it as secondary, and the `reference` code shows below the
 * actions in meta style (11.8 rule 3).
 *
 * not-found and no-access carry 11.8's fixed wording by default, and
 * `failed` in its page form does too; the caller may still pass its own.
 */
type EmptyStateVariant =
  | "nothing-yet"
  | "nothing-found"
  | "failed"
  | "not-found"
  | "no-access"

const ICONS: Record<EmptyStateVariant, React.ReactNode> = {
  "nothing-yet": <InboxIcon />,
  "nothing-found": <SearchIcon />,
  failed: <CircleAlertIcon />,
  "not-found": <FileQuestionMarkIcon />,
  "no-access": <LockIcon />,
}

const DASHBOARD_LABEL = "Go to dashboard"

type Base = Omit<React.ComponentProps<"div">, "children"> & {
  /**
   * The heading element. An error page (11.8) is the page, so its heading
   * defaults to h1; an empty state inside a screen defaults to h2. Set it
   * to fit the outline around it. The look does not change.
   */
  headingLevel?: 1 | 2 | 3
}

type EmptyStateProps = Base &
  (
    | {
        variant: "nothing-yet" | "nothing-found"
        /** Short. "No customers yet", not a sentence. */
        heading: string
        /** One line explaining how to change the situation. */
        children: React.ReactNode
        /**
         * Overrides only the wording. `nothing-yet` should name the
         * record ("Add customer", section 37.2).
         */
        actionLabel?: string
        onAction?: () => void
      }
    | {
        variant: "failed"
        /** Defaults to 11.8's "Something went wrong". */
        heading?: string
        /** What went wrong. Defaults to 11.8's line in the page form. */
        children?: React.ReactNode
        actionLabel?: string
        onAction?: () => void
        /** Turns this into the 11.8 page: adds "Go to dashboard". */
        dashboardHref?: string
        /** 11.8 rule 3: the code the server recorded with the error. */
        reference?: string
      }
    | ({
        variant: "not-found" | "no-access"
        heading?: string
        children?: React.ReactNode
      } & (
        | { dashboardHref: string; actionLabel?: never; onAction?: never }
        /*
         * Tracking extension (fe-kit): the one primary action as a handler
         * instead of a link, for a product with more than one "home" (a
         * complaints-only user has no budget dashboard to go to). Still
         * exactly one primary, as 11.8 requires; the label defaults to
         * "Go to dashboard".
         */
        | { dashboardHref?: never; actionLabel?: string; onAction: () => void }
      ))
  )

const DEFAULT_WORDS: Partial<
  Record<EmptyStateVariant, { heading: string; line: string }>
> = {
  "not-found": {
    heading: "Page not found",
    line: "The link may be old, or the page may have moved.",
  },
  "no-access": {
    heading: "You don't have access to this page",
    line: "Ask an administrator if you need it.",
  },
  failed: {
    heading: "Something went wrong",
    line: "Try again. If it keeps happening, share the reference below with your support team.",
  },
}

function DashboardLink({
  href,
  variant,
}: {
  href: string
  variant: "primary" | "secondary"
}) {
  return (
    <Button variant={variant} size="sm" nativeButton={false} render={<a href={href} />}>
      {DASHBOARD_LABEL}
    </Button>
  )
}

function EmptyState(props: EmptyStateProps) {
  const { className, variant, heading, children, headingLevel, ...rest } = props

  // Pull the variant-specific props out of the DOM spread.
  const {
    actionLabel,
    onAction,
    dashboardHref,
    reference,
    ...divProps
  } = rest as Base & {
    actionLabel?: string
    onAction?: () => void
    dashboardHref?: string
    reference?: string
  }

  const words = DEFAULT_WORDS[variant]
  const isPage =
    variant === "not-found" ||
    variant === "no-access" ||
    (variant === "failed" && dashboardHref !== undefined)

  const Heading = `h${headingLevel ?? (isPage ? 1 : 2)}` as "h1" | "h2" | "h3"

  let actions: React.ReactNode
  if (variant === "not-found" || variant === "no-access") {
    actions =
      dashboardHref !== undefined ? (
        <DashboardLink href={dashboardHref} variant="primary" />
      ) : (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel ?? DASHBOARD_LABEL}
        </Button>
      )
  } else if (variant === "failed") {
    actions = (
      <>
        <Button
          variant={dashboardHref !== undefined ? "primary" : "secondary"}
          size="sm"
          onClick={onAction}
        >
          {actionLabel ?? "Try again"}
        </Button>
        {dashboardHref !== undefined ? (
          <DashboardLink href={dashboardHref} variant="secondary" />
        ) : null}
      </>
    )
  } else {
    actions = (
      <Button variant="secondary" size="sm" onClick={onAction}>
        {actionLabel ?? (variant === "nothing-yet" ? "Add" : "Clear filters")}
      </Button>
    )
  }

  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className
      )}
      {...divProps}
    >
      {/* Section 23: 22px is the empty-state icon size. */}
      <div
        className="text-text-muted [&_svg:not([class*='size-'])]:size-icon-empty"
        aria-hidden="true"
      >
        {ICONS[variant]}
      </div>
      <Heading className="text-card-heading font-medium text-text-primary">
        {heading ?? words?.heading}
      </Heading>
      <p className="max-w-[46ch] text-body text-text-secondary">
        {children ?? (isPage || variant !== "failed" ? words?.line : "Try again.")}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {actions}
      </div>
      {variant === "failed" && reference ? (
        <p className="text-meta text-text-muted">Reference: {reference}</p>
      ) : null}
    </div>
  )
}

export { EmptyState, type EmptyStateVariant }
