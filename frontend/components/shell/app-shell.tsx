"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SidebarBody } from "@/components/shell/sidebar"
import { TopBar } from "@/components/shell/top-bar"
import {
  DESKTOP_QUERY,
  useIsDesktop,
  useSidebarMode,
} from "@/components/shell/use-sidebar"

/**
 * Section 12. The frame every page sits inside. It never changes
 * between pages.
 *
 * Two collapse behaviours, one button (section 9 rule 7 and 12.1):
 *
 *   1024px and above - the sidebar is a column beside the content and
 *   the toggle collapses it to a 64px icon rail with tooltips. The
 *   content widens into the space.
 *
 *   Below 1024px - the sidebar is hidden and the same toggle opens it
 *   as an overlay sliding OVER the content, never pushing the content
 *   sideways.
 *
 * Scroll ownership (section 10) is decided by the page, not here. This
 * frame gives the page a fixed-height box and hides its own overflow;
 * a list page then scrolls its data area and a detail page scrolls
 * itself. Either way there is exactly one scrolling container, never
 * one inside another.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebarMode()
  const isDesktop = useIsDesktop()
  const pathname = usePathname()

  /**
   * The overlay closes on two events, and both are derived rather than
   * watched from an effect:
   *
   *   following a link inside it must not leave it covering the page it
   *   just navigated to, so it is remembered against the route it was
   *   opened on;
   *
   *   widening past 1024 hands the sidebar back to the column, so the
   *   overlay must not still be sitting on top of it.
   */
  const [overlay, setOverlay] = React.useState({ open: false, at: pathname })
  const overlayOpen = overlay.open && overlay.at === pathname && !isDesktop

  const setOverlayOpen = React.useCallback(
    (open: boolean) => setOverlay({ open, at: pathname }),
    [pathname]
  )

  const handleToggle = React.useCallback(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      toggle()
    } else {
      setOverlay((current) => ({ open: !current.open, at: pathname }))
    }
  }, [pathname, toggle])

  const toggleLabel = !isDesktop
    ? "Open navigation"
    : collapsed
      ? "Expand sidebar"
      : "Collapse sidebar"

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-sunken">
      {/* 260px open, 64px rail collapsed. Hidden below 1024px, where
          the overlay below takes over. The width comes from
          <html data-sidebar> so a restored choice does not animate in
          on every page load. */}
      <aside className="hidden w-sidebar shrink-0 flex-col border-r border-border-light bg-surface transition-[width] duration-200 ease-out lg:flex rail:w-sidebar-rail">
        <SidebarBody collapsible collapsed={collapsed} />
      </aside>

      {/* Below 1024px only. Slides over the content rather than
          displacing it, and carries the labels - a rail with no room
          for an overlay tooltip would be unreadable on touch. */}
      <Sheet open={overlayOpen} onOpenChange={setOverlayOpen}>
        <SheetContent
          side="left"
          aria-label="Main navigation"
          className="flex flex-col gap-0 p-0 data-[side=left]:w-sidebar data-[side=left]:sm:max-w-none lg:hidden"
        >
          <SidebarBody collapsible={false} collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onToggle={handleToggle} toggleLabel={toggleLabel} />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}

export { AppShell }
