"use client"

import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Section 26: **disable** an individual action the user can see but
 * cannot perform, and always say why.
 *
 * The reasoning §26 gives is that a read-only user sees the same
 * screens with things disabled rather than a separate stripped-down
 * version, so two people looking at one record are looking at the same
 * software. **A staff member who cannot find a button does not know
 * whether it does not exist or whether they cannot use it**, and there
 * is nothing on screen to tell them. A greyed control saying "Only an
 * administrator can delete a site" answers the question the absence
 * leaves open.
 *
 * **Why this wrapper has to exist rather than putting a tooltip on the
 * control:** every disabled control in this product carries
 * `pointer-events-none` — `button` through `disabled:`, the menu items
 * through `data-disabled:`. That is correct, and it also means a
 * disabled control never receives a hover, so a tooltip attached to it
 * can never open. The reason would be written and never readable.
 *
 * So the hover is caught by a wrapper that is NOT disabled, and the
 * wrapper is focusable, because a keyboard user cannot hover at all and
 * would otherwise be the one person who never learns why (§19).
 *
 * `allowed` renders the children untouched — no wrapper, no extra
 * element in the tree — so the permitted path is exactly what it was
 * before this existed.
 */
export function PermissionTooltip({
  allowed,
  reason,
  children,
}: {
  allowed: boolean
  /**
   * States who may do it, not that the user may not: "Only an
   * administrator can delete a site" (§26's own wording), never
   * "You do not have permission".
   */
  reason: string
  children: React.ReactNode
}) {
  if (allowed) return <>{children}</>

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            // Focusable so the reason reaches a keyboard user, who has
            // no pointer and no other route to it.
            tabIndex={0}
            role="note"
            aria-label={reason}
            className="inline-flex rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{reason}</TooltipContent>
    </Tooltip>
  )
}
