"use client"

import * as React from "react"
import { ChevronLeftIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useBack, useTrackBackHistory } from "@/lib/back"
import { PHONE_WORDS } from "@/lib/phone-words"
import { Button } from "@/components/ui/button"
import { ShellLink } from "@/components/shell/progress-bar"

/**
 * Section 41.4 rule 4: two icon buttons, or one text button. Counted in
 * icon-button places: an icon button takes one, a text button both.
 */
const MAX_APP_BAR_ACTIONS = 2

type ActionProps = { children?: React.ReactNode; size?: unknown; render?: unknown }

/**
 * A text button: this kit's Button at a text size (default, sm or lg;
 * default when none is given), or any element that renders one through
 * `render` (a menu trigger given render={<Button>Select</Button>}).
 * Anything else - an icon button, a menu holding an icon trigger - is
 * one icon place.
 */
function isTextButton(node: React.ReactElement<ActionProps>): boolean {
  if (node.type === Button) {
    const size = node.props.size ?? "default"
    return size === "default" || size === "sm" || size === "lg"
  }
  const render = node.props.render
  return React.isValidElement<ActionProps>(render) && isTextButton(render)
}

/**
 * The icon-button places the actions take, looking inside fragments:
 * <><A/><B/></> is two icon buttons, two places; one text button is two
 * places on its own, the whole slot.
 */
function countActions(node: React.ReactNode): number {
  return React.Children.toArray(node).reduce<number>((n, child) => {
    if (!React.isValidElement<ActionProps>(child)) return n + 1
    if (child.type === React.Fragment) return n + countActions(child.props.children)
    return n + (isTextButton(child) ? MAX_APP_BAR_ACTIONS : 1)
  }, 0)
}

/**
 * The app bar's left and right slots. Icons 22px (41.9 rule 8). The bar
 * does not grow with the text-size setting, so neither do its buttons
 * (41.4 rule 1), whatever size the caller gave them:
 *
 *   - an icon button is a fixed 44px square, size-bar-button;
 *   - a text button (Select, 41.6 rule 14; data-size default, sm or lg)
 *     is pinned to the same fixed 44px height, h-bar-button, with its
 *     text in a fixed px size, so a large text setting cannot push it
 *     past the 56px bar. The px size is text-bar-label (12px), the only
 *     fixed-px type token at a button's scale; a fixed 14px token
 *     (--text-bar-button, the desktop body size) is what it should be, and
 *     is not in globals.css yet.
 *
 * Important, because tailwind-merge does not see size-control and
 * size-bar-button (or h-control and h-bar-button, text-body and
 * text-bar-label) as the same utility, and the button's own classes come
 * later in the stylesheet.
 */
const SLOT = cn(
  "flex shrink-0 items-center [&_svg]:size-icon-empty!",
  "[&_[data-size=icon]]:size-bar-button!",
  "[&_[data-size=default]]:h-bar-button! [&_[data-size=sm]]:h-bar-button! [&_[data-size=lg]]:h-bar-button!",
  "[&_[data-size=default]]:text-bar-button! [&_[data-size=sm]]:text-bar-button! [&_[data-size=lg]]:text-bar-button!"
)

