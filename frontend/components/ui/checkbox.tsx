"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Section 5.3: --radius-tick, 4px, and this is the only place it is
 * used. A 16px square at the 8px control radius reads as a radio
 * button, which is why the spec carries a third value scoped to here.
 *
 * Section 22: a tick box is the first column of any list where more
 * than one record can sensibly be acted on at once.
 *
 * PARTLY TICKED (section 40.3): a tick that stands for a group - a whole
 * module, a row of actions, a group of units - is partly ticked when
 * some of the group is ticked. Pass `indeterminate`; Base UI writes
 * `data-indeterminate` and aria-checked="mixed", which is not overridden.
 * It looks like ticked, with a minus in place of the tick, and takes the
 * ticked hover and pressed pair.
 *
 * Base UI already renders the indicator for an indeterminate box. Before
 * these classes existed it rendered the TICK there, on the unticked
 * white box: a partly ticked group read as fully ticked, with nothing
 * erroring.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-tick) border border-border-strong bg-surface transition-colors duration-(--duration-fast)",
        // A larger invisible hit area than the 16px box it draws. This
        // control already owns ::after, so it does not take the
        // tap-area utility; on a touch screen the same element becomes a
        // centred --tap-target square instead (section 9 rule 4). An inset
        // measured from the box falls 2px short: ::after sizes from the
        // padding box, inside the 1px border.
        "after:absolute after:-inset-x-3 after:-inset-y-2 pointer-coarse:after:inset-auto pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:size-(--tap-target) pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2",
        "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        // not-data-disabled: Tailwind emits data-indeterminate AFTER
        // data-disabled, so without it a disabled partly ticked box kept
        // the brand fill while a disabled ticked box went grey. Measured.
        "data-indeterminate:not-data-disabled:border-primary data-indeterminate:not-data-disabled:bg-primary data-indeterminate:not-data-disabled:text-primary-foreground",
        /*
         * Section 6.4: hover changes the background, pressed changes it
         * further. This control had neither — only resting, disabled
         * and focus — so two of the four required states did not exist.
         * Checked and unchecked each need their own pair, because the
         * checked background is `primary` and tinting it with a neutral
         * would be invisible.
         */
        "not-data-checked:not-data-indeterminate:not-data-disabled:hover:border-border-strong not-data-checked:not-data-indeterminate:not-data-disabled:hover:bg-surface-control",
        "not-data-checked:not-data-indeterminate:not-data-disabled:active:bg-surface-control-pressed",
        "data-checked:not-data-disabled:hover:border-primary-hover data-checked:not-data-disabled:hover:bg-primary-hover",
        "data-checked:not-data-disabled:active:border-primary-pressed data-checked:not-data-disabled:active:bg-primary-pressed",
        "data-indeterminate:not-data-disabled:hover:border-primary-hover data-indeterminate:not-data-disabled:hover:bg-primary-hover",
        "data-indeterminate:not-data-disabled:active:border-primary-pressed data-indeterminate:not-data-disabled:active:bg-primary-pressed",
        "data-disabled:cursor-default data-disabled:border-border-light data-disabled:bg-surface-sunken data-disabled:text-text-muted",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-3"
      >
        <CheckIcon className="group-data-indeterminate/checkbox:hidden" />
        <MinusIcon className="hidden group-data-indeterminate/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
