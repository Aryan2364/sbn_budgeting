"use client"

import * as React from "react"

import { KeyboardInsetSync } from "@/lib/keyboard"
import {
  LAYOUT_COOKIE,
  PHONE_SHORT_SIDE,
  type Layout,
  type WidthBand,
} from "@/lib/layout-shared"

/**
 * Section 41.2: which layout a device gets, and the width band inside it.
 *
 * THIS IS THE ONE PLACE THAT MEASURES THE SCREEN (41.2 rule 2). The
 * board's availability, the shell's docked or overlaid sidebar and every
 * phone variant of a component (41.3 rule 4) ask useLayout(); none of
 * them calls matchMedia or reads `screen` itself. Two measurements that
 * disagree by one resize event give a screen half in one layout and half
 * in the other.
 *
 * TWO ANSWERS, MEASURED FROM DIFFERENT THINGS, ON PURPOSE:
 *
 *   - THE LAYOUT comes from the SCREEN's shorter side AND the main
 *     pointer (41.2 rule 1), never the window. A narrow browser window on
 *     a computer is still a computer, and keeps the desktop layout and
 *     section 9. A phone turned sideways still has a short side under
 *     600, so it stays a phone. The pointer is needed because the screen
 *     is measured in CSS pixels, which display scaling shrinks: a
 *     1366x768 laptop at 150% reports 911x512. Its main pointer is a
 *     mouse or trackpad, so it keeps the desktop layout - and since the
 *     cookie only ever holds this measured answer, a scaled computer can
 *     never have "phone" saved for it.
 *   - THE BAND comes from the VIEWPORT width (section 9): desktop at 1280
 *     and above, laptop from 1024, tablet from 768, narrow below that.
 *     Inside the phone layout it is almost always narrow; it exists for
 *     the desktop layout's own breakpoints.
 *
 * THE FIRST PAINT IS THE SERVER'S GUESS (41.2 rule 3). The root layout
 * reads it in lib/layout.server.ts and hands it to LayoutProvider as
 * `initial`. useLayout() answers with that guess while hydrating, so the
 * markup matches the server's, and React then applies the measured answer
 * once. That is the one correction the rule allows; after it the cookie
 * holds the measured answer and the server guesses right from then on.
 */

const YEAR = 60 * 60 * 24 * 365

type Snapshot = { layout: Layout; band: WidthBand }

/*
 * One snapshot object per answer, kept until the answer changes.
 * useSyncExternalStore compares snapshots by reference, so a fresh object
 * on every read would re-render every caller on every read, for ever.
 */
let current: Snapshot | null = null
const listeners = new Set<() => void>()
let detach: (() => void) | null = null

/*
 * Touch first: the MAIN pointer is a finger ((pointer: coarse), not
 * any-pointer - a touchscreen laptop's main pointer is still its
 * trackpad), or the browser says it is a mobile device (the mobile client
 * hint, as read by the page).
 */
const TOUCH_FIRST = "(pointer: coarse)"

function isTouchFirst() {
  const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData?.mobile
  return window.matchMedia(TOUCH_FIRST).matches || hint === true
}

function measure(): Snapshot {
  const shortSide = Math.min(window.screen.width, window.screen.height)
  const layout: Layout =
    shortSide < PHONE_SHORT_SIDE && isTouchFirst() ? "phone" : "desktop"
  const band: WidthBand = window.matchMedia("(min-width: 1280px)").matches
    ? "desktop"
    : window.matchMedia("(min-width: 1024px)").matches
      ? "laptop"
      : window.matchMedia("(min-width: 768px)").matches
        ? "tablet"
        : "narrow"
  return { layout, band }
}

/** Re-measures, replacing the snapshot only when an answer changed. */
function refresh() {
  const next = measure()
  if (current && current.layout === next.layout && current.band === next.band) return false
  current = next
  return true
}

function notify() {
  if (refresh()) listeners.forEach((listener) => listener())
}

