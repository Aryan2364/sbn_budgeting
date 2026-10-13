"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { useLayout } from "@/lib/layout"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { whenLayersSettled } from "@/components/ui/sheet"

/**
 * Section 11.3 rule 10: leaving a form with unsaved changes asks first.
 *
 *   const unsaved = useUnsavedChanges({ changed: isChanged(values, saved), noun: "client" })
 *   const unsaved = useUnsavedChanges({ changed, noun: "client", mode: isEdit ? "edit" : "create" })
 *   ...
 *   {unsaved.warning}
 *   <Dialog open={open} onOpenChange={unsaved.guard(setOpen, reset)}>
 *
 * While `changed` is true it catches:
 * - in-app navigation: any click on a same-origin link anywhere on the
 *   page (sidebar, breadcrumb, a text link), caught before the router
 *   sees it. Leaving then goes where the link pointed.
 * - closing a dialog or sheet with Escape, the backdrop or the close
 *   button, through `guard(setOpen)` as its onOpenChange.
 * - closing the browser tab or reloading: the browser's own warning,
 *   the one browser dialog the system allows, because no site can style
 *   it.
 *
 * "Changed" is the caller's comparison of current values against the
 * saved ones - isChanged() below - never "was anything typed", so typing
 * and deleting back to the original closes without asking.
 *
 * Two wordings (pending kit change, KIT-PENDING-leave-warning.md):
 * - "edit" (the default): the kit's "Leave without saving?", for a
 *   record that already exists and has a Save.
 * - "create": "Leave this complaint?" / "What you have filled in will be
 *   lost." / "Keep filling" / "Leave", for a form whose record does not
 *   exist until it is submitted, where there is nothing to save. A form
 *   that is both Add and Edit (11.3 rule 1) passes "create" when adding.
 * The browser's own tab-close warning is the same for both: its words
 * are the browser's.
 *
 * Not caught: the browser's own Back and Forward buttons. The App Router
 * has no hook to cancel them, and a guard that traps Back would be worse
 * than the loss it prevents. On phone that includes Android's back (41.4
 * rule 9); a form there keeps a draft (lib/drafts.ts), so what was typed
 * is offered again rather than lost.
 *
 * A control that leaves the page without being a link - the phone's back
 * arrow, which is the form's Cancel on phone (41.7 rule 3) - carries
 * data-leaves-page and is caught the same way: its click waits for the
 * answer, and Leave clicks it again, unguarded.
 *
 * ON PHONE, LEAVING WAITS FOR THE WARNING TO GO. The warning holds a
 * history entry of its own while open (alert-dialog.tsx, 41.4 rule 9),
 * and closing it steps back off that entry - a step that lands a moment
 * later. Started at once, the back arrow's own step back (or a link's
 * push) raced it, and the person landed two screens back, or off the
 * site. So on phone, Leave closes the warning, waits until it has
 * finished closing (onOpenChangeComplete) and its entry is gone
 * (whenLayersSettled in sheet.tsx), and only then leaves: one screen back
 * from the back arrow, or exactly where the link pointed. Closing a dialog
 * or sheet through `guard` does not wait: the warning and the dialog
 * close together, and the layer queue takes both entries in one step.
 * On desktop nothing has an entry, and Leave leaves at once, as always.
 *
 * ONE ASKS. Several forms on a page may each be changed. The first
 * listener to catch a click asks, and stops every other one hearing it
 * (stopImmediatePropagation), so one leaving press never opens two
 * warnings; and the replayed click of a data-leaves-page control passes
 * every instance (`replaying`, shared by them all), so a second changed
 * form never catches the click the first one let through. Only the asking
 * form's onLeave runs.
 *
 * `onLeave` runs when the person chooses Leave (or "Leave without
 * saving"), by any of the routes above, before they leave. A phone form
 * passes its draft's clear(): choosing Leave discards the draft (41.7
 * rule 15).
 */

/** True when two plain value objects differ, in any key, at any depth. */
function isChanged(values: unknown, saved: unknown): boolean {
  return stable(values) !== stable(saved)
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value
  )
}

