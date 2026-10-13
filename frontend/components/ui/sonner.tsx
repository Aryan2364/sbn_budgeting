"use client"

import * as React from "react"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import {
  Toaster as Sonner,
  toast as sonnerToast,
  type ExternalToast,
  type ToasterProps,
} from "sonner"

import { useLayout } from "@/lib/layout"

/**
 * Section 25.
 * Bottom right. Fixed 360px, never full width. Four seconds for a
 * simple confirmation, ten when it carries an Undo link (section
 * 38.1), and error toasts never auto-dismiss - they stay until closed.
 * Maximum three stacked. Every toast has a close button. Toasts sit
 * above dialogs (section 5.5 rule 2), on --z-toast.
 *
 * A toast never carries information available nowhere else. If the
 * user misses it, nothing is lost. A toast is a whisper, not a record.
 * General notifications ("Rakesh assigned you a task") belong in the
 * notification centre, not here (section 7.3). On phone the same holds
 * for a bulk result: "4 approved. 1 skipped, marked in the list" only
 * because the list marks it (41.6 rule 18).
 *
 * Theme is pinned to light: section 28 says do not build a dark theme
 * until asked, and "system" would let the operating system produce a
 * half-built one.
 *
 * ON PHONE (41.8 rules 12 to 14), chosen through useLayout() and never
 * through sonner's own max-width: 600px breakpoint, which is a window
 * width and would reach a narrow desktop window:
 *   - at the bottom, centred, the screen width minus 16px each side plus
 *     the side safe areas, 16px above the tab bar or action bar and the
 *     keyboard (the bottom-bar contract in globals.css);
 *   - one at a time: a new toast replaces the one showing, unless that
 *     one is an error. Errors stay until closed and the new toast shows
 *     with them, two at most, both readable (expanded, not stacked
 *     behind each other). The replacing is done in `toast` below;
 *   - a sideways swipe dismisses it, as well as its close button;
 *   - durations unchanged.
 * A foldable that changes layout mid-use re-renders this with the other
 * set of props; toasts already showing stay.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const phone = useLayout().layout === "phone"

  // 41.4 rule 10: a swipe that starts within 24px of a side edge belongs
  // to the phone's own back gesture. Sonner has no option for this, so
  // a press there that lands on a toast is stopped before React - and so
  // sonner's swipe tracking - sees it. React listens on the document; a
  // capture listener on the window runs first. A click still follows, so
  // the close button keeps working wherever it is tapped.
  React.useEffect(() => {
    if (!phone) return
    const ignoreEdgeSwipe = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return
      const x = event.clientX
      if (x > SYSTEM_EDGE && x < window.innerWidth - SYSTEM_EDGE) return
      if (!(event.target instanceof Element)) return
      if (!event.target.closest("[data-sonner-toast]")) return
      event.stopPropagation()
    }
    window.addEventListener("pointerdown", ignoreEdgeSwipe, true)
    return () => window.removeEventListener("pointerdown", ignoreEdgeSwipe, true)
  }, [phone])

  return (
    <Sonner
      theme="light"
      position={phone ? "bottom-center" : "bottom-right"}
      visibleToasts={phone ? 2 : 3}
      {...(phone ? PHONE_PROPS : null)}
      closeButton
      duration={4000}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--text-primary)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--success-bg)",
          "--success-text": "var(--success)",
          "--success-border": "var(--success-border)",
          "--warning-bg": "var(--warning-bg)",
          "--warning-text": "var(--warning)",
          "--warning-border": "var(--warning-border)",
          "--error-bg": "var(--danger-bg)",
          "--error-text": "var(--danger)",
          "--error-border": "var(--danger-border)",
          "--border-radius": "var(--radius-control)",
          // Section 25: 360px. Sonner writes its own 356px default into
          // this same inline style, so a stylesheet rule never reaches it.
          "--width": "var(--spacing-toast)",
          // Sonner's own stylesheet pins the toaster at 999999999. The
          // layer comes from the token instead (section 5.5 rule 5), and
          // inline because sonner injects its CSS unlayered.
          zIndex: "var(--z-toast)",
          ...(phone ? PHONE_STYLE : null),
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

/** 41.4 rule 10: the strip along each side edge that belongs to the phone's back gesture. */
const SYSTEM_EDGE = 24

/*
 * 41.8 rule 12 and the bottom-bar contract: 16px (space-4) above
 *   var(--bottom-bar) + var(--safe-bottom) + var(--keyboard-inset).
 * The 16px matches the side margin and the add button's 16px above the
 * tab bar (41.5 rule 7), so a toast never sits flush on a bar.
 */
const PHONE_BOTTOM =
  "calc(var(--bottom-bar) + var(--safe-bottom) + var(--keyboard-inset) + var(--spacing) * 4)"

const PHONE_PROPS = {
  // Both toasts readable when an error and a newer toast show together
  // (41.8 rule 13). One at a time otherwise, so nothing else stacks.
  expand: true,
  // space-4 between the two. Sonner's default is 14px, off the 5.1
  // scale; the desktop stack keeps it, unchanged.
  gap: 16,
  // 41.8 rule 14: sideways only. Sonner's default for a bottom position
  // is a swipe down.
  swipeDirections: ["left", "right"],
  // Sonner writes these as inline variables. Below 600px wide its own
  // stylesheet switches to the --mobile-offset-* ones and sizes each
  // toast as 100% minus twice --mobile-offset-left, so that one is 0:
  // the toast is then the toaster's full width, whatever the window.
  offset: { bottom: PHONE_BOTTOM },
  mobileOffset: { bottom: PHONE_BOTTOM, left: 0, right: 0 },
} satisfies Partial<ToasterProps>

