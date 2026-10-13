"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { BandScope, HeaderBand } from "@/components/ui/header-band"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  registerLayerTitle,
  textOf,
} from "@/components/ui/sheet"

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
 *
 * ON PHONE (41.8 rule 10) the size decides the form, and the caller
 * never chooses: a small dialog becomes a bottom sheet, a medium or
 * large one a full-screen layer with the app bar. Both are sheet.tsx's,
 * so Android back, the swipe, steps and focus are its machinery, not a
 * copy. The caller writes the same Dialog, DialogContent, DialogHeader,
 * DialogBody and DialogFooter in both layouts.
 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  /*
   * The kit's Sheet root, in both layouts. Sheet is the same Base UI
   * dialog root (sheet.tsx imports it from the same module), renders no
   * DOM and passes every prop through, so the desktop dialog behaves as
   * before. It adds what the phone forms need: whether the dialog is
   * open, and a close that goes through onOpenChange, so Android back
   * closes it and the unsaved-changes guard can refuse (41.4 rule 9,
   * 11.3 rule 10). One root in both layouts, so a foldable changing
   * layout does not remount the trigger (41.2 rule 3).
   */
  return <Sheet data-slot="dialog" {...props} />
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
        "fixed inset-0 isolate z-(--z-dialog) bg-(--backdrop)",
        // Section 5.6: the backdrop fades with its dialog, on the same
        // durations - slow in, medium out.
        "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-slow) data-open:ease-enter",
        "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
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
  const { layout } = useLayout()
  if (layout === "phone") {
    return (
      <PhoneDialogContent size={size} showCloseButton={showCloseButton} {...props}>
        {children}
      </PhoneDialogContent>
    )
  }

  /**
   * Section 24, enforced HERE rather than trusted to the caller.
   *
   * The height cap and the internal scroll only work if everything
   * between the header and the footer sits in one `min-h-0 flex-1
   * overflow-y-auto` box. That was `DialogBody`, and it was the
   * caller's job to remember it — so three of the four dialogs in the
   * product this kit was taken from did not, and every one of them
   * broke the same way on a short viewport: the popup clamped to 80vh,
   * the unwrapped content kept its natural height, and the overflow
   * painted OUTSIDE the rounded panel. The header scrolled away, a
   * field was sliced in half with its helper text floating on the
   * backdrop, and the footer sat below the fold with both buttons
   * clipped. On a 14-inch laptop at 100%.
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
    // Section 36.4: the dialog is a banded region. The scope has to
    // cover the BODY as well as the header - a card in the body is a
    // sibling of the header, not a child of it, so a band that
    // published only to its own children would never reach it.
    <BandScope>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-size={size}
          className={cn(
            // Section 24: the widths are maximums. Below them the dialog
            // is the screen less 16px a side, so a large dialog at 768px
            // is 736px and never touches the edge.
            "fixed top-1/2 left-1/2 z-(--z-dialog) flex max-h-[80dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-xl border border-border-light bg-surface text-body text-text-primary shadow-dialog outline-none",
            "data-[size=sm]:max-w-dialog-sm data-[size=md]:max-w-dialog-md data-[size=lg]:max-w-dialog-lg",
            // Section 5.6: fade with a slight scale from 98%, slow; out at
            // medium. The centring is the `translate` property, which the
            // animation's `transform` does not touch.
            // animation-duration-*, never duration-*: that one also sets
            // transition-duration, and with transition-property at its
            // initial `all` every property of the popup - its width on a
            // resize included - would start to transition.
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98 data-open:animation-duration-(--duration-slow) data-open:ease-enter",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-98 data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
            // Nothing may paint outside the panel. Without this the
            // overflow above was not merely unscrollable, it was visible
            // on the backdrop.
            "overflow-hidden",
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
                // Section 6.3.2: it sits ON the header band, so no fill
                // and no border of its own, and the focus ring reverses
                // to on-brand - primary-ring on a primary ground is not
                // a ring.
                <Button
                  variant="on-brand"
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
    </BandScope>
  )
}

/** The words of the first DialogTitle among these elements, at any depth. */
function titleText(node: React.ReactNode): string | null {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) continue
    if (child.type === DialogTitle) return textOf(child.props.children)
    const inner = titleText(child.props.children)
    if (inner !== null) return inner
  }
  return null
}

function isElementOf<P = React.ComponentProps<"div">>(
  child: React.ReactNode,
  type: unknown
): child is React.ReactElement<P> {
  return React.isValidElement(child) && child.type === type
}

