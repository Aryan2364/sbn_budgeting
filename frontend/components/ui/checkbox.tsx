"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Section 5.3: --radius-tick, 4px, and this is the only place it is
 * used. A 16px square at the 8px control radius reads as a radio
 * button, which is why the spec carries a third value scoped to here.
 *
 * Section 22: a tick box is the first column of any list where more
 * than one record can sensibly be acted on at once.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-tick) border border-border-strong bg-surface transition-colors",
        // A larger invisible hit area than the 16px box it draws.
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        /*
         * Section 6.4: hover changes the background, pressed changes it
         * further. This control had neither — only resting, disabled
         * and focus — so two of the four required states did not exist.
         * Checked and unchecked each need their own pair, because the
         * checked background is `primary` and tinting it with a neutral
         * would be invisible.
         */
        "not-data-checked:not-data-disabled:hover:border-border-strong not-data-checked:not-data-disabled:hover:bg-surface-control",
        "not-data-checked:not-data-disabled:active:bg-surface-control-pressed",
        "data-checked:not-data-disabled:hover:border-primary-hover data-checked:not-data-disabled:hover:bg-primary-hover",
        "data-checked:not-data-disabled:active:border-primary-pressed data-checked:not-data-disabled:active:bg-primary-pressed",
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
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
