"use client"

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
 * notification centre, not here (section 7.3).
 *
 * Theme is pinned to light: section 28 says do not build a dark theme
 * until asked, and "system" would let the operating system produce a
 * half-built one.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      visibleToasts={3}
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
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

/**
 * The durations from section 25 live here rather than at every call
 * site, so no screen can raise an error toast that vanishes before it
 * has been read.
 */
const toast = {
  message: (message: string, options?: ExternalToast) =>
    sonnerToast(message, { duration: 4000, ...options }),

  success: (message: string, options?: ExternalToast) =>
    sonnerToast.success(message, { duration: 4000, ...options }),

  warning: (message: string, options?: ExternalToast) =>
    sonnerToast.warning(message, { duration: 4000, ...options }),

  /** Never auto-dismisses. Stays until the user closes it. */
  error: (message: string, options?: ExternalToast) =>
    sonnerToast.error(message, { duration: Infinity, ...options }),

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
   * pressed, and disappears with the toast.
   */
  undo: (
    message: string,
    onUndo: () => void,
    { undone, ...options }: ExternalToast & { undone?: string } = {}
  ) => {
    const entry: UndoEntry = { id: 0, run: () => {} }
    let done = false
    const forget = () => {
      const i = showingUndos.indexOf(entry)
      if (i !== -1) showingUndos.splice(i, 1)
    }
    entry.run = () => {
      if (done) return
      done = true
      forget()
      sonnerToast.dismiss(entry.id)
      onUndo()
      if (undone) sonnerToast.success(undone, { duration: 4000 })
    }
    entry.id = sonnerToast.success(message, {
      duration: 10000,
      action: { label: "Undo", onClick: entry.run },
      ...options,
      onDismiss: (t) => {
        forget()
        options.onDismiss?.(t)
      },
      onAutoClose: (t) => {
        forget()
        options.onAutoClose?.(t)
      },
    })
    showingUndos.push(entry)
    return entry.id
  },

  dismiss: sonnerToast.dismiss,
}

type UndoEntry = { id: string | number; run: () => void }

/** Undo toasts currently on screen, oldest first. */
const showingUndos: UndoEntry[] = []

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
