"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/*
 * 41.8 rule 18 and 41.5 rule 9: on phone, text that may run onto a second
 * line and is then cut with an ellipsis. whitespace-normal undoes the
 * one-line `truncate`; wrap-break-word lets an unbroken reference or
 * email break rather than push past the edge at 320px or at the largest
 * text size (41.13 rule 7, 41.9 rule 7). phone: only, so desktop never
 * sees it. Exported for text that is not a plain string, such as a
 * banner sentence holding markup, so the clamp is written once.
 */
const PHONE_TWO_LINES = "phone:line-clamp-2 phone:whitespace-normal phone:wrap-break-word"

/**
 * "Show more" (section 8, 6.6 rule 5): it expands or loads in place, so it
 * is a button, styled as a standing text link - the classes TextLink's
 * standing appearance uses - with the 9 rule 4 tap area and the
 * primary-ring focus ring (6.4). The one copy: Clamp's link below and
 * record-summary.tsx's ActivityList use it. The caller adds only its own
 * placement (Clamp's mt-1, a column's self-start).
 */
const SHOW_MORE_LINK = cn(
  "tap-area cursor-pointer rounded-sm text-body text-primary-text no-underline decoration-1 underline-offset-2 hover:underline",
  "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
)

/**
 * Section 8. Text must never overflow its container, and there are
 * three behaviours: truncate, wrap, clamp.
 *
 * Truncate is for table cells, list rows, chips, menu items and
 * buttons. One line ending in three dots, with the full text shown as
 * a tooltip on hover.
 *
 * The tooltip only attaches when the text is actually cut off.
 * Section 19 forbids a tooltip that carries information available
 * nowhere else - so on a string that fits, there is nothing to add and
 * no tooltip appears.
 *
 * ON PHONE THERE IS NO TOOLTIP (41.8 rules 16 to 18), SO THE CALLER OWES
 * THE FULL TEXT A PLACE ONE TAP AWAY. Truncate on phone cuts the text
 * and stops there: it renders no tooltip and never turns into a button.
 * Rule 18 allows two routes for cut text, and both belong to the screen,
 * not to this component:
 *
 *   - clamp to two lines: `phoneLines={2}`. The row name of a phone list
 *     (41.5 rule 9) and a page banner's sentence (41.8 rule 15).
 *   - show in full one tap away: the place the tap already goes. A list
 *     row's supporting facts are "on the record" (41.5 rule 10), which
 *     the whole row opens (41.5 rule 12); a select or multi-select
 *     trigger's value is listed in full in the sheet it opens; an app bar
 *     title or a section tab label (41.4 rules 3 and 21) is the name the
 *     screen below already shows in full (41.6 rule 2).
 *
 * A Truncate whose full text is NOT one tap away on phone is a defect at
 * the call site: use Clamp, or let the text wrap (section 8), instead.
 *
 * Why it does not reveal the text in place on a tap: nearly every phone
 * truncation sits inside something that is already tapped for another
 * purpose - a row that opens a record, a tab, a select trigger - and a
 * second tap target inside it would either steal that tap or be a button
 * inside a button. A control that is a button only when the screen is
 * narrow enough to cut its text would also change role as the phone
 * turns. A screen reader is not short-changed either way: the whole
 * string is in the DOM, only drawn short.
 */
function Truncate({
  children,
  className,
  phoneLines = 1,
  ...props
}: React.ComponentProps<"span"> & {
  children: string
  /**
   * Phone only: let the text run onto a second line before it is cut
   * (41.8 rule 18). Desktop always keeps one line.
   */
  phoneLines?: 1 | 2
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)
  const { layout } = useLayout()
  const twoLines = layout === "phone" && phoneLines === 2

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    // Two lines are cut at the bottom, one line at the side. Desktop
    // only ever measures the side, exactly as before.
    const measure = () =>
      setIsTruncated(
        twoLines
          ? el.scrollHeight > el.clientHeight + 1
          : el.scrollWidth > el.clientWidth + 1
      )
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // The web font arriving widens the text without resizing the box,
    // so the observer never fires: a value that fitted in the fallback
    // font and is cut in Geist got no tooltip. Measure again once fonts
    // have loaded.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined
    let live = true
    fonts?.ready.then(() => {
      if (live) measure()
    })
    fonts?.addEventListener("loadingdone", measure)
    return () => {
      live = false
      observer.disconnect()
      fonts?.removeEventListener("loadingdone", measure)
    }
    // isTruncated is a dependency on purpose: flipping it swaps the plain
    // span for the tooltip-wrapped one, which is a NEW node. Without
    // re-running, the observer stayed on the detached old node, whose
    // collapse to 0px measured "fits" and flipped the tooltip straight
    // back off - so a cut value never got its tooltip.
  }, [children, isTruncated, twoLines])

  const text = (
    <span
      ref={ref}
      data-slot="truncate"
      data-truncated={isTruncated || undefined}
      className={cn("block min-w-0 truncate", phoneLines === 2 && PHONE_TWO_LINES, className)}
      {...props}
    >
      {children}
    </span>
  )

  // No tooltip on phone (41.8 rule 16), and no trigger markup either: a
  // tooltip trigger that can never open is noise to a screen reader.
  if (!isTruncated || layout === "phone") return text

  return (
    <Tooltip>
      <TooltipTrigger render={text} />
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Section 8. Clamp is for card descriptions, notification rows and
 * previews: stop at two lines with a "Show more" link.
 *
 * Cards in a grid must all be the same height, and clamping is how
 * that is achieved (section 11.6).
 *
 * The same on phone: it is the first route 41.8 rule 18 names, and
 * "Show more" is already a button with its 44px tap area (9 rule 4), so
 * the full text is one tap away in place.
 */
function Clamp({
  children,
  lines = 2,
  className,
  moreLabel = "Show more",
  lessLabel = "Show less",
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  children: React.ReactNode
  lines?: number
  moreLabel?: string
  lessLabel?: string
}) {
  const ref = React.useRef<HTMLParagraphElement>(null)
  const [isClamped, setIsClamped] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      // Measured against the collapsed height, so the link does not
      // disappear the moment the text is expanded.
      if (expanded) return
      setIsClamped(el.scrollHeight > el.clientHeight + 1)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [children, expanded])

  return (
    <div data-slot="clamp" className={cn("min-w-0", className)} {...props}>
      <p
        ref={ref}
        data-clamped={!expanded && isClamped ? true : undefined}
        className={cn(!expanded && "overflow-hidden")}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
              }
        }
      >
        {children}
      </p>
      {isClamped ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(SHOW_MORE_LINK, "mt-1")}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  )
}

export { Truncate, Clamp, PHONE_TWO_LINES, SHOW_MORE_LINK }
