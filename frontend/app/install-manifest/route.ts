import type { MetadataRoute } from "next"

import { INSTALL_ICONS } from "@/lib/install-icon"
import { APP_NAME, APP_SHORT_NAME, INSTALL_COLOURS } from "@/lib/install-settings"

/**
 * The web app manifest - section 41.12 rules 7 and 9, 41.13 rule 9 - at
 * /install-manifest.
 *
 * WHY A ROUTE HANDLER AND NOT NEXT'S app/manifest.ts. The file convention
 * links the manifest from every page's head, on a computer too, where
 * desktop Chrome would then offer "Install" in its address bar and an
 * Android tablet installing it would be locked upright. Served from
 * here, it is linked only when the server guesses phone (app/layout.tsx's
 * generateMetadata). The address is deliberately not
 * /manifest.webmanifest: Next treats that name as its own metadata route.
 *
 *   - name and short_name: Sadbhavna's own, from lib/install-settings.ts.
 *   - start_url: where the installed app opens, the phone's home, My
 *     work (plan-phone D3, 41.15).
 *   - display "standalone", never "fullscreen" (41.12 rule 7).
 *   - orientation "portrait" (41.12 rule 7, 41.13 rules 8 and 9). iPhone
 *     ignores it.
 *   - theme_color = --primary, background_color = --surface, through
 *     lib/install-settings.ts (41.12 rule 9, section 1 rule 1's
 *     exception).
 *   - icons: 192px, 512px and a maskable 512px, drawn by
 *     app/install-icon/[name]/route.tsx.
 *
 * Built once, when the app is built (static: it reads nothing from the
 * request).
 */

export const dynamic = "force-static"

const SHORT_NAME_MAX = 12

function manifest(): MetadataRoute.Manifest {
  if (Array.from(APP_SHORT_NAME).length > SHORT_NAME_MAX) {
    throw new Error(
      `The app's short name "${APP_SHORT_NAME}" is longer than ${SHORT_NAME_MAX} characters (section 41.12 rule 9). Shorten it in lib/install-settings.ts.`
    )
  }

  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    // The app's identity once installed. Kept apart from start_url, so a
    // product can move its home without the phone seeing a new app.
    id: "/",
    // Plan-phone D3: the phone home is /my-work.
    start_url: "/my-work",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: INSTALL_COLOURS.theme,
    background_color: INSTALL_COLOURS.background,
    icons: INSTALL_ICONS.map((icon) => ({
      src: `/install-icon/${icon.name}`,
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.purpose,
    })),
  }
}

export function GET() {
  return new Response(JSON.stringify(manifest()), {
    headers: { "Content-Type": "application/manifest+json" },
  })
}
