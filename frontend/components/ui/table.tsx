"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"
import { BandScope, bandClasses, useBandLevel } from "@/components/ui/header-band"
import { Truncate } from "@/components/ui/truncate"

/**
 * Which section of the table a row is in.
 *
 * `TableRow` is used by the header, the body and the footer alike, so
 * a hover written on the row reaches all three. Before section 36 that
 * was invisible - the header was near-white and `surface-sunken` on it
 * changed almost nothing. On a brand band the same hover paints a
 * near-white bar over the band, which is the bug this context exists
 * to make impossible rather than to remember not to cause.
 *
 * Read as: a row's hover and its selected tint belong to the BODY. A
 * header row is chrome and a footer row is a conclusion; neither is
 * something the user points at to act on it.
 */
const TableSectionContext = React.createContext<"head" | "body" | "foot">("body")

/**
 * Sections 10, 11.1 and 22.
 *
 * Numbers are right-aligned, text is left-aligned - pass `numeric` on
 * the head and the cell rather than remembering a class each time.
 * Column headers stay visible while rows scroll.
 *
 * Horizontal scroll is a last resort (section 10 rule 2). Drop
 * secondary columns at narrower widths first; only a genuinely wide
 * table should scroll sideways, and then the first column freezes -
 * `TableRowHeader frozen` is that column.
 *
 * `containerClassName` is where a scrolling table puts its height and
 * its overflow, rather than a wrapper `<div>` the caller adds around
 * `Table`. The component then owns the element that scrolls, which is
 * the same argument section 24 makes about the dialog body.
 *
 * The scrollbar gutter runs the full height of that viewport, so it
 * passes the section 36 band at the top and leaves a pale notch beside
 * it. KNOWN AND LEFT ALONE - globals.css carries the reasoning and
 * _kit-only/SYNC.md carries the two attempts, so read those before trying a
 * third.
 */
function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  const level = useBandLevel()

  return (
    // Section 36.4: the table is a banded region, so everything inside
    // it - including a table nested in a cell - knows a band is above.
    <BandScope>
      <div
        data-slot="table-container"
        /*
         * `level + 1`, because `useBandLevel()` here reads the level
         * OUTSIDE this table's own `BandScope` while the `<thead>`
         * inside it reads one deeper. Published raw, a container
         * reported 1 while its own header reported 2 - so any rule
         * keyed on the container's level silently missed the nested
         * case. Kept in agreement even though nothing styles on it
         * today, because a data attribute that lies is worse than one
         * that is absent.
         */
        data-band-level={level + 1}
        className={cn("relative w-full", containerClassName)}
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-body", className)}
          {...props}
        />
      </div>
    </BandScope>
  )
}

/**
 * Section 36: the column header is a brand band.
 *
 * It reads its depth rather than rendering `HeaderBand`, because a
 * `<thead>` cannot be wrapped in a `<div>` - the table markup decides
 * the element and only the classes are ours. `bandClasses` is shared
 * with `HeaderBand` so the two cannot drift.
 *
 * The band is also what makes the sticky header read as sticky
 * (section 36.1). Before it, rows scrolled under a near-white bar and
 * the header looked like a row that had failed to move.
 *
 * The scope is published by `Table`, not here - see `header-band.tsx`
 * for why it has to be the container. A table nested inside a cell of
 * this one therefore reads level 2 and takes the accent form.
 */
function TableHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"thead">) {
  const level = useBandLevel()

  return (
    <thead
      data-slot="table-header"
      data-band-level={level}
      className={cn(
        "sticky top-0 z-(--z-sticky)",
        bandClasses(level),
        // bandClasses puts the rule on the thead; the row inside it
        // must not draw a second one.
        "[&_tr]:border-b-0",
        className
      )}
      {...props}
    >
      <TableSectionContext.Provider value="head">
        {children}
      </TableSectionContext.Provider>
    </thead>
  )
}

function TableBody({
  className,
  children,
  ...props
}: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      /*
       * `isolate`: every sticky part of a table sits on the one --z-sticky
       * layer (5.5), so a frozen body cell and the sticky header tie, and
       * a tie goes to whichever comes later in the page - the body, which
       * then slides OVER the header as it scrolls up. Isolating the body
       * keeps its frozen cells above their own row and below the header
       * and the total row, without a second z-index number.
       */
      className={cn("isolate [&_tr:last-child]:border-0", className)}
      {...props}
    >
      <TableSectionContext.Provider value="body">
        {children}
      </TableSectionContext.Provider>
    </tbody>
  )
}

/**
 * Section 3 rule 5: a total row carries body-strong weight.
 *
 * `sticky` is section 34.1: on a REPORT table the total row is pinned
 * the same way the column header is. A header tells you what a column
 * means; a total tells you what the report concluded, and losing the
 * second is worse — the answer ends up below the fold with nothing on
 * screen saying it exists. The header was already pinned; the
 * asymmetry was the bug.
 *
 * Opt-in rather than always-on, because it is a property of report
 * tables and not of every table that happens to have a footer.
 */
