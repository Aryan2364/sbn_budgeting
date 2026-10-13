"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "@/components/ui/sonner"
import { Switch } from "@/components/ui/switch"
import { TextLink } from "@/components/ui/text-link"
import type { InstallPlatform } from "@/lib/install"
import { useLayout } from "@/lib/layout"
import { unsubscribePush, usePushPermission } from "@/lib/push"

/* ------------------------------------------------------------------
   Ported from kit commit 66f1d28 (components/ui/notification-permission-sheet.tsx),
   with two product changes:

     1. A bottom sheet (plan-phone L13 names it one explicitly), not a
        dialog — components/ui/sheet.tsx's SheetContent side="bottom",
        the kit's one phone surface for exactly this (41.8).
     2. The words are GU_PHONE.notifications (components/complaints/gu.ts),
        set up in Phase 1 for this screen.

   NotificationPermissionSheet is the short sheet the app shows before
   the phone's own question: one line saying why, "હમણાં નહીં" (Not now)
   and "ચાલુ કરો" (Turn on). components/shell/notification-offer.tsx
   opens it on the first open after login (L13); the Notifications row
   in More opens it again after a "Not now" or a Skip.

   PhoneNotificationsSetting is the row/section for More: it says where
   phone notifications stand on this phone and offers the next step —
   the same sheet, how to allow them in the phone's settings after a
   phone-level no, or installing the app first on iPhone (41.12 rule 5).

   PHONE ONLY. Both render nothing on desktop: phone notifications are
   the phone's (41.12), and the computer keeps the bell panel (7.4).
   ------------------------------------------------------------------ */

type NotificationPermissionText = {
  title: string
  /** The one line saying why. */
  why: string
  /** The secondary: the person's "Not now" on the app's own sheet. */
  notNow: string
  /** The primary: asks the phone's own question. */
  turnOn: string
  /** The primary's words while the phone asks and the phone subscribes. */
  turningOn: string
  /** Past tense. */
  turnedOn: string
  /** Cause, then the next action. */
  failed: string
  /** The phone said yes, but the product has no public key, so nothing was subscribed. */
  notSetUp: string
}

/**
 * The app's own sheet before the phone's question (41.12 rule 4, L13).
 *
 *   <NotificationPermissionSheet
 *     person={me.id}
 *     open={open}
 *     onOpenChange={setOpen}
 *     text={GU_PHONE.notifications}
 *     onSubscribe={(subscription) => api.post("/push/subscriptions", subscription)}
 *   />
 *
 *   - "ચાલુ કરો" (Turn on) asks the phone's own question at once, from
 *     the tap (iPhone refuses it from anywhere else). On a yes it
 *     subscribes this phone with the product's public key and hands the
 *     subscription to `onSubscribe`, which POSTs it to the backend; then
 *     a success toast and the sheet closes. With no public key
 *     configured, the sheet closes with an error toast instead. On the
 *     phone's no, or when the person dismisses the phone's own
 *     question, the sheet just closes: that answer is the phone's to
 *     keep, and More's Notifications row explains what to do next.
 *   - When subscribing or `onSubscribe` fails, an error toast says so
 *     and the sheet stays open, so pressing again works.
 *   - While the phone asks and subscribes, the primary shows "ચાલુ થઈ
 *     રહી છે" and is disabled.
 *   - Closing it any other way — "હમણાં નહીં", a swipe down, the
 *     backdrop, Android back, Escape — without having pressed "ચાલુ
 *     કરો" is the person's "Not now". lib/push.ts remembers it was
 *     offered just now, so it is offered again only after 3 days
 *     (L13), or from More in the meantime.
 */
function NotificationPermissionSheet({
  person,
  open,
  onOpenChange,
  onSubscribe,
  text,
}: {
  /** The signed-in person: their choice is kept for them alone. */
  person: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Sends the subscription to the backend (POST /api/push/subscriptions,
   * body = subscription.toJSON()). Reject when it was not saved: the
   * error toast shows and the sheet stays open. Not called where no
   * public key is configured.
   */
  onSubscribe?: (subscription: PushSubscriptionJSON) => Promise<void> | void
  text: NotificationPermissionText
}) {
  const phone = useLayout().layout === "phone"
  const push = usePushPermission(person)
  const [busy, setBusy] = React.useState(false)
  // A second press in the same frame, before `busy` has rendered.
  const busyRef = React.useRef(false)
  // Pressed "Turn on" since this opening: closing is then not a "Not now".
  const [pressed, setPressed] = React.useState(false)

  // Fresh every opening. Reset while rendering the open, not when closing.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setPressed(false)
  }

  const close = (next: boolean) => {
    if (next) {
      onOpenChange(true)
      return
    }
    if (busyRef.current) return
    if (!pressed) push.decline()
    onOpenChange(false)
  }

  const turnOn = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setPressed(true)
    setBusy(true)
    let done = false
    try {
      // First, before any other await: the phone's question must come
      // straight from the tap.
      const answer = await push.ask()
      if (answer !== "granted") {
        // The phone's no, or its question dismissed: nothing to say here.
        done = true
        return
      }
      const subscription = await push.subscribe()
      if (!subscription) {
        // No public key: nothing was subscribed, so never "turned on".
        toast.error(text.notSetUp)
        done = true
        return
      }
      await onSubscribe?.(subscription)
      toast.success(text.turnedOn)
      done = true
    } catch {
      toast.error(text.failed)
    } finally {
      busyRef.current = false
      setBusy(false)
      if (done) onOpenChange(false)
    }
  }

  if (!phone) return null

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{text.title}</SheetTitle>
          <SheetDescription>{text.why}</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose render={<Button variant="secondary" />} disabled={busy}>
            {text.notNow}
          </SheetClose>
          <Button disabled={busy} aria-busy={busy || undefined} onClick={() => void turnOn()}>
            {busy ? text.turningOn : text.turnOn}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------------------------------------------
   More: where phone notifications stand on this phone.
   ------------------------------------------------------------------ */

