/*
 * The names lib/layout.ts (the browser) and lib/layout.server.ts (the
 * server's first guess) must agree on, written once (section 4 rule 2).
 *
 * This file has no "use client" on purpose. Every value a "use client"
 * module exports reaches a server module as a client reference rather
 * than the value itself, so the cookie's name cannot live in
 * lib/layout.ts and still be read by lib/layout.server.ts.
 */

type Layout = "phone" | "desktop"

/** Section 9, by viewport width: >=1280, 1024-1279, 768-1023, <768. */
type WidthBand = "desktop" | "laptop" | "tablet" | "narrow"

/** The cookie the server reads before any hint (41.2 rule 3). */
const LAYOUT_COOKIE = "layout"

/** 41.2 rule 1: a touch-first screen whose shorter side is under this is a phone. */
const PHONE_SHORT_SIDE = 600

export { LAYOUT_COOKIE, PHONE_SHORT_SIDE, type Layout, type WidthBand }
