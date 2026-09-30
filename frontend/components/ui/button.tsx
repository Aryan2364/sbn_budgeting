import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Section 6.
 * Four levels: primary, secondary, ghost, danger, plus `in-field` and
 * `on-brand`.
 * Exactly one primary button per screen or per dialog; every other
 * button with a text label is secondary, and carries the brand in its
 * text and icon (primary-text) so the one filled primary still stands
 * out (6.1 rule 2).
 *
 * `ghost` is the quiet icon-only button of section 6.3, everywhere: no
 * fill and no border at rest. Its icon, tooltip, hover fill and focus
 * ring make it readable as a control (6.1 rule 4). It is for icon-only
 * buttons ONLY - a text label on it is the word-with-no-edge that 6.1
 * rule 5 forbids.
 *
 * `in-field` is section 6.3.1: the same quiet button INSIDE an input, a
 * select or any other bordered field, with its focus ring inset so the
 * field does not clip it.
 *
 * `on-brand` is section 6.3.2: the same quiet button ON a section 36
 * header band, its colours reversed for the brand ground.
 *
 * Height is fixed at 36 / 32 / 40. Width grows with the label,
 * height never does, so two buttons on different screens are always
 * the same height. On a touch screen `tap-area` grows the TAP area to
 * 44px without changing what the user sees (9 rule 4).
 */
const buttonVariants = cva(
  [
    "group/button tap-area inline-flex shrink-0 cursor-pointer items-center justify-center gap-1",
    "rounded-lg border whitespace-nowrap select-none",
    /*
     * Section 5.6: hover and pressed change colour at the fast duration.
     * The property list is explicit rather than transition-colors,
     * because transition-colors also animates outline-color and the
     * focus ring is never animated - it appears at once, in
     * primary-ring, not fading in from the text colour.
     */
    "transition-[background-color,border-color,color] duration-(--duration-fast)",
    /*
     * SECTION 6.4'S FOCUS RING, AND THE THIRD CLASS IS NOT OPTIONAL.
     *
     * Tailwind v4 compiles `outline-none` to
     * `--tw-outline-style: none; outline-style: none`, and the WIDTH
     * utility `outline-2` to `outline-style: var(--tw-outline-style);
     * outline-width: 2px`. Both land on this element, so the width
     * utility reads the style back out of the variable the suppressor
     * just set: the focus ring computes to 2px of `outline-style: none`
     * and paints nothing, while `:focus-visible` matches and every
     * class reads correctly in the markup. It is invisible in the one
     * place it cannot afford to be, and invisible in review too.
     *
     * `focus-visible:[outline-style:solid]` sets the property directly.
     * The tidy `focus-visible:outline-solid` compiles to the same CSS
     * but does NOT survive `cn()`: tailwind-merge groups it with the
     * outline-COLOUR utilities and drops
     * `focus-visible:outline-primary-ring`, which leaves a correct ring
     * in `currentColor`. Measured both ways.
     *
     * Every control in this kit carries the same pair, so every one of
     * them carries this third class. Anything added later does too.
     */
    "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
    "disabled:pointer-events-none disabled:cursor-default",
    "disabled:border-border-light disabled:bg-surface-sunken disabled:text-text-muted",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary font-medium text-primary-foreground hover:border-primary-hover hover:bg-primary-hover active:border-primary-pressed active:bg-primary-pressed",
        /*
         * Section 6.1 rule 3: the hover is a neutral fill, never
         * primary-subtle - that colour means "selected".
         */
        secondary:
          "border-primary-border bg-surface text-primary-text hover:bg-surface-control active:bg-surface-control-pressed",
        /*
         * Section 6.3. The disabled line overrides the base's
         * surface-sunken fill and border-light border: a disabled quiet
         * button stays quiet, and only its icon drops to text-muted.
         */
        ghost: [
          "border-transparent bg-transparent text-text-secondary",
          "hover:bg-surface-control hover:text-text-primary",
          "active:bg-surface-control-pressed active:text-text-primary",
          "disabled:border-transparent disabled:bg-transparent disabled:text-text-muted",
        ].join(" "),
        danger:
          "border-danger bg-danger font-medium text-on-danger hover:border-danger-hover hover:bg-danger-hover active:border-danger-pressed active:bg-danger-pressed",
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
        /*
         * Section 6.3.2 - an icon button ON a section 36 header band.
         * The SAME rule as in-field with a different container: the
         * band is the visible ground, so the control brings no fill
         * and no border of its own. A pale surface-control chip on a
         * dark brand band is the box-inside-a-box fault with the
         * contrast turned up.
         *
         * THE FOCUS RING CHANGES COLOUR AND THAT IS NOT COSMETIC.
         * primary-ring is a mid-tone of the brand, so on a primary
         * ground it is very nearly the ground - a ring that vanishes
         * on exactly the surface it was specified for. A keyboard
         * user has no pointer and no other signal, so the ring
         * reverses to on-brand with everything else on the band.
         *
         * disabled: overrides the base, which sets a surface-sunken
         * fill and a border-light border - both of which are white-ish
         * and would show as a pale chip on the band.
         */
        "on-brand": [
          "border-transparent bg-transparent text-on-brand",
          "hover:bg-on-brand-hover active:bg-on-brand-pressed",
          "disabled:border-transparent disabled:bg-transparent disabled:text-on-brand-muted",
          "focus-visible:outline-on-brand focus-visible:outline-offset-0",
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

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

/**
 * `forwardRef` IS LOAD-BEARING. It is not tidiness and it is not
 * optional, and removing it breaks this kit on React 18 while leaving
 * every test on React 19 green.
 *
 * Every Base UI trigger that takes `render={<Button/>}` - Tooltip,
 * Popover, Menu, Sheet, Dialog, AlertDialog, and this kit's own
 * `AlertDialogCancel` - ends up in Base UI's `evaluateRenderProp`,
 * which does `cloneElement(render, {...props, ref})`.
 *
 *   React 19: `ref` is an ordinary prop on a function component, so the
 *             spread below would carry it through even without this.
 *   React 18: `ref` is a RESERVED key on the element. A function
 *             component never receives it, the ref resolves to null,
 *             and React warns "Function components cannot be given
 *             refs".
 *
 * What a null ref costs is not a crash, which is why it survived so
 * long: the popup still MOUNTS. It just has no anchor element to
 * position against, so Base UI's positioner pins it at top:0 left:0
 * with opacity:0 - invisible, while `aria-expanded` says "true". The
 * tooltip does not appear at all, and dialogs mount without moving
 * focus into themselves. Measured on React 18.3.1 before this ref
 * existed; see `_kit-only/react-compat-harness`.
 *
 * The declared element type is `HTMLButtonElement` because that is what
 * this renders by default. A caller using `render` to become something
 * else (`render={<Link/>}`) narrows it at the call site.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "default",
      nativeButton,
      render,
      ...props
    },
    ref
  ) {
    /*
     * TRACKING KEEPS ITS nativeButton DEFAULT (the kit dropped it).
     * A button rendered AS something else is not a native button. Base
     * UI defaults `nativeButton` to true and warns when the element it
     * renders is not a <button> - exactly what `render={<Link />}`
     * produces. Defaulting it from the presence of `render` keeps every
     * existing call site correct without passing nativeButton={false}
     * at each one. Passing it explicitly still wins.
     */
    return (
      <ButtonPrimitive
        ref={ref}
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
)

export { Button, buttonVariants }
