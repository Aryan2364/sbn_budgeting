"use client"

import * as React from "react"

import { complaintsApi } from "@/lib/complaints-api"

/**
 * The My work tab's count (kit 41.4 rule 16, 41.15 rule 8; plan-phone
 * D10): `counts.assigned` from GET /complaints/counts, the same number as
 * the desktop's Assigned tab.
 *
 * One module-level store, so the tab bar and any screen read the same
 * number. It is fetched:
 *   - when the phone shell mounts (useMyWorkCount with `active`),
 *   - when the window regains focus, at most once a minute,
 *   - after raise and resolve, through refreshMyWorkCount().
 * Nothing polls. A failed fetch keeps the last number shown (a count is
 * never worth an error on the tab bar); null until the first answer.
 */
const FOCUS_REFRESH_MS = 60_000

let count: number | null = null
let lastFetch = 0
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function publish(next: number | null) {
  if (next === count) return
  count = next
  listeners.forEach((listener) => listener())
}

/**
 * Fetches the count again now. Call it after an action that changes what
 * is waiting on this person: raising a complaint, resolving one.
 */
function refreshMyWorkCount(): Promise<void> {
  if (inFlight) return inFlight
  lastFetch = Date.now()
  inFlight = complaintsApi
    .counts()
    .then((counts) => publish(counts.assigned))
    .catch(() => {})
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** Forgets the number, at sign-out, so the next person never sees it. */
function forgetMyWorkCount() {
  lastFetch = 0
  publish(null)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The count, or null while not known. With `active` (the phone shell, for
 * someone who can open My work) it fetches on mount and on focus.
 */
function useMyWorkCount(active = false): number | null {
  const value = React.useSyncExternalStore(
    subscribe,
    () => count,
    () => null
  )

  React.useEffect(() => {
    if (!active) return
    void refreshMyWorkCount()
    const onFocus = () => {
      if (Date.now() - lastFetch >= FOCUS_REFRESH_MS) void refreshMyWorkCount()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [active])

  return value
}

export { useMyWorkCount, refreshMyWorkCount, forgetMyWorkCount }
