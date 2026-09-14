"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Section 15. Any irreversible action opens this. Never delete on a
 * single click.
 *
 * The title names what is being deleted. The description states what
 * else will be affected - "This will also remove 4 invoices and 3 open
 * tasks." A confirmation that does not state the consequences is not a
 * confirmation, it is a speed bump.
 *
 * The confirm button uses the danger style and states the actual verb
 * ("Delete client"), never "OK" or "Yes". Cancel is the safer option
 * and sits on the left.
 *
 * Section 24: confirmations close only via Cancel or the action, so
 * Escape is blocked here and the backdrop is inert.
 */
function AlertDialog({
  onOpenChange,
  ...props
}: AlertDialogPrimitive.Root.Props) {
  return (
    <AlertDialogPrimitive.Root
      data-slot="alert-dialog"
      onOpenChange={(open, eventDetails) => {
        if (!open && eventDetails.reason === "escape-key") {
          eventDetails.cancel()
          return
        }
        onOpenChange?.(open, eventDetails)
      }}
      {...props}
    />
  )
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-(--backdrop)",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** Section 24: a confirmation is the small dialog, 400px. */
function AlertDialogContent({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-dialog-sm -translate-x-1/2 -translate-y-1/2 flex-col",
          /*
           * Section 24 applies to this component too, and it had NO
           * height cap at all — not a weaker one, none. A confirmation
           * is required to state its consequences (section 15 rule 2),
           * and a long enough consequence list on a short viewport
           * pushed the footer, and therefore Cancel and the delete
           * button, off the bottom of the screen. A confirmation whose
           * Cancel cannot be reached is worse than no confirmation.
           */
          "max-h-[80vh] overflow-hidden",
          "rounded-xl border border-border-light bg-surface text-body text-text-primary shadow-lg outline-none",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      /*
       * This is the zone that scrolls. An alert dialog has no separate
       * body — the title and the consequences live here — so this is
       * what has to flex and scroll, while the footer stays pinned.
       */
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-border-light bg-surface-sunken px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-card-heading font-medium text-text-primary", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-body text-text-secondary", className)}
      {...props}
    />
  )
}

/** Defaults to danger: this dialog exists for irreversible actions. */
function AlertDialogAction({
  className,
  variant = "danger",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      variant={variant}
      className={cn(className)}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  variant = "secondary",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
