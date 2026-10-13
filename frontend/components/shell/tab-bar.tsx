"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { useKeyboard } from "@/lib/keyboard"
import { useLayout } from "@/lib/layout"
import { usePermissions } from "@/lib/permissions"
import { PHONE_WORDS } from "@/lib/phone-words"
import { Count } from "@/components/ui/badge"
import { CONTENT_ID } from "@/components/shell/content-area"
import { isNavItemActive, type Needs } from "@/components/shell/nav"
import { phoneDestinations } from "@/components/shell/phone-nav"
import { ShellLink } from "@/components/shell/progress-bar"

type PhoneTab = {
  label: string
  href: string
  /** A Lucide icon element, rendered at 22px (41.9 rule 8). */
  icon: React.ReactNode
  /** Items waiting, shown at the top right of the icon (41.4 rule 16). */
  count?: number
  /** The permission that opens it (41.4 rule 17); none means everyone. */
  permission?: Needs
}

/** Section 41.4 rule 13: two to five tabs, never padded to make up a number. */
const MIN_TABS = 2
const MAX_TABS = 5

/**
 * Rule 18: the active tab's screen back to the top. The page scrolls
 * itself on phone, so the window is enough; the content area is
 * included in case a frame ever makes it the scroller. Instant, not
 * smooth: section 5.6's list is the complete list of motion, and a
 * scroll is not on it.
 */
function scrollScreenToTop() {
  window.scrollTo({ top: 0, left: 0 })
  const content = document.getElementById(CONTENT_ID)
  if (content && content.scrollTop > 0) content.scrollTo({ top: 0, left: 0 })
}

/**
 * Section 41.4 rules 11 to 19: the phone's tab bar, on top-level screens
 * only. The caller passes the tabs in order - My work first, More last
 * (rule 15), the product's own between.
 *
 *   - Below the top level it is hidden by globals.css, not by script:
 *     the page's own app bar carries data-below-top (PageHeader), so the
 *     bar is already absent from the first paint (rule 11, 41.2 rule 3),
 *     and --bottom-bar drops to 0px with it. `hidden` is for a mode the
 *     person enters by a tap, such as select mode (41.6 rule 15), which
 *     AppShell passes from the app bar's override.
 *   - THE BOTTOM-BAR CONTRACT (globals.css). The bar only marks itself,
 *     data-fixed-bottom="tab-bar"; globals.css works out --bottom-bar
 *     from what is in the page, with :has. Nothing is set by an effect,
 *     so the content's bottom padding and the toasts' offset are right in
 *     the server's HTML and never go stale when the bar unmounts. That
 *     needs the bar IN the server's HTML on a phone guess, and it is:
 *     AppShell renders it from useLayout(), which answers with the
 *     server's guess while rendering on the server and hydrating, and
 *     useKeyboard() answers "closed" there.
 *   - Every tab goes through phoneDestinations() first (rule 17), the
 *     one place permissions will filter; this file never filters.
 *   - Fixed at the bottom, surface, a 1px border-light line on top, on
 *     the shell layer, no shadow (rule 12, 5.4 rule 2). Exactly
 *     --h-tab-bar tall, its line included, plus the bottom safe area
 *     (41.13 rule 2); the side safe areas pad it too. Full width even
 *     with the phone sideways (41.13 rule 10).
 *   - It does not grow with the text-size setting (rules 1 and 12):
 *     labels are text-bar-label, a px size, on one line and truncated.
 *   - It hides while the keyboard is open (rule 19): it is not rendered
 *     at all then, so its mark leaves the page, --bottom-bar drops to 0px
 *     by itself, and toasts follow with no script.
 *
 * Phone layout only. In the desktop layout it renders nothing and
 * touches nothing, so no desktop page can change because of it.
 */
