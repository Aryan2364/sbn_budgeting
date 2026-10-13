"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { PHONE_WORDS } from "@/lib/phone-words"
import { useKeyboard } from "@/lib/keyboard"
import { BandScope, HeaderBand, useBandLevel } from "@/components/ui/header-band"
import { Button } from "@/components/ui/button"
import { PhoneAppBar } from "@/components/shell/app-bar"
import { ChevronLeftIcon, XIcon } from "lucide-react"

/**
 * Section 41.8: on phone, `<SheetContent side="bottom">` is THE bottom
 * sheet - the one surface that stands in for dialogs, select lists,
 * menus, popovers and the filter panel there. Everything that makes it
 * one lives in this file, so 3B's dialog and 3C's selects, menus and
 * popover get it by rendering a bottom sheet, never by rebuilding it:
 *
 *   - full width, 12px top corners, --shadow-dialog, over --backdrop,
 *     with a drag handle (rules 2 and 3);
 *   - grows with its content to 90% of the visible height less the top
 *     safe area, sits on the keyboard while it is open, and scrolls its
 *     body between a fixed header and footer (rule 4, 24 rule 6);
 *   - closes on a swipe down, the backdrop, Android back and its close
 *     button, every one of them through onOpenChange, so the
 *     unsaved-changes guard can refuse (rule 5, 11.3 rule 10);
 *   - takes focus itself, never a field, so the keyboard stays shut
 *     until a field is tapped (rule 19);
 *   - opens a choice inside itself as a step, with a back arrow, never a
 *     second sheet (rule 9, 24 rule 4) - useSheetStep below.
 *
 * `presentation="screen"` is the other phone layer, what a medium or
 * large dialog becomes (41.8 rule 10): a full-screen layer with the app
 * bar and a back arrow, the body scrolling under it, and the footer as an
 * action bar on the keyboard (41.7 rules 3 and 4, 41.6 rules 7 and 8). It
 * shares the bottom sheet's history entry, its close through onOpenChange
 * and its focus, so Android back, the guard and rule 19 work the same.
 *
 * DESKTOP IS UNTOUCHED. Every difference above is taken only when
 * useLayout() says phone AND the side is bottom (or the presentation is
 * screen). Any other sheet, and every sheet on desktop, renders exactly
 * the markup it did before.
 */

/* ------------------------------------------------------------------
   The root: what the content needs to know about open and close.
   ------------------------------------------------------------------ */

/**
 * What became of a close the sheet asked for itself (a swipe, Android
 * back): the caller's onOpenChange refused it (the unsaved-changes
 * guard calls cancel()), let it through, or there was no root to ask.
 */
type CloseOutcome = "canceled" | "accepted" | null

type SheetState = {
  open: boolean
  /** Closes through onOpenChange, exactly as the close button does. */
  requestClose: () => CloseOutcome
}

const SheetStateContext = React.createContext<SheetState | null>(null)

/**
 * What a Base UI dialog root (Dialog's, which Sheet is, or AlertDialog's)
 * does not offer outside: whether it is open, and a close that goes
 * through the caller's onOpenChange and reports what became of it.
 * Shared by Sheet below and alert-dialog.tsx, so the two never drift.
 *
 * A close requested through Base UI's own actionsRef (or a click on one
 * of its Close parts) reaches onOpenChange like any other, so a guard can
 * cancel it; whether it did is read from the event details straight
 * after - Base UI calls onOpenChange synchronously.
 *
 * A caller's actionsRef still works: it is answered from the root's own.
 */
function useLayerRoot<Details extends { isCanceled: boolean }>({
  open: openProp,
  defaultOpen,
  onOpenChange,
  actionsRef,
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: Details) => void
  actionsRef?: React.Ref<SheetPrimitive.Root.Actions | null>
}) {
  const actions = React.useRef<SheetPrimitive.Root.Actions | null>(null)
  React.useImperativeHandle(
    actionsRef,
    () => ({
      close: () => actions.current?.close(),
      unmount: () => actions.current?.unmount(),
    }),
    []
  )

  // Uncontrolled roots (a trigger, a handle) keep their open state inside
  // Base UI. It is mirrored here from onOpenChange, which Base UI calls
  // before it applies a change, and only for changes not canceled.
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  const open = openProp !== undefined ? openProp : uncontrolledOpen

  const outcome = React.useRef<CloseOutcome>(null)
  const handleOpenChange = React.useCallback(
    (next: boolean, details: Details) => {
      onOpenChange?.(next, details)
      if (!next) outcome.current = details.isCanceled ? "canceled" : "accepted"
      if (!details.isCanceled) setUncontrolledOpen(next)
    },
    [onOpenChange]
  )

  /** Runs `close` and reports what onOpenChange made of it. */
  const request = React.useCallback((close: () => void): CloseOutcome => {
    outcome.current = null
    close()
    // The close ran onOpenChange synchronously, which set the outcome.
    return outcome.current as CloseOutcome
  }, [])

  const requestClose = React.useCallback(
    () => request(() => actions.current?.close()),
    [request]
  )

  return { open, actions, handleOpenChange, request, requestClose }
}

/**
 * The Base UI root, plus whether the sheet is open and a close that goes
 * through the caller's onOpenChange (useLayerRoot above).
 *
 * The bottom sheet needs both for Android back (41.4 rule 9): it adds a
 * history entry while open and, when back removes it, asks to close.
 *
 * It renders no DOM of its own and passes every prop through, so no
 * existing caller sees a difference.
 */
function Sheet({ onOpenChange, actionsRef, ...props }: SheetPrimitive.Root.Props) {
  const { open, actions, handleOpenChange, requestClose } = useLayerRoot({
    open: props.open,
    defaultOpen: props.defaultOpen,
    onOpenChange,
    actionsRef,
  })
  const state = React.useMemo(() => ({ open, requestClose }), [open, requestClose])

  return (
    <SheetStateContext.Provider value={state}>
      <SheetPrimitive.Root
        data-slot="sheet"
        actionsRef={actions}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </SheetStateContext.Provider>
  )
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        // Section 24 rule 5: the one --backdrop token and nothing of its
        // own, so no blur. It fades with the sheet (5.6).
        "fixed inset-0 z-(--z-dialog) bg-(--backdrop)",
        "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-slow) data-open:ease-enter",
        "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
        className
      )}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------
   Android back - 41.4 rule 9. One history entry per open bottom sheet,
   and one more per step inside it.
   ------------------------------------------------------------------ */

/**
 * What a layer's history entry carries in history.state. `kitLayer` is
 * the name shared with lib/back.ts, which never counts such an entry as
 * a screen. `kitSheet` names the layer (a bottom sheet, a full-screen
 * dialog, an alert dialog). `kitStep` is 0 for the layer itself and n for
 * its nth step. `kitUnder` names the layer of each layer entry directly
 * beneath this one, bottom first, one per entry, as far as they run
 * unbroken down to the screen's own entry: the entry beneath is always
 * the one that was current when this one was pushed, so it is known then
 * and never has to be stepped to.
 */
type LayerEntry = { kitLayer: true; kitSheet: string; kitStep: number; kitUnder: string[] }

function layerEntry(state: unknown): LayerEntry | null {
  const entry = state as Partial<LayerEntry> | null
  if (
    entry?.kitLayer !== true ||
    typeof entry.kitSheet !== "string" ||
    typeof entry.kitStep !== "number"
  ) {
    return null
  }
  return {
    kitLayer: true,
    kitSheet: entry.kitSheet,
    kitStep: entry.kitStep,
    kitUnder: Array.isArray(entry.kitUnder)
      ? entry.kitUnder.filter((layer): layer is string => typeof layer === "string")
      : [],
  }
}

/** The current entry, if it is one of this layer's. */
function ownTop(sheet: string): LayerEntry | null {
  const top = layerEntry(window.history.state)
  return top?.kitSheet === sheet ? top : null
}

/** The layer of each entry from the current one down, top first. */
function layerStack(): string[] {
  const top = layerEntry(window.history.state)
  return top ? [top.kitSheet, ...[...top.kitUnder].reverse()] : []
}

