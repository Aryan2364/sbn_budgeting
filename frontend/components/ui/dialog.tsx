"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * Section 24. Three widths exist: small 400px for confirmations,
 * medium 560px for short forms, large 800px when the dialog carries
 * tabs or a table. Height grows with the content to 80% of the window,
 * then the body scrolls while the header and footer stay fixed.
 *
 * Every dialog has a title and a 36x36 close button top right. Dialogs
 * close on Escape and on the backdrop; confirmations are the exception
 * and use AlertDialog instead.
 *
 * Never open a dialog from inside a dialog. If it needs to lead
 * somewhere else, it should be a page.
 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-(--backdrop)",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  size = "md",
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  size?: "sm" | "md" | "lg"
  showCloseButton?: boolean
}) {
  /**
   * Section 24, enforced HERE rather than trusted to the caller.
   *
   * The height cap and the internal scroll only work if everything
   * between the header and the footer sits in one `min-h-0 flex-1
   * overflow-y-auto` box. That was `DialogBody`, and it was the
   * caller's job to remember it — so three of the four dialogs in this
   * product did not, and every one of them broke the same way on a
   * short viewport: the popup clamped to 80vh, the unwrapped content
   * kept its natural height, and the overflow painted OUTSIDE the
   * rounded panel. The header scrolled away, a field was sliced in
   * half with its helper text floating on the backdrop, and the footer
   * sat below the fold with both buttons clipped.
   *
   * **A component that silently breaks when a caller forgets one
   * wrapper is the component's bug, not the caller's.** So the body is
   * assembled here: header first, everything else wrapped, footer
   * last, in that order whatever order they arrive in. A caller that
   * already uses `DialogBody` is passed through untouched.
   */
  const items = React.Children.toArray(children)
  const isType = (child: React.ReactNode, type: unknown) =>
    React.isValidElement(child) && child.type === type

  const header = items.filter((c) => isType(c, DialogHeader))
  const footer = items.filter((c) => isType(c, DialogFooter))
  const rest = items.filter(
    (c) => !isType(c, DialogHeader) && !isType(c, DialogFooter)
  )
  const alreadyWrapped = rest.length === 1 && isType(rest[0], DialogBody)

  /**
   * Only assemble when there is something to pin.
   *
   * A dialog with neither a header nor a footer among its children has
   * nothing to hold fixed and nothing to scroll against — the command
   * palette is one, and it brings its own full-height layout and its
   * own scrolling list. Wrapping that would add padding it explicitly
   * turns off and put a second scroll container around a list that
   * already has one, which is section 1 rule 8. Left alone.
   */
  const assemble = header.length > 0 || footer.length > 0

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
          // Nothing may paint outside the panel. Without this the
          // overflow above was not merely unscrollable, it was visible
          // on the backdrop.
          "overflow-hidden",
          "rounded-xl border border-border-light bg-surface text-body text-text-primary shadow-lg outline-none",
          "data-[size=sm]:max-w-dialog-sm data-[size=md]:max-w-dialog-md data-[size=lg]:max-w-dialog-lg",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      >
        {assemble ? (
          <>
            {header}
            {rest.length > 0
              ? alreadyWrapped
                ? rest
                : <DialogBody>{rest}</DialogBody>
              : null}
            {footer}
          </>
        ) : (
          children
        )}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-4"
                aria-label="Close"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border-light px-4 py-3 pr-16",
        className
      )}
      {...props}
    />
  )
}

/** The only zone that scrolls when a dialog runs tall. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto p-4", className)}
      {...props}
    />
  )
}

/** Section 11.3 rule 7: Cancel on the left, primary on the right. */
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-border-light bg-surface-sunken px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-card-heading font-medium text-text-primary", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-label text-text-secondary", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
