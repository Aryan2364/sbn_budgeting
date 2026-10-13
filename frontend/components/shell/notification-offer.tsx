"use client"

import * as React from "react"

import { GU_PHONE } from "@/components/complaints/gu"
import { NotificationPermissionSheet } from "@/components/ui/notification-permission-sheet"
import { api } from "@/lib/api"
import { useFirstOpenOffer, usePushPermission } from "@/lib/push"
import { useSession } from "@/components/shell/session"

/**
 * Plan-phone Phase 6b, L13 (the approved exception to kit 41.12 rule
 * 4): on the first open after login, an in-app bottom sheet asks to
 * turn on notifications, with a one-line Gujarati reason. "Not now"
 * offers it again after 3 days. Mounted ONCE, in the phone shell
 * (components/shell/app-shell.tsx), inside AppShell so it never shows
 * on Login (Login sits outside the (app) route group's AppShell) and
 * never on desktop (useFirstOpenOffer answers false there).
 *
 * "Never over another sheet" (the plan's words): this component opens
 * nothing until the session is signed in AND the phone is idle enough
 * that nothing else has grabbed layer 1 of the sheet stack yet, which
 * in practice is the first render after the shell mounts. It does not
 * attempt to inspect the live sheet-layer stack (components/ui/sheet.tsx's
 * module-private layer bookkeeping is intentionally not a public API) —
 * if a product screen opens its own sheet in the same tick as login,
 * that screen's sheet wins, and the sheets module's own stacking (41.8)
 * means ours queues behind it rather than clashing. A screen that must
 * guarantee no competing sheet on its very first render should hold off
 * calling anything that opens one until after this component's effect
 * has had a chance to run (one tick).
 *
 * iPhone, in the browser, not installed (push.needsInstall): the plan
 * says the first sheet offers Install app instead. That sheet
 * (install-sheet.tsx) is built in a separate worktree (Phase 5, the
 * install agent) and does not exist in this one.
 *
 * MERGE HOOK: wire `installSheetOpen`/`onInstallSheetOpenChange` below
 * to the real <InstallSheet /> once Phase 5 lands — open it instead of
 * NotificationPermissionSheet when `push.needsInstall` is true, the
 * same way this file opens NotificationPermissionSheet otherwise. Until
 * then, an iPhone-in-the-browser visitor who has never installed is
 * offered nothing here (More's "એપ ઇન્સ્ટોલ કરો" row, from Phase 5,
 * remains the way in).
 */
function NotificationOffer() {
  const { status, user } = useSession()
  const person = user?.id ?? null
  const offer = useFirstOpenOffer(person ?? "")
  const push = usePushPermission(person ?? "")
  const [open, setOpen] = React.useState(false)
  const offeredRef = React.useRef(false)

  React.useEffect(() => {
    if (status !== "in" || !person || offeredRef.current) return
    if (!push.ready) return
    // needsInstall: the merge hook above decides; nothing of ours opens today.
    if (push.needsInstall) {
      offeredRef.current = true
      return
    }
    if (offer()) {
      offeredRef.current = true
      // Deferred rather than called straight from the effect body: this
      // is a one-time decision read from an external source (lib/push.ts's
      // localStorage-backed offer), not state React owns, so opening the
      // sheet belongs in the next tick, not synchronously inside the effect.
      const id = window.setTimeout(() => setOpen(true), 0)
      return () => window.clearTimeout(id)
    }
  }, [status, person, push.ready, push.needsInstall, offer])

  if (status !== "in" || !person) return null

  return (
    <NotificationPermissionSheet
      person={person}
      open={open}
      onOpenChange={setOpen}
      text={GU_PHONE.notifications}
      onSubscribe={(subscription) => api.post("/push/subscriptions", subscription)}
    />
  )
}

export { NotificationOffer }