/** An entry for `sheet` at `step`, to sit directly on `under`. */
function newEntry(sheet: string, step: number, under: LayerEntry | null): LayerEntry {
  return {
    kitLayer: true,
    kitSheet: sheet,
    kitStep: step,
    kitUnder: under ? [...under.kitUnder, under.kitSheet] : [],
  }
}

/**
 * Adds an entry at the SAME address. No url is passed, on purpose:
 * Next.js patches pushState (node_modules/next/dist/client/components/
 * app-router.js), and a call with a url makes it dispatch a restore to
 * that url. Without one it only copies its own __NA and tree into this
 * state - so a popstate onto this entry later restores the same tree,
 * which renders nothing new and keeps the page's scroll and state.
 */
function pushEntry(sheet: string, step: number) {
  window.history.pushState(newEntry(sheet, step, layerEntry(window.history.state)), "")
}

/**
 * Turns the current entry, a closing layer's only one, into `sheet`'s
 * first. Same address and no url, for pushEntry's reason; Next.js's
 * patched replaceState then only copies its own state across.
 */
function replaceTopEntry(sheet: string) {
  const top = layerEntry(window.history.state)
  const entry = newEntry(sheet, 0, null)
  entry.kitUnder = top ? top.kitUnder : []
  window.history.replaceState(entry, "")
}

/**
 * A step through history a layer takes itself: leaving the entries of
 * the layers that closed some other way, or one step back from the back
 * arrow. `href` is the address the entries were pushed at.
 */
type OwnStep =
  | { kind: "leave"; sheets: string[]; delta: number; href: string; at: number }
  | { kind: "step" | "correct"; at: number }

/**
 * A step of ours that has not produced its popstate within this long
 * never will (the browser had nowhere to go). It must not swallow the
 * next real one.
 */
const OWN_STEP_TIMEOUT = 1000

const ownSteps: OwnStep[] = []
/** Open phone layers, each told about every popstate not ours. */
const openSheets = new Map<string, (state: unknown) => void>()
let listening = false

function dropExpiredSteps(now: number) {
  while (ownSteps.length > 0 && now - ownSteps[0].at > OWN_STEP_TIMEOUT) ownSteps.shift()
}

/* ------------------------------------------------------------------
   Opening and closing layers - one queue for the whole document.

   history.go() is asynchronous: its popstate arrives a moment later. A
   layer that closes while another opens in the same tap - a three-dot
   menu item that opens an Edit dialog, the unsaved-changes warning's
   "Leave" closing the warning and the sheet under it - would otherwise
   race. Each pushed or stepped on its own and the closing one's entry
   was left in the history, costing an extra Android back press (41.20
   check 8).

   So no layer touches the history for itself when it opens or closes.
   It asks (requestEntries), and once the commit that opened or closed
   it has run all its effects (a microtask), the queue settles every
   request together against the current entry:

     - the closing layers whose entries are on top are counted down from
       the current entry (kitUnder says what lies beneath without
       stepping there);
     - one closing entry and a layer opening: the entry is REPLACED by
       the new layer's (history.replaceState), so the history never
       holds the closed one at all;
     - closing entries alone: one step back over all of them;
     - more than one closing entry and a layer opening: one step back
       over all of them, and the new layer's entry is pushed once that
       step has landed;
     - nothing closing: the new layer's entry is pushed.

   While a step of ours is still on its way, the queue waits for it to
   land (or to time out) and then settles: an entry pushed before an
   earlier step lands would be the one that step takes away.

   A layer that closes while a layer that opened AFTER it is still open
   leaves its entry under that one. It cannot be removed without
   removing the open one's; lib/back.ts never counts it as a screen.
   ------------------------------------------------------------------ */

/** Layer id to its latest request: true open, false closed. Insertion order. */
const requested = new Map<string, boolean>()
let settleQueued = false

function requestEntries(layer: string, open: boolean) {
  // Re-inserted, so the order is that of the latest requests.
  requested.delete(layer)
  requested.set(layer, open)
  if (settleQueued) return
  settleQueued = true
  queueMicrotask(() => {
    settleQueued = false
    settleEntries()
  })
}

/** Callers waiting for the queue to be still (whenLayersSettled). */
const settledWaiters: (() => void)[] = []

/**
 * Resolves every whenLayersSettled() once nothing is left to do: no
 * request waiting for its microtask or for a step to land, and no step
 * of ours still on its way. A step that never lands counts as done once
 * it has expired.
 */
function notifyIfSettled() {
  if (settledWaiters.length === 0 || !layersSettled()) return
  settledWaiters.splice(0).forEach((resolve) => resolve())
}

/**
 * Resolves once the layer queue is still: every layer that opened or
 * closed has its history entries settled, and every step back of ours has
 * landed. A navigation that must start from the screen's own entry waits
 * for this - useUnsavedChanges's "Leave", after the warning has closed:
 * started while the warning's own step back is still on its way, the two
 * history moves race and the person lands two screens back.
 *
 * Call it after the commit that closed the layer has run (from Base UI's
 * onOpenChangeComplete, say): before that, the close has not been asked
 * for yet, and the queue reads still. It checks in a microtask, so a
 * request made in the same task is seen.
 */
function whenLayersSettled(): Promise<void> {
  return new Promise((resolve) => {
    settledWaiters.push(resolve)
    queueMicrotask(notifyIfSettled)
  })
}

function settleEntries() {
  settleNow()
  notifyIfSettled()
}

function settleNow() {
  if (requested.size === 0) return
  dropExpiredSteps(performance.now())
  if (ownSteps.length > 0) return

  const closing = new Set<string>()
  const opening: string[] = []
  requested.forEach((open, layer) => (open ? opening.push(layer) : closing.add(layer)))
  requested.clear()

  const stack = layerStack()
  let leave = 0
  while (leave < stack.length && closing.has(stack[leave])) leave++
  // A layer that already has its entry (a remount while open) keeps it.
  const kept = stack.slice(leave)
  const toOpen = opening.filter((layer) => !kept.includes(layer))

  if (leave === 0) {
    toOpen.forEach((layer) => pushEntry(layer, 0))
    return
  }
  if (leave === 1 && toOpen.length > 0) {
    replaceTopEntry(toOpen[0])
    toOpen.slice(1).forEach((layer) => pushEntry(layer, 0))
    return
  }
  takeOwnStep(
    {
      kind: "leave",
      sheets: [...closing],
      delta: leave,
      href: window.location.href,
      at: performance.now(),
    },
    -leave
  )
  // Pushed once the step back has landed (settleEntries runs again then).
  toOpen.forEach((layer) => requested.set(layer, true))
}

/** True when the queue is still: nothing requested, nothing on its way. */
function layersSettled(): boolean {
  dropExpiredSteps(performance.now())
  return !settleQueued && requested.size === 0 && ownSteps.length === 0
}

type NavigationLike = {
  currentEntry: { index: number } | null
  entries(): { url: string | null }[]
}

/**
 * True when the top entry we just stepped back from no longer holds the
 * address it was pushed at: the app replaced it (router.replace from the
 * sheet's own button) between our history.go() and the browser carrying
 * it out. Only the Navigation API can see an entry that is no longer
 * current; without it this cannot be told, and reads false.
 */
function replacedOnTheWay(step: Extract<OwnStep, { kind: "leave" }>): boolean {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation
  const current = nav?.currentEntry
  if (!nav || typeof nav.entries !== "function" || !current) return false
  const top = nav.entries()[current.index + step.delta]
  return top !== undefined && top.url !== step.href
}

/**
 * One capture listener for the document, added once and never removed:
 * it must outlive a sheet, because a closed sheet's own popstate arrives
 * after the sheet has gone.
 *
 * OUR OWN STEPS ARE SWALLOWED, and that is the point of capturing.
 * Next.js answers every popstate with a restore, and a restore that
 * arrives while a navigation is under way marks that navigation
 * discarded (app-router-instance.js, dispatchAction). A sheet button
 * that closes the sheet and navigates in one handler - "Show 12
 * results", a menu item that is a link - would lose its navigation to
 * the sheet's own tidying. stopImmediatePropagation in the capture phase
 * runs before Next.js's listener (capture listeners on the target run
 * first), so it never sees a step that only removed same-address
 * entries. lib/back.ts ignores same-address popstates anyway.
 *
 * Every other popstate - Android back, a back gesture, the browser's own
 * buttons - goes to the open sheets AND on to Next.js. Onto a sheet's
 * own entry that is a restore of the same tree, which changes nothing.
 */
