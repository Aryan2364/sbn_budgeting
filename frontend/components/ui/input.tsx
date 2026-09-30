import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Sections 6.2, 6.4 and 17.
 * Height is fixed at 36px so an input and a button line up on the same
 * row. Width comes from the column it sits in (section 17), capped at
 * 480px because a longer single line is uncomfortable to read back.
 * Validation colours the border danger; the message sits below the
 * field, never in a toast (section 7.1).
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control w-full max-w-field-max min-w-0 rounded-lg border border-border bg-surface px-3 text-body text-text-primary transition-colors duration-(--duration-fast)",
        "placeholder:text-text-muted",
        "outline-none focus-visible:border-primary-ring focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-0 focus-visible:outline-primary-ring",
        /*
         * Section 6.4: hover changes the background, pressed changes it
         * further. This control had NEITHER — only resting, disabled and
         * focus. Worse, globals.css forced a hover appearance for it in
         * the kitchen sink's state matrix, so the matrix displayed a
         * SECTION 6.4: A TEXT-ENTRY CONTROL IS NOT PRESSED, IT IS
         * FOCUSED. It carries no hover fill and no pressed fill - only
         * the border moves on hover, and focus is carried by the
         * border and the primary-ring.
         *
         * This field once had both fills. They were added to satisfy
         * `state-matrix-check`, which had correctly reported that it
         * declared no states - and the wrong half was fixed. The
         * background of a text field is carrying text the user is
         * reading back, and a pointer left over the field after a
         * click holds `:hover` for as long as they type. A hover fill
         * here is not a brief highlight, it is how the field looks in
         * use.
         *
         * `enabled:` so a disabled field does not light up under the
         * pointer.
         */
        "enabled:hover:border-border-strong",
        "disabled:cursor-default disabled:border-border-light disabled:bg-surface-sunken disabled:text-text-muted",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        "file:mr-3 file:h-control-sm file:border-0 file:bg-transparent file:text-body file:font-medium file:text-text-primary",
        className
      )}
      {...props}
    />
  )
}

export { Input }
