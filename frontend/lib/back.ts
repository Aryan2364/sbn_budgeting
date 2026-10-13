"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { useOptionalProgress } from "@/components/shell/progress-bar"

/**
 * Section 41.4 rule 7 - the phone's back arrow.
 *
 * It returns to the previous screen in the app. Where there is none
 * (the screen was opened from a notification, a link, a fresh load, or
 * a reload with nothing before it) it goes to the screen's parent, the
 * level a breadcrumb would show above it, with router.replace: the
 * history is not doubled, so Android back from the parent still leaves
 * the app as rule 9 expects.
 *
 * WHY NOT history.length. It counts entries from other websites before
 * this one, and the entry each open bottom sheet adds (41.4 rule 9).
 * Going back on a count that includes either leaves the app, or only
 * closes a sheet. So the app keeps its own record, in sessionStorage
 * (per tab, and it survives a reload of the tab), keyed so it follows
 * the tab's own history.
 *
 * TWO WAYS OF KEEPING IT, BY WHAT THE BROWSER OFFERS.
 *
 *   - With the Navigation API (Chrome and Android Chrome, Safari 26 and
 *     later): every history entry has a key that stays the same through
 *     a reload, a replace and a return from another website. The keys
 *     of the entries this app showed as screens are recorded, and the
 *     keys of sheet entries separately.
 *       - A SCREEN key is recorded by the shell's own pathname effect
 *         (useTrackBackHistory), as navigation.currentEntry.key at that
 *         moment: the entry a screen of the shell is showing on. Never
 *         from currententrychange for a new pathname, which also fires
 *         for a navigation that leaves the shell (to sign-in, say) while
 *         the shell is still mounted, and would record that page as a
 *         screen.
 *       - currententrychange classifies SHEET entries. The one screen it
 *         records is a push that changes only the search of the screen
 *         the shell is showing (a list's confirmed filters, decision 9):
 *         the same pathname cannot have left the shell, and without it
 *         back from a record opened from the filtered list would skip
 *         the list's filters (41.5 rule 17) and go to the parent.
 *     The arrow finds the entry the current screen sits on (stepping
 *     down past any sheet entries above it), then the nearest earlier
 *     entry that is not a sheet. If that is a recorded screen it goes
 *     there with navigation.traverseTo(key), skipping every sheet entry
 *     between in one step, so it never lands on a leftover sheet entry
 *     of the screen before (decision 10 in OVERNIGHT_DECISIONS.md).
 *   - Without it (older iPhones): a stack of the screens' addresses and
 *     the current depth. A pathname change made by the app is a step
 *     forward; a popstate that changes the pathname is a step back (or
 *     forward, matched against the stack). A popstate that leaves the
 *     pathname unchanged only opened or closed a sheet, and changes
 *     nothing. The arrow goes back history.go(-n) when n is known: 1 when
 *     the current entry is the screen's own, or the sheet's own entries
 *     plus 1 when it is a leftover sheet entry (its kitStep says how many
 *     it pushed). Otherwise router.back().
 *
 * SHEETS. Stage 3 gives each open bottom sheet a same-address history
 * entry whose history.state carries kitLayer: true (and kitStep, 0 for
 * the sheet and n for its nth step, components/ui/sheet.tsx). Those are
 * never a screen, in either way of keeping the record.
 *
 * KNOWN LIMITS, all erring towards the parent (a wrong "go to parent"
 * stays in the app; a wrong "go back" would leave it):
 *
 *   - Only screens shown while the phone shell is mounted are recorded.
 *     A page outside it (sign-in) never counts as a screen to go back to.
 *   - Without the Navigation API:
 *       - a leftover sheet entry BELOW the current screen's (one sheet
 *         left open by a navigation, decision 10) cannot be seen, so the
 *         arrow lands on it: the same earlier screen, which only costs
 *         one extra Android back press later;
 *       - a router.replace that changes the pathname, other than this
 *         file's own, reads as a step forward. Next.js gives no way to
 *         tell a replace from a push from outside the router, short of
 *         patching history.pushState, which Next.js already patches;
 *       - a browser forward press to an address that also sits behind
 *         reads as a step back;
 *       - a full page load (a plain <a>, a typed address) starts again
 *         at depth 0, apart from a reload or a return to the same entry;
 *       - search-only changes are not counted, since the record is of
 *         pathnames: back goes to the screen before, not to the same
 *         screen's earlier search.
 *   - Going back through history (traverseTo, history.go, router.back)
 *     does not show the loading bar of 5.6: ProgressApi.navigate covers
 *     push and replace only. The screen being returned to is normally in
 *     the router's cache.
 */

const STORAGE_KEY = "kit:back"

/** Stage 3's mark on a sheet's history entry (41.4 rule 9). */
const LAYER_FLAG = "kitLayer"

/** Keys kept per list. Old ones only matter after 100 screens in a tab. */
const KEEP = 100