function onPopState(event: PopStateEvent) {
  const now = performance.now()
  dropExpiredSteps(now)

  const own = ownSteps.shift()
  if (own) {
    event.stopImmediatePropagation()
    if (own.kind === "leave") {
      // The browser went back from somewhere other than our top entry: a
      // navigation started in the same handler pushed a new entry above
      // ours first (we landed on one of the closed layers' entries), or
      // replaced ours (the entry above is not where we left it). Either
      // way, the app is now on that newer entry; go forward to it again,
      // silently.
      const landed = layerEntry(window.history.state)
      if ((landed && own.sheets.includes(landed.kitSheet)) || replacedOnTheWay(own)) {
        takeOwnStep({ kind: "correct", at: now }, own.delta)
      }
    }
    // Requests that waited for this step to land.
    settleEntries()
    return
  }

  openSheets.forEach((onPop) => onPop(event.state))
}

function takeOwnStep(step: OwnStep, delta: number) {
  ownSteps.push(step)
  window.history.go(delta)
  // A step that never lands (nowhere to go) must not hold the queue.
  window.setTimeout(settleEntries, OWN_STEP_TIMEOUT + 1)
}

function listen() {
  if (listening) return
  listening = true
  window.addEventListener("popstate", onPopState, true)
}

/** A layer's steps, for Android back to walk (41.8 rule 9). */
type LayerSteps = {
  /** How many steps are on screen now. */
  shown: () => number
  /** Shows the steps up to `depth` (0 is the layer itself). */
  show: (depth: number) => void
}

/**
 * One history entry while `active`, and one more per step (41.4 rule 9).
 * Back onto a lower step of the layer shows that step; back past the
 * layer's first entry asks to close it through `requestClose`, so the
 * unsaved-changes guard can refuse (11.3 rule 10), and a refusal puts the
 * entries back. When the layer closes some other way, the queue above
 * removes its entries.
 *
 * `requestClose` and `steps` are read when needed, never captured: they
 * may change on every render.
 */
function useLayerEntries(
  id: string,
  active: boolean,
  requestClose: () => CloseOutcome,
  steps?: LayerSteps
) {
  const latest = React.useRef({ active, requestClose, steps })
  React.useLayoutEffect(() => {
    latest.current = { active, requestClose, steps }
  })

  /** Puts the layer's entries back after a refused close. */
  const restoreEntries = React.useCallback(() => {
    if (ownTop(id)) return
    const shown = latest.current.steps?.shown() ?? 0
    for (let step = 0; step <= shown; step++) pushEntry(id, step)
  }, [id])

  /** A popstate that was not ours, while this layer is open. */
  const onPop = React.useCallback(
    (state: unknown) => {
      const entry = layerEntry(state)
      if (entry?.kitSheet === id) {
        const steps = latest.current.steps
        const shown = steps?.shown() ?? 0
        if (entry.kitStep < shown) steps?.show(entry.kitStep)
        // Forward onto entries of steps no longer shown: step back off
        // them again, so the entries match the screen.
        else if (entry.kitStep > shown) {
          takeOwnStep({ kind: "step", at: performance.now() }, shown - entry.kitStep)
        }
        return
      }
      // Back landed on the entry of a layer that opened over this one (a
      // warning over a sheet over select mode, and back closed the
      // warning): this layer is still under it, and stays open.
      if (entry?.kitUnder.includes(id)) return
      // Back went past the layer's first entry: close it, through
      // onOpenChange, so the unsaved-changes guard can refuse. If it
      // refuses, the layer stays and so must its entry.
      const outcome = latest.current.requestClose()
      if (outcome === "canceled") {
        restoreEntries()
      } else if (outcome === "accepted") {
        // A controlled caller that let the close through but did not
        // close: the layer is still open, so it needs its entry back.
        window.setTimeout(() => {
          if (latest.current.active) restoreEntries()
        }, 0)
      }
    },
    [id, restoreEntries]
  )

  const pushed = React.useRef(false)
  React.useLayoutEffect(() => {
    if (active) {
      listen()
      requestEntries(id, true)
      openSheets.set(id, onPop)
      pushed.current = true
      return
    }
    if (!pushed.current) return
    pushed.current = false
    openSheets.delete(id)
    // Closed some other way than back - the close button, the backdrop,
    // a swipe, the caller's own button. The queue removes the entries
    // quietly, or hands the last one to a layer opening in its place.
    requestEntries(id, false)
  }, [active, id, onPop])

  // Unmounted while open: the page went away under it, by a navigation
  // that did not close the layer first. Stepping back now would undo
  // that navigation, so the entry is left behind; lib/back.ts never
  // counts it as a screen. An open still waiting in the queue is
  // dropped (React's development double mount asks again).
  React.useLayoutEffect(
    () => () => {
      if (!pushed.current) return
      pushed.current = false
      openSheets.delete(id)
      if (requested.get(id) === true) requested.delete(id)
    },
    [id]
  )
}

/**
 * Android back for a phone layer that is not a SheetContent: one history
 * entry while `active`, and back asks `requestClose`. alert-dialog.tsx
 * uses it, so an alert dialog's back press acts as its Cancel (decision
 * 22) through the same queue and listener as every sheet. Pass
 * `active` only on phone: on desktop nothing is pushed.
 *
 * `requestClose` returns what became of the close: "canceled" keeps the
 * layer and puts its entry back. A layer that must never let back fall
 * through to the page answers "canceled" whenever it did not close.
 */
function useLayerHistory(active: boolean, requestClose: () => CloseOutcome) {
  const id = React.useId()
  useLayerEntries(id, active, requestClose)
}

/* ------------------------------------------------------------------
   Steps - 41.8 rule 9.
   ------------------------------------------------------------------ */

type SheetStep = {
  title: string
  content: React.ReactNode
  /**
   * While this step is on top, the sheet takes its full height (41.8
   * rule 8): a searchable list opened as a step, its search box fixed at
   * the top so the keyboard never covers the list.
   */
  fullHeight?: boolean
}

type SheetStepApi = {
  /** True inside a bottom sheet on phone. Elsewhere open and back do nothing. */
  inSheet: boolean
  open(step: SheetStep): void
  back(): void
}

const OUTSIDE_SHEET: SheetStepApi = { inSheet: false, open() {}, back() {} }

const SheetStepContext = React.createContext<SheetStepApi>(OUTSIDE_SHEET)

/**
 * A choice inside a bottom sheet, such as a select among filters, opens
 * INSIDE the same sheet (41.8 rule 9): its content replaces the sheet's
 * body, a back arrow and its title replace the header, and the footer
 * stays. back(), the arrow and Android back return to the step before.
 * Never a sheet on a sheet (24 rule 4).
 *
 *   const step = useSheetStep()
 *   if (step.inSheet) step.open({ title: "Status", content: <StatusList /> })
 *
 * `fullHeight: true` gives the sheet its full height while that step is
 * on top (41.8 rule 8, a searchable list), and back gives the sheet's
 * own height back.
 *
 * Outside a phone bottom sheet - on desktop, in any other sheet -
 * inSheet is false and both calls do nothing, so the caller opens its
 * own popup as usual.
 *
 * The content is rendered as given at open(): it is an element, not a
 * function of the caller's later state, and it renders inside the sheet,
 * under the sheet's providers rather than the caller's. Give anything
 * that changes while the step is open (ticks in a multi-select, a search
 * box) state of its own. A SheetBody as the content is used as it is;
 * anything else is wrapped in one, which pads it.
 */
function useSheetStep(): SheetStepApi {
  return React.useContext(SheetStepContext)
}

type OpenStep = SheetStep & {
  key: number
  /** Where focus was when the step opened, to return it on back (39.3). */
  opener: HTMLElement | null
}

let stepKey = 0

/* ------------------------------------------------------------------
   The bottom sheet's own parts.
   ------------------------------------------------------------------ */

