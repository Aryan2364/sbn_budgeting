"use client"

import * as React from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Section 26: **disable** an individual action the user can see but
 * cannot perform, and always say why.
 *
 * The reasoning section 26 gives is that a read-only user sees the same
 * screens with things disabled rather than a separate stripped-down
 * version, so two people looking at one record are looking at the same
 * software. **Somebody who cannot find a button does not know whether
 * it does not exist or whether they cannot use it**, and there is
 * nothing on screen to tell them. A greyed control saying "Only people
 * allowed to delete clients can do this" answers the question the
 * absence leaves open.
 *
 * **Why this wrapper has to exist rather than putting a tooltip on the
 * control:** every disabled control in this system carries
 * `pointer-events-none` — `button` through `disabled:`, the menu items
 * through `data-disabled:`. That is correct, and it also means a
 * disabled control never receives a hover, so a tooltip attached to it
 * can never open. The reason would be written and never readable, and
 * nothing would error: the control looks exactly right, greyed and
 * unclickable and silent.
 *
 * So the hover is caught by a wrapper that is NOT disabled, and the
 * wrapper is focusable, because a keyboard user cannot hover at all and
 * would otherwise be the one person who never learns why (section 19).
 *
 * **Tap opens it too** (sections 19 and 26). A tablet user can neither
 * hover nor press Tab, and Base UI's tooltip opens on neither a touch
 * nor a click - it CLOSES on a click by default. So the open state is
 * held here: a press on the wrapper opens it and keeps it open, and it
 * closes the way any tooltip does (pressing elsewhere, Escape, the
 * pointer or focus leaving). The wrapper takes the tap-area extension,
 * because the disabled control's own extension has pointer-events-none
 * and a tap on it would fall straight through.
 *
 * `allowed` renders the children untouched — no wrapper, no extra
 * element — so the permitted path is exactly what it was before this
 * existed.
 *
 * **Not known yet is not "not allowed"** (section 26.1). Until the
 * user's permissions have arrived, `allowed` is `undefined`: the children
 * render untouched, with no wrapper and no reason, and the caller keeps
 * the control disabled (`disabled={allowed !== true}`). A reason shown
 * before the answer lands is a guess, and wrong for everyone who turns
 * out to be allowed.
 *
 * `allowed` is REQUIRED, with `undefined` as an accepted value, rather
 * than optional. An optional prop lets a caller forget it, and a
 * forgotten prop would silently read as "not known yet" for ever: the
 * control disabled, the reason never shown. Required means every caller
 * passes the hook's answer on purpose.
 */
export function PermissionTooltip({
  allowed,
  reason,
  children,
}: {
  /** true: allowed. false: not allowed, show the reason. undefined: not known yet. */
  allowed: boolean | undefined
  /**
   * Names the permission, never a role, and states who may do it rather
   * than that the user may not (section 26.2): "Only people allowed to
   * delete clients can do this", never "Only an administrator can…" and
   * never "You do not have permission".
   */
  reason: string
  children: React.ReactNode
}) {
  if (allowed !== false) return <>{children}</>

  return <DeniedReason reason={reason}>{children}</DeniedReason>
}

function DeniedReason({
  reason,
  children,
}: {
  reason: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        closeOnClick={false}
        onClick={() => setOpen(true)}
        render={
          <span
            // Focusable so the reason reaches a keyboard user, who has
            // no pointer and no other route to it.
            tabIndex={0}
            role="note"
            aria-label={reason}
            className="tap-area inline-flex rounded-lg outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{reason}</TooltipContent>
    </Tooltip>
  )
}