/** A click that would navigate this tab to another same-origin page. */
function interceptableHref(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const anchor = (event.target as Element | null)?.closest?.("a[href]")
  if (!(anchor instanceof HTMLAnchorElement)) return null
  if (anchor.target && anchor.target !== "_self") return null
  if (anchor.hasAttribute("download")) return null
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) return null
  // A link to a spot on this same page is not leaving it.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null
  return url.pathname + url.search + url.hash
}

/** A click on a control marked data-leaves-page (not a link). */
function leavesPage(event: MouseEvent): HTMLElement | null {
  if (event.defaultPrevented || event.button !== 0) return null
  const el = (event.target as Element | null)?.closest?.(LEAVES_PAGE)
  return el instanceof HTMLElement && !(el instanceof HTMLAnchorElement) ? el : null
}

/** Fixed words, or words built from the form's `noun`. */
type Words = string | ((noun: string) => string)

/** The dialog's words, for a screen in another language. */
type UnsavedChangesText = {
  /** "Leave without saving?", or on a create form "Leave this client?" */
  title: Words
  /** "Your changes to this client will be lost." */
  description: Words
  stay: string
  leave: string
}

type UnsavedChangesMode = "edit" | "create"

const TEXT: Record<UnsavedChangesMode, UnsavedChangesText> = {
  /** Kit 11.3 rule 10: a record that exists, with a Save. */
  edit: {
    title: "Leave without saving?",
    description: (noun) => `Your changes to this ${noun} will be lost.`,
    stay: "Stay",
    leave: "Leave without saving",
  },
  /** Nothing exists until it is submitted, so there is nothing to save. */
  create: {
    title: (noun) => `Leave this ${noun}?`,
    description: "What you have filled in will be lost.",
    stay: "Keep filling",
    leave: "Leave",
  },
}

function say(words: Words, noun: string): string {
  return typeof words === "function" ? words(noun) : words
}

type Options = {
  /** Values differ from the saved ones. */
  changed: boolean
  /** What the form edits, for "Your changes to this client will be lost." */
  noun: string
  /**
   * "edit" (default) for a record that exists; "create" for a form whose
   * record does not exist until it is submitted.
   */
  mode?: UnsavedChangesMode
  /** The dialog's own words. Keys not given keep the mode's English words. */
  text?: Partial<UnsavedChangesText>
  /**
   * Runs when the person chooses to leave, before they go: a phone form's
   * draft.clear() (41.7 rule 15).
   */
  onLeave?: () => void
}

/** Marks a control that leaves the page without being a link (the phone's back arrow). */
const LEAVES_PAGE = "[data-leaves-page]"

/*
 * THE PAGE-WIDE MARK. How many forms on the page have unsaved changes
 * right now, kept by every useUnsavedChanges while its `changed` is true,
 * and read through useAnyUnsavedChanges below. The new-version banner
 * (41.14 rule 11, components/ui/connection-banner.tsx) never shows while
 * it is above zero: "Reload" would throw the changes away, so the banner
 * waits until the person leaves the form (it unmounts) or saves it.
 */
let unsavedForms = 0
const unsavedListeners = new Set<() => void>()

function subscribeUnsaved(listener: () => void) {
  unsavedListeners.add(listener)
  return () => {
    unsavedListeners.delete(listener)
  }
}

function countUnsaved(delta: 1 | -1) {
  unsavedForms = Math.max(0, unsavedForms + delta)
  unsavedListeners.forEach((listener) => listener())
}

/**
 * True while any form on the page has unsaved changes: any mounted
 * useUnsavedChanges whose `changed` is true. False on the server and while
 * hydrating, as nothing is changed yet then.
 */
function useAnyUnsavedChanges(): boolean {
  return React.useSyncExternalStore(
    subscribeUnsaved,
    () => unsavedForms > 0,
    () => false
  )
}

/**
 * Set while Leave re-clicks a data-leaves-page control, so it passes - the
 * listener of every useUnsavedChanges on the page, not only the one that
 * asked (ONE ASKS, above). The click is dispatched synchronously, so it is
 * set for exactly that click.
 */
let replaying = false

