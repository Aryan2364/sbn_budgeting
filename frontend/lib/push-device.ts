"use client"

/**
 * TEMPORARY MERGE SHIM — Phase 6b (push, frontend), 13 Oct 2026.
 *
 * lib/install.ts (Phase 5, built in a separate worktree by the install
 * agent) is the kit's one place for `isInstalledApp`, `detectPlatform`
 * and `onInstalledAppChange` (section 4 rule 2: one installed check, one
 * platform detection). It does not exist yet in THIS worktree, so
 * lib/push.ts needs its own copy to compile and run until the branches
 * merge.
 *
 * ON MERGE: delete this file, re-point lib/push.ts's import at
 * "@/lib/install", and confirm lib/install.ts exports the same three
 * names with the same behaviour (it is ported from the same kit commit,
 * 66f1d28, so it should). Do not keep both.
 */

type InstallPlatform = "ios" | "android" | "other"

/** The media query for an app opened from the home screen. */
const STANDALONE = "(display-mode: standalone)"

/**
 * The page is open as the installed app: opened from the home screen
 * (display-mode standalone), or navigator.standalone, which older
 * iPhones report instead. Browser only.
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
 * Calls `onChange` when the page starts or stops being the installed
 * app (opened from the home screen). Returns the function that stops
 * it. Browser only.
 */
function onInstalledAppChange(onChange: () => void): () => void {
  const query = window.matchMedia(STANDALONE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

export { isInstalledApp, detectPlatform, onInstalledAppChange }
export type { InstallPlatform }
