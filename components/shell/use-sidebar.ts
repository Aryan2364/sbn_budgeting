"use client"

import * as React from "react"

import { SIDEBAR_STORAGE_KEY } from "@/components/shell/sidebar-storage"

/**
 * Section 12.1: "The user's open or collapsed choice is saved and
 * restored next visit."
 *
 * The stored choice is applied to <html data-sidebar> by the inline
 * script in app/layout.tsx, before the first paint, and the sidebar's
 * width comes from that attribute through the `rail:` variant in
 * globals.css. React state is not the source of the width - if it
 * were, someone who collapsed the sidebar last visit would watch it
 * animate from 260px to 64px on every page load.
 *
 * That makes the attribute an external store, and it is subscribed to
 * as one. The alternative - reading it into state inside an effect -
 * is a cascading render, and React says as much.
 */
export { SIDEBAR_STORAGE_KEY }

export type SidebarMode = "open" | "collapsed"

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function getSnapshot(): SidebarMode {
  return document.documentElement.dataset.sidebar === "collapsed"
    ? "collapsed"
    : "open"
}

/**
 * The server has no window to measure and no storage to read, so it
 * renders the open sidebar. The inline script has already corrected
 * the attribute by the time this hydrates.
 */
function getServerSnapshot(): SidebarMode {
  return "open"
}

export function useSidebarMode() {
  const mode = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  const toggle = React.useCallback(() => {
    const next: SidebarMode = getSnapshot() === "open" ? "collapsed" : "open"
    document.documentElement.dataset.sidebar = next
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next)
    } catch {
      // Private browsing, or storage disabled. The choice simply does
      // not survive the visit; nothing else changes.
    }
    for (const listener of listeners) listener()
  }, [])

  return { collapsed: mode === "collapsed", toggle }
}

/**
 * Section 9 and 12.1. 1024px is the line between the two collapse
 * behaviours: at or above it the toggle collapses the sidebar to a
 * rail beside the content; below it the sidebar is hidden and the same
 * toggle opens it as an overlay over the content.
 */
export const DESKTOP_QUERY = "(min-width: 1024px)"

function subscribeToDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export function useIsDesktop() {
  return React.useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  )
}