function TableFooter({
  className,
  sticky,
  children,
  ...props
}: React.ComponentProps<"tfoot"> & { sticky?: boolean }) {
  return (
    <tfoot
      data-slot="table-footer"
      data-sticky={sticky || undefined}
      className={cn(
        // Section 34.1: the total row is pinned like the header but
        // does NOT take the section 36 band. A header says what a
        // column means; a total says what the report concluded, and an
        // answer belongs in the reader's own text colour rather than
        // reversed out of a coloured bar. The 2px primary rule is what
        // ties it back to the header without repeating it - the same
        // accent, on the opposite edge.
        "border-t-2 border-primary bg-surface-sunken font-medium text-text-primary [&>tr]:last:border-b-0",
        // Applied to the cells as well: several engines still ignore
        // position:sticky on <tfoot> itself but honour it on the cells.
        sticky && "sticky bottom-0 z-(--z-sticky) [&_td]:sticky [&_td]:bottom-0",
        className
      )}
      {...props}
    >
      <TableSectionContext.Provider value="foot">
        {children}
      </TableSectionContext.Provider>
    </tfoot>
  )
}

/**
 * Anything inside a row that does its own thing when clicked. A click
 * that lands on one of these belongs to it, not to the row (11.1.2):
 * the tick box ticks, the menu opens, the record's own link follows
 * itself.
 */
const ROW_CLICK_OWNERS =
  "a, button, input, select, textarea, label, summary, [contenteditable=''], [contenteditable='true'], " +
  "[role='button'], [role='checkbox'], [role='radio'], [role='switch'], [role='menuitem'], [role='combobox'], [role='link'], [role='tab']"

/**
 * `selected` tints the row primary-subtle, per section 22.1.
 *
 * The selected tint applies in the BODY only. A header row sits on a
 * section 36 band and a footer row is the section 34.1 total. See
 * `TableSectionContext`.
 *
 * A ROW OPENS ITS RECORD WHEN IT HOLDS A `TableRowLink` (11.1.2), and
 * only then. There is no prop to remember: a list table puts the
 * record's name in a `TableRowLink` because 11.1.2 requires a real link
 * anyway, and a report table (34) or data entry grid (31) has no record
 * to open, holds none, and keeps plain rows with no hover. The hover
 * fill and the hand cursor are keyed on the link being there, so a row
 * never looks clickable when it is not.
 *
 * The row's click is delegated to that link rather than carrying its
 * own address, so the two cannot disagree (11.1.2: "the same address")
 * and a Next `Link` given through `render` still navigates client-side.
 * A click is left alone when it
 * - lands on anything in ROW_CLICK_OWNERS, including the link itself;
 * - comes from a portal the row opened (a menu item), which React
 *   bubbles through the row although it is not inside it on the page;
 * - ends a text selection inside the row.
 * Ctrl, Cmd, Shift and the middle button open the record in a new tab,
 * as they would on the link.
 */
function TableRow({
  className,
  selected,
  onClick,
  onAuxClick,
  ...props
}: React.ComponentProps<"tr"> & { selected?: boolean }) {
  const section = React.useContext(TableSectionContext)
  const interactive = section === "body"

  function rowLinkFor(event: React.MouseEvent<HTMLTableRowElement>) {
    if (!interactive || event.defaultPrevented) return null
    const row = event.currentTarget
    const target = event.target as Element
    if (!row.contains(target)) return null
    const owner = target.closest(ROW_CLICK_OWNERS)
    if (owner && row.contains(owner)) return null
    const selection = window.getSelection()
    if (
      selection &&
      !selection.isCollapsed &&
      selection.toString().trim() !== "" &&
      selection.anchorNode &&
      row.contains(selection.anchorNode)
    ) {
      return null
    }
    return row.querySelector<HTMLAnchorElement>('[data-slot="table-row-link"]')
  }

  function openInNewTab(link: HTMLAnchorElement) {
    window.open(link.href, "_blank", "noopener")
  }

  return (
    <tr
      data-slot="table-row"
      data-section={section}
      data-selected={(interactive && selected) || undefined}
      className={cn(
        "group/row border-b border-border-light",
        interactive && [
          "data-selected:bg-primary-subtle",
          // 11.1.2: soft neutral fill and a hand cursor, on a row that
          // opens something. A selected row keeps its tint (16.2's rule
          // that selected and hovered look different).
          "has-[[data-slot=table-row-link]]:cursor-pointer",
          "has-[[data-slot=table-row-link]]:not-data-selected:hover:bg-surface-control",
          // TRACKING BACKWARD COMPATIBILITY: a row made clickable the old
          // way (role="link" + onClick, e.g. the dashboard's attention
          // list) keeps its hover fill and cursor, and its focus ring
          // gets the outline-style fix. New code uses TableRowLink.
          "[&[role=link]]:cursor-pointer [&[role=link]]:not-data-selected:hover:bg-surface-control",
          "[&[role=link]]:focus-visible:[outline-style:solid]",
          "transition-[background-color] duration-(--duration-fast) ease-enter",
        ],
        className
      )}
      onClick={(event) => {
        onClick?.(event)
        const link = rowLinkFor(event)
        if (!link) return
        if (event.ctrlKey || event.metaKey || event.shiftKey) openInNewTab(link)
        else link.click()
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event)
        if (event.button !== 1) return
        const link = rowLinkFor(event)
        if (link) openInNewTab(link)
      }}
      {...props}
    />
  )
}

