"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"

/**
 * Section 41.12 rule 8: installing the app on the home screen.
 *
 *   const install = useInstall()
 *   if (install.ready && !install.installed) ... // offer "Install app" in More
 *   const outcome = await install.prompt()        // the browser's own question
 *
 * WHAT IT ANSWERS
 *
 *   - canPrompt: the browser can ask its own install question. Only
 *     Chrome-based browsers (Chrome, Edge, Samsung Internet on Android)
 *     offer it, through the beforeinstallprompt event, kept here.
 *   - installed: the app is installed. Certain where it is open as the
 *     installed app (isInstalledApp: display-mode standalone, or
 *     navigator.standalone on iPhone), and once the browser reports
 *     appinstalled. In a browser tab after installing, the browser stops
 *     offering its question (Chrome sends no beforeinstallprompt for an
 *     installed app), so an install this browser reported is remembered,
 *     and forgotten the moment the browser offers its question again (the
 *     app was removed). Where the browser reports nothing - Safari on
 *     iPhone, in a tab - it cannot be known, and installed stays false.
 *   - platform: "ios", "android" or "other" (detectPlatform), for which
 *     steps to show where the browser cannot ask itself
 *     (install-sheet.tsx).
 *   - ready: false on the server, while the page hydrates, and always on
 *     desktop, when none of this is known. Nothing is offered until it is
 *     true, so the installed app never shows its install button and then
 *     removes it.
 *   - prompt(): asks the browser's own question, once. "accepted" or
 *     "dismissed" is the person's answer; "unavailable" means the browser
 *     cannot ask (any more): show the browser's own steps instead.
 *
 * IT NEVER SHOWS ANYTHING BY ITSELF (41.12 rule 8: More only, never a
 * pop-up). Chrome on Android shows its own install banner unless the page
 * takes the beforeinstallprompt event; this file takes it on phone, so
 * the only place the offer appears there is the button in More.
 *
 * PHONE ONLY (stage 6 decision 1). Nothing runs when this module loads.
 * The browser's install question is listened for only while the layout is
 * phone - while <InstallPromptCapture /> or useInstall() is mounted in the
 * phone layout - and the listener is removed the moment the layout
 * becomes desktop (a foldable unfolded). On desktop a beforeinstallprompt
 * is never taken or prevented, so the desktop browser's own install
 * handling is exactly as it was.
 *
 * MOUNT EARLY. The browser sends beforeinstallprompt once per page load,
 * soon after the page opens - often before the person reaches More. So
 * <InstallPromptCapture /> is rendered once, in the root layout, and
 * starts listening as soon as the page runs in the phone layout. An event
 * sent before that is missed, and More falls back to the browser's own
 * steps.
 *
 * ONE INSTALLED CHECK, ONE PLATFORM DETECTION (section 4 rule 2):
 * isInstalledApp(), detectPlatform() and onInstalledAppChange() are
 * exported for lib/push.ts, which needs the same answers. Browser only:
 * call them from an effect, an event handler or a store snapshot, never
 * while rendering on the server.
 */

type InstallPlatform = "ios" | "android" | "other"
type InstallOutcome = "accepted" | "dismissed" | "unavailable"

/** Chrome's event; not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

type InstallSnapshot = {
  ready: boolean
  canPrompt: boolean
  installed: boolean
  platform: InstallPlatform
}

type InstallApi = InstallSnapshot & {
  prompt: () => Promise<InstallOutcome>
}

const NOT_KNOWN: InstallSnapshot = Object.freeze({
  ready: false,
  canPrompt: false,
  installed: false,
  platform: "other",
})

/** localStorage: this browser reported the app installed. */
const REMEMBERED = "install|installed"

/** The media query for an app opened from the home screen. */
const STANDALONE = "(display-mode: standalone)"

/* ------------------------------------------------------------------
   The one installed check and the one platform detection.
   ------------------------------------------------------------------ */

/**
 * The page is open as the installed app: opened from the home screen
 * (display-mode standalone), or navigator.standalone, which older iPhones
 * report instead. Browser only.
 */
function isInstalledApp(): boolean {
  const iPhoneStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iPhoneStandalone || window.matchMedia(STANDALONE).matches
}

/** Which phone this is: "ios" (iPhone and iPad), "android" or "other". Browser only. */
function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; a Mac has no touch points.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios"
  }
  if (/Android/i.test(ua)) return "android"
  return "other"
}

/**
 * Calls `onChange` when the page starts or stops being the installed app
 * (opened from the home screen). Returns the function that stops it.
 * Browser only.
 */
