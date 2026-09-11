"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

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
 */
function Truncate({
  children,
  className,
  ...props
}: React.ComponentProps<"span"> & { children: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => setIsTruncated(el.scrollWidth > el.clientWidth + 1)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [children])

  const text = (
    <span
      ref={ref}
      data-slot="truncate"
      data-truncated={isTruncated || undefined}
      className={cn("block min-w-0 truncate", className)}
      {...props}
    >
      {children}
    </span>
  )

  if (!isTruncated) return text

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
          className={cn(
            "mt-1 cursor-pointer rounded-lg text-label text-primary hover:text-primary-hover",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
          )}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      ) : null}
    </div>
  )
}

export { Truncate, Clamp }
