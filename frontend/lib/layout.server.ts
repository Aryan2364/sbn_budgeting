import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { LAYOUT_COOKIE, type Layout } from "@/lib/layout-shared"

/*
 * Server only: next/headers throws if this is ever reached from a client
 * component, which is the guard ("server-only" is not installed, and
 * section 1 rule 10 forbids adding it unasked).
 */

/*
 * The user agent, for browsers that send no mobile hint (Safari,
 * Firefox). An iPad and an Android tablet (Android without "Mobile") are
 * deliberately not matched: a tablet keeps the desktop layout (41.2 rule
 * 1). iPadOS also reports itself as a Mac, so it never matches anyway.
 */
function isPhoneUserAgent(ua: string) {
  return (
    /iPhone|iPod|Windows Phone|Opera Mini|IEMobile/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua)) ||
    (/Firefox/i.test(ua) && /Mobile/i.test(ua))
  )
}

/**
 * Section 41.2 rule 3: the server's first guess at the layout, so the
 * first paint is already the right one.
 *
 *   1. The layout cookie, which LayoutProvider writes with the measured
 *      answer. Once a device has been measured, it wins.
 *   2. Sec-CH-UA-Mobile, sent by Chromium browsers: "?1" phone, "?0" not.
 *   3. The user agent, where no hint was sent.
 *   4. Desktop.
 *
 * A wrong guess (a foldable, a small tablet) is corrected once in the
 * browser and never again, because the cookie then holds the answer.
 *
 * The root layout calls this for the first paint. A route whose address
 * means something different per layout may call it too, so it decides
 * from the same guess: a phone-only address redirects a desktop guess to
 * its desktop form through redirectOnDesktop below (41.2 rule 5). Nothing
 * else should need it; a component asks useLayout(). Reading cookies and headers makes
 * every route render per request, which is accepted: the layout is a
 * fact about the request.
 */
async function getInitialLayout(): Promise<Layout> {
  const saved = (await cookies()).get(LAYOUT_COOKIE)?.value
  if (saved === "phone" || saved === "desktop") return saved

  const request = await headers()
  const hint = request.get("sec-ch-ua-mobile")
  if (hint === "?1") return "phone"
  if (hint === "?0") return "desktop"

  return isPhoneUserAgent(request.get("user-agent") ?? "") ? "phone" : "desktop"
}

/**
 * Section 41.2 rule 5, on the server: a phone-only address (More, the
 * phone search page, personal settings) opens its desktop form on a
 * computer. The server decides from its guess at the layout (41.2 rule 3,
 * the same one the root layout uses), so a desktop never paints the phone
 * screen at all: the response is a redirect. Where the guess turns out
 * wrong on the device, PhoneOnly (components/shell/phone-only.tsx)
 * corrects it in the browser.
 *
 * Call it at the top of the route's page, before rendering anything.
 */
async function redirectOnDesktop(desktopHref: string): Promise<void> {
  if ((await getInitialLayout()) === "desktop") redirect(desktopHref)
}

export { getInitialLayout, redirectOnDesktop }
