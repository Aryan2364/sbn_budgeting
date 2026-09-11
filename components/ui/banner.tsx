import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Section 7.1, the banner: a condition that persists until it is
 * resolved. Named Banner, not Alert, because section 7.1 treats
 * banner, inline field error, toast and dialog as four distinct
 * patterns with a decision rule between them - a component called
 * Alert invites picking by feel instead of by the rule.
 *
 * The user can carry on, but it stays true - which is what separates a
 * banner from a toast (temporary) and a dialog (must act). One field
 * being wrong is InlineFieldError, not this.
 *
 * Section 7.2 rule 1: every banner carries an icon as well as a colour.
 * Colour alone is invisible to colour-blind users. Rule 3: no
 * exclamation marks, no "Error:" prefix, and never a raw technical
 * message.
 *
 * `neutral` is the default. There is deliberately no blue information
 * colour in this system (section 2.4) - neutral grey carries it.
 */
const bannerVariants = cva(
  [
    "group/banner relative grid w-full gap-1 rounded-lg border px-4 py-3 text-left text-body",
    "has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3",
    "has-data-[slot=banner-action]:pr-4",
    "*:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        neutral:
          "border-border bg-surface text-text-primary *:[svg]:text-text-secondary",
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        danger: "border-danger-border bg-danger-bg text-danger",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function Banner({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof bannerVariants>) {
  return (
    <div
      data-slot="banner"
      role="alert"
      className={cn(bannerVariants({ variant }), className)}
      {...props}
    />
  )
}

function BannerTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="banner-title"
      className={cn(
        "font-medium group-has-[>svg]/banner:col-start-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 7.2 rule 2: state the cause, then the next action. "Enter a
 * complete email address, like name@company.com", not "Invalid email".
 */
function BannerDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="banner-description"
      className={cn(
        "text-body group-has-[>svg]/banner:col-start-2 [&_p:not(:last-child)]:mb-2",
        className
      )}
      {...props}
    />
  )
}

/** Section 13: no dead ends. A banner offers a way forward. */
function BannerAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="banner-action"
      className={cn(
        "mt-2 flex items-center gap-2 group-has-[>svg]/banner:col-start-2",
        className
      )}
      {...props}
    />
  )
}

export { Banner, BannerTitle, BannerDescription, BannerAction }
