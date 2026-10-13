"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { Button } from "@/components/ui/button"

const CONTENT_ID = "content"

/**
 * The phone's content area - 41.4 rule 20, 41.13 rules 2 and 10.
 *
 *   - Sides: 16px (space-4) plus the side safe areas, so nothing sits
 *     under a notch held sideways. No maximum width.
 *   - Held sideways (or on any phone screen wider than the column plus
 *     its 16px sides), the content sits in a centred column no wider than
 *     --spacing-phone-column: each side's padding grows to half of what
 *     is left over. max() picks it only where it is the larger, so an
 *     upright phone, always under 600px wide (41.2 rule 1), keeps 16px.
 *     The app bar, tab bar and action bar stay full width (41.13 rule 10).
 *   - The two side paddings are published as --content-pad-left and
 *     --content-pad-right, so whatever runs FULL WIDTH inside (the page's
 *     app bar, section tabs) bleeds out by exactly them, to the screen's
 *     edges in either orientation.
 *   - Edge-to-edge ROWS (a phone list, More: 41.5 rule 8) are content,
 *     not bars, so held sideways they stay in the column. Their bleed is
 *     published as --content-bleed-left and --content-bleed-right: the
 *     whole padding (16px plus the safe area) where the padding is that,
 *     and 0px where the padding is the sideways column's. CSS has no
 *     "if", so the switch is a clamp: (16px + safe area - column
 *     padding) is >= 0 exactly when max() above picked 16px + safe area,
 *     and scaled by 1000 it saturates to the full 16px + safe area; below
 *     0 it clamps to 0px. It cannot drift from the padding, because it
 *     is built from the same two terms.
 *   - Top: 16px above the first block. A page's app bar pulls itself up
 *     over it (PageHeader).
 *   - Bottom: the bar fixed at the bottom of the screen now, plus the
 *     bottom safe area, plus 16px, so the last block clears the tab bar
 *     or action bar. --bottom-bar is the contract in globals.css, worked
 *     out there by :has from the bar that marks itself in the page
 *     (data-fixed-bottom), never by an effect, so this padding is right
 *     in the server's HTML.
 *   - The page scrolls on the window, never inside this: the tab bar's
 *     scroll to the top (41.4 rule 18) and the sticky app bar and section
 *     tabs rely on it, and an inner scroller would trap the pointer (1
 *     rule 8).
 */
const PHONE_CONTENT = cn(
  "w-full min-w-0 flex-1 outline-none",
  "[--content-pad-left:max(calc(var(--spacing)_*_4_+_var(--safe-left)),calc((100vw_-_var(--spacing-phone-column))_/_2))]",
  "[--content-pad-right:max(calc(var(--spacing)_*_4_+_var(--safe-right)),calc((100vw_-_var(--spacing-phone-column))_/_2))]",
  "[--content-bleed-left:clamp(0px,calc((var(--spacing)_*_4_+_var(--safe-left)_-_(100vw_-_var(--spacing-phone-column))_/_2)_*_1000),calc(var(--spacing)_*_4_+_var(--safe-left)))]",
  "[--content-bleed-right:clamp(0px,calc((var(--spacing)_*_4_+_var(--safe-right)_-_(100vw_-_var(--spacing-phone-column))_/_2)_*_1000),calc(var(--spacing)_*_4_+_var(--safe-right)))]",
  "pt-4 pr-(--content-pad-right) pl-(--content-pad-left)",
  "pb-[calc(var(--bottom-bar)_+_var(--safe-bottom)_+_var(--spacing)_*_4)]"
)

/* ------------------------------------------------------------------
   Edge-to-edge rows on phone - 41.5 rule 8, 41.13 rules 2 and 10.

   The one copy of the classes every phone block of rows uses: the phone
   list (phone-list.tsx), the record's related rows and activity
   (record-summary.tsx) and More (more-screen.tsx). They live here, beside
   the variables they read, so the rows and the content area cannot drift
   apart (section 4 rule 2). Phone only: nothing on desktop uses them,
   and the variables are set only by PHONE_CONTENT above.
   ------------------------------------------------------------------ */

/**
 * A block that runs edge to edge: it pulls itself out over the content
 * area's side padding by exactly the bleed the content area publishes -
 * 16px plus the side safe area upright, nothing when held sideways, where
 * the content keeps to the 600px column (41.13 rule 10) and the rows stay
 * inside it. Never a fixed -mx-4: that is right upright only while the
 * safe area is 0px. The fallbacks are for rows outside the content area:
 * no bleed.
 */