/**
 * Tells SheetHeader, SheetBody and SheetFooter they are in a phone layer,
 * which of the two it is, and hands a bottom sheet's header the close
 * button to place in its band.
 */
const BottomSheetContext = React.createContext<{
  closeButton: React.ReactNode
  presentation: "sheet" | "screen"
} | null>(null)

/**
 * 41.8 rules 6 and 11, 41.6 rule 8: the buttons in a phone footer share
 * its width, in the order written - the primary last, so on the right.
 * 41.9 rule 7: a control's height is a minimum on phone, so a label that
 * wraps in a half-width button at the largest text size makes the button
 * taller instead of being clipped, and the row's buttons stay one height
 * (give the row items-stretch).
 *
 * The one copy: the bottom sheet's footer and the action bar here,
 * alert-dialog.tsx's footer and popover.tsx's buttons import it. Every
 * class is behind `phone:`, so it can sit in markup both layouts share
 * (the alert dialog's footer) and the desktop layout never sees it.
 */
const SHARE_THE_WIDTH =
  "phone:*:h-auto phone:*:min-h-control phone:*:min-w-0 phone:*:flex-1 phone:*:py-2 phone:*:text-center phone:*:whitespace-normal"

/** 41.6 rule 8: at most two buttons in the action bar. */
const MAX_ACTION_BAR_BUTTONS = 2

/** The plain text of a node: a title that a bar or step header shows as a string. */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ""
}

/**
 * The components that name a layer: SheetTitle, and any other title part
 * registered with registerLayerTitle (dialog.tsx's DialogTitle). A full-
 * screen layer shows its title in the app bar and moves everything else
 * in its header's band to the app bar's actions (41.8 rule 10).
 */
const layerTitles = new Set<unknown>()

/** Marks a title component, so a full-screen layer keeps it as the title. */
function registerLayerTitle(component: unknown) {
  layerTitles.add(component)
}

/** True when this node is, or holds at any depth, a layer title. */
function holdsLayerTitle(node: React.ReactNode): boolean {
  return React.Children.toArray(node).some(
    (child) =>
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      (child.type === SheetTitle ||
        layerTitles.has(child.type) ||
        holdsLayerTitle(child.props.children))
  )
}

/** The elements written, looking inside fragments: <><A/><B/></> is two. */
function countParts(node: React.ReactNode): number {
  return React.Children.toArray(node).reduce<number>(
    (n, child) =>
      React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment
        ? n + countParts(child.props.children)
        : n + 1,
    0
  )
}

/**
 * Where a drag must not start: a control in the header (the close or
 * back button) takes a tap, however much the finger moves on it.
 */
const NOT_A_DRAG =
  "button, a[href], input, select, textarea, label, [role='button'], [role='link'], [contenteditable='true']"

/**
 * 41.6 rule 8, for every action bar (the page's ActionBar in
 * action-bar.tsx and a full-screen dialog's footer here): counts the
 * buttons written, looking inside fragments, and throws past two - in
 * every build, as the app bar does past its limit, so a third button
 * fails on the computer and in production too, not only on a phone in
 * development. `whereTheRestGo` ends the message with where the others
 * belong. Returns the count: no buttons, no bar (41.6 rule 9).
 */
function checkActionBarButtons(children: React.ReactNode, whereTheRestGo: string): number {
  const count = countParts(children)
  if (count > MAX_ACTION_BAR_BUTTONS) {
    throw new Error(
      `An action bar was given ${count} buttons. FRONTEND_RULES_PHONE.md section 41.6 rule 8 allows two at most: the primary on the right, one other on the left as secondary. ${whereTheRestGo}`
    )
  }
  return count
}

/**
 * How far the field being typed in is kept from what is below it (an
 * action bar, the keyboard) and from the top of a layer's body: 16px
 * (space-4), the content area's own padding. One value, so a field sits
 * the same distance above Save on a page and in a full-screen dialog.
 */
const FIELD_CLEARANCE = 16

/** Where the field being typed in must stay in view, and what scrolls to keep it there. */
type FieldArea =
  /** A full-screen layer's body: the field stays inside its edges, moved by its own scrollTop. */
  | { scroller: HTMLElement }
  /** A page's fixed action bar: the field stays above it, moved by the window. */
  | { bar: HTMLElement }

/**
 * 41.7 rule 4: the field being typed in sits in view, FIELD_CLEARANCE
 * clear of what is below it. The one copy, for both places:
 *
 *   - In a full-screen layer: inside its body's edges, by the body's own
 *     scrollTop - the page is locked under the layer. The body ends at
 *     the layer's action bar, or at the keyboard when it has none.
 *   - On a page with a fixed action bar: above the bar, by the window,
 *     which is what scrolls on phone (content-area.tsx). A field in a
 *     sheet or dialog is that layer's own: it sits above this bar and
 *     keeps its own fields in view.
 *
 * Instant: a scroll is not on section 5.6's list of motion.
 */
function keepFieldInView(area: FieldArea) {
  const field = document.activeElement
  if (!(field instanceof HTMLElement)) return
  if ("scroller" in area) {
    const { scroller } = area
    if (!scroller.contains(field)) return
    const view = scroller.getBoundingClientRect()
    const box = field.getBoundingClientRect()
    if (box.bottom > view.bottom - FIELD_CLEARANCE) {
      scroller.scrollTop += box.bottom - view.bottom + FIELD_CLEARANCE
    } else if (box.top < view.top + FIELD_CLEARANCE) {
      scroller.scrollTop -= view.top - box.top + FIELD_CLEARANCE
    }
    return
  }
  const { bar } = area
  if (bar.contains(field) || field.closest("[role=dialog], [role=alertdialog]")) return
  const below = field.getBoundingClientRect().bottom - (bar.getBoundingClientRect().top - FIELD_CLEARANCE)
  if (below > 0) window.scrollBy({ top: below, left: 0 })
}

/**
 * Runs keepFieldInView while `active` and the keyboard is open (41.7 rule
 * 4, 41.13 rule 6): when the keyboard opens or changes height - the
 * visible area has just shrunk, so a field low on the screen can be left
 * under the bar - and when focus moves to another field while it stays
 * open (a tap, or the keyboard's Next), after the browser's own scrolling
 * for the focus, so the measurement is the final one.
 *
 * A layout effect: the scroll lands in the same frame as the keyboard's
 * new height, before the field can be painted under the bar.
 */
function useFieldInView(
  active: boolean,
  element: React.RefObject<HTMLElement | null>,
  kind: "scroller" | "bar"
) {
  const keyboard = useKeyboard()
  React.useLayoutEffect(() => {
    const el = element.current
    if (!active || !keyboard.open || !el) return
    const area: FieldArea = kind === "scroller" ? { scroller: el } : { bar: el }
    keepFieldInView(area)
    // A layer's body hears its own fields; a page's bar, the document's.
    const target: EventTarget = kind === "scroller" ? el : document
    let frame = 0
    const onFocusIn = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => keepFieldInView(area))
    }
    target.addEventListener("focusin", onFocusIn)
    return () => {
      target.removeEventListener("focusin", onFocusIn)
      window.cancelAnimationFrame(frame)
    }
  }, [active, element, kind, keyboard.open, keyboard.inset])
}

/**
 * 41.4 rule 10: this close to a side edge (px), a swipe is the phone's own
 * back gesture, so none of the kit's swipes (sheets, toasts, rows, pull to
 * refresh) starts there. The one copy: phone-list.tsx imports it.
 */
const SIDE_EDGE_PX = 24
/** A swipe past this share of the sheet's height closes it. */
const CLOSE_SHARE = 0.25
/** So does a flick faster than this, in px per ms, however short. */
const FLICK_SPEED = 0.5