/**
 * The record's name in a list row - a real link (11.1.2, 6.6). It is
 * how a keyboard user reaches the record with Tab and opens it with
 * Enter, and how "open in new tab" works; its presence is also what
 * makes the row around it clickable (see `TableRow`).
 *
 * text-primary like the rest of the row, underlined on hover - of the
 * link or of the row, since clicking either goes to the same place.
 * Give it an `href`, or a router link through `render`.
 */
function TableRowLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "tap-area rounded-lg text-text-primary hover:underline group-hover/row:underline",
          "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "table-row-link",
    },
  })
}

/*
 * TRACKING KEEPS ITS AUTOMATIC <Truncate> (the kit dropped it). A
 * plain-string label or cell value is wrapped in `Truncate`, so every
 * existing budget screen keeps its overflow protection and its "full
 * text in a tooltip when cut" (section 8) without each call site
 * remembering it. Without it an unbroken amount such as
 * 10,00,00,00,00,00,00,000.00 spills into the next cell. Non-string
 * children (a badge, a TableRowLink, a sortable header's button) pass
 * through unchanged; that caller owns its own overflow.
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
        // No colour of its own: it INHERITS from the band on the
        // <thead> - `on-brand` at level 1, `primary` in the accent
        // form. Section 2.3: text-secondary is measured on white and
        // means nothing on a brand ground, so setting it here would be
        // the predictable mistake section 36.8 names.
        // `h-band`, not `h-control`: section 36.3 says a band is one
        // row, and one row is the same height on every component that
        // has one. It is also what lets the scroll gutter strip below
        // be a single constant rather than a per-component guess.
        // `truncate` rather than bare `whitespace-nowrap`: a header
        // that cannot wrap and is not clipped overflows INTO THE NEXT
        // COLUMN when its own is too narrow, which reads as a rendering
        // fault rather than as a column that needs widening. It is a
        // backstop, not the plan - section 17.1 requires a column to be
        // wide enough for its own header, so an ellipsis in a header
        // means that rule was broken upstream.
        "h-band px-4 text-left align-middle text-label font-normal truncate",
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
 * The first-column label on a report table (34.3) or a data entry grid
 * (31.4) - the ROW SPINE.
 *
 * It is a `<th scope="row">`, not a `<td>`. A screen reader announces
 * it as the row's name when reading a cell, which is the same job the
 * tint does for the eye; a `<td>` says nothing.
 *
 * `frozen` is section 34.3 and 31.4 in one prop: sticky to the left
 * edge with a 1px right border, so cells sliding underneath read as a
 * boundary rather than as clipping. Hand-rolling that string at the
 * call site is how the border gets forgotten on the screen that needs
 * it most.
 *
 * SCOPED TO READ-ONLY TABLES, AND THAT IS WHAT MAKES THE TINT SAFE.
 * `primary-subtle` is also the section 22.1 selected-row tint, so a
 * spine and a selection on the same table would render a selected row
 * and its spine in one colour. Report tables and data entry grids have
 * no selection - section 34 is read-only and section 31 is editable
 * cells - so the two never meet. A list page's frozen first column is
 * a record you act on rather than a label, so it stays an ordinary
 * cell and takes its row's selected state.
 *
 * In a footer the tint is dropped: the total row owns that cell, the
 * same way section 31.3 gives the grand total the corner where a row
 * total and a column total meet.
 */
function TableRowHeader({
  className,
  frozen,
  ...props
}: React.ComponentProps<"th"> & { frozen?: boolean }) {
  const section = React.useContext(TableSectionContext)

  return (
    <th
      scope="row"
      data-slot="table-row-header"
      data-frozen={frozen || undefined}
      className={cn(
        "px-4 py-3 text-left align-middle text-body font-medium text-text-primary",
        section !== "foot" && "bg-primary-subtle",
        frozen && [
          "sticky left-0 z-(--z-sticky) w-grid-head",
          "after:absolute after:top-0 after:right-0 after:h-full after:border-r after:border-border",
        ],
        className
      )}
      {...props}
    />
  )
}

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
  TableRowHeader,
  TableRowLink,
  TableCell,
  TableCaption,
}
