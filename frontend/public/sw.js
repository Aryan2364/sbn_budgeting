/*
 * The kit's service worker - FRONTEND_RULES_PHONE.md section 41.14 rules
 * 9 to 11. Hand-written, no package, no build step. Registered only in
 * the phone layout, in production builds, in a secure context
 * (lib/service-worker.ts): the installable app is the phone's (41.12), so
 * a computer never runs this file and its behaviour is unchanged.
 *
 * WHAT IT DOES, AND WHAT IT NEVER DOES
 *
 *   - Page HTML is never cached. Pages are dynamic and private (they carry
 *     the signed-in person's data and permissions), so a navigation always
 *     goes to the network. Working fully offline is not built (41.14
 *     rule 8).
 *   - A navigation that FAILS - no connection - or that has not answered
 *     within 8 seconds is answered with the offline screen
 *     (app/offline/page.tsx), cached when this worker installed. So the installed app opens without a connection and shows
 *     the offline banner and the failed empty state with "Try again", never
 *     the browser's error page (41.14 rules 9 and 10, 41.20 check 20). The
 *     address stays the one the person asked for, so "Try again" (a reload)
 *     opens exactly that screen once the connection is back.
 *   - Next's built files (/_next/static/*: scripts, styles, fonts) and the
 *     install icons are kept the first time they are fetched and served
 *     from the cache after that. The built files are content-hashed, so a
 *     cached copy can never be stale: a new release asks for new names.
 *   - Everything else - data requests, RSC payloads, anything not a GET,
 *     other sites - passes straight through, untouched.
 *
 * INSTALL caches the offline screen and the files it needs to draw itself
 * (its styles, scripts and fonts, read from its own HTML), and nothing
 * else: no other page is cached up front. Without its files the screen
 * would paint unstyled on a phone that had not loaded them through this
 * worker yet (the very first visit is loaded before the worker exists).
 *
 * RELEASES AND THE NEW-VERSION BANNER (41.14 rule 11)
 *
 * The worker is registered as /sw.js?release=<id>, where <id> is a hash
 * of the offline screen's HTML as the server sends it now
 * (lib/service-worker.ts). That HTML is prerendered at build time and
 * names the build's hashed files, so it changes exactly when a new release
 * is deployed, with nothing for anyone to remember to bump. A new release
 * means a new script address, which the browser installs as a new worker.
 *
 *   - The new worker installs (caching the new release's offline screen)
 *     and then WAITS: it does not take over the open app by itself.
 *   - The page sees it waiting. If the page is older than it, the page
 *     shows "A new version is ready" with "Reload"; Reload sends
 *     SKIP_WAITING, the new worker takes over, and the page reloads once
 *     it controls the page. If the page is already that release (it was
 *     opened after the release went out), the page sends SKIP_WAITING
 *     quietly: nothing on screen is old.
 *   - On taking over it deletes every older cache of this worker's, and
 *     takes control of the open pages, so their files are cached from now.
 *
 * A change to this file or to /sw-push.js alone is picked up by the
 * browser's own byte-for-byte check (registered with updateViaCache
 * "none") and follows the same path.
 *
 * NAMES. This file shares the worker's global scope with /sw-push.js
 * (part 6C: the push and notificationclick handlers), so every top-level
 * name here starts with SHELL_ and cannot collide with one of its own.
 */

/*
 * Phone notifications (41.12 rules 2 and 3) live in their own file. If it
 * is missing or fails, this worker must still install: the offline screen
 * matters more than a notification handler.
 */
try {
  importScripts("/sw-push.js")
} catch {
  // Without it, no phone notifications arrive; everything else works.
}

/**
 * The cache layout of this file. Raise it only when a change here makes
 * an existing cache unreadable; releases change the name by themselves.
 */
const SHELL_WORKER_VERSION = 1

/** Every cache this worker owns starts with this, so it never deletes another's. */
const SHELL_CACHE_PREFIX = "sbn-shell-"

/** This release's cache: the offline screen and the built files seen. */
const SHELL_CACHE =
  SHELL_CACHE_PREFIX +
  SHELL_WORKER_VERSION +
  "-" +
  (new URL(self.location.href).searchParams.get("release") || "unversioned")

/** The offline screen (app/offline/page.tsx), the one page ever cached. */
const SHELL_OFFLINE_URL = "/offline"

/**
 * What is cached on first use: Next's built files (content-hashed), and
 * the install icons and favicon, which change only with a release, and so
 * with this worker's cache.
 *
 * The install icons are exactly the routes of app/install-icon/[name]:
 * one name each, no deeper path - today 192, 512, maskable and apple
 * (iPhone's apple-touch-icon), lib/install-icon.tsx. Any other name there
 * is not found (dynamicParams false), and only a 200 is kept, so a new
 * icon a product adds there is covered without touching this file.
 */
const SHELL_CACHED_PATH = /^\/(?:_next\/static\/|install-icon\/[^/]+$|favicon\.ico$)/

/**
 * A built file named inside the offline screen's HTML or its stylesheets:
 * in a src or href attribute, inside the page's escaped RSC data, or in a
 * stylesheet's url(). It stops at the quote, backslash, bracket or space
 * that ends the address in each of those.
 */