type PhoneNotificationsText = NotificationPermissionText & {
  /** The row's own label, independent of the sheet's title. */
  switchLabel: string
  notSetUp: string
  on: string
  off: string
  /** An iPhone that has not installed the app (41.12 rule 5). */
  needsInstall: string
  installLink: string
  /** A phone or browser that cannot show notifications at all. */
  unsupported: string
  turnedOff: string
  /** After the phone's no: how to allow them in the phone's settings. */
  denied: (platform: InstallPlatform, installed: boolean, appName: string) => string
}

/**
 * The Notifications row for More (plan-phone Phase 6b, L13). Phone
 * only, like More itself: it renders nothing on desktop.
 *
 *   <PhoneNotificationsSetting
 *     person={me.id}
 *     appName="Sadbhavna"
 *     installHref="/more"
 *     text={GU_PHONE.notifications}
 *     onSubscribe={(subscription) => api.post("/push/subscriptions", subscription)}
 *     onUnsubscribe={(endpoint) => api.delete("/push/subscriptions", { endpoint })}
 *   />
 *
 * What it shows, from what the phone and the person have answered:
 *
 *   - Not known yet (server, hydrating), or the product has not
 *     configured its public key: nothing (not configured: the row is
 *     hidden entirely, per the backend contract).
 *   - An iPhone without the app installed: notifications need the app
 *     on the home screen first, with a link to the install step.
 *   - A browser that cannot show them: says so.
 *   - The phone said no: the steps to allow them in the phone's
 *     settings, for this phone.
 *   - Granted: the switch is on. Turning it off calls `onUnsubscribe`
 *     with the endpoint (the backend DELETE), then unsubscribes the
 *     phone.
 *   - Not asked, or "Not now": the switch is off; turning it on opens
 *     the sheet.
 */
function PhoneNotificationsSetting({
  person,
  appName,
  installHref,
  onSubscribe,
  onUnsubscribe,
  text,
}: {
  person: string
  /** The installed app's name, as the phone's settings list it. */
  appName: string
  /** Where the install option is: More (41.12 rule 8). */
  installHref: string
  onSubscribe?: (subscription: PushSubscriptionJSON) => Promise<void> | void
  /** The backend DELETE, called when the person turns the switch off. */
  onUnsubscribe?: (endpoint: string) => Promise<void> | void
  text: PhoneNotificationsText
}) {
  const phone = useLayout().layout === "phone"
  const push = usePushPermission(person)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const headingId = React.useId()

  if (!phone || !push.ready || !push.configured) return null

  const turnOff = async () => {
    setBusy(true)
    try {
      const endpoint = await unsubscribePush()
      if (endpoint) await onUnsubscribe?.(endpoint)
      toast.success(text.turnedOff)
    } catch {
      toast.error(text.failed)
    } finally {
      setBusy(false)
    }
  }

  let line: string
  let next: React.ReactNode = null
  let showSwitch = false
  if (push.needsInstall) {
    line = text.needsInstall
    next = (
      <TextLink href={installHref} render={<Link href={installHref} />}>
        {text.installLink}
      </TextLink>
    )
  } else if (!push.supported) {
    line = text.unsupported
  } else if (push.permission === "denied") {
    line = text.denied(push.platform, push.installed, appName)
  } else if (push.permission === "granted") {
    line = text.on
    showSwitch = true
  } else {
    line = text.off
    showSwitch = true
  }

  return (
    <section data-slot="phone-notifications-setting" aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-card-heading font-medium text-text-primary">
          {text.switchLabel}
        </h2>
        {showSwitch ? (
          <Switch
            checked={push.permission === "granted"}
            disabled={busy}
            onCheckedChange={(checked) => {
              if (checked) setOpen(true)
              else void turnOff()
            }}
            aria-label={text.switchLabel}
          />
        ) : null}
      </div>
      <p className="text-body text-text-primary">{line}</p>
      {next ? <div className="pt-1">{next}</div> : null}
      <NotificationPermissionSheet person={person} open={open} onOpenChange={setOpen} onSubscribe={onSubscribe} text={text} />
    </section>
  )
}

export { NotificationPermissionSheet, PhoneNotificationsSetting }
export type { NotificationPermissionText, PhoneNotificationsText }
