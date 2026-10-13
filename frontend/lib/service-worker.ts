"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"

/**
 * Section 41.14 rules 9 and 11 - the page's side of the service worker
 * (public/sw.js): registering it, and knowing when a new release is
 * waiting.
 *
 *   const { updateReady, reload } = useServiceWorker()
 *
 * PHONE ONLY. The installable app is the phone's (41.12, 41.19 rule 1),
 * so the worker is registered only in the phone layout (useLayout(),
 * 41.2), only in a production build (in development every file changes on
 * every save, and a cached one would fight the dev server), and only in a
 * secure context (https, or localhost), the only place a browser allows
 * one. On a computer nothing is registered and `updateReady` is always
 * false, so desktop behaves exactly as it did. A foldable that unfolds
 * keeps a worker it already has; it is never unregistered, because that
 * would also drop the phone's notification subscription (lib/push.ts).
 *
 * WHICH RELEASE IS THIS? The offline screen (/offline) is prerendered at
 * build time and names the build's hashed files, so its HTML changes
 * exactly when a new release is deployed. A short hash of it, as the
 * server sends it now, is the release's name: no version for anyone to
 * remember to bump. It is read when the page opens (the release THIS page
 * belongs to, since page HTML is never cached) and again later, to see
 * whether the server has moved on while the page stayed open.
 *
 * THE WORKER is registered as /sw.js?release=<name>. A new release is a
 * new script address, which the browser installs as a new worker; it
 * caches the new offline screen and waits (public/sw.js).
 *
 *   - A waiting worker of a NEWER release than the page: `updateReady`.
 *     The new-version banner offers "Reload" (connection-banner.tsx).
 *   - A waiting worker of the page's OWN release (the page opened after
 *     the release went out, while the old worker still ran): the page is
 *     not old, so the worker is told to take over quietly, with no banner.
 *   - The first worker on a phone takes over by itself: nothing waits.
 *
 * WHEN IT LOOKS. When the page opens, when the app comes back to the
 * front (at most every 5 minutes), and every 30 minutes while it is in
 * front. Each look is one small request for /offline; each registration
 * also lets the browser check sw.js and sw-push.js for changes.
 *
 * `reload()` asks the waiting worker to take over (SKIP_WAITING) and
 * reloads once it controls the page, so the reloaded page and the worker
 * are the same release. A worker that has not taken over within 3 seconds
 * does not leave the button dead: the page reloads anyway, and the fresh
 * page settles the worker quietly as above.
 *
 * A PRODUCT KEEPS /offline (app/offline/page.tsx). Without it there is
 * nothing to cache for the offline screen and nothing to name a release
 * by, so no worker is registered.
 */

const SCRIPT = "/sw.js"
/** The offline screen: what the worker caches, and what names a release. */
const OFFLINE_SCREEN = "/offline"

const CHECK_EVERY_MS = 30 * 60 * 1000
const CHECK_AT_MOST_EVERY_MS = 5 * 60 * 1000
/** Section 14 rule 4: every request has a deadline where it is made. */
const DEADLINE_MS = 10 * 1000
const TAKEOVER_DEADLINE_MS = 3 * 1000

let started = false
/** The release this page was loaded from; null when it could not be read. */
let pageRelease: string | null = null
let lastCheck = 0
let waiting: ServiceWorker | null = null
let reloading = false
const watched = new WeakSet<ServiceWorkerRegistration>()
const followed = new WeakSet<ServiceWorker>()
const considered = new WeakSet<ServiceWorker>()

/* The one piece of state the screen reads, as a tiny external store. */
let updateReady = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setUpdateReady(next: boolean) {
  if (updateReady === next) return
  updateReady = next
  listeners.forEach((listener) => listener())
}

function supported(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    typeof crypto !== "undefined" &&
    crypto.subtle !== undefined
  )
}

/** The release a worker was registered for, from its script address. */
function releaseOf(scriptURL: string | undefined): string | null {
  if (!scriptURL) return null
  try {
    return new URL(scriptURL).searchParams.get("release")
  } catch {
    return null
  }
}