/**
 * Section 41.4 rules 1 to 4 - the phone's app bar, presentational only.
 *
 * It depends on no context, so stage 3's full-screen dialogs (41.8 rule
 * 10) draw the same bar. A page gets it through PageHeader, which renders
 * it itself; AppBar below is the shell's fallback for a page without one.
 *
 *   - Filled primary, on the shell layer, and the outermost band of every
 *     phone screen (36.4). It does not render a HeaderBand: the shell's
 *     BandScope around the whole phone column (app bar, content, tab bar,
 *     and through portals everything they open) puts every other header
 *     one level deeper, into the accent form.
 *   - Padded by the top safe area, so the phone's status bar sits on
 *     primary (41.13 rule 4), and by the side safe areas (41.13 rule 2).
 *   - One row, exactly 56px (--spacing-topbar). It does not grow with the
 *     text-size setting; the title is in px (text-bar-title) and stays on
 *     one line, truncated (41.4 rule 1).
 *   - Left: `leading`, the back arrow or select mode's close (rule 2).
 *     Then the title, the screen's one h1 (rule 3, 3 rule 3). Right: at
 *     most two actions (rule 4); the back arrow does not count.
 *   - Icons in it are 22px (41.9 rule 8). Its icon buttons are the
 *     on-brand variant (6.3.2) at a fixed size-bar-button, 44px: the bar
 *     does not grow with the text-size setting, so neither do they. They
 *     sit 8px apart (41.9 rule 4).
 *
 * The side padding puts a leading or trailing button's 22px icon about
 * 16px from the edge, in line with the content (41.4 rule 20); a title
 * with nothing beside it starts at 16px itself.
 *
 * `titleAs` is "h1" for a screen's own bar. A full-screen dialog (stage
 * 3) passes "h2", so the page under it never has two h1s. The shell's
 * fallback passes "p": the product name is not a page title, and a page
 * without a PageHeader carries its own h1 in its content.
 *
 * `source` and `belowTop` are the attributes globals.css reads (block
 * "PHONE SHELL - 41.4"), so the right bar and the tab bar show from the
 * first paint with no effect: a page's own bar ("page") hides the shell's
 * fallback ("shell"), and a page's bar below the top level hides the tab
 * bar (41.4 rule 11). A dialog's bar passes neither.
 *
 * `children` hang off the bottom edge: the page-loading bar (41.4 rule
 * 22), which positions itself `absolute top-full`. The header is sticky,
 * so it is the bar's containing block, as the top bar is on desktop.
 */
function PhoneAppBar({
  leading,
  title,
  titleAs: Title = "h1",
  actions,
  source,
  belowTop = false,
  className,
  children,
}: {
  leading?: React.ReactNode
  /** Tracking: a node, as Tracking's PageHeader title is (one line, truncated). */
  title: React.ReactNode
  titleAs?: "h1" | "h2" | "p"
  actions?: React.ReactNode
  source?: "page" | "shell"
  belowTop?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const count = countActions(actions)
  if (count > MAX_APP_BAR_ACTIONS) {
    throw new Error(
      `The phone app bar was given more actions than fit: they take ${count} icon-button places, and a text button takes both. FRONTEND_RULES_PHONE.md section 41.4 rule 4 allows two icon buttons, or one text button; the back arrow does not count. Put the rest in the three-dot menu.`
    )
  }
  const hasLeading = countActions(leading) > 0

  return (
    <header
      data-slot="app-bar"
      data-source={source}
      data-below-top={belowTop ? "" : undefined}
      className={cn(
        "sticky top-0 z-(--z-shell) shrink-0 bg-primary pt-safe-top pr-safe-right pl-safe-left text-on-brand",
        className
      )}
    >
      <div
        className={cn(
          "flex h-topbar items-center gap-2",
          hasLeading ? "pl-1" : "pl-4",
          count > 0 ? "pr-1" : "pr-4"
        )}
      >
        {hasLeading ? <div className={SLOT}>{leading}</div> : null}
        <Title className="min-w-0 flex-1 truncate text-bar-title font-medium">{title}</Title>
        {count > 0 ? <div className={cn(SLOT, "gap-2")}>{actions}</div> : null}
      </div>
      {children}
    </header>
  )
}

/**
 * What a page in a special mode puts over its app bar: stage 4's select
 * mode (41.6 rules 14 and 15) shows "5 selected", a close button on the
 * left, and hides the tab bar. A field left undefined keeps the page's
 * own; `leading: null` or `actions: null` clear them.
 */
type AppBarOverride = {
  leading?: React.ReactNode
  title?: string
  actions?: React.ReactNode
  hideTabBar?: boolean
}

/** A value and the hook instance that set it, so only its owner clears it. */
type Owned<T> = { owner: string; value: T }

function shallowEqual<T extends object>(a: T, b: T) {
  const keys = Object.keys(a) as (keyof T)[]
  return (
    keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]))
  )
}

function nextOwned<T extends object>(
  prev: Owned<T> | null,
  owner: string,
  value: T | null
): Owned<T> | null {
  if (value === null) return prev?.owner === owner ? null : prev
  if (prev?.owner === owner && shallowEqual(prev.value, value)) return prev
  return { owner, value }
}

type SetOverride = (owner: string, value: AppBarOverride | null) => void

const AppBarSettersContext = React.createContext<SetOverride | null>(null)
const AppBarStateContext = React.createContext<{
  override: AppBarOverride | null
  searchHref: string | undefined
} | null>(null)

