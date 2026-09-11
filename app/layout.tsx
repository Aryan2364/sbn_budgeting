import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/components/shell/session";
import { SIDEBAR_STORAGE_KEY } from "@/components/shell/sidebar-storage";

export const metadata: Metadata = {
  title: "Sadbhavna",
  description: "Tree plantation project and site tracking",
};

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full`}
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
        {/* Section 19: tooltips appear after about 400ms on hover, and
            immediately on keyboard focus. */}
        <SessionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