/*
 * One set of window listeners however many components ask. A foldable
 * being unfolded changes the screen mid-use (41.2 rule 3): the snapshot
 * changes, every caller re-renders in place, and nothing remounts, so the
 * screen and anything typed into it survive the switch.
 */
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!detach) {
    window.addEventListener("resize", notify)
    // screen.orientation is missing on older iPhones; the window event
    // covers them.
    window.screen.orientation?.addEventListener("change", notify)
    window.addEventListener("orientationchange", notify)
    // A tablet that gains or loses a keyboard and trackpad changes its
    // main pointer without any resize.
    const pointer = window.matchMedia(TOUCH_FIRST)
    pointer.addEventListener("change", notify)
    detach = () => {
      window.removeEventListener("resize", notify)
      window.screen.orientation?.removeEventListener("change", notify)
      window.removeEventListener("orientationchange", notify)
      pointer.removeEventListener("change", notify)
    }
    // The screen may have changed while nothing was listening.
    notify()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && detach) {
      detach()
      detach = null
    }
  }
}

function getSnapshot(): Snapshot {
  // Unwatched, the cached answer may be stale; watched, it is current.
  if (!detach || !current) refresh()
  return current as Snapshot
}

/*
 * The server's guess, as a snapshot. Fixed objects, for the same
 * reference reason as above. A phone guess is narrow: a phone's viewport
 * is under 768 wide in either orientation.
 */
const SERVER_DESKTOP: Snapshot = { layout: "desktop", band: "desktop" }
const SERVER_PHONE: Snapshot = { layout: "phone", band: "narrow" }

const InitialLayoutContext = React.createContext<Layout>("desktop")

function useMeasured(initial: Layout): Snapshot {
  return React.useSyncExternalStore(subscribe, getSnapshot, () =>
    initial === "phone" ? SERVER_PHONE : SERVER_DESKTOP
  )
}

/**
 * The layout and width band, for any client component.
 *
 * On the server and while hydrating it answers with the server's guess;
 * from then on with the measured screen and viewport.
 */
function useLayout(): { layout: Layout; band: WidthBand } {
  return useMeasured(React.useContext(InitialLayoutContext))
}

function readCookie(): string | undefined {
  try {
    const prefix = `${LAYOUT_COOKIE}=`
    return document.cookie
      .split("; ")
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length)
  } catch {
    return undefined
  }
}

/*
 * iPhone Safari does not apply :active styles on a tap unless some touch
 * listener exists on the page. On phone the pressed state is the only
 * feedback a tap gets (41.9 rule 1, 41.14 rule 2), so without this a tap
 * on iPhone shows nothing at all. Passive and empty, so it never delays
 * scrolling and does nothing else.
 */
function enableActiveOnTouch() {}

/**
 * Mounted once, in the root layout, inside <body>. `initial` is the
 * server's guess from getInitialLayout().
 *
 * It corrects data-layout on the html element when the measured layout
 * differs from the guess, and keeps the layout cookie holding the
 * measured answer, so the next request is guessed right (41.2 rule 3).
 */
function LayoutProvider({
  initial,
  children,
}: {
  initial: Layout
  children: React.ReactNode
}): React.ReactNode {
  const { layout } = useMeasured(initial)

  // A layout effect, so the phone token values (41.9) switch in the same
  // frame as the React tree rather than one paint after it.
  React.useLayoutEffect(() => {
    // Read the store, not `layout`: while hydrating, `layout` is still
    // the server's guess, and the cookie must only ever hold the
    // measured answer.
    const measured = getSnapshot().layout
    const root = document.documentElement
    if (root.dataset.layout !== measured) root.dataset.layout = measured
    if (readCookie() !== measured) {
      try {
        document.cookie = `${LAYOUT_COOKIE}=${measured}; path=/; max-age=${YEAR}; samesite=lax`
      } catch {}
    }
  }, [layout])

  React.useEffect(() => {
    document.addEventListener("touchstart", enableActiveOnTouch, { passive: true })
    return () => document.removeEventListener("touchstart", enableActiveOnTouch)
  }, [])

  // createElement rather than JSX: the contract fixes this file as .ts.
  return React.createElement(
    InitialLayoutContext.Provider,
    { value: initial },
    children,
    // 41.13 rule 6: the keyboard is tracked only where a phone's fixed
    // bars need to sit above it.
    layout === "phone" ? React.createElement(KeyboardInsetSync) : null
  )
}

export {
  LAYOUT_COOKIE,
  PHONE_SHORT_SIDE,
  LayoutProvider,
  useLayout,
  type Layout,
  type WidthBand,
}