type BackRecord = {
  /** Navigation API: keys of entries shown as screens of this app. */
  screens: string[]
  /** Navigation API: keys of sheet entries. */
  layers: string[]
  /** Fallback: the screens' pathnames in this tab, oldest first. */
  stack: string[]
  /** Fallback: where the current screen sits in `stack`. */
  depth: number
}

type NavEntry = { key: string; index: number; url: string | null }

type NavigationLike = EventTarget & {
  currentEntry: NavEntry | null
  entries(): NavEntry[]
  traverseTo(key: string): { committed: Promise<unknown>; finished: Promise<unknown> }
}

type EntryChangeEvent = Event & {
  navigationType: "push" | "replace" | "traverse" | "reload" | null
  from: NavEntry
}

/*
 * Module state, one per document. The listeners are added once and never
 * removed; they act only while a tracker is mounted (`trackers`), so a
 * page outside the shell is never recorded.
 */
let record: BackRecord = { screens: [], layers: [], stack: [], depth: 0 }
let started = false
let trackers = 0
/**
 * The pathname the shell's own effect last saw: the screen the shell is
 * showing. Both ways of keeping the record read it.
 */
let lastPath = ""
/**
 * Fallback only: the pathname this file is replacing to, so it reads as a
 * replace. Never set where the Navigation API keeps the record, since
 * nothing there would ever read or clear it.
 */
let pendingReplace: string | null = null

function navigationApi(): NavigationLike | null {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation
  return nav && typeof nav.entries === "function" && typeof nav.traverseTo === "function"
    ? nav
    : null
}

/** The current entry's sheet mark, or null when it is not a sheet's. */
function layerState(): { kitStep?: unknown } | null {
  const state = window.history.state as { [LAYER_FLAG]?: unknown; kitStep?: unknown } | null
  return state?.[LAYER_FLAG] === true ? state : null
}

function pathnameOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

function load(): BackRecord {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null")
    if (
      saved &&
      Array.isArray(saved.screens) &&
      Array.isArray(saved.layers) &&
      Array.isArray(saved.stack) &&
      typeof saved.depth === "number"
    ) {
      return saved as BackRecord
    }
  } catch {}
  return { screens: [], layers: [], stack: [], depth: 0 }
}

/** Best effort: storage can be blocked. The module state still holds. */
function save() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {}
}

/** Moves `key` to the end of `into`, takes it out of `other`, and trims. */
function remember(into: string[], other: string[], key: string) {
  const found = into.indexOf(key)
  if (found !== -1) into.splice(found, 1)
  into.push(key)
  if (into.length > KEEP) into.splice(0, into.length - KEEP)
  const elsewhere = other.indexOf(key)
  if (elsewhere !== -1) other.splice(elsewhere, 1)
}

/**
 * Navigation API, from currententrychange. Records a SHEET's entry, and a
 * push that changes only the search of the screen the shell is showing.
 * Any entry at another pathname is left for the shell's pathname effect
 * (recordScreen): if the shell is still there once it renders, it
 * records it; if the navigation left the shell, nothing does.
 */
function onEntryChange(nav: NavigationLike, event: EntryChangeEvent) {
  if (trackers === 0) return
  const entry = nav.currentEntry
  if (!entry?.key) return
  // A push to the same address is a sheet even if its state was not
  // marked: Next.js never pushes an address that is already current.
  const layer =
    layerState() !== null || (event.navigationType === "push" && entry.url === event.from.url)
  if (layer) {
    remember(record.layers, record.screens, entry.key)
    save()
    return
  }
  if (event.navigationType === "push" && lastPath !== "" && pathnameOf(entry.url) === lastPath) {
    remember(record.screens, record.layers, entry.key)
    save()
  }
}

/**
 * Navigation API, from the shell's own pathname effect: the entry a
 * screen of the shell is showing on now. A sheet's entry is left alone.
 */
function recordScreen(nav: NavigationLike) {
  lastPath = window.location.pathname
  const entry = nav.currentEntry
  if (!entry?.key || layerState() !== null) return
  remember(record.screens, record.layers, entry.key)
  save()
}

/** Fallback: starts the stack, resuming it only for this same entry. */
function startStack() {
  const path = window.location.pathname
  const timing = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined
  const resumed =
    (timing?.type === "reload" || timing?.type === "back_forward") &&
    record.stack[record.depth] === path
  if (!resumed) {
    record.stack = [path]
    record.depth = 0
  }
  lastPath = path
  save()
}

/** Fallback: a popstate. The same pathname means only a sheet moved. */
function onPopState() {
  if (trackers === 0) return
  const path = window.location.pathname
  if (path === lastPath) return
  if (record.stack[record.depth - 1] === path) {
    record.depth -= 1
  } else if (record.stack[record.depth + 1] === path) {
    record.depth += 1
  } else {
    // Not in the stack. Read it as a step back, the safe direction.
    record.depth = Math.max(0, record.depth - 1)
    record.stack = record.stack.slice(0, record.depth)
    record.stack[record.depth] = path
  }
  lastPath = path
  save()
}

