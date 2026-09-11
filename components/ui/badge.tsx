import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Sections 2.4, 7.2 and 11.1.
 * Status is always a badge, never plain coloured text. Status colours
 * never change when the brand colour changes - they carry meaning, not
 * brand.
 *
 * Section 7.2 rule 1: every status badge carries an icon as well as a
 * colour, because colour alone is invisible to colour-blind users.
 * `neutral` is the default: a notification or a plain count is neither
 * success nor failure (section 7.3).
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
        primary:
          "border-primary bg-primary font-medium text-primary-foreground",
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

export { Badge, badgeVariants }
