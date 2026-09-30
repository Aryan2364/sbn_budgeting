import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Section 11.1 zone 4, in the plain treatment of section 11.1.1. Record
 * count on the left, page controls on the right. This zone does not
 * scroll. Default page size is 25.
 *
 * Section 1 rule 7: nothing renders an unbounded list. Everything is
 * paginated.
 *
 * NOTHING HERE GOES THROUGH `Button`, and that is the whole of what
 * section 11.1.1 changes. A boxed control inside a bordered
 * `surface-sunken` strip is the box-inside-a-box fault sections 6.3.1
 * and 6.3.2 already name for a field and for a brand band; the bar is
 * the third container. Overriding `Button`'s fill and border from
 * outside would be the "child told to be invisible" that section 6.5
 * calls a silenced defect rather than a removed one, so these controls
 * carry their own states instead.
 */
function PaginationBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="pagination-bar"
      className={cn(
        "flex shrink-0 items-center justify-between gap-4 border-t border-border-light bg-surface-sunken px-4 py-1.5",
        className
      )}
      {...props}
    />
  )
}

/** "1–25 of 148" - always states the total, never just the page. */
function PaginationCount({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="pagination-count"
      className={cn(
        "whitespace-nowrap text-label tabular-nums text-text-secondary",
        className
      )}
      {...props}
    />
  )
}

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      // gap-2, not gap-1: 9 rule 4 keeps controls 8px apart so their
      // 44px touch extensions never overlap.
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

/**
 * The four states of section 6.4, carried by colour and weight because
 * there is no box left to change. The 36px height and the 36px floor on
 * width are section 6.2's control size and section 9 rule 4's touch
 * target - both of which the box used to supply, and neither of which
 * is allowed to leave with it.
 */
const controlClasses =
  "tap-area inline-flex h-control min-w-control cursor-pointer items-center justify-center gap-1 " +
  "px-2 text-body text-text-secondary transition-[color] duration-(--duration-fast) ease-enter " +
  "hover:text-text-primary active:text-text-primary " +
  /* `focus-visible:[outline-style:solid]` is not belt and braces - see
     the long note in `button.tsx`, which every control in this kit
     needs and this one is no exception to. */
  "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] " +
  "focus-visible:outline-offset-1 focus-visible:outline-primary-ring " +
  "aria-disabled:pointer-events-none aria-disabled:cursor-default aria-disabled:text-text-muted " +
  "[&_svg]:size-4 [&_svg]:shrink-0"

type PaginationLinkProps = {
  isActive?: boolean
} & React.ComponentProps<"a">

/**
 * The current page is body-strong in `primary-text` (11.1.1) - the one
 * loud thing on a bar that is otherwise a footnote.
 *
 * AN `a` ONLY WHERE THERE IS SOMEWHERE TO GO. An anchor without `href`
 * is not focusable and not reachable by keyboard, so a control that
 * only calls back renders as a real `button`. The `Button` wrapper used
 * to hide this by supplying the tab stop the bare anchor lacked; with
 * the wrapper gone it has to be the right element.
 */
function PaginationLink({
  className,
  isActive,
  href,
  ...props
}: PaginationLinkProps) {
  const shared = {
    "aria-current": isActive ? ("page" as const) : undefined,
    "data-slot": "pagination-link",
    "data-active": isActive,
    className: cn(
      controlClasses,
      isActive && "font-medium text-primary-text hover:text-primary-text",
      className
    ),
  }

  if (href !== undefined) return <a href={href} {...shared} {...props} />

  /* eslint-disable @typescript-eslint/no-unused-vars -- destructured only to drop them (Tracking lint config) */
  const {
    /* `a`-only attributes a `button` must not receive. */
    download: _download,
    target: _target,
    rel: _rel,
    hrefLang: _hrefLang,
    ping: _ping,
    referrerPolicy: _referrerPolicy,
    ...rest
  } = props
  /* eslint-enable @typescript-eslint/no-unused-vars */
  return (
    <button
      type="button"
      {...shared}
      {...(rest as React.ComponentProps<"button">)}
    />
  )
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      className={cn(className)}
      {...props}
    >
      <ChevronLeftIcon />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      className={cn(className)}
      {...props}
    >
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-control items-center justify-center text-text-muted [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationBar,
  PaginationContent,
  PaginationCount,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
