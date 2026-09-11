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
        "disabled:cursor-default disabled:border-border-light disabled:bg-surface-sunken disabled:text-text-muted",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