/**
 * Mounted once, by AppShell, in BOTH layouts and at the same place in
 * the tree, so a foldable switching layout never remounts the page under
 * it (41.2 rule 3). It renders no element, so the desktop markup is
 * unchanged.
 *
 * It holds the override a page in a special mode puts over its app bar
 * (useAppBarOverride). A page's own title, back arrow and actions are not
 * held here: PageHeader draws the page's app bar itself, on the server,
 * so they are right on the first paint (41.2 rule 3, 26.4 rule 1).
 *
 * Setter and state are separate contexts. The setter never changes, so
 * the component in a special mode is not re-rendered when the override
 * changes; only the app bars and the tab bar, which read it, are. A
 * component that both writes an override AND reads useAppBarState would
 * re-render on its own write and, with new elements each render, write
 * again for ever: keep the two in different components.
 *
 * It also carries the address of the phone search page, `searchHref`
 * (41.4 rule 5), so every top-level screen's app bar can offer search
 * without each page passing it (see withSearch below).
 *
 * It also keeps the record of screens behind the back arrow (lib/back.ts)
 * for as long as the shell is mounted. That runs on desktop too, where it
 * shows nothing, so a foldable that changes layout mid-use still knows
 * which screens are behind it.
 */
function AppBarProvider({
  searchHref,
  children,
}: {
  /** The phone search page's address (41.4 rule 5). Without it no app bar offers search. */
  searchHref?: string
  children: React.ReactNode
}) {
  useTrackBackHistory()
  const [override, setOverrideState] = React.useState<Owned<AppBarOverride> | null>(null)

  const setOverride = React.useCallback<SetOverride>(
    (owner, value) => setOverrideState((prev) => nextOwned(prev, owner, value)),
    []
  )
  const state = React.useMemo(
    () => ({ override: override?.value ?? null, searchHref }),
    [override, searchHref]
  )

  return (
    <AppBarSettersContext.Provider value={setOverride}>
      <AppBarStateContext.Provider value={state}>{children}</AppBarStateContext.Provider>
    </AppBarSettersContext.Provider>
  )
}

/**
 * The override the app bars and the tab bar show now; a field left
 * undefined means "the page's own". `inShell` is false where no
 * AppBarProvider is above (a page rendered outside AppShell), and
 * PageHeader then keeps its desktop form. `hideTabBar` is only the
 * override's: below the top level, globals.css hides the tab bar from
 * the page's own app bar, with no script (41.4 rule 11).
 *
 * `overriding` is true while a special mode's override is on, whatever it
 * replaces; `searchHref` is the shell's search page (41.4 rule 5). An app
 * bar offers search only on a top-level screen with no override on:
 * withSearch below.
 */
function useAppBarState(): {
  inShell: boolean
  leading?: React.ReactNode
  title?: string
  actions?: React.ReactNode
  hideTabBar: boolean
  overriding: boolean
  searchHref?: string
} {
  const state = React.useContext(AppBarStateContext)
  const override = state?.override ?? null
  return {
    inShell: state !== null,
    leading: override?.leading,
    title: override?.title,
    actions: override?.actions,
    hideTabBar: override?.hideTabBar ?? false,
    overriding: override !== null,
    searchHref: state?.searchHref,
  }
}

/**
 * Section 41.4 rule 5: search, an icon button in the app bar of a
 * top-level screen, opening the full-screen search page. It replaces
 * Ctrl+K and command.tsx on phone.
 *
 * The search icon (23.1), in the phone icon set, whose meaning needs no
 * tooltip (41.9 rule 9); screen-reader label "Search". The on-brand
 * variant (6.3.2) at the bar's fixed 44px (41.4 rule 1). A link, not a
 * button (6.6: it goes somewhere), through ShellLink so the loading bar
 * shows while the search page loads (5.6).
 */
function AppBarSearchButton({ href }: { href: string }) {
  return (
    <Button
      variant="on-brand"
      size="icon"
      className="size-bar-button!"
      nativeButton={false}
      render={<ShellLink href={href} />}
      aria-label={PHONE_WORDS.a11y.search}
    >
      <SearchIcon aria-hidden className="size-icon-empty" />
    </Button>
  )
}

