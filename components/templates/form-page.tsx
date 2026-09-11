import * as React from "react"

import { cn } from "@/lib/utils"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"

/**
 * Section 11.3.
 *
 * Add and Edit are the same component (section 4 rule 1). One file,
 * same fields, same order, same labels, same validation; only the
 * title text and the submit button label differ. These pieces are the
 * frame that component sits in.
 *
 * Labels sit ABOVE their field - never to the left, never as
 * placeholder text. Required fields carry a red asterisk; optional
 * fields are not marked. Fields are grouped into named sections.
 * Maximum two columns of content.
 *
 * Actions sit in a footer bar aligned right, Cancel on the left and
 * the primary on the right, always in that order. The footer is fixed
 * rather than scrolled away, so Save is reachable from any point in a
 * long form (rule 8).
 */

/**
 * The form's own frame: the fields scroll, the footer does not. This
 * is the one scrolling container on the screen.
 */
function FormFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-frame"
      className={cn("flex h-full flex-col", className)}
      {...props}
    />
  )
}

function FormScrollArea({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-scroll-area"
      className={cn("min-h-0 flex-1 overflow-y-auto", className)}
      {...props}
    />
  )
}

/** A named group of related fields. Section 5.2: space above, not below. */
function FormSection({
  label,
  description,
  children,
  className,
  ...props
}: React.ComponentProps<"section"> & {
  label: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <section
      data-slot="form-section"
      className={cn("mt-8 first:mt-0", className)}
      {...props}
    >
      <h2 className="text-section font-medium text-text-primary">{label}</h2>
      {description ? (
        <p className="mt-1 text-label text-text-secondary">{description}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-12 gap-6">{children}</div>
    </section>
  )
}

/**
 * Section 17. A field is as wide as the data it holds - never full
 * width by default, because the eye uses field width as a clue about
 * what belongs in the box.
 *
 *   3  - PIN code, amount, quantity, year, percentage
 *   4  - phone number, date, short dropdown, reference number
 *   6  - person name, company name, email address, city
 *   12 - street address, description, notes, anything free-form
 *
 * The spans widen as the screen narrows so a 3-column field never
 * falls under the 160px minimum. Section 9 rule 3: a column holding
 * text must be allowed to shrink below its content width, which is
 * what min-w-0 is for.
 */
const FIELD_SPANS = {
  3: "col-span-12 md:col-span-4 lg:col-span-3",
  4: "col-span-12 md:col-span-6 lg:col-span-4",
  6: "col-span-12 lg:col-span-6",
  12: "col-span-12",
} as const

function FormField({
  span = 6,
  label,
  required,
  htmlFor,
  hint,
  error,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  span?: keyof typeof FIELD_SPANS
  label: React.ReactNode
  required?: boolean
  htmlFor?: string
  /** Helper text. Wraps (section 8). Never a substitute for the label. */
  hint?: React.ReactNode
  /**
   * The error MESSAGE, not an element.
   *
   * It used to take a rendered `<InlineFieldError>`, which is always a
   * truthy element even when it has nothing to say — so `hint && !error`
   * was never true and no hint on any form ever rendered. Taking the
   * string means "is there an error" is a question this can answer.
   */
  error?: string | null
}) {
  return (
    <div
      data-slot="form-field"
      className={cn("flex min-w-0 flex-col gap-2", FIELD_SPANS[span], className)}
      {...props}
    >
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error ? (
        <p className="text-label text-text-secondary">{hint}</p>
      ) : null}
      <InlineFieldError>{error}</InlineFieldError>
    </div>
  )
}

/**
 * Fixed footer. Cancel on the left of the primary, always in that
 * order, both aligned right.
 */
function FormFooter({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-footer"
      className={cn(
        "shrink-0 border-t border-border-light bg-surface",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex w-full max-w-content-max items-center justify-end gap-2 px-6 py-3">
        {children}
      </div>
    </div>
  )
}

export {
  FormFrame,
  FormScrollArea,
  FormSection,
  FormField,
  FormFooter,
}
