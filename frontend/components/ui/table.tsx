"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Truncate } from "@/components/ui/truncate"

/**
 * Sections 10, 11.1 and 22.
 *
 * Numbers are right-aligned, text is left-aligned - pass `numeric` on
 * the head and the cell rather than remembering a class each time.
 * Column headers stay visible while rows scroll, so the header is
 * sticky inside whichever container owns the scroll.
 *
 * Horizontal scroll is a last resort (section 10 rule 2). Drop
 * secondary columns at narrower widths first; only a genuinely wide
 * table should scroll sideways, and then the first column freezes.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-body", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "sticky top-0 z-10 bg-surface-sunken [&_tr]:border-b [&_tr]:border-border-light",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

/**
 * Section 3 rule 5: a total row carries body-strong weight.
 *
 * `sticky` is section 34.1: on a REPORT table the total row is pinned
 * the same way the column header is. A header tells you what a column
 * means; a total tells you what the report concluded, and losing the
 * second is worse — the answer ends up below the fold with nothing on
 * screen saying it exists.
 *
 * Opt-in rather than always-on, because it is a property of report
 * tables and not of every table that happens to have a footer.
 */
function TableFooter({
  className,
  sticky,
  ...props
}: React.ComponentProps<"tfoot"> & { sticky?: boolean }) {
  return (
    <tfoot
      data-slot="table-footer"
      data-sticky={sticky || undefined}
      className={cn(
        "border-t border-border-light bg-surface-sunken font-medium [&>tr]:last:border-b-0",
        // Applied to the cells as well: several engines still ignore
        // position:sticky on <tfoot> itself but honour it on the cells.
        sticky && "sticky bottom-0 z-20 [&_td]:sticky [&_td]:bottom-0",
        className
      )}
      {...props}
    />
  )
}

/** `selected` tints the row primary-subtle, per section 22.1. */
function TableRow({
  className,
  selected,
  ...props
}: React.ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected || undefined}
      className={cn(
        "border-b border-border-light transition-colors hover:bg-surface-sunken",
        "data-selected:bg-primary-subtle data-selected:hover:bg-primary-subtle",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 8: "A header cell truncates like any other cell." Plain-string
 * labels (the overwhelming majority of headers) are wrapped in `Truncate`
 * automatically, so every existing caller gets the fix for free and
 * nothing double-wraps a caller that already passes its own `Truncate`
 * (non-string children, e.g. a sortable header's button+chevron, or a
 * caller-supplied node) are left exactly as passed through - such a
 * caller is responsible for truncating its own label internally the way
 * `record-list.tsx`'s sortable header does.
 */
function TableHead({
  className,
  numeric,
  children,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      data-numeric={numeric || undefined}
      className={cn(
        "h-control px-4 text-left align-middle text-label font-normal whitespace-nowrap text-text-secondary",
        "data-numeric:text-right",
        className
      )}
      {...props}
    >
      {typeof children === "string" ? <Truncate>{children}</Truncate> : children}
    </th>
  )
}

/**
 * Section 8, section 1 rule 6: a numeric cell overflows just as easily
 * as a text one - a stress-tested amount like `10,00,00,00,00,00,00,000.00`
 * has no break opportunity and, with `overflow:visible` (the browser's
 * table-cell default), spills into the neighbouring cell instead of
 * clipping. Plain-string children are wrapped in `Truncate` the same way
 * `TableHead` already does it, so this is the default for every numeric
 * (and text) cell rather than something each caller has to remember.
 * `Truncate`'s span sets no text-align of its own, so it inherits the
 * cell's `data-numeric:text-right` and the ellipsis stays right-aligned.
 * Non-string children (badges, icons, a caller's own composed node) pass
 * through unchanged - that caller owns its own overflow handling, exactly
 * as `TableHead` already treats a non-string header.
 */
function TableCell({
  className,
  numeric,
  children,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      data-numeric={numeric || undefined}
      className={cn(
        "px-4 py-3 align-middle text-body",
        "data-numeric:text-right data-numeric:tabular-nums",
        className
      )}
      {...props}
    >
      {typeof children === "string" ? <Truncate>{children}</Truncate> : children}
    </td>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-label text-text-secondary", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
