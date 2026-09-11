"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Section 3 rule 2: labels are always 13px, weight 400, text-secondary.
 * A label in text-primary reads as body text and the hierarchy
 * collapses - that is a bug, not a preference.
 *
 * Section 11.3: labels sit above their field, never beside it and never
 * as placeholder text. Required fields carry a red asterisk; optional
 * fields are not marked.
 */
function Label({
  className,
  children,
  required = false,
  ...props
}: React.ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      data-slot="label"
      className={cn(
        // flex, not inline-flex: a label is block-level so the field
        // that follows it starts on the next line (section 11.3). w-fit
        // keeps the clickable area to the text, not the whole row.
        "flex w-fit items-center gap-1 text-label text-text-secondary select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-text-muted",
        "peer-disabled:cursor-default peer-disabled:text-text-muted",
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="text-danger" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}

export { Label }
