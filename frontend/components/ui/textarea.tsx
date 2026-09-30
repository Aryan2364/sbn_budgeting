import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Section 17: free-form text spans all 12 columns, so a textarea is the
 * one field that is allowed to be full width. Everything else about it
 * matches Input.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content flex min-h-16 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-body text-text-primary transition-colors duration-(--duration-fast)",
        "placeholder:text-text-muted",
        "outline-none focus-visible:border-primary-ring focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-0 focus-visible:outline-primary-ring",
        /*
         * Section 6.4: hover changes the background, pressed changes it
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
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
