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
        "field-sizing-content flex min-h-16 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-body text-text-primary transition-colors",
        "placeholder:text-text-muted",
        "outline-none focus-visible:border-primary-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-ring",
          /*
   * Section 6.4: a text-entry control is not pressed, it is focused.
   * Its background carries text the user is reading back, so it must
   * not shift under them while they hover or type — a pointer left
   * over a field after a click holds `:hover` for as long as typing
   * continues, so a hover fill here would be how the field looks in
   * use, not a brief highlight. Only the border responds to hover;
   * there is no hover or pressed background fill.
   *
   * `enabled:` so a disabled field does not light up under the pointer.
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