const SHELL_BUILT_FILE_IN_TEXT = /\/_next\/static\/[^"'\\\s<>()]+/g

/**
 * Section 14 rule 4: every request this worker makes has a deadline. A
 * request that never settles must not hold the install, or a built file,
 * for ever.
 */
const SHELL_DEADLINE_MS = 15000

/**
 * A navigation that has not answered in this long is given the offline
 * screen instead (decision 12 of the stage 6 review): long enough for a
 * slow 4G page to load, short enough that a connection that answers
 * nothing does not leave a blank screen.
 */
const SHELL_NAVIGATION_DEADLINE_MS = 8000

/**
 * fetch() with SHELL_DEADLINE_MS: aborted (AbortController) if no answer
 * has begun by then. Once it has, the deadline is cleared, so a large file
 * still arriving is not cut off.
 */
function shellFetchWithDeadline(input, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SHELL_DEADLINE_MS)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function shellFetch(url) {
  return shellFetchWithDeadline(url, { cache: "reload", credentials: "same-origin" })
}

/** Caches one built file. Best effort: a file that fails is fetched on first use instead. */
async function shellCacheFile(cache, url) {
  try {
    const response = await shellFetch(url)
    if (!response.ok) return null
    const text = /\.css(?:\?|$)/.test(url) ? await response.clone().text() : null
    await cache.put(url, response)
    return text
  } catch {
    return null
  }
}

function shellBuiltFiles(text) {
  return Array.from(new Set(text.match(SHELL_BUILT_FILE_IN_TEXT) || []))
}

/**
 * The offline screen and the files it draws with. The screen itself must
 * be cached, or the install fails and the browser tries again later; its
 * files are best effort. Fonts are named by the stylesheets, so those are
 * read for a second round.
 */
async function shellCacheOfflineScreen() {
  const cache = await caches.open(SHELL_CACHE)
  const response = await shellFetch(SHELL_OFFLINE_URL)
  if (!response.ok) throw new Error("The offline screen could not be fetched: " + response.status)
  const html = await response.clone().text()
  await cache.put(SHELL_OFFLINE_URL, response)

  const files = shellBuiltFiles(html)
  const styles = await Promise.all(files.map((url) => shellCacheFile(cache, url)))
  const fromStyles = shellBuiltFiles(styles.filter(Boolean).join("\n")).filter(
    (url) => !files.includes(url)
  )
  await Promise.all(fromStyles.map((url) => shellCacheFile(cache, url)))
}

self.addEventListener("install", (event) => {
  // No skipWaiting here: a new worker waits until the page asks (above).
  event.waitUntil(shellCacheOfflineScreen())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE)
          .map((name) => caches.delete(name))
      )
      // Starts each navigation's request while the worker is still waking,
      // so a navigation is no slower for passing through it (41.14 rule 2).
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {})
      }
      // The open pages are served by this worker from now, so the files
      // they fetch next are cached and a later failed navigation is caught.
      await self.clients.claim()
    })()
  )
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting()
})

/** The cached offline screen, or undefined if this release has none. */
async function shellOfflineScreen() {
  const cache = await caches.open(SHELL_CACHE)
  return cache.match(SHELL_OFFLINE_URL)
}

/** Stands for "the navigation deadline passed" in the race below. */
const SHELL_TOO_SLOW = Symbol("too slow")

/**
 * A navigation: the network, or the offline screen when there is none, or
 * when the network has not answered within SHELL_NAVIGATION_DEADLINE_MS
 * (14 rule 4).
 *
 * The request is ABANDONED at the deadline, not aborted. The browser
 * starts a navigation's request itself (navigation preload), which no
 * AbortController reaches; and a navigation request cannot be given a
 * signal without being turned into a different request (its mode becomes
 * "same-origin", and with it the Sec-Fetch headers the server sees). So
 * the race stops waiting, the offline screen answers, and whatever the
 * network sends later is dropped. If the offline screen is not cached,
 * the network is waited for after all: a slow page beats an error page.
 *
 * An HTTP error is a response, not a failure, and reaches the page as
 * sent.
 */
function shellNavigate(event) {
  const network = (async () => {
    const preloaded = await event.preloadResponse
    return preloaded || fetch(event.request)
  })()
  // The preload must be waited on, or the browser cancels it and warns;
  // an abandoned one is waited on here instead of by the race. A failure
  // is handled below, so it is never reported as unhandled.
  event.waitUntil(network.then(() => undefined, () => undefined))

  return (async () => {
    let timer
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => resolve(SHELL_TOO_SLOW), SHELL_NAVIGATION_DEADLINE_MS)
    })
    try {
      const first = await Promise.race([network, deadline])
      if (first !== SHELL_TOO_SLOW) return first
      const offline = await shellOfflineScreen()
      return offline || (await network)
    } catch (error) {
      // No connection (or the server cannot be reached at all).
      const offline = await shellOfflineScreen()
      if (offline) return offline
      throw error
    } finally {
      clearTimeout(timer)
    }
  })()
}

/** A built file: the cached copy, or the network, keeping what it sends. */
async function shellBuiltFile(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached) return cached
  // Section 14 rule 4: a built file whose answer never begins is given up
  // on, and the page sees a failed load, not a hang.
  const response = await shellFetchWithDeadline(request)
  // Only a whole, successful answer from this site is kept.
  if (response.status === 200 && response.type === "basic") {
    cache.put(request, response.clone()).catch(() => {})
  }
  return response
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(shellNavigate(event))
    return
  }
  if (SHELL_CACHED_PATH.test(url.pathname)) {
    event.respondWith(shellBuiltFile(request))
  }
  // Everything else is not answered here, so the browser fetches it as
  // if this worker did not exist.
})