function onInstalledAppChange(onChange: () => void): () => void {
  const query = window.matchMedia(STANDALONE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/* ------------------------------------------------------------------
   The install question: listened for only while held in the phone layout.
   ------------------------------------------------------------------ */

let platform: InstallPlatform = "other"
/** The browser's install question, kept until it is asked (it can be asked once). */
let deferred: BeforeInstallPromptEvent | null = null
/** The browser reported an install while this page was open. */
let installedNow = false
/*
 * One snapshot object per answer, replaced only when the answer changes:
 * useSyncExternalStore compares snapshots by reference.
 */
let snapshot: InstallSnapshot = NOT_KNOWN
const listeners = new Set<() => void>()

/** How many phone-layout parts hold the listener now (InstallPromptCapture, useInstall). */
let holders = 0
/** Removes the listeners; null while nothing holds them. */
let detach: (() => void) | null = null

/* Storage that fails never breaks anything: unreadable reads as "not installed". */
function readRemembered(): boolean {
  try {
    return window.localStorage.getItem(REMEMBERED) === "1"
  } catch {
    return false
  }
}

function writeRemembered(installed: boolean) {
  try {
    if (installed) window.localStorage.setItem(REMEMBERED, "1")
    else window.localStorage.removeItem(REMEMBERED)
  } catch {
    // Private browsing or a full quota: the button may show once too often.
  }
}

function publish(next: InstallSnapshot) {
  if (
    next.ready === snapshot.ready &&
    next.canPrompt === snapshot.canPrompt &&
    next.installed === snapshot.installed &&
    next.platform === snapshot.platform
  ) {
    return
  }
  snapshot = next
  for (const listener of listeners) listener()
}

function update() {
  if (!detach) {
    publish(NOT_KNOWN)
    return
  }
  const installed = isInstalledApp() || installedNow || (deferred === null && readRemembered())
  publish({
    ready: true,
    canPrompt: deferred !== null && !installed,
    installed,
    platform,
  })
}

function attach(): () => void {
  platform = detectPlatform()

  const onPrompt = (event: Event) => {
    // Never the browser's own banner on phone: the offer lives in More only.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    // The browser offers to install, so the app is not installed (or was
    // removed since this browser last reported it).
    installedNow = false
    writeRemembered(false)
    update()
  }

  const onInstalled = () => {
    deferred = null
    installedNow = true
    writeRemembered(true)
    update()
  }

  window.addEventListener("beforeinstallprompt", onPrompt)
  window.addEventListener("appinstalled", onInstalled)
  const stopWatching = onInstalledAppChange(update)

  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt)
    window.removeEventListener("appinstalled", onInstalled)
    stopWatching()
    // A question kept for the phone layout is not carried into desktop.
    deferred = null
  }
}

/**
 * Starts listening, or keeps listening, while the caller holds it. Called
 * only in the phone layout. Returns the release: once nothing holds it,
 * the listeners are removed and the answers go back to "not known".
 */
function hold(): () => void {
  holders += 1
  if (holders === 1) {
    detach = attach()
    update()
  }
  let released = false
  return () => {
    if (released) return
    released = true
    holders -= 1
    if (holders === 0 && detach) {
      detach()
      detach = null
      update()
    }
  }
}

/** Asks the browser's own install question, where it can. */
async function prompt(): Promise<InstallOutcome> {
  const event = deferred
  if (!event) return "unavailable"
  // The question can be asked once; whatever the answer, it is spent.
  deferred = null
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    if (outcome === "accepted") {
      // appinstalled follows once the phone has added the app; the button
      // goes now, at the yes.
      installedNow = true
      writeRemembered(true)
    }
    update()
    return outcome
  } catch {
    update()
    return "unavailable"
  }
}

function getSnapshot() {
  return snapshot
}

function getNotKnown() {
  return NOT_KNOWN
}

/**
 * Whether the app can be installed, and how. Shows nothing by itself. On
 * desktop it never listens and answers with ready false.
 */
function useInstall(): InstallApi {
  const phone = useLayout().layout === "phone"
  const subscribe = React.useCallback(
    (listener: () => void) => {
      listeners.add(listener)
      const release = phone ? hold() : null
      return () => {
        listeners.delete(listener)
        release?.()
      }
    },
    [phone]
  )
  const state = React.useSyncExternalStore(subscribe, phone ? getSnapshot : getNotKnown, getNotKnown)
  return React.useMemo(() => ({ ...state, prompt }), [state])
}

/**
 * Renders nothing. Mounted once in the root layout, it listens for the
 * browser's install question from the moment the page runs in the phone
 * layout (MOUNT EARLY above), and stops when the layout becomes desktop.
 */
function InstallPromptCapture() {
  const phone = useLayout().layout === "phone"
  React.useEffect(() => (phone ? hold() : undefined), [phone])
  return null
}

export { useInstall, InstallPromptCapture, isInstalledApp, detectPlatform, onInstalledAppChange }
export type { InstallApi, InstallOutcome, InstallPlatform }