const BLEED =
  "mr-[calc(var(--content-bleed-right,0px)_*_-1)] ml-[calc(var(--content-bleed-left,0px)_*_-1)]"

/**
 * The side padding inside a bled block: 16px (41.5 rule 8), or the bleed
 * where that is larger, so text and icons land back on the content
 * area's edge and never under a notch. Outside the content area: 16px.
 */
const INSET =
  "pr-[max(calc(var(--spacing)_*_4),var(--content-bleed-right,0px))] pl-[max(calc(var(--spacing)_*_4),var(--content-bleed-left,0px))]"

/**
 * The keyboard focus ring (6.4) drawn INSIDE the element: a row runs to
 * the screen's edges, where an outside ring would be cut off.
 */
const INSET_RING =
  "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:-outline-offset-2 focus-visible:outline-primary-ring"

/** A block of rows: surface, border-light lines between the rows and above and below them. */
const BLOCK = "divide-y divide-border-light border-y border-border-light bg-surface"

/**
 * One tappable row that opens a screen (41.5 rules 8 and 12): More's rows,
 * a record's related rows and its "Add comment" row. At least 48px, like
 * a sheet's rows (41.8 rule 7), and a minimum, so it grows with the
 * text-size setting (41.9 rule 7); 12px above and below; the sides as
 * INSET; the whole row is the link. Pressed is a surface-control fill and
 * there is no hover state: on phone the pressed fill is the feedback
 * (41.9 rule 1). Icons are 18px (23); a leading one sits 4px from its
 * label, and the trailing chevron at least 12px from it (its own ml-2 on
 * the row's 4px gap).
 *
 * A phone LIST row (41.5 rules 8 to 11) is taller and lays out three
 * lines; phone-list.tsx builds it from INSET and INSET_RING.
 */
const ROW = cn(
  "flex min-h-12 w-full items-center gap-1 py-3 text-left text-body text-text-primary",
  INSET,
  "[&_svg]:size-icon-nav [&_svg]:shrink-0",
  "transition-[background-color] duration-(--duration-fast) active:bg-surface-control",
  INSET_RING
)

/**
 * Section 12.3. 24px on every side, at most 1600px wide and centred. The
 * page header, with its title and one primary action, belongs to the
 * page, not to this. On phone it takes the form above, through
 * useLayout() (41.3 rule 4); the desktop classes are exactly as before.
 *
 * It is the skip link's target, so it takes focus (tabIndex -1) without
 * becoming a tab stop, and shows no ring: it is not a control.
 */
function ContentArea({ className, ...props }: React.ComponentProps<"main">) {
  const { layout } = useLayout()
  return (
    <main
      id={CONTENT_ID}
      tabIndex={-1}
      data-slot="content-area"
      className={cn(
        layout === "phone"
          ? PHONE_CONTENT
          : "mx-auto w-full max-w-content-max min-w-0 flex-1 p-6 outline-none",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 39.1. The first Tab on every page reaches this, and it is
 * visible only while it has focus. It jumps past the sidebar and the top
 * bar (on phone, the shell's app bar) to the page's content.
 *
 * Focus moves by script as well as by the href, because a hash link only
 * moves focus in some browsers, and not at all once the URL already ends
 * in #content. On the tooltip layer while focused: it has to show above
 * the shell it skips, and like a tooltip it is transient.
 */
function SkipToContent({ children = "Skip to content" }: { children?: React.ReactNode }) {
  return (
    <Button
      variant="secondary"
      nativeButton={false}
      render={<a href={`#${CONTENT_ID}`} />}
      data-slot="skip-to-content"
      onClick={(event) => {
        const target = document.getElementById(CONTENT_ID)
        if (!target) return
        event.preventDefault()
        target.focus()
        target.scrollIntoView({ block: "start" })
      }}
      className="fixed -top-12 left-2 z-(--z-tooltip) focus:top-2 phone:focus:top-[calc(var(--safe-top)+var(--spacing)*2)]"
    >
      {children}
    </Button>
  )
}

export { ContentArea, SkipToContent, CONTENT_ID, PHONE_CONTENT, BLEED, INSET, INSET_RING, BLOCK, ROW }