/** A motion token as milliseconds, whichever unit globals.css wrote it in. */
function tokenMs(value: string) {
  const v = value.trim()
  return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * A swipe that did not close the sheet: the sheet returns to rest, at
 * the medium duration with the enter easing, as a dropped board card
 * settles (5.6). With reduce motion it is simply back (5.6 rule 3).
 */
function settle(popup: HTMLElement, from: number) {
  popup.style.removeProperty("transform")
  if (from <= 0 || prefersReducedMotion()) return
  const root = getComputedStyle(document.documentElement)
  popup.animate(
    [{ transform: `translate3d(0, ${from}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
    {
      duration: tokenMs(root.getPropertyValue("--duration-medium")),
      easing: root.getPropertyValue("--ease-enter").trim() || undefined,
    }
  )
}

/** Hands an element to a ref of either kind - here, a caller's ref on the popup. */
function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

/**
 * 41.8 rule 4: up to 90% of the visible height left above the keyboard,
 * less the top safe area. dvh, never vh (41.13 rule 5). On Android the
 * keyboard shrinks dvh itself and --keyboard-inset stays 0; on iPhone dvh
 * keeps its height and the inset is taken off. Rule 8's searchable list
 * opens at this full height (`fullHeight`).
 */
const BOTTOM_SHEET_MAX_H =
  "max-h-[calc(0.9_*_(100dvh_-_var(--keyboard-inset))_-_var(--safe-top))]"
const BOTTOM_SHEET_FULL_H =
  "h-[calc(0.9_*_(100dvh_-_var(--keyboard-inset))_-_var(--safe-top))]"

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  fullHeight = false,
  presentation = "sheet",
  screenTitle = "",
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  /**
   * Phone bottom sheet only: open at the full height rather than
   * growing with the content (41.8 rule 8, a searchable list). Ignored
   * by every other sheet.
   */
  fullHeight?: boolean
  /**
   * Phone only. "screen" draws a full-screen layer with the app bar
   * instead of a sheet (41.8 rule 10, what dialog.tsx's medium and large
   * dialogs become). `side`, `fullHeight` and `showCloseButton` do not
   * apply to it: its back arrow is its close. Ignored on desktop.
   */
  presentation?: "sheet" | "screen"
  /**
   * presentation="screen" only: the app bar's title, as text (PhoneAppBar
   * takes a string). The SheetTitle still names the layer for screen
   * readers, hidden: the app bar shows its words.
   */
  screenTitle?: string
}) {
  const { layout } = useLayout()
  const phone = layout === "phone"
  const screen = phone && presentation === "screen"
  const bottomSheet = phone && side === "bottom" && !screen
  // Either phone layer: one history entry, closed through onOpenChange.
  const layer = bottomSheet || screen

  /*
   * Section 36.4: the sheet's own header sits one band level below
   * whatever is around the sheet. On phone the shell's BandScope makes
   * that 2 - the accent form, on surface - and an on-brand button there
   * is white on white. So on phone the sheet's header buttons follow the
   * band's form: on-brand on a solid band (6.3.2), the quiet ghost on the
   * accent form (6.3). On desktop it stays on-brand, exactly as before.
   *
   * 41.8 rule 6: a bottom sheet's header is ALWAYS the accent form on
   * phone. Inside the shell the shell's scope already makes it so; a
   * bottom sheet opened outside it (level 0: the sign-in page, the
   * kitchen sink) takes one more scope of its own to get there.
   */
  const outerLevel = useBandLevel()
  const extraScope = bottomSheet && outerLevel === 0
  const headerLevel = outerLevel + 1 + (extraScope ? 1 : 0)
  const headerButton = !phone || headerLevel <= 1 ? "on-brand" : "ghost"

  const sheetState = React.useContext(SheetStateContext)
  const active = layer && sheetState?.open === true
  const id = React.useId()

  /*
   * Section 24 rule 6, as dialog.tsx does it and for its recorded
   * reason: the component assembles header, scrolling body and footer
   * itself rather than trusting each caller to. A single SheetBody is
   * passed through as it is.
   */
  const items = React.Children.toArray(children)
  const isType = (child: React.ReactNode, type: unknown) =>
    React.isValidElement(child) && child.type === type
  const header = items.filter((c) => isType(c, SheetHeader))
  const footer = items.filter((c) => isType(c, SheetFooter))
  const rest = items.filter((c) => !isType(c, SheetHeader) && !isType(c, SheetFooter))
  const singleBody = rest.length === 1 && isType(rest[0], SheetBody)
  const body =
    rest.length === 0 ? null : singleBody ? rest : <SheetBody>{rest}</SheetBody>

  const popupRef = React.useRef<HTMLDivElement | null>(null)
  const callerRef = props.ref
  const setPopup = React.useCallback(
    (node: HTMLDivElement | null) => {
      popupRef.current = node
      assignRef(callerRef, node)
    },
    [callerRef]
  )

  /* -- Steps ------------------------------------------------------- */

  const [steps, setSteps] = React.useState<OpenStep[]>([])

  // A sheet opens at its first step, every time. Reset while rendering
  // the open, not when closing: the exit animation keeps what it showed.
  const [wasActive, setWasActive] = React.useState(active)
  if (wasActive !== active) {
    setWasActive(active)
    if (active && steps.length > 0) setSteps([])
  }

  // Callbacks run outside render, and read the latest through these.
  const stepsRef = React.useRef(steps)
  const activeRef = React.useRef(active)
  const stateRef = React.useRef(sheetState)
  React.useLayoutEffect(() => {
    stepsRef.current = steps
    activeRef.current = active
    stateRef.current = sheetState
  })

  const stepBackButton = React.useRef<HTMLButtonElement | null>(null)
  const focusAfterStep = React.useRef<"back-button" | HTMLElement | null>(null)

  /** Shows the steps up to `depth` (0 is the sheet itself). */
  const showDepth = React.useCallback((depth: number) => {
    const current = stepsRef.current
    if (depth >= current.length) return
    // 39.3: focus returns to what opened the step. Not to a text field,
    // which would open the keyboard unasked (41.8 rule 19).
    const opener = current[depth].opener
    const typing = opener instanceof HTMLInputElement || opener instanceof HTMLTextAreaElement
    focusAfterStep.current = opener && !typing ? opener : null
    stepsRef.current = current.slice(0, depth)
    setSteps(stepsRef.current)
  }, [])

  const openStep = React.useCallback(
    (step: SheetStep) => {
      if (!activeRef.current) return
      const current = stepsRef.current
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      // Android back returns to the step before (41.4 rule 9), so each
      // step has its own entry - pushed only while the entries are in
      // step with the steps on screen.
      if (ownTop(id)?.kitStep === current.length) pushEntry(id, current.length + 1)
      focusAfterStep.current = "back-button"
      stepsRef.current = [...current, { ...step, key: ++stepKey, opener }]
      setSteps(stepsRef.current)
    },
    [id]
  )

  const backStep = React.useCallback(() => {
    const current = stepsRef.current
    if (!activeRef.current || current.length === 0) return
    // Our own step back off the step's entry, so Android back afterwards
    // still has the right number of entries to undo.
    if (ownTop(id)?.kitStep === current.length) takeOwnStep({ kind: "step", at: performance.now() }, -1)
    showDepth(current.length - 1)
  }, [id, showDepth])

  const stepApi = React.useMemo<SheetStepApi>(
    () => ({ inSheet: true, open: openStep, back: backStep }),
    [openStep, backStep]
  )

  React.useLayoutEffect(() => {
    const target = focusAfterStep.current
    if (!target) return
    focusAfterStep.current = null
    if (target === "back-button") stepBackButton.current?.focus()
    else (target.isConnected ? target : popupRef.current)?.focus()
  }, [steps])

  /* -- History ----------------------------------------------------- */

  // 41.4 rule 9: one entry for the layer and one per step, through the
  // document's one queue (useLayerEntries).
  useLayerEntries(
    id,
    active,
    () => sheetState?.requestClose() ?? null,
    { shown: () => stepsRef.current.length, show: showDepth }
  )

  /*
   * 41.7 rule 4: while the keyboard is open the field being typed in sits
   * in view above the action bar. When the keyboard opens (or changes
   * height) the layer has just shrunk to end at it, so a field low in the
   * form can be left under the bar; and while it stays open, a tap or
   * Next that moves to another field can land on one under the bar too.
   * The layer's own scroller is moved, by scrollTop, never the page: the
   * page is locked under the layer. The same logic as a page's action bar
   * (useFieldInView); the layer's footer, an ActionBarFrame, leaves it to
   * this, so it also works for a layer with no footer.
   */
  const screenScroller = React.useRef<HTMLDivElement | null>(null)
  useFieldInView(screen, screenScroller, "scroller")

  /* -- Swipe down to close ----------------------------------------- */

  const drag = React.useRef<{
    pointer: number
    startY: number
    lastY: number
    lastT: number
    speed: number
    threshold: number
    dragging: boolean
  } | null>(null)

  const onDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return
    // 41.4 rule 10: the side edges belong to the phone's back gesture.
    if (event.clientX < SIDE_EDGE_PX || event.clientX > window.innerWidth - SIDE_EDGE_PX) return
    // Only the handle and the header's own ground start a swipe. A press
    // on the close or back button (or any control the caller put in the
    // band) stays a tap, even if the finger slides a few pixels.
    const target = event.target
    if (target instanceof Element) {
      const control = target.closest(NOT_A_DRAG)
      if (control && event.currentTarget.contains(control)) return
    }
    drag.current = {
      pointer: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      speed: 0,
      // The board's press-or-drag distance (35.6.1): less is a tap on
      // the handle or the header's ground, not a swipe.
      threshold: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--drag-threshold")
      ),
      dragging: false,
    }
  }

  const onDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const popup = popupRef.current
    if (!d || !popup || event.pointerId !== d.pointer) return
    const dy = event.clientY - d.startY
    if (!d.dragging) {
      if (Math.abs(dy) < d.threshold) return
      // Only down closes. A move up first is not a swipe of ours.
      if (dy < 0) {
        drag.current = null
        return
      }
      d.dragging = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const dt = event.timeStamp - d.lastT
    if (dt > 0) d.speed = (event.clientY - d.lastY) / dt
    d.lastY = event.clientY
    d.lastT = event.timeStamp
    // Section 1 rule 2 forbids inline styles for colour, spacing and
    // typography. This is none of them: it is where the finger is, a
    // runtime measurement that only an inline transform can follow
    // (5.6: the sheet follows the finger while dragged down). It is
    // removed when the finger lifts.
    popup.style.transform = `translate3d(0, ${Math.max(0, dy)}px, 0)`
  }

  const onDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const popup = popupRef.current
    drag.current = null
    if (!d?.dragging || !popup || event.pointerId !== d.pointer) return
    const dy = Math.max(0, event.clientY - d.startY)
    // A cancelled pointer (the browser took the gesture) never closes.
    const cancelled = event.type === "pointercancel"
    const far = dy > popup.offsetHeight * CLOSE_SHARE
    const flicked = d.speed > FLICK_SPEED
    if (cancelled || (!far && !flicked)) {
      settle(popup, dy)
      return
    }
    const outcome = stateRef.current?.requestClose() ?? null
    if (outcome !== "accepted") {
      settle(popup, dy)
      return
    }
    // Closing: the exit animation (slide-out-to-bottom) has no start
    // frame, so it carries on from where the finger left the sheet. With
    // reduce motion globals.css zeroes the slide, which would carry the
    // sheet back UP as it fades; pinning the exit offset here keeps it
    // fading where it is. A runtime measurement, as above.
    if (prefersReducedMotion()) popup.style.setProperty("--tw-exit-translate-y", `${dy}px`)
    // A controlled caller that let the close through but did not close
    // would leave the sheet hanging where the finger let go. The close,
    // when it happens, has rendered by now (pointerup is a discrete
    // event, flushed before any timer).
    window.setTimeout(() => {
      if (!activeRef.current) return
      popup.style.removeProperty("--tw-exit-translate-y")
      settle(popup, dy)
    }, 0)
  }

  /* -- Rendering --------------------------------------------------- */

  if (!layer) {
    return (
      // Section 36.4: a banded region, scope over the whole subtree.
      <BandScope>
        <SheetPortal>
          <SheetOverlay />
          <SheetPrimitive.Popup
            data-slot="sheet-content"
            data-side={side}
            className={cn(
              // Section 5.6: a sheet slides in from its own edge, slow, and
              // leaves at medium. Keyframes (tw-animate) rather than
              // transitions, so the one reduce-motion rule in globals.css
              // turns the slide into a fade here as it does everywhere.
              "fixed z-(--z-dialog) flex flex-col gap-4 border-border-light bg-surface bg-clip-padding text-body text-text-primary shadow-dialog",
              "data-open:animate-in data-open:animation-duration-(--duration-slow) data-open:ease-enter",
              "data-closed:animate-out data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
              // With reduce motion the slide is removed centrally, so the
              // sheet needs a fade of its own or it simply appears.
              "motion-reduce:data-open:fade-in-0 motion-reduce:data-closed:fade-out-0",
              "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-open:slide-in-from-bottom data-[side=bottom]:data-closed:slide-out-to-bottom",
              "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-open:slide-in-from-top data-[side=top]:data-closed:slide-out-to-top",
              "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:sm:max-w-sm data-[side=left]:data-open:slide-in-from-left data-[side=left]:data-closed:slide-out-to-left",
              "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:sm:max-w-sm data-[side=right]:data-open:slide-in-from-right data-[side=right]:data-closed:slide-out-to-right",
              className
            )}
            {...props}
          >
            {/* Renders no DOM. A side sheet opened from inside a phone
                layer must not take that layer's header, body and footer. */}
            <BottomSheetContext.Provider value={null}>{children}</BottomSheetContext.Provider>
            {showCloseButton && (
              <SheetPrimitive.Close
                data-slot="sheet-close"
                render={
                  // Section 6.3.2 - it sits on the header band.
                  <Button
                    variant={headerButton}
                    className="absolute top-3 right-3"
                    size="icon"
                  />
                }
              >
                <XIcon
                />
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            )}
          </SheetPrimitive.Popup>
        </SheetPortal>
      </BandScope>
    )
  }

  if (screen) {
    /*
     * Content with no header, no footer and no SheetBody brings its own
     * layout and its own scrolling (the command palette): it fills the
     * space under the app bar and is not wrapped, so no second scroller
     * goes round its list (section 1 rule 8, as dialog.tsx on desktop).
     */
    const bare = header.length === 0 && footer.length === 0 && !singleBody

    /*
     * 41.8 rule 10: the app bar IS the header's band here. Its title is
     * the layer's (screenTitle); everything else the caller put in the
     * band - a three-dot menu, a text button - goes to the app bar's
     * actions rather than vanishing with the hidden band. PhoneAppBar
     * holds them to its limit (41.4 rule 4) and throws past it. The
     * header keeps its title parts (hidden, they still name the layer)
     * and its description.
     */
    const appBarActions: React.ReactNode[] = []
    const screenHeader = header.map((child) => {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>
      const kept = React.Children.toArray(element.props.children).filter((part) => {
        if (isType(part, SheetDescription) || holdsLayerTitle(part)) return true
        appBarActions.push(part)
        return false
      })
      return React.cloneElement(element, undefined, kept)
    })

    return (
      // Section 36.4: the app bar is the outermost band in the layer, so
      // everything inside sits one level deeper - a card or a table
      // header in the body takes the accent form. In the shell that is
      // already so; this keeps it so outside the shell too.
      <BandScope>
        <SheetPortal>
          <SheetPrimitive.Popup
            data-slot="sheet-content"
            data-presentation="screen"
            className={cn(
              // 41.8 rule 10: covers the screen, on the dialog layer
              // (5.5), on the page's own ground (41.4). Its bottom is the
              // top of the keyboard while it is open, so the action bar,
              // its last row, sits directly on the keyboard and the body
              // ends above it (41.7 rule 4, 41.13 rule 6). It covers the
              // page entirely, so it has no backdrop.
              "fixed inset-x-0 top-0 bottom-keyboard-inset z-(--z-dialog) flex flex-col overflow-hidden outline-none",
              "bg-surface-sunken text-body text-text-primary",
              // 41.14 rule 4: no page-change animation, and section 5.6
              // lists no screen slide. A fade, at the dialog's
              // durations: slow in, medium out.
              "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-slow) data-open:ease-enter",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
              className
            )}
            {...props}
            ref={setPopup}
            // 41.8 rule 19: the layer itself takes focus, never a field,
            // so the keyboard stays shut until a field is tapped (41.7
            // rule 17). Focus returns to the opener on close (39.3).
            initialFocus={props.initialFocus ?? popupRef}
          >
            <BottomSheetContext.Provider value={{ closeButton: null, presentation: "screen" }}>
              {/* A screen, not a sheet: a select inside it opens a sheet
                  of its own (41.7 rule 7), not a step of this layer. */}
              <SheetStepContext.Provider value={OUTSIDE_SHEET}>
                <PhoneAppBar
                  titleAs="h2"
                  title={screenTitle}
                  actions={appBarActions.length > 0 ? appBarActions : undefined}
                  leading={
                    // 41.4 rules 6 and 10: chevron-left, "Back", the
                    // bar's fixed 44px, no tooltip (41.8 rule 16). It is
                    // the layer's only close (no x as well), and it
                    // closes through onOpenChange, so the unsaved-changes
                    // guard can refuse (11.3 rule 10).
                    <SheetPrimitive.Close
                      data-slot="sheet-close"
                      render={
                        <Button
                          variant="on-brand"
                          size="icon"
                          className="size-bar-button"
                          aria-label={PHONE_WORDS.a11y.back}
                        />
                      }
                    >
                      <ChevronLeftIcon className="size-icon-empty" />
                    </SheetPrimitive.Close>
                  }
                />
                {bare ? (
                  <div
                    data-slot="sheet-screen-body"
                    className="flex min-h-0 flex-1 flex-col pr-safe-right pb-safe-bottom pl-safe-left"
                  >
                    {/* 41.13 rule 10: held sideways, the content keeps
                        to the centred phone column. */}
                    <div className="mx-auto flex min-h-0 w-full max-w-phone-column flex-1 flex-col overflow-hidden">
                      {rest}
                    </div>
                  </div>
                ) : (
                  <div
                    ref={screenScroller}
                    data-slot="sheet-screen-body"
                    className={cn(
                      // The one scroller: the description and the body
                      // scroll together under the app bar, which, with
                      // the action bar, is all that stays (41.4).
                      "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-safe-right pl-safe-left",
                      // With no action bar below, the body clears the
                      // home indicator itself (41.13 rule 2).
                      footer.length === 0 && "pb-safe-bottom"
                    )}
                  >
                    <div className="mx-auto w-full max-w-phone-column">
                      {screenHeader}
                      {body}
                    </div>
                  </div>
                )}
                {footer}
              </SheetStepContext.Provider>
            </BottomSheetContext.Provider>
          </SheetPrimitive.Popup>
        </SheetPortal>
      </BandScope>
    )
  }

  const top = steps.length > 0 ? steps[steps.length - 1] : null

  // In the band, at the end of its row (41.8 rule 6), rather than
  // positioned on the popup: the handle sits above the band here.
  const closeButton = showCloseButton ? (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      render={<Button variant={headerButton} size="icon" className="-mr-2" />}
    >
      <XIcon />
      <span className="sr-only">{PHONE_WORDS.a11y.close}</span>
    </SheetPrimitive.Close>
  ) : null

  return (
    // 36.4 and 41.8 rule 6: the sheet's scope, plus one more where nothing
    // banded is around it, so its header is the accent form either way.
    <BandScope>
      <BandScope active={extraScope}>
        <SheetPortal>
          <SheetOverlay />
          <SheetPrimitive.Popup
            data-slot="sheet-content"
            data-side={side}
            className={cn(
              // 41.8 rules 2 and 4: full width, 12px top corners only,
              // --shadow-dialog. Above the tab bar and action bar on the
              // dialog layer (5.5), and ON the keyboard while it is open
              // (--safe-bottom is 0 then, so nothing floats above it).
              "fixed inset-x-0 bottom-keyboard-inset z-(--z-dialog) flex flex-col overflow-hidden outline-none",
              "rounded-t-xl border border-b-0 border-border-light bg-surface bg-clip-padding text-body text-text-primary shadow-dialog",
              // A step that asks for it (a searchable list, rule 8) takes the
              // full height while it is on top, and gives it back after.
              fullHeight || top?.fullHeight ? BOTTOM_SHEET_FULL_H : BOTTOM_SHEET_MAX_H,
              // 41.13 rule 2: the sides and the bottom inset. The footer
              // sits above the home indicator; with no footer, the body.
              "pr-safe-right pb-safe-bottom pl-safe-left",
              // 5.6 and 41.14 rule 4: slides up, slow, enter easing; leaves
              // at medium, exit easing. Only transform and opacity move.
              "data-open:animate-in data-open:slide-in-from-bottom data-open:animation-duration-(--duration-slow) data-open:ease-enter",
              "data-closed:animate-out data-closed:slide-out-to-bottom data-closed:animation-duration-(--duration-medium) data-closed:ease-exit",
              "motion-reduce:data-open:fade-in-0 motion-reduce:data-closed:fade-out-0",
              className
            )}
            {...props}
            ref={setPopup}
            // 41.8 rule 19: the sheet itself takes focus, never a field,
            // so the keyboard stays shut until a field is tapped. The popup
            // is focusable (Base UI gives it tabindex -1) and labelled by
            // its SheetTitle. Focus returns to the opener on close (39.3).
            initialFocus={props.initialFocus ?? popupRef}
          >
            <BottomSheetContext.Provider value={{ closeButton, presentation: "sheet" }}>
              <SheetStepContext.Provider value={stepApi}>
                {/*
                 * The handle and the header are where a swipe down closes
                 * the sheet (rule 5). The body is left to scroll. Vertical
                 * panning is taken from the browser here, so it hands the
                 * finger to the swipe instead of scrolling the page behind
                 * or pulling to refresh; pinch zoom is left alone (41.9
                 * rule 7).
                 */}
                <div
                  data-slot="sheet-drag-zone"
                  className="flex shrink-0 touch-pan-x touch-pinch-zoom flex-col"
                  onPointerDown={onDragStart}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                >
                  {/* 41.8 rule 3: 32 by 4px in border, fully rounded (5.3), centred. */}
                  <div aria-hidden className="flex justify-center py-2">
                    <div data-slot="sheet-handle" className="h-1 w-8 rounded-full bg-border" />
                  </div>
                  {/*
                   * Kept mounted under a step, so its SheetTitle still
                   * names the sheet. `contents` keeps the header a direct
                   * flex child; `hidden` wins over it (preflight).
                   */}
                  <div className="contents" hidden={top !== null}>
                    {header}
                  </div>
                  {top ? (
                    <div data-slot="sheet-header" className="flex shrink-0 flex-col">
                      <HeaderBand>
                        <div className="flex min-w-0 items-center gap-2">
                          <Button
                            ref={stepBackButton}
                            variant={headerButton}
                            size="icon"
                            className="-ml-2"
                            aria-label={PHONE_WORDS.a11y.back}
                            onClick={backStep}
                          >
                            <ChevronLeftIcon />
                          </Button>
                          <h2 className="min-w-0 truncate text-card-heading font-medium">
                            {top.title}
                          </h2>
                        </div>
                        {closeButton}
                      </HeaderBand>
                    </div>
                  ) : null}
                </div>
                {/*
                 * Every step keeps its own body, mounted and hidden under
                 * the ones above it, so going back finds the previous step
                 * as it was left: its scroll, what was typed, and the
                 * control that opened the step, which takes focus again.
                 */}
                {body ? (
                  <div className="contents" hidden={top !== null}>
                    {body}
                  </div>
                ) : null}
                {steps.map((step) => (
                  <div key={step.key} className="contents" hidden={step !== top}>
                    {isType(step.content, SheetBody) ? (
                      step.content
                    ) : (
                      <SheetBody>{step.content}</SheetBody>
                    )}
                  </div>
                ))}
                {footer}
              </SheetStepContext.Provider>
            </BottomSheetContext.Provider>
          </SheetPrimitive.Popup>
        </SheetPortal>
      </BandScope>
    </BandScope>
  )
}

/**
 * Section 36: a brand band, one row, description below it (36.3).
 * `pr-16` leaves room for the close button positioned on the popup.
 *
 * In a phone bottom sheet the close button is in the band instead, at
 * the end of its row, so there is no room to leave.
 *
 * In a phone screen layer the app bar IS the band (41.8 rule 10), so the
 * header draws none. The title stays mounted but hidden: the SheetTitle
 * still names the layer for screen readers (aria-labelledby reads hidden
 * text), while the app bar shows its words. Any other control in the
 * band has already been moved to the app bar's actions by SheetContent.
 * The description sits at the top of the content, on the page's ground,
 * and scrolls with it.
 */
function SheetHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const bottomSheet = React.useContext(BottomSheetContext)
  const items = React.Children.toArray(children)
  const isDescription = (child: React.ReactNode) =>
    React.isValidElement(child) && child.type === SheetDescription

  const description = items.filter(isDescription)
  const banded = items.filter((child) => !isDescription(child))

  if (bottomSheet?.presentation === "screen") {
    return (
      <div data-slot="sheet-header" className={cn("flex flex-col", className)} {...props}>
        <div hidden>{banded}</div>
        {description.length > 0 ? (
          <div data-slot="sheet-header-description" className="px-4 pt-4">
            {description}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-slot="sheet-header"
      className={cn("flex shrink-0 flex-col", className)}
      {...props}
    >
      <HeaderBand className={bottomSheet ? undefined : "pr-16"}>
        {banded}
        {bottomSheet?.closeButton}
      </HeaderBand>
      {description.length > 0 ? (
        <div
          data-slot="sheet-header-description"
          className="border-b border-border-light px-4 py-3"
        >
          {description}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The zone that scrolls when a phone bottom sheet runs tall (24 rule 6).
 * The bottom sheet wraps whatever sits between its header and footer in
 * one; pass one yourself only to change it - `className="p-0"` for rows
 * that run edge to edge, such as a menu or an option list (41.8 rule 7).
 * overscroll-contain stops a scroll at its end moving the page behind.
 */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  const layer = React.useContext(BottomSheetContext)
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        // In a screen layer the layer's own body is the one scroller
        // (section 1 rule 8); this keeps only its 16px padding (41.4
        // rule 20).
        layer?.presentation === "screen"
          ? "p-4"
          : "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
        className
      )}
      {...props}
    />
  )
}

/**
 * A disabled action wrapped in permission-tooltip.tsx (section 26). The
 * wrapper - the one the kit puts round a disabled control, role="note" -
 * becomes the row's child, so SHARE_THE_WIDTH sizes the wrapper and not
 * the button inside it. Here the wrapper gives up its padding and the
 * button fills it, so a disabled action is exactly as wide and as tall as
 * the enabled one beside it. More specific than SHARE_THE_WIDTH's `*:`
 * classes and the button's own size classes, so these win. They match
 * nothing but such a wrapper.
 */
const WRAPPED = cn(
  "[&>[role=note]]:items-stretch [&>[role=note]]:py-0",
  "[&>[role=note]>*]:h-auto [&>[role=note]>*]:min-h-control [&>[role=note]>*]:min-w-0 [&>[role=note]>*]:flex-1",
  "[&>[role=note]>*]:py-2 [&>[role=note]>*]:text-center [&>[role=note]>*]:whitespace-normal"
)

/**
 * The phone's action bar, drawn once (41.6 rules 7 to 9, 41.7 rules 3 and
 * 4): what a page's ActionBar (action-bar.tsx) and a full-screen dialog's
 * footer (SheetFooter below, 41.8 rule 10) both render. Phone only: its
 * callers render it only in the phone layout.
 *
 *   - Surface, a 1px border-light line on top, 12px (space-3) padding,
 *     plus the bottom and side safe areas (41.13 rule 2). No shadow (5.4
 *     rule 2). While the keyboard is open --safe-bottom is 0px, so the bar
 *     sits directly on it.
 *   - Held sideways the bar stays full width and its buttons keep to the
 *     centred phone column, as the content does (41.13 rule 10).
 *   - At most two buttons, sharing the width (SHARE_THE_WIDTH) in the
 *     order written: the secondary first, on the left, the primary last,
 *     on the right; one takes the full width (rule 8, 11.3 rule 7). More
 *     throws (checkActionBarButtons). A disabled one inside
 *     permission-tooltip.tsx keeps its peer's size (WRAPPED).
 *   - Heights are minimums (41.9 rule 7): a label that wraps at the
 *     largest text size makes its button taller rather than clip, and the
 *     row's buttons stay one height (items-stretch).
 *   - THE BOTTOM-BAR CONTRACT (globals.css): the bar marks itself
 *     data-fixed-bottom="action-bar", and CSS works out --bottom-bar from
 *     that mark with :has, so the content's bottom padding clears the bar
 *     and toasts sit above it (41.8 rule 12) for exactly as long as it is
 *     in the page.
 *
 * `fixed`: fixed to the bottom of the screen, on the shell layer (5.5),
 * sitting on the keyboard (bottom-keyboard-inset: the covered height on
 * iPhone, 0px on Android, where the viewport shrinks instead), and
 * keeping the field being typed in above it (useFieldInView). Otherwise
 * it is the last row of a full-screen layer, which ends at the keyboard
 * and keeps its own fields in view.
 *
 * `className` and any other props go to the row of buttons. `label`
 * names the bar for screen readers (role="group").
 */
function ActionBarFrame({
  fixed = false,
  slot,
  label,
  whereTheRestGo,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  fixed?: boolean
  /** The bar's data-slot. */
  slot: string
  label?: string
  /** Where the buttons past two belong, for the error thrown past the limit. */
  whereTheRestGo: string
}) {
  checkActionBarButtons(children, whereTheRestGo)
  const bar = React.useRef<HTMLDivElement | null>(null)
  useFieldInView(fixed, bar, "bar")
  return (
    <div
      ref={bar}
      role={label !== undefined ? "group" : undefined}
      aria-label={label}
      data-slot={slot}
      data-fixed-bottom="action-bar"
      className={cn(
        fixed ? "fixed inset-x-0 bottom-keyboard-inset z-(--z-shell)" : "shrink-0",
        "border-t border-border-light bg-surface pr-safe-right pb-safe-bottom pl-safe-left"
      )}
    >
      <div
        className={cn(
          // 12px all round; the 1px line above and this padding are the
          // --h-action-bar the content's bottom padding allows for.
          "mx-auto flex w-full max-w-phone-column items-stretch gap-2 p-3",
          SHARE_THE_WIDTH,
          WRAPPED,
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * In a phone bottom sheet (41.8 rule 6): one row, the buttons sharing its
 * full width - the secondary first, so on the left, the primary last, on
 * the right (11.3 rule 7). The sheet pads it by the bottom safe area.
 *
 * 41.9 rule 7: on phone a control's height is a minimum. A label at the
 * largest text size wraps in a half-width button, so the buttons here
 * grow to fit it instead of clipping it.
 *
 * In a phone screen layer it is the action bar (41.6 rules 7 and 8, 41.7
 * rules 3 and 4), drawn by ActionBarFrame above, the same bar as a page's.
 * It is the layer's last row and the layer ends at the keyboard, so it
 * sits directly on the keyboard while it is open.
 */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  const bottomSheet = React.useContext(BottomSheetContext)
  if (bottomSheet?.presentation === "screen") {
    return (
      <ActionBarFrame
        slot="sheet-footer"
        whereTheRestGo="Cancel is the back arrow (41.7 rule 3; write it as a DialogClose and it is left out). Put the rest in a three-dot menu in the dialog's header, which shows in the app bar."
        className={className}
        {...props}
      />
    )
  }
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        bottomSheet
          ? cn("flex shrink-0 items-stretch gap-2 border-t border-border-light px-4 py-3", SHARE_THE_WIDTH)
          : "mt-auto flex flex-col gap-2 p-4",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      // Inherits `on-brand` from the band (section 36).
      className={cn("text-card-heading font-medium", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-label text-text-secondary", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  useSheetStep,
  useLayerRoot,
  useLayerHistory,
  whenLayersSettled,
  registerLayerTitle,
  textOf,
  SHARE_THE_WIDTH,
  SIDE_EDGE_PX,
  ActionBarFrame,
  checkActionBarButtons,
  MAX_ACTION_BAR_BUTTONS,
}
export type { SheetStep, CloseOutcome }
