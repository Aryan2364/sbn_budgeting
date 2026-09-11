import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Section 12.3 and 11. The content area is 24px padded on all sides
 * and capped at 1600px, centred - beyond that, text lines are too long
 * to read and tables look stranded.
 *
 * The two frames below differ on ONE thing: who owns the scroll
 * (section 10).
 *
 *   PageFrame    - the page is a fixed-height box that does not
 *                  scroll. Something inside it does. This is the list
 *                  page, where the data area scrolls under a header
 *                  and toolbar that stay put, and the form page, where
 *                  the footer stays reachable.
 *   PageScroller - the page itself scrolls. This is the detail page,
 *                  the dashboard and settings, where the cards inside
 *                  never scroll on their own.
 *
 * Whichever is used, there is exactly one scrolling container on the
 * screen. Never one inside another (section 1 rule 8).
 */

/** The 24px padded, 1600px centred column. Both frames use it. */
function PageColumn({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-column"
      className={cn("mx-auto w-full max-w-content-max p-6", className)}
      {...props}
    />
  )
}

/** Fixed height, does not scroll. A child owns the scroll. */
function PageFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-frame"
      className={cn(
        "mx-auto flex h-full w-full max-w-content-max flex-col p-6",
        className
      )}
      {...props}
    />
  )
}

/** The page owns the scroll. Cards inside it do not. */
function PageScroller({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-scroller"
      className={cn("h-full overflow-y-auto", className)}
      {...props}
    >
      <PageColumn>{children}</PageColumn>
    </div>
  )
}

/**
 * Sections 11.1, 11.2 and 12.3. The page header belongs to the page,
 * not to the shell: title on the left, one primary action on the
 * right, record count or supporting meta as meta text underneath.
 *
 * One component rather than one per template. A detail page passes
 * `badges` - status sits BESIDE the record name, never below it
 * (11.2) - and a list page passes `meta`. Nothing else differs, so
 * nothing else is duplicated.
 */
function PageHeader({
  title,
  meta,
  badges,
  actions,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  /** Section 3 rule 3: one page title per screen. Only one. */
  title: React.ReactNode
  meta?: React.ReactNode
  badges?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex shrink-0 flex-wrap items-start justify-between gap-4",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-page-title font-medium text-text-primary">
            {title}
          </h1>
          {badges}
        </div>
        {meta ? (
          <p className="mt-1 text-meta text-text-muted">{meta}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

export { PageColumn, PageFrame, PageScroller, PageHeader }
