import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Section 11.2. The breadcrumb is the first element on a detail page
 * and it reflects the structure of the software, not the user's
 * history. Maximum three levels; if a fourth is needed, the structure
 * is wrong.
 *
 * Section 1 rule 11: there are no back arrows on a desktop or tablet
 * page. A back button does something different depending on how the
 * user arrived, which is what makes people feel lost. A breadcrumb is
 * the same every time.
 *
 * The phone is the exception (41.4 rules 6 to 8): there the app bar's
 * back arrow and title replace the breadcrumb, so it is not shown at
 * all. `phone:hidden` rather than useLayout(), so this file stays usable
 * from a server component; display: none also takes it out of the
 * accessibility tree, so a screen reader does not find it either.
 */
function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      className={cn("phone:hidden", className)}
      {...props}
    />
  )
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-2 text-label text-text-secondary",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        // A standing text link (6.6): primary-text, underlined on hover.
        className: cn(
          "tap-area cursor-pointer rounded-lg text-primary-text hover:underline",
          "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  })
}

/** The current page is not a link. It is the quietest item, not the loudest. */
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("text-text-secondary", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("text-text-muted [&>svg]:size-4", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn(
        "flex size-4 items-center justify-center text-text-muted [&>svg]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
