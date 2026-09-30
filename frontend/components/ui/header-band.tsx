"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Section 36 - the brand header band.
 *
 * A header band is the chrome that labels the content beneath it: a
 * table's column header, a card header, a dialog, sheet or popover
 * header, a board column header. It is filled with `primary` and takes
 * `on-brand`.
 *
 * WHY THIS FILE EXISTS RATHER THAN A CLASS ON EACH HEADER.
 *
 * Section 36.4: a table inside a card puts two bands within 16px of
 * each other, and two solid bands with a hairline between them read as
 * a rendering fault. The outermost band wins and an inner header drops
 * to the ACCENT FORM - surface fill, `primary-text` label text, a 2px
 * `primary` bottom rule.
 *
 * That resolution is the component's job, never the caller's. Section
 * 24 already records what happens when a structural requirement is
 * left to the call site: three of four dialogs in the first product
 * forgot to wrap their body, which indicts the component rather than
 * the callers. So the nesting is resolved through context, and no call
 * site passes a prop or can get it wrong.
 *
 * The accent form is the FLOOR, not one step in a ladder: level 2 and
 * level 5 look the same. Section 36.4 says so explicitly rather than
 * inventing a third treatment nobody would recognise.
 */

/**
 * How many banded regions deep this point is, COUNTING THE CURRENT
 * region's own band.
 *
 *   0 - not inside any banded region
 *   1 - the outermost band: solid brand fill
 *   2+ - nested: the accent form
 *
 * THE SCOPE IS PUBLISHED BY THE CONTAINER, NOT BY THE BAND, and that
 * is the whole reason this is not three lines of `className`. A band
 * that published to its own children would reach a table nested in the
 * header and nothing else - not the card in a dialog's BODY, which is
 * a sibling of the dialog's header rather than a child of it. Card,
 * Table, DialogContent, SheetContent, PopoverContent and the board
 * column each wrap their whole subtree in `BandScope`, so anything
 * rendered anywhere inside them knows a band is already above it.
 */
const BandLevelContext = React.createContext(0)

function useBandLevel() {
  return React.useContext(BandLevelContext)
}

/**
 * Wraps a container that renders a banded header, and raises the level
 * for everything inside it.
 *
 * It renders no DOM of its own: a container's layout is its own
 * business and an extra `<div>` in the tree would break the flex and
 * grid arrangements these components rely on.
 */
function BandScope({ children }: { children: React.ReactNode }) {
  const level = useBandLevel()

  return (
    <BandLevelContext.Provider value={level + 1}>
      {children}
    </BandLevelContext.Provider>
  )
}

/**
 * The class list for a band at a given level, shared so that a
 * component which cannot render `HeaderBand` still cannot drift from
 * one that can. `table.tsx` is the case: a `<thead>` cannot be wrapped
 * in a `<div>`, so the table markup decides the element and only the
 * classes are ours.
 *
 * `text-on-brand` sits on the band rather than on each child, so a
 * title, a count and an icon inside it all inherit. Section 2.3: the
 * neutral text tokens are measured on white and must never appear here
 * - `text-muted` on this ground measures under 2:1.
 */
function bandClasses(level: number) {
  return level <= 1
    ? "bg-primary text-on-brand border-b border-primary"
    : // Section 36.4, the accent form. The label is primary-text - the
      // brand used AS TEXT on surface, which for a light brand is a
      // darker shade than primary (2.2). The 2px rule stays primary: it
      // is one of section 5.3's three permitted 2px borders, not text.
      "bg-surface text-primary-text border-b-2 border-primary"
}

/**
 * True for anything rendered INSIDE a solid band's row (level 1), false
 * in the accent form and everywhere else. A quiet control that can sit
 * in a band reads it to pick section 6.3.2's on-brand variant by itself
 * (36.7), so no call site has to know whether its header is solid.
 */
const OnBandContext = React.createContext(false)

function useOnBand() {
  return React.useContext(OnBandContext)
}

/**
 * Renders a band at whatever level it finds itself.
 *
 * Section 36.3: the band is ONE ROW. It carries the title and the
 * controls that act on the region; explanatory text sits below it, on
 * the surface, where a description is content rather than chrome. A
 * card header holding a two-line description would be ~72px of solid
 * brand and a different height on every card, which is why the
 * components that own a description place it outside the band rather
 * than trusting a caller to.
 */
function HeaderBand({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const level = useBandLevel()

  return (
    <div
      data-slot="header-band"
      data-band-level={level}
      className={cn(
        // `min-h-band`, not `min-h-control`: section 36.7 puts a 36px
        // icon button on a band, and a border-box minimum of 36px
        // leaves it hanging 9px past the band onto the surface below.
        // Measured in the dialog before the token existed.
        "flex min-h-band shrink-0 items-center justify-between gap-3 px-4 py-2",
        bandClasses(level),
        className
      )}
      {...props}
    >
      <OnBandContext.Provider value={level <= 1}>{children}</OnBandContext.Provider>
    </div>
  )
}

export { HeaderBand, BandScope, useBandLevel, useOnBand, bandClasses }
