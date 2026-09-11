import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Section 7.1, the inline field error: used when one specific form
 * field is wrong. It is one of four distinct message patterns, and the
 * deciding question is "can the user ignore it and carry on?" - yes and
 * temporary is a toast, yes but it stays true is a Banner, no is a
 * Dialog, about one field is this.
 *
 * Section 7.1 also forbids using a toast for a field validation error:
 * the user has to remember which field was wrong after it vanishes.
 *
 * Section 7.2 rule 2: state the cause, then the next action. "Enter a
 * complete email address, like name@company.com", not "Invalid email".
 * Rule 3: no exclamation marks, no "Error:" prefix, no raw technical
 * message.
 *
 * Section 11.3 rule 6: the error appears below the field and the field
 * border turns danger red - pass `aria-invalid` to the field itself to
 * get the border.
 */
function InlineFieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  if (!children) return null

  return (
    <p
      data-slot="inline-field-error"
      role="alert"
      className={cn("mt-1.5 text-label text-danger", className)}
      {...props}
    >
      {children}
    </p>
  )
}

export { InlineFieldError }
