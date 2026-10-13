"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { Button } from "@/components/ui/button"
import {
  SHARE_THE_WIDTH,
  useLayerHistory,
  useLayerRoot,
  type CloseOutcome,
} from "@/components/ui/sheet"

/**
 * How the dialog's Cancel tells the root where it is, so Android back can
 * press it: the node now, and the node it held before (so a Cancel that
 * leaves only clears its own place).
 */
const CancelContext = React.createContext<
  ((node: HTMLElement | null, previous: HTMLElement | null) => void) | null
>(null)

/** Hands an element to a ref of either kind - the caller's own ref on Cancel. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

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
 *
 * ON PHONE, Android back acts as Cancel (decision 22 in
 * OVERNIGHT_DECISIONS.md, 41.4 rule 9): letting it fall through would
 * leave the page under an open confirmation. While open, the dialog holds
 * one history entry, through sheet.tsx's machinery (useLayerHistory), the
 * same queue and listener every bottom sheet uses. A back press that is
 * not the kit's own presses the dialog's AlertDialogCancel - the same
 * click, the same onOpenChange with Base UI's close-press reason, the
 * same onClick if the caller gave Cancel one. Over a sheet with unsaved
 * changes that makes back "Stay": the warning closes and the sheet stays.
 * With no Cancel rendered, it closes through onOpenChange all the same.
 * A Cancel that is disabled (an action under way) or a close the caller
 * refuses keeps the dialog and its entry, so the press never reaches the
 * page. On desktop nothing is pushed and nothing changes.
 */
function AlertDialog({
  onOpenChange,
  actionsRef,
  ...props
}: AlertDialogPrimitive.Root.Props) {
  const refuseEscape = React.useCallback(
    (open: boolean, eventDetails: AlertDialogPrimitive.Root.ChangeEventDetails) => {
      if (!open && eventDetails.reason === "escape-key") {
        eventDetails.cancel()
        return
      }
      onOpenChange?.(open, eventDetails)
    },
    [onOpenChange]
  )
  const { open, actions, handleOpenChange, request, requestClose } = useLayerRoot({
    open: props.open,
    defaultOpen: props.defaultOpen,
    onOpenChange: refuseEscape,
    actionsRef,
  })

  const cancel = React.useRef<HTMLElement | null>(null)
  const placeCancel = React.useCallback(
    (node: HTMLElement | null, previous: HTMLElement | null) => {
      if (node) cancel.current = node
      else if (cancel.current === previous) cancel.current = null
    },
    []
  )
  const pressCancel = React.useCallback((): CloseOutcome => {
    const button = cancel.current
    const outcome = button?.isConnected ? request(() => button.click()) : requestClose()
    // Not closed - refused, or a disabled Cancel - is never let through.
    return outcome ?? "canceled"
  }, [request, requestClose])

  const { layout } = useLayout()
  useLayerHistory(layout === "phone" && open, pressCancel)

  return (
    <CancelContext.Provider value={placeCancel}>
      <AlertDialogPrimitive.Root
        data-slot="alert-dialog"
        actionsRef={actions}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </CancelContext.Provider>
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
        "fixed inset-0 isolate z-(--z-dialog) bg-(--backdrop)",
        "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-slow) data-open:ease-enter",
        "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 24: a confirmation is the small dialog, 400px.
 *
 * ON PHONE it stays a centred dialog (41.8 rule 11), not a bottom sheet:
 * the screen width less 16px a side, and less the side safe areas too, so
 * a phone held sideways keeps it clear of the notch (41.13 rule 2). It is
 * centred between the safe areas rather than on the screen, which only
 * differs when they are uneven. Section 24's 400px stays its maximum,
 * which a phone held upright never reaches. It never closes on a swipe
 * (it has none) or the backdrop (Base UI's alert dialog ignores it), and
 * Escape is refused above (24 rule 3). Phone-only classes go through the
 * `phone:` variant, so the desktop dialog is untouched.
 */
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
          "fixed top-1/2 left-1/2 z-(--z-dialog) flex w-[calc(100%-2rem)] max-w-dialog-sm -translate-x-1/2 -translate-y-1/2 flex-col",
          // Spacing in px on phone (41.9 rule 7): --spacing * 8 is 32px,
          // where 2rem is 34px on iPhone's system body font.
          "phone:left-[calc(50%_+_(var(--safe-left)_-_var(--safe-right))_/_2)] phone:w-[calc(100%_-_var(--spacing)_*_8_-_var(--safe-left)_-_var(--safe-right))]",
          "rounded-xl border border-border-light bg-surface text-body text-text-primary shadow-dialog outline-none",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98 data-open:animation-duration-(--duration-slow) data-open:ease-enter",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-98 data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
          /*
           * Section 24 applies to this component too, and it had NO
           * height cap at all — not a weaker one, none. A confirmation
           * is required to state its consequences (section 15 rule 2),
           * and a long enough consequence list on a short viewport
           * pushed the footer, and therefore Cancel and the delete
           * button, off the bottom of the screen. A confirmation whose
           * Cancel cannot be reached is worse than no confirmation.
           */
          "max-h-[80dvh] overflow-hidden",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

/**
 * SECTION 36.6 - THIS HEADER IS DELIBERATELY NOT A BRAND BAND, and the
 * omission is the rule rather than an oversight.
 *
 * Section 2.4 settles it: status colours carry meaning, not brand. A
 * brand band across the top of "Delete client?" puts the product's
 * identity exactly where the warning belongs, and a confirmation is
 * the one dialog in this system where the user must read before
 * acting.
 *
 * So do not "make this consistent" with `dialog.tsx`. It already is
 * consistent - with section 36.6.
 */
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
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 15 rule 4 and 11.3 rule 7: Cancel on the left, the action on
 * the right.
 *
 * On phone (41.8 rule 11) the two buttons sit side by side and share the
 * width. A control's height is a minimum there (41.9 rule 7): a label
 * that wraps at the largest text size, in half the width, makes its
 * button taller rather than being clipped, and the pair stay the same
 * height. The classes are sheet.tsx's SHARE_THE_WIDTH, the one copy,
 * all behind `phone:`.
 */
function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-border-light bg-surface-sunken px-4 py-3",
        "phone:items-stretch",
        SHARE_THE_WIDTH,
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
  ref,
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size"> & {
    ref?: React.Ref<HTMLButtonElement>
  }) {
  // Puts itself where AlertDialog's Android back can press it. Renders no
  // DOM of its own, so the button is exactly as before.
  const placeCancel = React.useContext(CancelContext)
  const own = React.useRef<HTMLButtonElement | null>(null)
  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      placeCancel?.(node, own.current)
      own.current = node
      assignRef(ref, node)
    },
    [placeCancel, ref]
  )
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
      ref={setRef}
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
