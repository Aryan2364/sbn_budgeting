"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"
import { PageHeader } from "@/components/templates/page"
import { EmptyState, type EmptyStateText } from "@/components/ui/empty-state"

/**
 * Section 41.11: what a computer-only screen shows on a phone.
 *
 * Organisation settings, the access screens, the data entry grid, Gantt
 * charts and reports built for analysis stay on the computer (41.1). A
 * phone opening one of their addresses, from a notification, WhatsApp or
 * an email, gets this page at the same address (41.2 rule 4), never a
 * squeezed desktop layout (41.1 rule 3).
 *
 * Inside the phone shell, like any screen:
 *   - PageHeader draws the app bar with the screen's own title, so the
 *     person can tell which screen this is, and the product's home as its
 *     parent: the screen is below the top level, with the back arrow and
 *     no tab bar (41.4 rules 6, 7 and 11). The title in the bar is the
 *     screen's one h1 (3 rule 3), so the empty state's heading is an h2.
 *   - Then the desktop-only empty state (41.11 rule 1): monitor, "This
 *     screen works on a computer", "Share link" and "Go to home".
 * PageHeader's bar must be a direct child of the page's top level (sticky
 * holds only within its parent), so this returns a fragment.
 *
 * A computer-only screen never appears in the tab bar or in More (41.11
 * rule 2), and phone screens never link to one (rule 3): this page is
 * only reached by its address.
 */
function ComputerOnlyPage({
  title,
  homeHref,
  onSignOut,
  text,
}: {
  /** The computer-only screen's own title: "Settings". */
  title: string
  /**
   * The product's home on phone, My work (41.15). Tracking (plan-phone
   * Q4): null for someone with no phone screen at all, whose "Go to home"
   * would bring them straight back here. The page is then a top-level
   * screen with no back arrow, and its secondary is Sign out.
   */
  homeHref: string | null
  /** Required when `homeHref` is null. */
  onSignOut?: () => void
  /** The empty state's words, in the phone's language (plan-phone D7). */
  text?: Partial<EmptyStateText>
}) {
  return (
    <>
      <PageHeader title={title} parent={homeHref ?? undefined} />
      <div
        data-slot="computer-only-page"
        className="flex flex-1 items-center justify-center py-12"
      >
        {homeHref !== null ? (
          <EmptyState variant="desktop-only" homeHref={homeHref} headingLevel={2} text={text} />
        ) : (
          <EmptyState variant="desktop-only" onSignOut={onSignOut} headingLevel={2} text={text} />
        )}
      </div>
    </>
  )
}

/**
 * The one wrapper a computer-only page needs (41.1 rule 3): on desktop it
 * renders the page's own content untouched, adding no element, so the
 * desktop screen does not change by a pixel; on phone it renders
 * ComputerOnlyPage in its place.
 *
 * useLayout() decides (41.2 rule 2). On the server and while hydrating it
 * answers with the server's guess (41.2 rule 3), so a phone's first paint
 * is already this page. A foldable unfolded while it shows switches to
 * the real screen in place.
 *
 *   export default function SettingsPage() {
 *     return (
 *       <ComputerOnly title="Settings" homeHref="/my-work">
 *         ...the desktop page...
 *       </ComputerOnly>
 *     )
 *   }
 */
function ComputerOnly({
  title,
  homeHref,
  text,
  children,
}: {
  title: string
  homeHref: string
  text?: Partial<EmptyStateText>
  children: React.ReactNode
}) {
  const { layout } = useLayout()
  if (layout === "phone") return <ComputerOnlyPage title={title} homeHref={homeHref} text={text} />
  return <>{children}</>
}

export { ComputerOnly, ComputerOnlyPage }
