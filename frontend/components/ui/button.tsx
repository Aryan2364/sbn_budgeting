import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Section 6.
 * Four levels: primary, secondary, ghost, danger, plus `in-field`.
 * Exactly one primary button per screen or per dialog; everything
 * else is secondary. Ghost is allowed only for icon-only buttons
 * inside a toolbar, which is why it still carries a fill and a
 * border - a button the user cannot see is a button is broken.
 *
 * `in-field` is section 6.3.1: an icon button INSIDE an input, a
 * select or any other bordered field. It is the one variant with no
 * fill and no border, because the field around it already is the
 * visible container and a bordered button inside a bordered input
 * draws a box inside a box. It is NOT a general-purpose quiet button
 * - used anywhere else it is exactly the invisible control section
 * 6.1 rule 4 forbids. Same shape as the calendar day cell: a control
 * nested inside another container does not bring its own border.
 *
 * Height is fixed at 36 / 32 / 40. Width grows with the label,
 * height never does, so two buttons on different screens are always
 * the same height.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1",
    "rounded-lg border whitespace-nowrap transition-colors select-none",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
    "disabled:pointer-events-none disabled:cursor-default",
    "disabled:border-border-light disabled:bg-surface-sunken disabled:text-text-muted",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary font-medium text-primary-foreground hover:border-primary-hover hover:bg-primary-hover active:border-primary-pressed active:bg-primary-pressed",
        secondary:
          "border-border bg-surface text-text-primary hover:bg-surface-control active:bg-surface-control-pressed",
        ghost:
          "border-border bg-surface-control text-text-primary hover:border-border-strong hover:bg-surface-control-hover active:border-border-strong active:bg-surface-control-pressed",
        danger:
          "border-danger bg-danger font-medium text-primary-foreground hover:border-danger-hover hover:bg-danger-hover active:border-danger-pressed active:bg-danger-pressed",
        /*
         * Section 6.3.1. All four states plus focus, moved from the
         * border to the background:
         *   resting  - nothing; the field is the container
         *   hover    - a surface-control tint behind the icon
         *   pressed  - the pressed tint
         *   disabled - reduced contrast, and the base already removes
         *              the pointer; its fill and border are overridden
         *              back to nothing here
         *   focus    - the primary-ring outline at offset 0, so it
         *              hugs the icon INSIDE the field rather than
         *              straddling the field's own border
         *
         * The focus ring is the only cue a keyboard user gets that the
         * icon is what Enter will press. It is never removed.
         */
        "in-field": [
          "border-transparent bg-transparent text-text-secondary",
          "hover:bg-surface-control hover:text-text-primary",
          "active:bg-surface-control-pressed active:text-text-primary",
          "disabled:border-transparent disabled:bg-transparent disabled:text-text-muted",
          "focus-visible:outline-offset-0",
        ].join(" "),
      },
      size: {
        default: "h-control px-4 text-body",
        sm: "h-control-sm px-3 text-label",
        lg: "h-control-lg px-4 text-body",
        icon: "size-control p-0",
        "icon-sm": "size-control-sm p-0",
        "icon-lg": "size-control-lg p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  nativeButton,
  render,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  /**
   * A button rendered AS something else is not a native button.
   *
   * Base UI defaults `nativeButton` to true and warns when the element
   * it ends up rendering is not a `<button>` — which is exactly what
   * `render={<Link />}` produces, and a link carrying button semantics
   * confuses both forms and screen readers.
   *
   * Defaulting it from the presence of `render` fixes every call site
   * at once, including the ones nobody has written yet. Passing
   * `nativeButton` explicitly still wins, which is what a caller
   * rendering a real `<button>` through `render` needs.
   */
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      nativeButton={nativeButton ?? render === undefined}
      render={render}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
