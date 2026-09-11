import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Sections 5.3 and 11.6.
 * 12px radius, a 1px border-light edge, no shadow. The header carries
 * the card heading and, optionally, one action on the right; the footer
 * sits on surface-sunken so it reads as chrome rather than content.
 *
 * Cards in a grid must all be the same height, which is what
 * CardDescription's two-line clamp is for (section 8).
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-xl border border-border-light bg-surface text-body text-text-primary",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border-light px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-card-heading font-medium text-text-primary", className)}
      {...props}
    />
  )
}

/** Section 8: clamped to two lines so a grid of cards stays level. */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("line-clamp-2 text-label text-text-secondary", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("p-4", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border-light bg-surface-sunken px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
