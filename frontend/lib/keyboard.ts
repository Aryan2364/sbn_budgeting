"use client"

import * as React from "react"

/**
 * Section 41.13 rule 6 - the on-screen keyboard, measured once for both
 * phones.
 *
 * Three things need to know about the keyboard: the action bar sits
 * directly above it (41.7 rule 4), the tab bar hides while it is open
 * (41.4 rule 19), and a sheet with a field sits above it and shrinks to
 * the space left (41.8 rule 4). Rule 6 says one shared hook serves all
 * of them, so they can never disagree about whether the keyboard is up.
 *
 * WHY THE TWO PHONES NEED DIFFERENT MEASUREMENTS.
 *
 *   - Android honours interactive-widget=resizes-content (app/layout.tsx),
 *     so the keyboard shrinks the layout viewport itself. A fixed bar at
 *     bottom: 0 already sits above it and the inset is about 0, but the
 *     keyboard is still OPEN, and only a drop in the visible height says
 *     so.
 *   - iPhone ignores that setting. The layout viewport keeps its height
 *     and the keyboard covers its bottom, so the covered part is measured
 *     from window.visualViewport and handed to CSS as --keyboard-inset.
 *
 * A KEYBOARD ALREADY OPEN WHEN MEASURING STARTS (Android). The drop is
 * measured from the tallest visible height seen in this orientation. The
 * one screen that opens with a field in focus, the search page (41.7 rule
 * 17), can be the first screen this tracker ever measures: opened from a
 * link, reloaded, the installed app reopened onto it, or the layout
 * switching to phone with it open. Its keyboard may then be up before the
 * first measurement, the "tallest" learned is the keyboard-shrunk height,
 * and the keyboard reads as closed. So the starting height is not only
 * what is visible now - see startingTallest() below for how it is found
 * and where it can still be wrong.
 *
 * KeyboardInsetSync is the only writer. LayoutProvider (lib/layout.ts)
 * mounts it once, in the phone layout only, so on desktop nothing
 * listens and useKeyboard() stays closed.
 */

type KeyboardState = { open: boolean; inset: number }

const CLOSED: KeyboardState = { open: false, inset: 0 }

/**
 * Below this many CSS px of covered layout viewport, the gap is not a
 * keyboard: rounding of the fractional visualViewport values and Safari's
 * toolbar settling leave a few pixels. iOS's shortcut bar, shown alone
 * when a hardware keyboard is attached, covers about 45 to 55px and is
 * above it, so the action bar clears that bar too.
 */
const INSET_MIN = 40

/**
 * How far the visible height must fall below the tallest seen in this
 * orientation to count as the keyboard. The browser's address bar
 * sliding in and out moves it by about 50 to 100px, which must not
 * count; the smallest on-screen keyboard, a phone held sideways, takes
 * about 200px, which must.
 */
const DROP_MIN = 150

/**
 * The most the phone's and browser's own bars can take from the screen's
 * available height while the keyboard is closed: the status bar (about
 * 24px) and the three-button navigation bar (about 48px), where the
 * screen reports them as available, plus the browser's address bar (56px)
 * and a bottom toolbar some browsers add (about 50px). Generous on
 * purpose: a guess built from it must never read a closed keyboard as
 * open. Used only when nothing has been measured yet (startingTallest).
 */
const SCREEN_CHROME_MAX = 150

/**
 * Where the tallest visible height per orientation is kept for the rest of
 * the browser tab's session, so a reload, or a page opened in the same
 * tab, starts from a real measurement. Per tab, not for ever: a new
 * session (a new tab, the installed app reopened) measures afresh.
 */
const TALLEST_KEY = "keyboard|tallest"

