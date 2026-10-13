"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { OctagonXIcon } from "lucide-react"

import { useLayout } from "@/lib/layout"
import { usePageGuard, usePermissions } from "@/lib/permissions"
import { PHONE_WORDS } from "@/lib/phone-words"
import { Banner, BannerAction, BannerDescription } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { BandScope } from "@/components/ui/header-band"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { AppBar, AppBarProvider, useAppBarState } from "@/components/shell/app-bar"
import { areaPermission, PHONE_HOME, PHONE_TABS, phoneHomeHref } from "@/components/shell/nav"
import { CONTENT_ID, PHONE_CONTENT, SkipToContent } from "@/components/shell/content-area"
import { DocumentLanguage } from "@/components/shell/document-language"
import { PhoneRouteGate } from "@/components/shell/phone-route-gate"
import { ProgressBar, ProgressProvider } from "@/components/shell/progress-bar"
import { SidebarBody } from "@/components/shell/sidebar"
import { TabBar, type PhoneTab } from "@/components/shell/tab-bar"
import { TopBar } from "@/components/shell/top-bar"
import { useMyWorkCount } from "@/components/complaints/phone/use-my-work-count"
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
 * Kit section 12: the sidebar is filled with primary (sidebar.tsx) and
 * the 56px top bar stays neutral beside it, so the brand runs down the
 * full height of the window. The progress bar of 5.6 hangs off the top
 * bar's bottom edge; ProgressProvider is here so everything inside the
 * shell (ShellLink, the notification panel, list reloads) drives it.
 * "Skip to content" is the first Tab stop (39.1) and jumps to <main>.
 *
 * Scroll ownership (section 10) is decided by the page, not here. This
 * frame gives the page a fixed-height box and hides its own overflow;
 * a list page then scrolls its data area and a detail page scrolls
 * itself. Either way there is exactly one scrolling container, never
 * one inside another.
 *
 * Two permission duties sit here, once for every page (kit 26):
 *
 *   The failed state of kit 26.1 rule 5. If what this person may do
 *   could not be loaded, every gated control stays disabled without a
 *   reason, and this danger banner says so and offers "Try again".
 *
 *   Kit 26.6's page check, in the browser (access plan 3.3 item 3). An
 *   address whose area the user holds nothing in renders the 11.8 "No
 *   access" page inside the shell, never a redirect. The area is the
 *   sidebar item that owns the address (nav.ts `areaPermission`), so a
 *   typed link is refused by the same rule that hides its item.
 */
function PermissionsFailedBanner({ phone }: { phone: boolean }) {
  const { status, refresh } = usePermissions()
  if (status !== "failed") return null
  return (
    <div className={phone ? "shrink-0 px-4 pt-4" : "no-print shrink-0 px-6 pt-4"}>
      {/* Pending banner rule 3: it explains why every control is
          disabled, so it has no close. Rule 1: one line, the action is
          the button. */}
      <Banner variant="danger" layout="line">
        <OctagonXIcon />
        <BannerDescription>We could not load what you can do here.</BannerDescription>
        <BannerAction>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Try again
          </Button>
        </BannerAction>
      </Banner>
    </div>
  )
}

function AreaGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const denied = usePageGuard(areaPermission(pathname))
  return <>{denied ?? children}</>
}

/**
 * The phone's tab bar (41.4 rules 11 to 19, plan-phone section 6): My
 * work, Complaints, More, filtered by permission in phoneDestinations
 * (tab-bar.tsx), with My work's count. Hidden while a special mode asks
 * (select mode, 41.6 rule 15). Plan Q4: someone with no phone home has
 * fewer than the two tabs 41.4 rule 13 needs, and gets no tab bar at all.
 */
function ShellTabBar() {
  const { hideTabBar } = useAppBarState()
  const { can } = usePermissions()
  const hasHome = phoneHomeHref(can) !== null
  const count = useMyWorkCount(hasHome)
  if (!hasHome) return null
  const tabs: PhoneTab[] = PHONE_TABS.map(({ icon: Icon, ...tab }) => ({
    ...tab,
    icon: <Icon aria-hidden />,
    count: tab.href === PHONE_HOME ? (count ?? undefined) : undefined,
  }))
  return <TabBar tabs={tabs} hidden={hideTabBar} />
}