/**
 * A top-level screen's app bar actions with search added (41.4 rules 4
 * and 5), for PageHeader's bar and the shell's fallback bar, the two
 * places a screen's app bar is drawn:
 *
 *   - Only with a search address (the shell's `phoneSearchHref`), only on
 *     a top-level screen (`belowTop` false: a screen below the top level
 *     has its back arrow and no search, rules 6 and 7), and never while a
 *     special mode's override is on (select mode, 41.6 rule 15).
 *   - Search is ONE OF the two places (rule 4). The page's own actions
 *     come first: search takes a place only when one is free. So a page
 *     with a text button, which takes both places, has no search - which
 *     is how Select replaces search on My work while its Approvals chip
 *     is chosen (rule 4) - and a page with two icon buttons has none
 *     either. Never a throw: rule 5 says search "may be" one of the two.
 *   - It sits before the page's own actions, so a three-dot menu keeps
 *     the far edge.
 */
function withSearch(
  actions: React.ReactNode,
  {
    searchHref,
    belowTop,
    overriding,
  }: { searchHref: string | undefined; belowTop: boolean; overriding: boolean }
): React.ReactNode {
  if (searchHref === undefined || belowTop || overriding) return actions
  if (countActions(actions) >= MAX_APP_BAR_ACTIONS) return actions
  return (
    <>
      <AppBarSearchButton href={searchHref} />
      {actions}
    </>
  )
}

/**
 * Puts a special mode's chrome over the page's while the caller is
 * mounted and `override` is non-null (stage 4's select mode, 41.6 rules
 * 14 and 15). Pass null to leave the mode.
 *
 * A layout effect, so the app bar changes in the same frame as the page.
 * It writes after every render, with no dependency list on purpose:
 * `override` holds elements, new on every render, and nextOwned keeps the
 * old state when nothing changed. Select mode starts from a tap, so this
 * is never part of a first paint.
 */
function useAppBarOverride(override: AppBarOverride | null): void {
  const setOverride = React.useContext(AppBarSettersContext)
  const owner = React.useId()

  React.useLayoutEffect(() => {
    setOverride?.(owner, override)
  })
  React.useLayoutEffect(() => () => setOverride?.(owner, null), [setOverride, owner])
}

/**
 * Section 41.4 rules 6 and 7: chevron-left (23.1), screen-reader label
 * "Back". No tooltip: a phone has none (41.8 rule 16), and the arrow is
 * in the phone icon set, whose meaning needs none (41.9 rule 9). A fixed
 * 44px, like every button in the bar (41.4 rule 1).
 */
function BackButton({ parent }: { parent?: string }) {
  const back = useBack(parent)
  return (
    <Button
      variant="on-brand"
      size="icon"
      className="size-bar-button!"
      // The screen-reader label in the phone's language (plan-phone D7).
      aria-label={PHONE_WORDS.a11y.back}
      // 41.7 rule 3: on phone the back arrow is a form's Cancel, so it
      // leaves the page the way a link does, and useUnsavedChanges asks
      // first when the form has changes (11.3 rule 10).
      data-leaves-page
      onClick={back}
    >
      <ChevronLeftIcon className="size-icon-empty" />
    </Button>
  )
}

/**
 * The shell's FALLBACK app bar, for a page with no PageHeader: a page not
 * yet moved onto PageHeader. (The in-shell error pages of 11.8 have one
 * on phone: components/templates/error-page.tsx.) Its title is the
 * product name and it has no back arrow. globals.css hides it whenever
 * the page draws its own app bar, so a screen never shows two.
 *
 * It takes a special mode's override as a page's bar does. `children` is
 * the loading bar: while this bar is hidden, so is its loading bar, and
 * the page's own app bar carries the one that shows.
 */
function AppBar({
  fallbackTitle,
  children,
}: {
  fallbackTitle: string
  children?: React.ReactNode
}) {
  const { title, actions, leading, overriding, searchHref } = useAppBarState()
  return (
    <PhoneAppBar
      source="shell"
      leading={leading}
      title={title ?? fallbackTitle}
      titleAs="p"
      // A page with no PageHeader has no back arrow here, so it is drawn as
      // a top-level screen: search too, when the shell has a search page.
      actions={withSearch(actions, { searchHref, belowTop: false, overriding })}
    >
      {children}
    </PhoneAppBar>
  )
}

export {
  PhoneAppBar,
  AppBarProvider,
  AppBar,
  BackButton,
  AppBarSearchButton,
  withSearch,
  useAppBarState,
  useAppBarOverride,
  MAX_APP_BAR_ACTIONS,
}
export type { AppBarOverride }