function readStoredTallest(widthKey: number): number | null {
  try {
    const raw = window.sessionStorage.getItem(TALLEST_KEY)
    if (!raw) return null
    const value = (JSON.parse(raw) as Record<string, unknown>)[String(widthKey)]
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function writeStoredTallest(widthKey: number, tallest: number) {
  try {
    const raw = window.sessionStorage.getItem(TALLEST_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    if (all[String(widthKey)] === tallest) return
    all[String(widthKey)] = tallest
    window.sessionStorage.setItem(TALLEST_KEY, JSON.stringify(all))
  } catch {
    // Storage blocked or full: the next session measures afresh.
  }
}

/**
 * The visible height to measure the drop from when an orientation is
 * first seen, and whether it is PROVISIONAL (not measured on this page
 * with the keyboard known to be closed).
 *
 *   1. What is visible now, always: it is a real lower bound.
 *   2. The tallest kept for this width in this tab's session
 *      (TALLEST_KEY): a real measurement, but from an earlier page.
 *   3. Only while a text field is already focused, so the keyboard may
 *      already be up, and only when the window spans the screen's full
 *      width (the same orientation, not side by side with another app): a
 *      guess from the screen, its available height less the most the
 *      bars can take (SCREEN_CHROME_MAX). Upright, any on-screen keyboard
 *      (about 250px or more) takes the visible height well below it, and
 *      a closed one never does.
 *
 * 2 and 3 are provisional: the first measurement with no text field
 * focused, when the keyboard is closed, replaces them with what is then
 * visible, and from then on only real heights count. That keeps a stale
 * or wrong starting value from lasting: after a split screen started, say,
 * where the window is shorter than anything remembered.
 *
 * WHERE IT CAN STILL BE WRONG.
 *   - A first-ever measurement with a field already focused, held
 *     SIDEWAYS: the screen's available height is then small and the
 *     keyboard's share of it is not reliably above the margin, so the
 *     guess may miss it. The phone is upright only (41.13 rule 8), so
 *     this is accepted.
 *   - Android in split screen, top and bottom, with a field focused when
 *     measuring starts: the guess (full screen height) reads the keyboard
 *     as open until the field loses focus once. Only the tab bar and the
 *     add button hide meanwhile, and both come back on the next blur.
 *   - A browser that reports the screen's height as something other than
 *     the device's CSS height (some older WebViews): the guess is then
 *     skipped or too low, which errs towards "closed", as before.
 * iPhone does not depend on this: there the covered height
 * (visualViewport) says the keyboard is open by itself.
 */
function startingTallest(
  visible: number,
  width: number,
  widthKey: number
): { tallest: number; provisional: boolean } {
  let tallest = visible
  let provisional = false
  const stored = readStoredTallest(widthKey)
  if (stored !== null && stored > tallest) {
    tallest = stored
    provisional = true
  }
  if (isTextEntry(document.activeElement)) {
    const screen = window.screen
    const fullWidth = Math.abs((screen?.availWidth ?? 0) - width) <= 2
    const guess = fullWidth ? (screen?.availHeight ?? 0) - SCREEN_CHROME_MAX : 0
    if (guess > tallest) {
      tallest = guess
      provisional = true
    }
  }
  return { tallest, provisional }
}

/**
 * Inputs whose type opens no keyboard. Every other input type is text
 * entry. date and time are included as text entry on purpose: the
 * measurement, not the type, then decides whether anything covered the
 * screen, because the phone's own pickers differ by phone and version.
 */
const NOT_TEXT = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
  "hidden",
])

function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLInputElement) {
    return !NOT_TEXT.has(el.type) && !el.readOnly && !el.disabled
  }
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  return el instanceof HTMLElement && el.isContentEditable
}

/**
 * The store. One module-level snapshot, replaced (never mutated) on each
 * change, so useSyncExternalStore sees a stable reference between
 * changes and React re-renders only when the answer actually moved.
 */
let snapshot: KeyboardState = CLOSED
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function getSnapshot() {
  return snapshot
}

function getServerSnapshot() {
  return CLOSED
}

function publish(next: KeyboardState) {
  if (next.open === snapshot.open && next.inset === snapshot.inset) return
  snapshot = next.open ? next : CLOSED
  listeners.forEach((listener) => listener())
}

/**
 * Whether the on-screen keyboard is open, and how many CSS px of the
 * layout viewport it covers (iPhone; about 0 on Android, where the
 * viewport shrinks instead). Always closed in the desktop layout and on
 * the server.
 */
function useKeyboard(): KeyboardState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Measures the keyboard and keeps <html> in step with it:
 *
 *   - --keyboard-inset, the covered height ("0px" when closed), which
 *     fixed bottom bars and sheets use as their bottom offset;
 *   - data-keyboard="open" while it is open, which hides the tab bar.
 *
 * Both are removed on unmount, so globals.css's default of 0px applies
 * again.
 */