/*
 * Each toast is 100% of the toaster on phone. --width is the one value
 * that must be inline, because sonner writes its own 356px into the same
 * inline style. The toaster's edges (16px plus the side safe areas, and
 * the 600px column held sideways, 41.13 rule 10) are in globals.css, in
 * the TOASTS ON PHONE block: sonner sets those in its unlayered
 * stylesheet, which a more specific unlayered rule beats.
 */
const PHONE_STYLE = {
  "--width": "100%",
}

/*
 * Toasts a new one replaces on phone: every toast showing that is not an
 * error (41.8 rule 13). An error is never in here, so it is never
 * replaced; it stays until closed.
 *
 * An id is removed when its toast closes (dismissed, swiped or timed
 * out). A toast closed by its own action button skips sonner's
 * callbacks and leaves its id behind; the next phone toast dismisses
 * that id, which no longer matches anything, and it is gone.
 */
const replaceable = new Set<string | number>()

function isPhone() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.layout === "phone"
  )
}

/** Closes one toast, or every toast, and forgets it at once. */
function dismiss(id?: string | number) {
  if (id === undefined) {
    replaceable.clear()
    showingUndos.length = 0
  } else {
    replaceable.delete(id)
    forgetUndo(id)
  }
  return sonnerToast.dismiss(id)
}

/**
 * Every toast goes through here. On phone, first closes the non-error
 * toasts showing, so the new one replaces them; a caller updating a
 * toast in place (`options.id`) does not close the toast it updates.
 * On desktop only the bookkeeping runs, and sonner stacks as before.
 */
function raise(
  error: boolean,
  show: (options: ExternalToast) => string | number,
  options: ExternalToast
) {
  if (isPhone()) {
    for (const id of replaceable) {
      if (id !== options.id) dismiss(id)
    }
  }
  const id = show({
    ...options,
    onDismiss: (t) => {
      replaceable.delete(t.id)
      options.onDismiss?.(t)
    },
    onAutoClose: (t) => {
      replaceable.delete(t.id)
      options.onAutoClose?.(t)
    },
  })
  if (error) replaceable.delete(id)
  else replaceable.add(id)
  return id
}

/**
 * The durations from section 25 live here rather than at every call
 * site, so no screen can raise an error toast that vanishes before it
 * has been read. They are the same on phone.
 */
function success(message: string, options?: ExternalToast) {
  return raise(false, (o) => sonnerToast.success(message, o), {
    duration: 4000,
    ...options,
  })
}

const toast = {
  message: (message: string, options?: ExternalToast) =>
    raise(false, (o) => sonnerToast(message, o), { duration: 4000, ...options }),

  success,

  warning: (message: string, options?: ExternalToast) =>
    raise(false, (o) => sonnerToast.warning(message, o), {
      duration: 4000,
      ...options,
    }),

  /** Never auto-dismisses. Stays until the user closes it, on phone too. */
  error: (message: string, options?: ExternalToast) =>
    raise(true, (o) => sonnerToast.error(message, o), {
      duration: Infinity,
      ...options,
    }),

  /**
   * Sections 22.2 and 38.1: a reversible action happens at once and
   * confirms with an Undo that lasts ten seconds, the life of the toast.
   * Undo is kinder than a confirmation people click through anyway.
   *
   * `message` says what happened, in the past tense ("Client archived").
   * `onUndo` restores exactly the previous values. `undone`, when given,
   * is the confirmation shown once it has ("Client restored").
   *
   * While the toast is showing, Ctrl+Z outside a text field presses its
   * Undo (39.5) through pressShowingUndo(). Undo runs once however it is
   * pressed, and disappears with the toast. On phone a newer toast
   * replaces it (41.8 rule 13), and its Undo goes with it.
   */
  undo: (
    message: string,
    onUndo: () => void,
    { undone, ...options }: ExternalToast & { undone?: string } = {}
  ) => {
    const entry: UndoEntry = { id: 0, run: () => {} }
    let done = false
    entry.run = () => {
      if (done) return
      done = true
      dismiss(entry.id)
      onUndo()
      if (undone) success(undone)
    }
    entry.id = raise(false, (o) => sonnerToast.success(message, o), {
      duration: 10000,
      action: { label: "Undo", onClick: entry.run },
      ...options,
      onDismiss: (t) => {
        forgetUndo(entry.id)
        options.onDismiss?.(t)
      },
      onAutoClose: (t) => {
        forgetUndo(entry.id)
        options.onAutoClose?.(t)
      },
    })
    showingUndos.push(entry)
    return entry.id
  },

  dismiss,
}

type UndoEntry = { id: string | number; run: () => void }

/** Undo toasts currently on screen, oldest first. */
const showingUndos: UndoEntry[] = []

function forgetUndo(id: string | number) {
  const i = showingUndos.findIndex((entry) => entry.id === id)
  if (i !== -1) showingUndos.splice(i, 1)
}

/**
 * Presses the Undo of the most recent Undo toast still showing (39.5,
 * Ctrl+Z). Returns false, and does nothing, when there is none.
 */
function pressShowingUndo(): boolean {
  const entry = showingUndos.at(-1)
  if (!entry) return false
  entry.run()
  return true
}

export { Toaster, toast, pressShowingUndo }
