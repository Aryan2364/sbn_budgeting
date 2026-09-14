"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * On is primary, off is a neutral control fill. A switch commits
 * immediately - if the change needs a Save, it should be a tick box on
 * a form instead.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 transition-colors",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
        "data-checked:bg-primary data-unchecked:bg-surface-control-pressed",
        /*
         * Section 6.4: hover changes the background, pressed changes it
         * further. This control had neither — only resting, disabled
         * and focus — so two of the four required states did not exist.
         * Checked and unchecked each need their own pair, because the
         * checked background is `primary` and tinting it with a neutral
         * would be invisible.
         */
        "data-unchecked:not-data-disabled:hover:bg-border data-unchecked:not-data-disabled:active:bg-border-strong",
        "data-checked:not-data-disabled:hover:bg-primary-hover data-checked:not-data-disabled:active:bg-primary-pressed",
        "data-disabled:cursor-default data-disabled:bg-border-light",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-surface transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