/** The name of the release the server is sending now; null when it cannot be read. */
async function currentRelease(): Promise<string | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), DEADLINE_MS)
  try {
    const response = await fetch(OFFLINE_SCREEN, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
    if (!response.ok) return null
    const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer())
    return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** A worker has installed and is waiting to take over. */
function consider(worker: ServiceWorker) {
  if (considered.has(worker)) return
  considered.add(worker)
  // The first worker on this phone: there is nothing to replace, and it
  // takes over by itself.
  if (!navigator.serviceWorker.controller) return
  if (pageRelease !== null && releaseOf(worker.scriptURL) === pageRelease) {
    // Only the worker is behind; nothing on screen is old.
    worker.postMessage({ type: "SKIP_WAITING" })
    return
  }
  waiting = worker
  setUpdateReady(true)
  worker.addEventListener("statechange", () => {
    // Replaced by a newer one before Reload was pressed: that one is
    // considered in its turn.
    if (worker.state === "redundant" && waiting === worker) {
      waiting = null
      setUpdateReady(false)
    }
  })
}

/** Waits for an installing worker to finish installing. */
function follow(worker: ServiceWorker) {
  if (followed.has(worker)) return
  followed.add(worker)
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed") consider(worker)
  })
}

function watch(registration: ServiceWorkerRegistration) {
  if (watched.has(registration)) return
  watched.add(registration)
  if (registration.waiting) consider(registration.waiting)
  // One may already be installing (its updatefound came before this ran).
  if (registration.installing) follow(registration.installing)
  registration.addEventListener("updatefound", () => {
    if (registration.installing) follow(registration.installing)
  })
}

/**
 * Registers the worker for `release`. The same address again is harmless:
 * the browser then only checks sw.js and sw-push.js for changes.
 */
async function register(release: string) {
  try {
    const registration = await navigator.serviceWorker.register(
      `${SCRIPT}?release=${encodeURIComponent(release)}`,
      // "none": the browser's own check for a changed worker never reads
      // sw.js or sw-push.js from the HTTP cache.
      { scope: "/", updateViaCache: "none" }
    )
    watch(registration)
  } catch {
    // Refused (private mode, storage full, blocked by the person): the
    // app works as a plain website. Nothing to show.
  }
}

async function check(force: boolean) {
  const now = Date.now()
  if (!force && now - lastCheck < CHECK_AT_MOST_EVERY_MS) return
  lastCheck = now
  const release = await currentRelease()
  if (release === null) return
  // Unread when the page opened (the connection dropped just then): from
  // now this is the best answer there is.
  if (pageRelease === null) pageRelease = release
  await register(release)
}

async function start() {
  if (started || !supported()) return
  started = true
  lastCheck = Date.now()
  pageRelease = await currentRelease()

  if (pageRelease !== null) {
    await register(pageRelease)
  } else {
    // The server could not be read just now. Keep watching a worker the
    // phone already has; the next look registers one.
    const existing = await navigator.serviceWorker.getRegistration("/").catch(() => undefined)
    if (existing) watch(existing)
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check(false)
  })
  window.setInterval(() => {
    if (document.visibilityState === "visible") void check(true)
  }, CHECK_EVERY_MS)
}

/** "Reload" on the new-version banner. */
function reload() {
  if (reloading) return
  reloading = true
  const worker = waiting
  if (!worker || !("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    window.location.reload()
    return
  }
  const go = () => window.location.reload()
  navigator.serviceWorker.addEventListener("controllerchange", go, { once: true })
  window.setTimeout(go, TAKEOVER_DEADLINE_MS)
  worker.postMessage({ type: "SKIP_WAITING" })
}

/**
 * Registers the service worker on phone, and says whether a new release
 * is ready. Mounted by the shell (through ConnectionBanner); calling it
 * from several places registers once.
 */
function useServiceWorker(): { updateReady: boolean; reload: () => void } {
  const phone = useLayout().layout === "phone"

  React.useEffect(() => {
    if (phone) void start()
  }, [phone])

  const ready = React.useSyncExternalStore(
    subscribe,
    () => updateReady,
    () => false
  )
  return { updateReady: phone && ready, reload }
}

export { useServiceWorker, OFFLINE_SCREEN }
