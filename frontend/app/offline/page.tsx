import type { Metadata } from "next"

import { OfflineScreen } from "@/components/ui/connection-banner"
import { PRODUCT } from "@/lib/product"
import { PHONE_WORDS } from "@/lib/phone-words"

/**
 * The offline screen - section 41.14 rules 9 and 10, 41.20 check 20.
 *
 * The service worker (public/sw.js) caches this page when it installs and
 * answers with it whenever a navigation finds no connection or has not
 * answered within 8 seconds, so the installed app opens offline to this,
 * never to the browser's error page. The page itself is
 * components/ui/connection-banner.tsx's OfflineScreen: a static app bar
 * with the product name (the screen's h1; no back arrow, no actions and
 * no tab bar, since each of them needs the network), then the offline
 * banner and the failed empty state with "Try again".
 *
 * STATIC, ON PURPOSE. It is prerendered once at build time
 * (force-static), so it can be cached and served with no server: the root
 * layout's cookies() and headers() read as empty here, its layout guess
 * is "desktop", and nothing about the person is in it. The browser
 * corrects the layout once it runs, as on any page (41.2 rule 3); the
 * screen is drawn the same in both. Its HTML changes exactly when a new
 * release is built, which is also how lib/service-worker.ts tells
 * releases apart.
 *
 * Gujarati words (plan-phone D7): read from PHONE_WORDS even though the
 * layout guess here is always "desktop" (static rendering), because every
 * phone that ever sees this screen is, in fact, a phone; the words are
 * shown regardless of the server's static guess, matching how a phone
 * screen always reads Gujarati (D9).
 *
 * OUTSIDE (app). RequireSession never wraps it, so it is reachable
 * without sign-in (plan-phone instructions): Tracking signs in
 * client-side via localStorage, and the offline screen must open with no
 * session at all.
 */
export const dynamic = "force-static"

export const metadata: Metadata = { title: "Sadbhavna" }

export default function OfflinePage() {
  return <OfflineScreen product={PRODUCT} text={PHONE_WORDS.connection} />
}