function KeyboardInsetSync(): null {
  React.useEffect(() => {
    const root = document.documentElement
    // The tallest visible height seen, per orientation. Keyed on width,
    // so turning the phone starts a fresh memory instead of comparing a
    // sideways height against an upright one.
    let widthKey = -1
    let tallest = 0
    // The starting height was remembered or guessed, not measured here
    // with the keyboard closed (startingTallest).
    let provisional = false
    // What was last kept in sessionStorage, so it is written only when it
    // changes, not on every frame of a scroll.
    let kept = ""
    let frame = 0

    const write = (next: KeyboardState) => {
      // Section 1 rule 2 forbids inline styles for colour, spacing and
      // typography. This is none of those: it is a runtime measurement
      // of the keyboard, and one CSS variable on <html> is the only way
      // to hand a measurement to CSS (41.13 rule 6). The bars' spacing
      // stays in globals.css.
      root.style.setProperty("--keyboard-inset", `${next.inset}px`)
      if (next.open) root.setAttribute("data-keyboard", "open")
      else root.removeAttribute("data-keyboard")
      publish(next)
    }

    const measure = () => {
      frame = 0
      const vv = window.visualViewport
      const scale = vv?.scale ?? 1
      // Multiplying by scale undoes pinch zoom, which shrinks the visual
      // viewport in CSS px without anything covering the screen.
      const visible = (vv?.height ?? window.innerHeight) * scale
      const width = Math.round((vv?.width ?? window.innerWidth) * scale)

      const focused = isTextEntry(document.activeElement)
      if (width !== widthKey) {
        widthKey = width
        ;({ tallest, provisional } = startingTallest(visible, width, widthKey))
      } else if (provisional && !focused) {
        // Nothing focused, so no keyboard: what is visible now is the
        // real height, and replaces the remembered or guessed one.
        tallest = visible
        provisional = false
      } else if (visible > tallest) {
        tallest = visible
        provisional = false
      }
      // Only measured heights are kept for the next page in this tab.
      if (!provisional && kept !== `${widthKey}:${tallest}`) {
        kept = `${widthKey}:${tallest}`
        writeStoredTallest(widthKey, tallest)
      }

      // The layout viewport's bottom minus the visual viewport's bottom:
      // the part of the page the keyboard covers on iPhone. While pinch
      // zoomed, the visual viewport is a small window that can sit
      // anywhere on the page, so its bottom says nothing about the
      // keyboard; then the covered height is what the unzoomed visible
      // height falls short of the layout viewport.
      const zoomed = scale > 1.01
      const covered = !vv
        ? 0
        : Math.max(
            0,
            Math.round(
              zoomed
                ? window.innerHeight - visible
                : window.innerHeight - (vv.height + vv.offsetTop)
            )
          )

      // Both signals are needed. On iPhone the covered height falls to 0
      // when the page is scrolled to its very bottom with the keyboard
      // up, but the visible height stays dropped; on Android only the
      // drop is ever there.
      const open = focused && (covered > INSET_MIN || tallest - visible > DROP_MIN)

      const next = open ? { open: true, inset: covered } : CLOSED
      if (next.open !== snapshot.open || next.inset !== snapshot.inset) write(next)
    }

    // One measurement per frame, however many events arrive. On focusout
    // this also waits for the next frame, when focus has usually landed
    // on the next field and the keyboard is staying up.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    const vv = window.visualViewport
    vv?.addEventListener("resize", schedule)
    vv?.addEventListener("scroll", schedule)
    window.addEventListener("resize", schedule)
    document.addEventListener("focusin", schedule)
    document.addEventListener("focusout", schedule)

    write(CLOSED)
    measure()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv?.removeEventListener("resize", schedule)
      vv?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      document.removeEventListener("focusin", schedule)
      document.removeEventListener("focusout", schedule)
      root.style.removeProperty("--keyboard-inset")
      root.removeAttribute("data-keyboard")
      publish(CLOSED)
    }
  }, [])

  return null
}

export { useKeyboard, KeyboardInsetSync }
export type { KeyboardState }