function start() {
  if (started) return
  started = true
  record = load()
  const nav = navigationApi()
  if (nav) {
    nav.addEventListener("currententrychange", (event) =>
      onEntryChange(nav, event as EntryChangeEvent)
    )
  } else {
    startStack()
    window.addEventListener("popstate", onPopState)
  }
}

/**
 * The shell's pathname effect: a screen of the shell is showing. With the
 * Navigation API, its entry is recorded as a screen. Without it, a
 * pathname change the app made (popstate ones are already seen) is a
 * step forward, or this file's own replace.
 */
function noteScreen() {
  const nav = navigationApi()
  if (nav) {
    recordScreen(nav)
    return
  }
  const path = window.location.pathname
  if (path === lastPath) return
  if (pendingReplace === path) {
    record.stack[record.depth] = path
  } else {
    record.depth += 1
    record.stack = record.stack.slice(0, record.depth)
    record.stack[record.depth] = path
  }
  pendingReplace = null
  lastPath = path
  save()
}

/**
 * Fallback: a tracker mounting. An address that changed while no tracker
 * was mounted is unknown, so the stack starts again from it. (With the
 * Navigation API, the pathname effect that runs right after this records
 * the current entry.)
 */
function noteMount() {
  if (navigationApi()) return
  const path = window.location.pathname
  if (path === lastPath) return
  record.stack = [path]
  record.depth = 0
  lastPath = path
  save()
}

/**
 * Where the back arrow can go in the app, or null for "no earlier screen".
 *
 *   - Navigation API: the key of the earlier screen's entry. From the
 *     current entry, step down past sheet entries to the entry the
 *     current screen sits on; then past sheet entries again to the
 *     nearest earlier entry. It must be a recorded screen.
 *   - Fallback: how many entries back it is when that is known; 0 when
 *     there is an earlier screen but not how far (router.back() then).
 */
function backTarget(): { key: string } | { delta: number } | null {
  const nav = navigationApi()
  if (!nav) {
    if (record.depth <= 0) return null
    const layer = layerState()
    if (layer === null) return { delta: 1 }
    // A leftover sheet entry on top of the current screen's: the sheet
    // pushed kitStep + 1 entries (itself and each step), then one more
    // takes it to the screen before.
    const step = layer.kitStep
    return typeof step === "number" && Number.isInteger(step) && step >= 0
      ? { delta: step + 2 }
      : { delta: 0 }
  }
  const current = nav.currentEntry
  if (!current || current.index < 0) return null
  const entries = nav.entries()
  const isLayer = (i: number) => {
    const key = entries[i]?.key
    return key !== undefined && record.layers.includes(key)
  }
  let i = current.index
  // Marked as a sheet's, though its push was not seen: still a sheet's.
  if (layerState() !== null && !isLayer(i)) i -= 1
  while (i >= 0 && isLayer(i)) i--
  for (let j = i - 1; j >= 0; j--) {
    if (isLayer(j)) continue
    const key = entries[j]?.key
    return key && record.screens.includes(key) ? { key } : null
  }
  return null
}

/**
 * Keeps the record of screens shown in this tab. Mounted once, by
 * AppBarProvider (components/shell/app-bar.tsx), so it runs for as long
 * as the shell does. Never mount a second one: each mount of a tracker
 * reads a pathname it has not seen as a fresh start.
 */
function useTrackBackHistory() {
  const pathname = usePathname()

  React.useEffect(() => {
    start()
    trackers += 1
    noteMount()
    return () => {
      trackers -= 1
    }
  }, [])

  // Where a screen is recorded (A SCREEN key, above). Runs after the mount
  // effect, on mount too. By then Next.js has written the new entry: it
  // does so in an insertion effect, which runs before any effect.
  React.useEffect(() => {
    noteScreen()
  }, [pathname])
}

/**
 * What the back arrow does (41.4 rule 7). `parent` is the screen's
 * parent in the product's structure; with none given, the home screen.
 */
function useBack(parent?: string): () => void {
  const router = useRouter()
  // The shell's loading bar where there is one (AppShell provides it), so
  // going to the parent shows it under the app bar (41.4 rule 22).
  const progress = useOptionalProgress()

  return React.useCallback(() => {
    start()
    const target = backTarget()
    if (target !== null) {
      const nav = navigationApi()
      if ("key" in target && nav) {
        const result = nav.traverseTo(target.key)
        // A traversal the browser drops (another navigation started
        // first) rejects. Nothing is left to do, and it is not an error.
        result.committed.catch(() => {})
        result.finished.catch(() => {})
      } else if ("delta" in target && target.delta > 0) {
        window.history.go(-target.delta)
      } else {
        router.back()
      }
      return
    }
    const href = parent ?? "/"
    // The fallback reads this as a replace; the Navigation API tells a
    // replace from a push itself, so there it is never set (and so never
    // left stale).
    if (!navigationApi()) pendingReplace = new URL(href, window.location.href).pathname
    if (progress) progress.navigate(href, { replace: true })
    else router.replace(href)
  }, [router, progress, parent])
}

export { useBack, useTrackBackHistory }