function TabBar({ tabs, hidden = false }: { tabs: PhoneTab[]; hidden?: boolean }) {
  const { can } = usePermissions()
  const shown = phoneDestinations(tabs, can)
  const pathname = usePathname()
  // The sidebar's longest match, through the sidebar's own test (nav.ts
  // isNavItemActive, 12.1), so the two shells can never disagree about
  // which destination owns an address.
  const active =
    shown
      .filter((tab) => isNavItemActive(tab.href, pathname))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  const { layout } = useLayout()
  const keyboard = useKeyboard()
  const onPhone = layout === "phone"

  // The upper limit counts the full configured list, as the sidebar's
  // does (12.1): the person who can use everything must still see five or
  // fewer, and a product that configures six fails for everyone, not only
  // for them. The lower limit counts what this person is shown.
  if (tabs.length > MAX_TABS || shown.length < MIN_TABS) {
    const n = tabs.length > MAX_TABS ? tabs.length : shown.length
    throw new Error(
      `The phone tab bar has ${n} tabs. FRONTEND_RULES_PHONE.md section 41.4 rule 13 allows two to five; the rest of the product's phone screens belong in More.`
    )
  }

  if (hidden || !onPhone || keyboard.open) return null

  return (
    <nav
      aria-label={PHONE_WORDS.a11y.mainNav}
      data-slot="tab-bar"
      // The bottom-bar contract: globals.css reads this mark with :has.
      data-fixed-bottom="tab-bar"
      className={cn(
        "fixed inset-x-0 bottom-0 z-(--z-shell) flex border-t border-border-light bg-surface",
        // Border-box: the 56px holds the 1px line (the contract in
        // globals.css), and the bottom safe area is added on top of it.
        "h-[calc(var(--h-tab-bar)+var(--safe-bottom))] pr-safe-right pb-safe-bottom pl-safe-left"
      )}
    >
      {shown.map((tab) => (
        <Tab
          key={tab.href}
          tab={tab}
          active={tab.href === active}
          // Rule 18. Below the tab's own address the tab still opens its
          // top-level screen; on that screen it scrolls instead.
          atTop={pathname === tab.href}
        />
      ))}
    </nav>
  )
}

function Tab({ tab, active, atTop }: { tab: PhoneTab; active: boolean; atTop: boolean }) {
  const count = tab.count && tab.count > 0 ? tab.count : null
  return (
    <ShellLink
      href={tab.href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (!active || !atTop) return
        // A plain tap only; a modified click (a new tab) is left alone.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return
        }
        // Next's Link skips its navigation when the click is prevented.
        event.preventDefault()
        scrollScreenToTop()
      }}
      className={cn(
        // Equal widths (rule 13): each tab takes one share of the bar and
        // may shrink below its label, which then truncates.
        "flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 px-1",
        "[&_svg]:size-icon-empty [&_svg]:shrink-0",
        // Rule 14: no hover state - the pressed fill is the feedback.
        "transition-[background-color] duration-(--duration-fast) active:bg-surface-control",
        // Inset, so the ring shows inside the bar rather than off its
        // edges or over the neighbouring tab.
        "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:-outline-offset-2 focus-visible:outline-primary-ring",
        // Rule 14: active is primary-text, icon and label together.
        active ? "text-primary-text" : "text-text-secondary"
      )}
    >
      <span className="relative flex">
        {tab.icon}
        {count !== null ? (
          // Rule 16: at the top right of the icon. Count shows "99+"
          // itself (6.8). The number is read with the label instead, so
          // a screen reader hears "My work, 12" rather than "12 My work".
          // Its text is the bar's fixed px size, so like the label it
          // does not outgrow its 18px pill at a large text setting.
          <Count value={count} aria-hidden className="absolute -top-2 left-3 text-bar-label" />
        ) : null}
      </span>
      <span className="max-w-full truncate text-bar-label font-medium">{tab.label}</span>
      {count !== null ? <span className="sr-only">, {count}</span> : null}
    </ShellLink>
  )
}

export { TabBar }
export type { PhoneTab }