/**
 * Section 41.8 rule 10 - the dialog on phone. The caller's parts are
 * handed to sheet.tsx as its own, one for one: DialogHeader becomes
 * SheetHeader (its DialogDescription a SheetDescription, so it leaves the
 * band as on desktop, 36.3), DialogBody becomes SheetBody, DialogFooter
 * becomes SheetFooter. DialogTitle and DialogClose are already the Base
 * UI parts the sheet uses, so they stay as they are.
 *
 *   - sm: a bottom sheet (41.8 rules 1 to 9): the header band in the form
 *     its depth gives it, the scrolling body, the footer's buttons
 *     sharing its width, the close button in the band.
 *   - md and lg: a full-screen layer (sheet.tsx, presentation="screen"):
 *     the app bar with the dialog's title and a back arrow, the body
 *     scrolling under it, the footer as the action bar on the keyboard.
 *
 * WHAT CHANGES ON THE WAY, ALL PHONE ONLY, EACH FOR A RULE:
 *
 *   - The caller's className is not applied. It was written for the
 *     centred 400-800px box (position, width, radius: the command
 *     palette's `top-1/3 rounded-xl! p-0`), and both phone forms own
 *     their own box; applied, it would pull a full-screen layer a third
 *     of the way down the screen.
 *   - In the full-screen layer, a DialogClose in the footer is left out.
 *     41.7 rule 3: "Cancel is the back arrow", and the back arrow closes
 *     the layer through the same onOpenChange. A footer left with nothing
 *     has no action bar (41.6 rule 9). A Cancel that is a plain Button
 *     with its own onClick cannot be told from a real action and stays:
 *     write Cancel as a DialogClose.
 *   - In the full-screen layer, a control in DialogHeader's band other
 *     than the title (a three-dot menu) moves to the app bar's actions,
 *     which hold two icon buttons or one text button (41.4 rule 4).
 *   - In the full-screen layer, the footer is the action bar: at most two
 *     buttons once a DialogClose is left out (41.6 rule 8); more throws
 *     in development.
 *   - In the full-screen layer with no header or footer (the command
 *     palette), a DialogTitle among the content is hidden, not removed:
 *     it still names the layer, and the app bar shows its words, so a
 *     screen reader does not meet the title twice.
 *   - A dialog with no header or footer keeps its content unwrapped, as
 *     on desktop: no padding and no second scroller round content that
 *     brings its own (section 1 rule 8).
 */
function PhoneDialogContent({
  children,
  size,
  showCloseButton,
  ...props
}: Omit<DialogPrimitive.Popup.Props, "className"> & {
  size: "sm" | "md" | "lg"
  showCloseButton: boolean
}) {
  const screen = size !== "sm"
  const items = React.Children.toArray(children)

  const header = items.filter((c) => isElementOf(c, DialogHeader)).map((child) => {
    const { children: parts, ...headerProps } = (child as React.ReactElement<React.ComponentProps<"div">>).props
    return (
      <SheetHeader key={(child as React.ReactElement).key} {...headerProps}>
        {React.Children.toArray(parts).map((part) =>
          isElementOf<DialogPrimitive.Description.Props>(part, DialogDescription) ? (
            <SheetDescription key={part.key} {...part.props} />
          ) : (
            part
          )
        )}
      </SheetHeader>
    )
  })

  const footer = items.filter((c) => isElementOf(c, DialogFooter)).flatMap((child) => {
    const { children: buttons, ...footerProps } = (child as React.ReactElement<React.ComponentProps<"div">>).props
    const kept = React.Children.toArray(buttons).filter(
      (button) => !(screen && isElementOf(button, DialogClose))
    )
    return kept.length === 0
      ? []
      : [
          <SheetFooter key={(child as React.ReactElement).key} {...footerProps}>
            {kept}
          </SheetFooter>,
        ]
  })

  const rest = items.filter((c) => !isElementOf(c, DialogHeader) && !isElementOf(c, DialogFooter))
  // Decided on what the caller wrote, before any DialogClose was left
  // out: a body whose footer held only Close still scrolls as a body.
  const assemble = header.length > 0 || items.some((c) => isElementOf(c, DialogFooter))

  let body: React.ReactNode
  if (assemble) {
    const only = rest.length === 1 ? rest[0] : null
    body =
      rest.length === 0 ? null : isElementOf(only, DialogBody) ? (
        <SheetBody key={only.key} {...only.props} />
      ) : (
        <SheetBody>{rest}</SheetBody>
      )
  } else if (screen) {
    body = rest.map((child) =>
      isElementOf(child, DialogTitle) ? (
        <div key={child.key} hidden>
          {child}
        </div>
      ) : (
        child
      )
    )
  } else {
    // A bottom sheet always has a body; this one neither pads nor
    // scrolls, for the reason above.
    body = <SheetBody className="flex flex-col overflow-hidden p-0">{rest}</SheetBody>
  }

  return (
    <SheetContent
      side="bottom"
      presentation={screen ? "screen" : "sheet"}
      screenTitle={screen ? (titleText(children) ?? "") : undefined}
      showCloseButton={showCloseButton}
      data-size={size}
      {...props}
    >
      {header}
      {body}
      {footer}
    </SheetContent>
  )
}

/**
 * Section 36: the dialog header is a brand band, and section 36.3
 * keeps it to one row - the description moves below it, onto the
 * surface. Split here rather than at the call site, exactly as the
 * scrolling body is, and for the same recorded reason.
 *
 * `pr-16` on the band leaves room for the close button, which is
 * positioned against the popup rather than living in the header.
 */
function DialogHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const items = React.Children.toArray(children)
  const isDescription = (child: React.ReactNode) =>
    React.isValidElement(child) && child.type === DialogDescription

  const description = items.filter(isDescription)
  const banded = items.filter((child) => !isDescription(child))

  return (
    <div
      data-slot="dialog-header"
      className={cn("flex shrink-0 flex-col", className)}
      {...props}
    >
      <HeaderBand className="pr-16">{banded}</HeaderBand>
      {description.length > 0 ? (
        <div
          data-slot="dialog-header-description"
          className="border-b border-border-light px-4 py-3"
        >
          {description}
        </div>
      ) : null}
    </div>
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
      // Inherits `on-brand` from the band (section 36).
      className={cn("text-card-heading font-medium", className)}
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

/*
 * On phone a medium or large dialog's header band is the app bar (41.8
 * rule 10): the part holding the DialogTitle stays the title, and every
 * other control in the band moves to the app bar's actions. This tells
 * sheet.tsx which part is the title.
 */
registerLayerTitle(DialogTitle)

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