function AppShell({ children }: { children: React.ReactNode }) {
  // Kit 41.2 rule 2: only useLayout() decides phone or desktop.
  const phone = useLayout().layout === "phone"
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

  /*
   * ONE TREE FOR BOTH LAYOUTS (kit 41.2 rule 3, as kit 3bb95d1's
   * app-shell does it). A foldable unfolded mid-use switches layout, and
   * must keep the screen and anything typed. React keeps a component's
   * state only while every element above it keeps its type and position,
   * so the page sits at the same place in both: the providers, the
   * shell's div, the column, <main>, PhoneRouteGate, AreaGuard. Only the
   * chrome beside the content differs, slot by slot.
   *
   * DESKTOP renders exactly the markup it did before the phone layout
   * existed: the providers, DocumentLanguage and PhoneRouteGate add no
   * element, and BandScope passes the band level through unchanged.
   *
   * PHONE (kit 41.4, replacing section 12): no sidebar and no top bar
   * (no bell and no user menu: plan-phone L8); the shell's fallback app
   * bar, which globals.css hides whenever the page draws its own through
   * PageHeader; the content area in its phone form, with the window
   * scrolling; the tab bar. BandScope sets the band depth to one around
   * the whole phone column (41.4 rule 1).
   */
  return (
    <ProgressProvider>
    <AppBarProvider>
    <SkipToContent>{phone ? PHONE_WORDS.a11y.skipToContent : undefined}</SkipToContent>
    <DocumentLanguage />
    <div
      data-slot={phone ? "app-shell" : undefined}
      className={phone ? "flex min-h-dvh w-full" : "flex h-dvh overflow-hidden bg-surface-sunken"}
    >
      {/* 260px open, 64px rail collapsed. Hidden below 1024px, where
          the overlay below takes over. The width comes from
          <html data-sidebar> so a restored choice does not animate in
          on every page load. */}
      {phone ? null : (
        <aside className="no-print z-(--z-shell) hidden w-sidebar shrink-0 flex-col bg-primary transition-[width] duration-(--duration-slow) ease-enter motion-reduce:transition-none lg:flex rail:w-sidebar-rail">
          <SidebarBody collapsible collapsed={collapsed} />
        </aside>
      )}

      {/* Below 1024px only. Slides over the content rather than
          displacing it, and carries the labels - a rail with no room
          for an overlay tooltip would be unreadable on touch. */}
      {phone ? null : (
        <Sheet open={overlayOpen} onOpenChange={setOverlayOpen}>
          <SheetContent
            side="left"
            aria-label="Main navigation"
            className="flex flex-col gap-0 border-0 bg-primary p-0 data-[side=left]:w-sidebar data-[side=left]:border-r-0 data-[side=left]:sm:max-w-none lg:hidden"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody
              collapsible={false}
              collapsed={false}
              onNavigate={() => setOverlayOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      <BandScope active={phone}>
        <div className="flex min-w-0 flex-1 flex-col">
          {phone ? (
            <AppBar fallbackTitle={PHONE_WORDS.titles.product}>
              <ProgressBar />
            </AppBar>
          ) : (
            <TopBar onToggle={handleToggle} toggleLabel={toggleLabel}>
              <ProgressBar />
            </TopBar>
          )}
          <PermissionsFailedBanner phone={phone} />
          {/* The skip link's target: focusable by script, not a tab stop,
              and no ring because it is not a control. On phone it is the
              phone content area (content-area.tsx PHONE_CONTENT), and the
              window scrolls. */}
          <main
            id={CONTENT_ID}
            tabIndex={-1}
            data-slot={phone ? "content-area" : undefined}
            className={phone ? PHONE_CONTENT : "min-h-0 flex-1 overflow-hidden outline-none"}
          >
            <PhoneRouteGate>
              <AreaGuard>{children}</AreaGuard>
            </PhoneRouteGate>
          </main>
          {phone ? <ShellTabBar /> : null}
        </div>
      </BandScope>
    </div>
    </AppBarProvider>
    </ProgressProvider>
  )
}

export { AppShell }
