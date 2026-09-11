"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

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

/** Section 3 rule 5: a total row carries body-strong weight. */
function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border-light bg-surface-sunken font-medium [&>tr]:last:border-b-0",
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

function TableHead({
  className,
  numeric,
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
    />
  )
}

function TableCell({
  className,
  numeric,
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
    />
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
