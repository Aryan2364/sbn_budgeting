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
 * simple confirmation, six when it carries an Undo link, and error
 * toasts never auto-dismiss - they stay until closed. Maximum three
 * stacked. Every toast has a close button.
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
   * Section 22.2: after a bulk change the confirmation carries an Undo
   * link lasting about ten seconds. Undo is kinder than a confirmation
   * people click through anyway.
   */
  undo: (message: string, onUndo: () => void, options?: ExternalToast) =>
    sonnerToast.success(message, {
      duration: 6000,
      action: { label: "Undo", onClick: onUndo },
      ...options,
    }),

  dismiss: sonnerToast.dismiss,
}

export { Toaster, toast }
