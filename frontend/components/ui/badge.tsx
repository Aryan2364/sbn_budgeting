import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import type * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Sections 2.4, 7.2 and 11.1.
 * Status is always a badge, never plain coloured text. Status colours
 * never change when the brand colour changes - they carry meaning, not
 * brand.
 *
 * Section 7.2 rule 1: every status badge carries an icon as well as a
 * colour, because colour alone is invisible to colour-blind users.
 * The caller passes the icon as the first child.
 *
 * `neutral` is section 2.4's fourth status row: Draft, Inactive,
 * Deactivated, Cancelled, Archived - a record that is simply not in use
 * or not started, neither good nor bad. text-secondary on
 * surface-control, about 7.2:1. It is also the default, because a
 * notification is neither success nor failure (7.3).
 *
 * A number inside a control is not a badge: it is Count, below.
 */
const badgeVariants = cva(
  [
    "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1",
    "rounded-lg border px-2 py-0.5 text-meta whitespace-nowrap",
    "[&>svg]:pointer-events-none [&>svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        neutral: "border-border bg-surface-control text-text-secondary",
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        danger: "border-danger-border bg-danger-bg text-danger",
        /*
         * DEPRECATED - kept only for backward compatibility (Tracking
         * uses it on settings/people "Admin" and the expense filter
         * count). The kit removed it: a number inside a control is
         * Count (6.8), and a role label is neutral. It is drawn in the
         * kit's nearest look - Count's primary pill colours - so the
         * remaining call sites read the same as a Count until they move.
         * Do not add new uses.
         */
        primary: "border-primary bg-primary font-medium text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function Badge({
  className,
  variant = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

/**
 * Section 6.8: a count inside a button, tab or menu item - the number of
 * active filters, of records in a tab. One style in every control: a
 * pill in primary with primary-foreground text, 12px at 500, 18px tall,
 * never narrower than it is tall (a single digit is a circle), 6px either
 * side of a longer number. Over 99 it reads "99+".
 *
 * It sits 8px (space-2) from its label. Tabs and menu items already
 * space their children by 8px; a button spaces an icon 4px from its
 * label (section 23), so inside a button the count adds the other 4px.
 *
 * Primary on primary is invisible, so a count never goes on a primary
 * button; its controls are secondary buttons, tabs and menu items.
 */
function Count({
  value,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & { value: number }) {
  const text = value > 99 ? "99+" : String(value)
  return (
    <span
      data-slot="count"
      className={cn(
        "inline-flex h-count min-w-count shrink-0 items-center justify-center rounded-full bg-primary",
        // A single digit is about 7px wide, so 6px either side would make
        // it 19px, and never the 18px circle 6.8 asks for. The side
        // padding is for numbers that outgrow the circle.
        text.length > 1 && "px-count-pad",
        "text-meta leading-none font-medium text-primary-foreground tabular-nums",
        "in-data-[slot=button]:ml-1",
        className
      )}
      {...props}
    >
      {text}
    </span>
  )
}

export { Badge, Count, badgeVariants }