/** What Leave does once chosen. */
type PendingLeave = {
  leave: () => void
  /**
   * It moves through history (the back arrow, a link), so on phone it
   * waits for the warning's own history entry to be gone first.
   */
  navigates: boolean
}

function useUnsavedChanges({ changed, noun, mode = "edit", text, onLeave }: Options) {
  const router = useRouter()
  const phone = useLayout().layout === "phone"
  const [open, setOpen] = React.useState(false)
  const pending = React.useRef<PendingLeave | null>(null)
  // A navigating Leave chosen on phone, run once the warning has closed.
  const afterClose = React.useRef<(() => void) | null>(null)
  // The latest onLeave, read when Leave is chosen, without re-running the
  // effect below for a new function each render.
  const leaveHook = React.useRef(onLeave)
  React.useEffect(() => {
    leaveHook.current = onLeave
  })

  const ask = React.useCallback((leave: () => void, navigates: boolean) => {
    pending.current = { leave, navigates }
    setOpen(true)
  }, [])

  // The page-wide mark (above): counted while changed, and no longer once
  // saved, put back, or unmounted.
  React.useEffect(() => {
    if (!changed) return
    countUnsaved(1)
    return () => countUnsaved(-1)
  }, [changed])

  React.useEffect(() => {
    if (!changed) return

    // Capture phase on the window, so it runs before React's own click
    // handling and the router's Link never sees the click.
    const onClick = (event: MouseEvent) => {
      if (replaying) return
      const leaver = leavesPage(event)
      if (leaver) {
        event.preventDefault()
        event.stopImmediatePropagation()
        ask(() => {
          // Gone while the warning was up (the page changed under it):
          // nothing is left to press.
          if (!leaver.isConnected) return
          replaying = true
          try {
            leaver.click()
          } finally {
            replaying = false
          }
        }, true)
        return
      }
      const href = interceptableHref(event)
      if (!href) return
      event.preventDefault()
      event.stopImmediatePropagation()
      ask(() => router.push(href), true)
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Some browsers still need this to show their warning.
      event.returnValue = ""
    }

    window.addEventListener("click", onClick, true)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [changed, ask, router])

  /**
   * onOpenChange for a Dialog or Sheet holding the form. Opening passes
   * straight through; closing with unsaved changes asks first. `onDiscard`
   * runs after the user chooses to leave, to put the form back to its
   * saved values.
   */
  const guard = React.useCallback(
    (setDialogOpen: (open: boolean) => void, onDiscard?: () => void) =>
      (next: boolean, details?: { cancel?: () => void }) => {
        if (next || !changed) {
          setDialogOpen(next)
          return
        }
        details?.cancel?.()
        ask(() => {
          setDialogOpen(false)
          onDiscard?.()
        }, false)
      },
    [changed, ask]
  )

  /** Leave was chosen: the form's onLeave, then the leave itself. */
  const chooseLeave = () => {
    const chosen = pending.current
    pending.current = null
    setOpen(false)
    if (!chosen) return
    leaveHook.current?.()
    // On phone a move through history waits for the warning's own entry
    // to go (ON PHONE, LEAVING WAITS, above); onOpenChangeComplete runs it.
    if (phone && chosen.navigates) afterClose.current = chosen.leave
    else chosen.leave()
  }

  const t = { ...TEXT[mode], ...text }
  const warning = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false)
          pending.current = null
        }
      }}
      onOpenChangeComplete={(isOpen) => {
        const leave = afterClose.current
        if (isOpen || !leave) return
        afterClose.current = null
        // The close has committed by now, so its step back off the
        // warning's entry has been asked for; this waits for it to land.
        void whenLayersSettled().then(leave)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{say(t.title, noun)}</AlertDialogTitle>
          <AlertDialogDescription>{say(t.description, noun)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.stay}</AlertDialogCancel>
          <AlertDialogAction onClick={chooseLeave}>
            {t.leave}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { warning, guard, changed }
}

export {
  useUnsavedChanges,
  useAnyUnsavedChanges,
  isChanged,
  type UnsavedChangesMode,
  type UnsavedChangesText,
}
