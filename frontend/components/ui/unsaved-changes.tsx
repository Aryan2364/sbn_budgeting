"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

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

/**
 * Section 11.3 rule 10: leaving a form with unsaved changes asks first.
 *
 *   const unsaved = useUnsavedChanges({ changed: isChanged(values, saved), noun: "client" })
 *   ...
 *   {unsaved.warning}
 *   <Dialog open={open} onOpenChange={unsaved.guard(setOpen, reset)}>
 *
 * While `changed` is true it catches:
 * - in-app navigation: any click on a same-origin link anywhere on the
 *   page (sidebar, breadcrumb, a text link), caught before the router
 *   sees it. "Leave without saving" then goes where the link pointed.
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
 * Not caught: the browser's own Back and Forward buttons. The App Router
 * has no hook to cancel them, and a guard that traps Back would be worse
 * than the loss it prevents.
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

/** The dialog's words, for a screen in another language. */
type UnsavedChangesText = {
  title: string
  /** Given the form's `noun`: "Your changes to this client will be lost." */
  description: (noun: string) => string
  stay: string
  leave: string
}

const DEFAULT_TEXT: UnsavedChangesText = {
  title: "Leave without saving?",
  description: (noun) => `Your changes to this ${noun} will be lost.`,
  stay: "Stay",
  leave: "Leave without saving",
}

type Options = {
  /** Values differ from the saved ones. */
  changed: boolean
  /** What the form edits, for "Your changes to this client will be lost." */
  noun: string
  /** The dialog's own words. Keys not given keep the English defaults. */
  text?: Partial<UnsavedChangesText>
}

function useUnsavedChanges({ changed, noun, text }: Options) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const pending = React.useRef<(() => void) | null>(null)

  const ask = React.useCallback((leave: () => void) => {
    pending.current = leave
    setOpen(true)
  }, [])

  React.useEffect(() => {
    if (!changed) return

    // Capture phase on the window, so it runs before React's own click
    // handling and the router's Link never sees the click.
    const onClick = (event: MouseEvent) => {
      const href = interceptableHref(event)
      if (!href) return
      event.preventDefault()
      event.stopPropagation()
      ask(() => router.push(href))
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
   * runs after "Leave without saving", to put the form back to its saved
   * values.
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
        })
      },
    [changed, ask]
  )

  const t = { ...DEFAULT_TEXT, ...text }
  const warning = (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false)
          pending.current = null
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.description(noun)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.stay}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const leave = pending.current
              pending.current = null
              setOpen(false)
              leave?.()
            }}
          >
            {t.leave}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { warning, guard, changed }
}

export { useUnsavedChanges, isChanged, type UnsavedChangesText }
