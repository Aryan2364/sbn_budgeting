"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Count } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Truncate } from "@/components/ui/truncate"
import { useLayout } from "@/lib/layout"
import { cn } from "@/lib/utils"

/**
 * Section 33. A list page's optional fifth zone.
 *
 * **Sibling views of ONE SECTION** — three reports over the same data —
 * which is a different job from the `tabs` on a detail page, where the
 * tabs are a record's child collections. Same component underneath;
 * section 33.1 gives the test for which is which: a detail page's tabs
 * are about one RECORD, section tabs are about one SECTION.
 *
 * **Sub-navigation is deliberately rare, and each instance is agreed.**
 * This is a thin wiring layer over `tabs`, not a second tab component
 * and not a licence to add one to every screen. Section 12.1 caps the
 * sidebar at seven items for a reason, and a view is not a destination
 * in its own right — but nor is a tab bar a place to hide a screen that
 * deserves its own sidebar entry.
 *
 * It sits BETWEEN THE HEADER AND THE TOOLBAR and does not scroll. The
 * header names the section and this divides it, so it comes after the
 * title; the toolbar comes after it, because search and filters belong
 * to the active tab rather than to the section. A search box above a
 * tab bar implies it searches all of them, and it does not.
 *
 * The active tab lives in the URL (section 33.4), so a view can be
 * linked to and the browser's own back button returns to the tab the
 * user came from — the navigation this system has instead of a back
 * button (section 1 rule 11). Switching REPLACES the history entry:
 * flipping between three views should not make the back button walk
 * through every flip.
 *
 * **`useSearchParams` requires a Suspense boundary above it** when the
 * page it sits on is prerendered. Render it inside one, or the route
 * opts out of static rendering without saying so.
 *
 * **On phone (41.4 rule 21)** the bar sits directly under the app bar and
 * stays there while the content scrolls beneath it: sticky, at the app
 * bar's height plus the top safe area. Pass it to PageHeader's `tabs`, so
 * it sits under the page's app bar and above the meta line. It runs edge
 * to edge, cancelling the phone content area's side padding (16px plus
 * the side safe areas, 41.4 rule 20, or the wider padding of the centred
 * column held sideways, 41.13 rule 10) and padding back by the safe
 * areas only, so the border-light line spans the screen like the app
 * bar above it. The tabs share the width equally
 * and each label truncates to one line (section 8). The tab height stays
 * fixed: a label that cannot wrap never needs the taller control of 41.9
 * rule 7. The component switches itself through useLayout() and the
 * `phone:` variant (41.3 rule 4); the desktop bar is untouched.
 */

export interface SectionTab {
  value: string
  label: string
  /**
   * Section 6.8 count, shown as `Count` inside the trigger. Section 33.3:
   * if one tab carries a count they all do, so pass it on every tab.
   * `null` means "still loading" and renders nothing rather than a 0.
   */
  count?: number | null
}

export function SectionTabs({
  tabs,
  value,
  param = "view",
  onValueChange,
}: {
  /** Section 33.5: at most four. */
  tabs: SectionTab[]
  value: string
  /** The query parameter that carries the active tab. */
  param?: string
  /**
   * For a screen that keeps the tab in the URL TOGETHER with its own
   * toolbar state (search, filters, page), and so must write them in one
   * replace — section 33.4 clears the toolbar on a tab switch. When
   * given, this component calls it and leaves the URL to the caller;
   * the caller must still store the tab in the URL.
   */
  onValueChange?: (value: string) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { layout } = useLayout()

  if (tabs.length > 4) {
    throw new Error(
      `[design-system] A section tab bar was given ${tabs.length} tabs. ` +
        `FRONTEND_RULES.md section 33.5: maximum four. Past that it is not a ` +
        `section with views, it is an information architecture problem.`,
    )
  }

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (onValueChange) {
          onValueChange(String(next))
          return
        }
        const params = new URLSearchParams(searchParams.toString())
        params.set(param, String(next))
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      }}
      className={cn(
        // shrink-0: fixed chrome. Only the data area scrolls beneath it.
        "mt-6 shrink-0",
        // Phone, 41.4 rule 21: pinned under the app bar (56px plus the
        // top safe area), on a surface fill so rows never show through.
        "phone:sticky phone:top-[calc(var(--spacing-topbar)_+_var(--safe-top))] phone:z-(--z-sticky) phone:mt-0 phone:bg-surface",
        // Touching the app bar at rest. Right after the page's app bar
        // (PageHeader's `tabs`, or the next sibling of a PageHeader with
        // no meta line), it cancels the bar's 16px bottom margin. As the
        // first child under the shell's fallback bar, it cancels the
        // content area's 16px top padding. Then 16px above the first
        // block, as below the app bar (41.4 rule 20).
        "phone:first:-mt-4 phone:[[data-slot=app-bar]+&]:-mt-4 phone:mb-4",
        // Edge to edge: out by exactly the content area's side padding,
        // which it publishes (content-area.tsx); 16px plus the safe area
        // where it does not, as outside the shell.
        "phone:ml-[calc(var(--content-pad-left,calc(var(--spacing)_*_4_+_var(--safe-left)))_*_-1)]",
        "phone:mr-[calc(var(--content-pad-right,calc(var(--spacing)_*_4_+_var(--safe-right)))_*_-1)]"
      )}
    >
      {/* Four labels with counts do not fit a 360px window in the desktop
          layout (the agreed exception for the field screens). The row
          scrolls sideways rather than wrapping, which keeps the 2px accent
          on one line; a horizontal scroller inside the vertical page is
          allowed (section 1 rule 8). On wider screens nothing overflows and
          this wrapper is inert.

          overflow-x:auto makes overflow-y compute to auto as well, so
          anything poking out vertically draws a vertical scrollbar - on a
          touch screen the trigger's 44px tap area (::before, 4px past a
          36px tab top and bottom) did exactly that, even on a wide screen.
          p-1 gives that tap area and the 4px focus ring room inside the
          box (-m-1 cancels it, so the layout does not move), and
          overflow-y-hidden rules out a vertical scrollbar for good.

          ON PHONE (41.4 rule 21, kit 3bb95d1) the wrapper is inert and the
          tabs share the full width equally, each label truncated to one
          line, the count kept beside it. */}
      <div className="-m-1 overflow-x-auto overflow-y-hidden p-1 [scrollbar-width:thin] phone:m-0 phone:overflow-visible phone:p-0">
        {/* Back in by the safe areas only, so no tab sits under a notch. */}
        <TabsList className="min-w-max phone:min-w-0 phone:gap-0 phone:pr-safe-right phone:pl-safe-left">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                // Equal shares. min-w-0 lets the label shrink and truncate;
                // px-2 keeps neighbouring labels 16px apart when both are cut.
                "phone:min-w-0 phone:flex-1 phone:px-2",
                // The first and last tab touch the screen edge, where an
                // outset ring would be cut off. Inset, as 6.3.1 does.
                "phone:focus-visible:-outline-offset-2"
              )}
            >
              {layout === "phone" ? <Truncate>{tab.label}</Truncate> : tab.label}
              {typeof tab.count === "number" ? <Count value={tab.count} /> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  )
}
