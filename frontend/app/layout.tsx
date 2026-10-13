import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Noto_Sans_Gujarati } from "next/font/google";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/components/shell/session";
import { SIDEBAR_STORAGE_KEY } from "@/components/shell/sidebar-storage";
import { LayoutProvider } from "@/lib/layout";
import { getInitialLayout } from "@/lib/layout.server";
import { InstallPromptCapture } from "@/lib/install";
import { APPLE_ICON } from "@/lib/install-icon";
import { APP_SHORT_NAME, INSTALL_COLOURS, IPHONE_STATUS_BAR } from "@/lib/install-settings";

/**
 * Kit 37.6 rule 4 (plan-phone D8): the Complaints area is Gujarati, and
 * Geist has no Gujarati letters. Placed after Geist in --font-sans
 * (globals.css), so Latin text keeps Geist and only Gujarati letters fall
 * through to it, instead of to whatever the phone or computer has.
 */
const notoSansGujarati = Noto_Sans_Gujarati({
  variable: "--font-gujarati",
  subsets: ["gujarati"],
  weight: ["400", "500"],
  display: "swap",
});

/** Everything every page's head carries, in both layouts. */
const METADATA: Metadata = {
  title: "Sadbhavna",
  description: "Tree plantation project and site tracking",
};

/*
 * THE INSTALL HEAD TAGS ARE THE PHONE'S (plan-phone Phase 5, kit stage 6
 * decision 5). The manifest link, theme-color, iPhone's web-app tags and
 * the apple-touch-icon are sent only when the server guesses phone
 * (getInitialLayout, 41.2 rule 3). On a computer they would tint desktop
 * Safari's tab bar, make desktop Chrome offer "Install", and lock an
 * Android tablet that installed it upright - so on desktop the head is
 * exactly what it was before the app was installable (Q2: phone only).
 *
 *   - manifest: app/install-manifest/route.ts.
 *   - appleWebApp: capable (opens without the browser bar, with the
 *     manifest's display "standalone"). statusBarStyle: Sadbhavna's dark
 *     brand uses black-translucent (lib/install-settings.ts). title: the
 *     short name under the icon.
 *   - icons.apple: iPhone's home screen icon, app/install-icon/[name].
 *     The favicon stays first among the icons.
 */
const PHONE_METADATA: Metadata = {
  manifest: "/install-manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: IPHONE_STATUS_BAR,
    title: APP_SHORT_NAME,
  },
  icons: {
    apple: [
      {
        url: `/install-icon/${APPLE_ICON.name}`,
        sizes: `${APPLE_ICON.size}x${APPLE_ICON.size}`,
        type: "image/png",
      },
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const layout = await getInitialLayout();
  return layout === "phone" ? { ...METADATA, ...PHONE_METADATA } : METADATA;
}

/*
 * Section 41.13. viewport-fit=cover lets the page reach under the notch
 * and the phone's bars, so the safe-area insets can be read (rule 1).
 * resizes-content makes Android's keyboard shrink the visible area (rule
 * 6). color-scheme is light whatever the phone's setting (rule 12):
 * "only light", because plain "light" still lets Chrome and Samsung
 * Internet on Android repaint the page dark when the phone is set dark.
 * Zooming is never blocked: no maximum-scale, no user-scalable (41.9 rule
 * 7).
 */
const VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "only light",
};

/*
 * Phone only (decision above): themeColor is the install settings' theme
 * colour, --primary (lib/install-settings.ts): the phone's status bar
 * sits on primary (41.13 rule 4). A colour value, not a token, because
 * the browser cannot read a token here (section 1 rule 1's exception).
 */
export async function generateViewport(): Promise<Viewport> {
  const layout = await getInitialLayout();
  return layout === "phone" ? { ...VIEWPORT, themeColor: INSTALL_COLOURS.theme } : VIEWPORT;
}

/**
 * Section 12.1: the sidebar's open or collapsed choice is saved and
 * restored next visit. This runs before the shell is parsed, so a
 * restored rail is already 64px wide when the first paint happens
 * rather than animating in from 260px afterwards. globals.css reads
 * the attribute through the `rail:` variant.
 *
 * Where the two rules meet: section 9 gives the DEFAULT - open at 1280
 * and above, an icon rail on a 1024 to 1279 laptop - and section 12.1
 * gives the user the last word. So the width decides only when nothing
 * has been stored, and it decides once, on load. Narrowing the window
 * mid-session does not reach over and collapse a sidebar somebody
 * deliberately opened.
 */
const RESTORE_SIDEBAR = `(function(){var m="open";try{var v=localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY
)});m=v==="open"||v==="collapsed"?v:(matchMedia("(min-width:1280px)").matches?"open":"collapsed")}catch(e){}document.documentElement.dataset.sidebar=m})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Section 41.2 rule 3: the server's guess, so the first paint is
  // already the right layout and its token values apply from the start.
  const layout = await getInitialLayout();

  return (
    <html
      // Plan-phone D9: every phone screen but Login is Gujarati, so a
      // phone guess says so (the sign-in page marks itself lang="en").
      // Desktop is English; DocumentLanguage (in the shell) keeps this
      // right after a layout correction and while a complaints page is
      // open.
      lang={layout === "phone" ? "gu" : "en"}
      data-layout={layout}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${notoSansGujarati.variable} h-full`}
    >
      <head>
        {/* Must execute BEFORE the shell is parsed, so a restored rail
            is already 64px wide at first paint. next/script's
            beforeInteractive strategy only queues the code for the
            client runtime, which runs after paint - that is a flash,
            not a restore. */}
        <script dangerouslySetInnerHTML={{ __html: RESTORE_SIDEBAR }} />
      </head>
      <body className="flex min-h-full flex-col">
        <LayoutProvider initial={layout}>
          {/* Section 19: tooltips appear after about 400ms on hover, and
              immediately on keyboard focus. */}
          <SessionProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </SessionProvider>
          <Toaster />
          {/* 41.12 rule 8: Chrome offers the install prompt once per page
              load, often before More is open; this keeps it for More's
              Install app button and stops Chrome's own pop-up. It
              listens in the phone layout only and renders nothing, so on
              desktop the event is never taken (lib/install.ts). */}
          <InstallPromptCapture />
        </LayoutProvider>
      </body>
    </html>
  );
}
