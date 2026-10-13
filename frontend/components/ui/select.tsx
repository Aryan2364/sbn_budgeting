"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { PHONE_WORDS } from "@/lib/phone-words"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useSheetStep,
  type SheetStep,
} from "@/components/ui/sheet"

/**
 * Section 16.
 *
 * Trigger is 36px, matching an input, with the chevron on the right;
 * it points down when closed and up when open. The menu is exactly the
 * trigger's width, 12px radius, capped at exactly seven rows
 * (--menu-max-height) before it scrolls on the styled scrollbar from
 * section 10, and it flips upward when there is no room below.
 *
 * Selected and hovered must look different (16.2). Selected is
 * primary-subtle with a tick on the right; hovered is neutral grey.
 * They are two different meanings and never share one style.
 *
 * The trigger shows the raw value unless Root is given an `items` map
 * of value to label. Pass it whenever the value is a code rather than
 * the words the user should read.
 *
 * Section 16.3: this is for 6 options or fewer. 7 or more is
 * SearchableSelect (searchable-select.tsx), whose search box sits fixed
 * above the list.
 *
 * ON PHONE (41.7 rule 7, 41.8) the trigger stays and the list becomes a
 * bottom sheet titled by the field's label, or a step of the sheet the
 * select sits in. See PhoneSelect below. Nothing changes for the caller.
 */
/**
 * The trigger's appearance, shared so the searchable picker in
 * section 16.3 cannot drift away from the plain dropdown.
 */
const selectTriggerClassName = [
  "tap-area flex h-control w-full max-w-field-max min-w-0 cursor-pointer items-center justify-between gap-2",
  "rounded-lg border border-border bg-surface px-3 text-body text-text-primary whitespace-nowrap transition-colors select-none",
  "outline-none focus-visible:border-primary-ring focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-0 focus-visible:outline-primary-ring",
  // Section 6.4, same gap as input and textarea: the trigger had no
  // hover and no pressed of its own while globals.css forced one.
  "not-data-disabled:hover:border-border-strong not-data-disabled:hover:bg-surface-control",
  "not-data-disabled:active:bg-surface-control-pressed",
  "disabled:cursor-default disabled:border-border-light disabled:bg-surface-sunken disabled:text-text-muted",
  "data-disabled:cursor-default data-disabled:border-border-light data-disabled:bg-surface-sunken data-disabled:text-text-muted",
  "data-placeholder:text-text-muted",
  "aria-invalid:border-danger",
].join(" ")

/**
 * Section 16.3, made self-enforcing: 6 options or fewer here, 7 or more
 * in SearchableSelect.
 *
 * Choosing the right control was the caller's job, which means it gets
 * forgotten by the fourth screen. This warns in development, once per
 * mounted Select, and compiles away in production. It warns rather than
 * throws: a seventh option is the wrong control, not a broken screen,
 * and throwing would blank a working form over it.
 */
function useLongListWarning(children: React.ReactNode) {
  const warned = React.useRef(false)

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" || warned.current) {
      return
    }

    // Items may sit directly under SelectContent or inside a
    // SelectGroup, so flatten one level before counting.
    let count = 0
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return
      if (child.type === SelectItem) {
        count += 1
        return
      }
      if (child.type === SelectGroup) {
        const groupChildren = (child.props as { children?: React.ReactNode })
          .children
        React.Children.forEach(groupChildren, (grandchild) => {
          if (React.isValidElement(grandchild) && grandchild.type === SelectItem) {
            count += 1
          }
        })
      }
    })

    if (count > 6) {
      warned.current = true
      console.warn(
        `[design-system] A Select was rendered with ${count} options. ` +
          `FRONTEND_RULES.md section 16.3: 7 options or more use ` +
          `SearchableSelect from components/ui/searchable-select.tsx, ` +
          `whose search box sits fixed above the list.`
      )
    }
  }, [children])
}

/* ------------------------------------------------------------------
   PHONE - section 41.8. Shared by every picker and menu in the kit.

   On phone a select list, a dropdown menu, the three-dot menu and a
   popover all become a bottom sheet (41.8 rules 1 to 9). The rows those
   sheets list are the same row everywhere, so the pieces below are
   exported for searchable-select, multi-select, dropdown-menu and
   popover to import, as selectTriggerClassName already is. They are the
   kit's own plumbing, not parts a screen uses.

   None of it renders on desktop: every component reaches it only after
   useLayout() has said phone.
   ------------------------------------------------------------------ */

/**
 * One row of a list or menu in a phone bottom sheet (41.8 rule 7).
 *
 * - 48px at least (space-12), never a fixed height: at the largest text
 *   setting the label wraps and the row grows instead of clipping or
 *   truncating it (41.9 rule 7). 16px sides, matching the sheet.
 * - Chosen: primary-subtle with the tick on the right (16.2). Nothing
 *   else ever takes that fill.
 * - Pressed is the feedback (41.9 rule 1): surface-control, or the
 *   danger background on a danger row. No hover state.
 * - Disabled: text-muted, no pointer. Its reason, where a screen gives
 *   one, comes through permission-tooltip.tsx around the row (26).
 */
function phoneRowClassName({
  chosen = false,
  danger = false,
}: { chosen?: boolean; danger?: boolean } = {}) {
  return cn(
    "flex min-h-12 w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-body outline-none select-none",
    // Inset, so the sheet's edges never clip it (6.4).
    "focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:-outline-offset-2 focus-visible:outline-primary-ring",
    "aria-disabled:pointer-events-none aria-disabled:cursor-default aria-disabled:text-text-muted",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    chosen
      ? "bg-primary-subtle text-primary-text"
      : danger
        ? "text-danger active:bg-danger-bg *:[svg]:text-danger"
        : "text-text-primary active:bg-surface-control"
  )
}

/**
 * The row's label: it wraps rather than truncating (41.9 rule 7), and
 * takes the space left of the tick.
 */
const phoneRowLabelClassName = "min-w-0 flex-1 break-words"

/**
 * The tick on the right of a chosen row (16.2). Always laid out, hidden
 * when not chosen, so a label wraps at the same width ticked or not.
 */
function PhoneRowTick({ shown }: { shown: boolean }) {
  return <CheckIcon aria-hidden="true" className={cn("size-4", !shown && "invisible")} />
}

/** What every phone sheet row carries, so the keyboard can find it. */
const PHONE_ROW = { "data-sheet-row": "" } as const

/**
 * Section 16.4 where a keyboard is attached to the phone: arrows, Home
 * and End move between the rows, a letter jumps to the next row starting
 * with it. Enter and Space press the focused row, because every row is a
 * button. Escape closes the sheet (sheet.tsx). Tab reaches every row too.
 *
 * Put on the list and on the sheet itself, which holds focus when it
 * opens (41.8 rule 19): from there the first arrow goes to the chosen
 * row, or the first. A key the list already handled is not handled twice.
 */
function phoneListKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return

  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>("[data-sheet-row]")
  ).filter((row) => !row.closest("[hidden]") && row.getAttribute("aria-disabled") !== "true")
  if (rows.length === 0) return

  const active = document.activeElement
  const at = rows.findIndex((row) => row === active)
  let next = -1

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (at < 0) {
      const chosen = rows.findIndex(
        (row) => row.getAttribute("aria-selected") === "true" || row.getAttribute("aria-checked") === "true"
      )
      next = chosen >= 0 ? chosen : event.key === "ArrowDown" ? 0 : rows.length - 1
    } else {
      const step = event.key === "ArrowDown" ? 1 : -1
      next = (at + step + rows.length) % rows.length
    }
  } else if (event.key === "Home") {
    next = 0
  } else if (event.key === "End") {
    next = rows.length - 1
  } else if (event.key.length === 1 && event.key.trim() !== "") {
    const letter = event.key.toLowerCase()
    for (let i = 1; i <= rows.length; i++) {
      const row = rows[(Math.max(at, -1) + i) % rows.length]
      if ((row.textContent ?? "").trim().toLowerCase().startsWith(letter)) {
        next = rows.indexOf(row)
        break
      }
    }
  }

  if (next < 0) return
  event.preventDefault()
  rows[next].focus()
}

/**
 * The list inside a phone sheet: rows edge to edge (the sheet body is
 * p-0), a little space above the first and below the last, and the
 * keyboard of phoneListKeyDown. A column, so every row runs the full
 * width.
 *
 * Its children are rows (role option or menuitem), groups and labels
 * only. A PermissionTooltip around a row puts its role="note" wrapper
 * between the list and the row, which breaks the roles a list must own;
 * a row that cannot be chosen carries its reason itself, as MultiSelect's
 * locked rows do.
 */
function PhoneSheetList({
  role,
  label,
  multiselectable,
  children,
}: {
  role: "listbox" | "menu"
  label: string
  multiselectable?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      role={role}
      aria-label={label}
      aria-multiselectable={multiselectable || undefined}
      onKeyDown={phoneListKeyDown}
      className="flex flex-col py-2"
    >
      {children}
    </div>
  )
}

/** The visible text of an element, without what is hidden from a screen reader. */
function visibleText(node: Element) {
  const copy = node.cloneNode(true) as Element
  copy.querySelectorAll("[aria-hidden='true']").forEach((hidden) => hidden.remove())
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim()
}

/**
 * A phone sheet's title (41.8 rule 6), read from the control that
 * opened it, in the order a screen reader names that control:
 *
 *   1. aria-labelledby - Base UI fills it in when a field label exists;
 *   2. aria-label - InlineChoice's "Records per page", a three-dot
 *      menu's "Actions for INV-2041";
 *   3. its <label for> - the kit's Label above a select (11.3), minus
 *      the required asterisk, which is aria-hidden;
 *   4. its own text, with `content` - a menu button's "Sort by". Never
 *      for a select, whose text is the chosen value, not its name.
 *
 * Read once, when the sheet opens, from the element the press came from.
 * null when nothing names it; each caller has its own fallback.
 */
function phoneSheetTitle(element: Element | null, { content }: { content: boolean }) {
  if (!element) return null
  const labelledBy = element.getAttribute("aria-labelledby")
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null && node !== element)
      .map(visibleText)
      .join(" ")
      .trim()
    if (text) return text
  }
  const ariaLabel = element.getAttribute("aria-label")?.trim()
  if (ariaLabel) return ariaLabel
  const labels = (element as HTMLButtonElement).labels
  if (labels && labels.length > 0) {
    const text = visibleText(labels[0])
    if (text) return text
  }
  if (content) {
    const text = visibleText(element)
    if (text) return text
  }
  return null
}

/**
 * The control a Base UI open came from: the press's trigger, or, for a
 * key that opened it (where Base UI passes none), the focused element.
 */
function phoneTrigger(details: { trigger?: Element; event?: Event }): HTMLElement | null {
  const candidates = [details.trigger, details.event?.currentTarget, document.activeElement]
  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement && candidate !== document.body) return candidate
  }
  return null
}

/**
 * The details object a Base UI change handler expects, for a change the
 * phone rows make themselves - same shape, so a caller's onValueChange or
 * onCheckedChange can read the reason and cancel() exactly as on desktop.
 */
function phoneChangeDetails(reason: string, event?: Event) {
  let canceled = false
  return {
    reason,
    event: event ?? new Event("base-ui"),
    trigger: undefined,
    cancel() {
      canceled = true
    },
    allowPropagation() {},
    get isCanceled() {
      return canceled
    },
    get isPropagationAllowed() {
      return false
    },
  }
}

/** What a sheet title falls back to when nothing names the select. */
// Phone only (a sheet title), so in the phone's language (plan-phone D7).
const CHOOSE_TITLE = PHONE_WORDS.a11y.chooseOption

/* ------------------------------------------------------------------
   The phone root, shared by Select, DropdownMenu and Popover.

   All three do the same thing on phone: Base UI's root is held closed,
   and a press that would open it opens a bottom sheet instead, or a step
   of the sheet the control sits in (41.8 rules 1 and 9). The content
   part (SelectContent, DropdownMenuContent, PopoverContent) draws the
   sheet, or, inside another sheet, hands its content up for the step.
   ------------------------------------------------------------------ */

/** The sheet's side of a phone root, from the root to its content part. */
type PhoneSheetRoot<C> = {
  open: boolean
  /**
   * The sheet's own onOpenChange, passed on with ITS details, so a
   * caller's cancel() reaches the sheet (sheet.tsx reads isCanceled).
   */
  onOpenChange: (open: boolean, details: { isCanceled: boolean }) => void
  title: string
  trigger: React.RefObject<HTMLElement | null>
  /** Inside a bottom sheet the root opens a step, never its own sheet. */
  inSheet: boolean
  /** The content part hands its content up, for a step to show. */
  registerContent: (content: C) => void
}

/** What every Base UI open change carries, as far as a phone root reads it. */
type OpenChangeDetails = { isCanceled: boolean; event?: Event; trigger?: Element }

/**
 * The phone root's state and Base UI's onOpenChange for its held-closed
 * root. `toStep` builds the step it opens inside another sheet, from the
 * content its content part handed up; null opens none.
 */
function usePhoneSheetRoot<C, D extends OpenChangeDetails>({
  open: openProp,
  defaultOpen,
  onOpenChange,
  fallbackTitle,
  nameFromContent,
  toStep,
}: {
  open: boolean | undefined
  defaultOpen: boolean | undefined
  onOpenChange: ((open: boolean, details: D) => void) | undefined
  /** The title when nothing names the trigger (decision 30). */
  fallbackTitle: string
  /** A menu or popover button is named by its text; a select never is (phoneSheetTitle). */
  nameFromContent: boolean
  toStep: (name: string, content: C | null, back: () => void) => SheetStep | null
}) {
  const step = useSheetStep()
  const [openLocal, setOpenLocal] = React.useState(defaultOpen ?? false)
  const open = openProp ?? openLocal
  const [title, setTitle] = React.useState(fallbackTitle)
  const trigger = React.useRef<HTMLElement | null>(null)
  const content = React.useRef<C | null>(null)

  const setOpen = (next: boolean, details: { isCanceled: boolean }) => {
    onOpenChange?.(next, details as unknown as D)
    if (!details.isCanceled) setOpenLocal(next)
  }

  const onRootOpenChange = (next: boolean, details: D) => {
    // Base UI's root never opens on phone, so its closes mean nothing.
    if (!next) return
    const opener = phoneTrigger(details)
    trigger.current = opener
    const name = phoneSheetTitle(opener, { content: nameFromContent }) ?? fallbackTitle

    if (step.inSheet) {
      onOpenChange?.(true, details)
      if (details.isCanceled) return
      const opened = toStep(name, content.current, step.back)
      if (!opened) return
      // 39.3: the sheet returns focus to what had it when the step
      // opened. A tap on iPhone does not focus a button, so it is given
      // focus here - a button, never a field (41.8 rule 19).
      opener?.focus({ preventScroll: true })
      step.open(opened)
      return
    }

    setTitle(name)
    setOpen(true, details)
  }

  const sheet: PhoneSheetRoot<C> = {
    open,
    onOpenChange: setOpen,
    title,
    trigger,
    inSheet: step.inSheet,
    registerContent: (next) => {
      content.current = next
    },
  }

  return {
    sheet,
    onRootOpenChange,
    /** Whether the trigger has its sheet open, for PhoneTriggerState. */
    expanded: open && !step.inSheet,
  }
}

/**
 * Whether a phone root's sheet is open; null outside a phone root, so on
 * desktop. Base UI's root is held closed on phone, so its trigger would
 * say aria-expanded="false" while the sheet is open; the trigger parts
 * read this instead (usePhoneTriggerProps).
 */
const PhoneTriggerContext = React.createContext<boolean | null>(null)

function PhoneTriggerState({
  expanded,
  children,
}: {
  expanded: boolean
  children: React.ReactNode
}) {
  return <PhoneTriggerContext.Provider value={expanded}>{children}</PhoneTriggerContext.Provider>
}

const NO_TRIGGER_PROPS = {}
/**
 * While its sheet is open: aria-expanded for assistive technology, and
 * data-popup-open, which turns the chevron up as on desktop (16.1). They
 * win over Base UI's own, which come before a trigger's props. Closed,
 * and always on desktop, nothing at all, so Base UI's attributes stand.
 */
const OPEN_TRIGGER_PROPS = { "aria-expanded": true, "data-popup-open": "" } as const

/** Spread LAST on a Base UI trigger, so it wins on phone while the sheet is open. */
function usePhoneTriggerProps(): Partial<typeof OPEN_TRIGGER_PROPS> {
  return React.useContext(PhoneTriggerContext) ? OPEN_TRIGGER_PROPS : NO_TRIGGER_PROPS
}

/* ------------------------------------------------------------------
   Select on phone.
   ------------------------------------------------------------------ */

/** The options' side: what is chosen, and how to choose. */
type PhoneSelectList = {
  value: unknown
  multiple: boolean
  isEqual: (itemValue: unknown, value: unknown) => boolean
  choose: (value: unknown, event: React.SyntheticEvent) => void
}

const PhoneSelectListContext = React.createContext<PhoneSelectList | null>(null)

/** The sheet's side: open state, title, and where focus returns. SelectContent hands its options up. */
type PhoneSelectSheet = PhoneSheetRoot<React.ReactNode>

const PhoneSelectSheetContext = React.createContext<PhoneSelectSheet | null>(null)

type AnySelectRootProps = SelectPrimitive.Root.Props<unknown, boolean | undefined>

function isChosen(list: PhoneSelectList, itemValue: unknown) {
  if (list.multiple) {
    return Array.isArray(list.value) && list.value.some((v) => list.isEqual(itemValue, v))
  }
  return list.value != null && list.isEqual(itemValue, list.value)
}

/** A multiple select's next value: the row's value added or taken out. */
function toggled(list: PhoneSelectList, itemValue: unknown) {
  const current = Array.isArray(list.value) ? list.value : []
  return isChosen(list, itemValue)
    ? current.filter((v) => !list.isEqual(itemValue, v))
    : [...current, itemValue]
}

/**
 * A list opened as a step (41.8 rule 9). The step is drawn as it was
 * given when it opened, so it keeps its own copy of the value: a
 * multiple select's ticks change while the step stays open.
 */
function PhoneSelectStep({
  initial,
  multiple,
  isEqual,
  commit,
  done,
  title,
  children,
}: {
  initial: unknown
  multiple: boolean
  isEqual: PhoneSelectList["isEqual"]
  commit: (next: unknown, event: React.SyntheticEvent) => boolean
  done: () => void
  title: string
  children: React.ReactNode
}) {
  const [value, setValue] = React.useState(initial)
  const list: PhoneSelectList = {
    value,
    multiple,
    isEqual,
    choose(itemValue, event) {
      const next = multiple ? toggled(list, itemValue) : itemValue
      if (!commit(next, event)) return
      setValue(next)
      if (!multiple) done()
    },
  }
  return (
    <PhoneSelectListContext.Provider value={list}>
      <PhoneSheetList role="listbox" label={title} multiselectable={multiple}>
        {children}
      </PhoneSheetList>
    </PhoneSelectListContext.Provider>
  )
}

/**
 * The phone Select root. The trigger, the value it shows and the hidden
 * form input are Base UI's, exactly as on desktop. Only the list moves:
 * Base UI's root is held closed, and a press that would open it opens the
 * bottom sheet instead (41.7 rule 7, 41.8 rules 1 and 7), or a step of
 * the sheet the select sits in (41.8 rule 9).
 *
 * The value comes in controlled from Select, which holds an uncontrolled
 * one above the layout switch (41.2 rule 3), because the rows in the
 * sheet are not Base UI items and cannot reach its store.
 */
function PhoneSelect(props: AnySelectRootProps) {
  const {
    value,
    onValueChange,
    open,
    defaultOpen,
    onOpenChange,
    multiple = false,
    readOnly = false,
    isItemEqualToValue,
    children,
    ...rest
  } = props

  const isEqual = React.useCallback(
    (itemValue: unknown, current: unknown) =>
      isItemEqualToValue ? isItemEqualToValue(itemValue, current) : Object.is(itemValue, current),
    [isItemEqualToValue]
  )

  /** The caller's onValueChange, as Base UI would call it. False if it cancelled. */
  const commit = (next: unknown, event: React.SyntheticEvent) => {
    if (readOnly) return false
    const details = phoneChangeDetails("item-press", event.nativeEvent)
    onValueChange?.(next, details as unknown as SelectPrimitive.Root.ChangeEventDetails)
    return !details.isCanceled
  }

  const { sheet, onRootOpenChange, expanded } = usePhoneSheetRoot<
    React.ReactNode,
    SelectPrimitive.Root.ChangeEventDetails
  >({
    open,
    defaultOpen,
    onOpenChange,
    fallbackTitle: CHOOSE_TITLE,
    nameFromContent: false,
    toStep: (name, content, back) => ({
      title: name,
      content: (
        <PhoneSelectStep
          initial={value}
          multiple={multiple}
          isEqual={isEqual}
          commit={commit}
          done={back}
          title={name}
        >
          {content}
        </PhoneSelectStep>
      ),
    }),
  })

  const list: PhoneSelectList = {
    value,
    multiple,
    isEqual,
    choose(itemValue, event) {
      const next = multiple ? toggled(list, itemValue) : itemValue
      const committed = commit(next, event)
      // One choice closes the sheet, and focus returns to the trigger
      // (16.4). A multiple select stays open for the next tick.
      if ((committed || readOnly) && !multiple) {
        sheet.onOpenChange(false, phoneChangeDetails("item-press", event.nativeEvent))
      }
    },
  }

  return (
    <PhoneTriggerState expanded={expanded}>
      <PhoneSelectSheetContext.Provider value={sheet}>
        <PhoneSelectListContext.Provider value={list}>
          <SelectPrimitive.Root
            {...rest}
            multiple={multiple}
            readOnly={readOnly}
            isItemEqualToValue={isItemEqualToValue}
            // Base UI still commits on its own for the hidden input's
            // autofill, through the same onValueChange.
            value={value}
            onValueChange={onValueChange}
            open={false}
            onOpenChange={onRootOpenChange}
          >
            {children}
          </SelectPrimitive.Root>
        </PhoneSelectListContext.Provider>
      </PhoneSelectSheetContext.Provider>
    </PhoneTriggerState>
  )
}

/**
 * The bottom sheet a phone Select opens (41.8 rules 1 to 7): the field's
 * label as its title, the options as 48px rows below. Inside another
 * bottom sheet it renders nothing and hands its options up instead, for
 * the step the root opens (41.8 rule 9).
 */
function PhoneSelectContent({
  sheet,
  children,
}: {
  sheet: PhoneSelectSheet
  children: React.ReactNode
}) {
  const list = React.useContext(PhoneSelectListContext)
  const { registerContent } = sheet
  React.useLayoutEffect(() => {
    registerContent(children)
  })

  if (sheet.inSheet) return null

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(next, details) => {
        // The sheet only ever asks to close; opening is the root's.
        if (!next) sheet.onOpenChange(false, details)
      }}
    >
      <SheetContent
        side="bottom"
        // 16.4: focus returns to the trigger when the sheet closes.
        finalFocus={sheet.trigger}
        onKeyDown={phoneListKeyDown}
      >
        <SheetHeader>
          <SheetTitle>{sheet.title}</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">
          <PhoneSheetList role="listbox" label={sheet.title} multiselectable={list?.multiple}>
            {children}
          </PhoneSheetList>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

/** A phone option row: 48px, wrapping, chosen with a tick (41.8 rule 7). */
function PhoneSelectItem({
  list,
  value,
  disabled,
  className,
  children,
}: {
  list: PhoneSelectList
  value: unknown
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  const chosen = isChosen(list, value)
  return (
    <button
      type="button"
      role="option"
      data-slot="select-item"
      {...PHONE_ROW}
      aria-selected={chosen}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className={cn(phoneRowClassName({ chosen }), className)}
      onClick={(event) => {
        if (!disabled) list.choose(value, event)
      }}
    >
      <span className={phoneRowLabelClassName}>{children}</span>
      <PhoneRowTick shown={chosen} />
    </button>
  )
}

/**
 * The Select root. On desktop it is Base UI's root; on phone (useLayout,
 * 41.3 rule 4) it is PhoneSelect above; the caller never chooses. The two
 * are different components, so a layout switch mounts the other one
 * fresh.
 *
 * So an uncontrolled value is held HERE, above the switch, and both roots
 * get it controlled: a foldable unfolded mid-form keeps what was chosen
 * (41.2 rule 3). It behaves as Base UI's own would - it starts from
 * defaultValue (null, or [] for a multiple select), and a change the
 * caller's onValueChange cancels is not kept. A controlled value passes
 * through as it is.
 */
function Select<Value, Multiple extends boolean | undefined = false>(
  props: SelectPrimitive.Root.Props<Value, Multiple>
) {
  const { layout } = useLayout()
  const { value: valueProp, defaultValue, onValueChange, ...rest } =
    props as unknown as AnySelectRootProps
  const [local, setLocal] = React.useState<unknown>(
    () => defaultValue ?? (rest.multiple ? [] : null)
  )
  const rootProps: AnySelectRootProps = {
    ...rest,
    value: valueProp !== undefined ? valueProp : local,
    onValueChange: (next, details) => {
      onValueChange?.(next, details)
      if (!details.isCanceled) setLocal(next)
    },
  }
  if (layout !== "phone") return <SelectPrimitive.Root {...rootProps} />
  return <PhoneSelect {...rootProps} />
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      // Phone: the rows run edge to edge in the sheet (41.8 rule 7).
      className={cn("scroll-my-1 p-1 phone:p-0", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 truncate text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  // Phone, while the sheet is open: aria-expanded (Base UI's root is
  // held closed there). Nothing on desktop.
  const phoneTrigger = usePhoneTriggerProps()
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(selectTriggerClassName, className)}
      {...props}
      {...phoneTrigger}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-text-secondary transition-transform group-data-popup-open:rotate-180 data-popup-open:rotate-180" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  // Section 16.3's limit stays on phone too (41.7 rule 7).
  useLongListWarning(children)

  const phoneSheet = React.useContext(PhoneSelectSheetContext)
  if (phoneSheet) {
    return <PhoneSelectContent sheet={phoneSheet}>{children}</PhoneSelectContent>
  }

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-(--z-popover)"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative isolate flex w-(--anchor-width) origin-(--transform-origin) flex-col",
            "rounded-xl border border-border bg-surface text-body text-text-primary shadow-menu",
            // Section 5.6: fade in with a 4px slide away from the trigger,
            // medium; out one step shorter, at fast. animation-duration-*,
            // not duration-*, for the reason given in dialog.tsx.
            "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-medium) data-open:ease-enter",
            "data-[side=bottom]:data-open:slide-in-from-top-1 data-[side=top]:data-open:slide-in-from-bottom-1 data-[side=left]:data-open:slide-in-from-right-1 data-[side=right]:data-open:slide-in-from-left-1",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-fast) data-closed:ease-exit",
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          {/* Section 16.2: the list is the scroll container, capped at
              about seven rows. Base UI documents it here rather than on
              the popup, and its roving focus depends on that. */}
          <SelectPrimitive.List className="max-h-menu-max overflow-x-hidden overflow-y-auto p-1">
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      // Phone: a small label between the rows, in line with their 16px
      // sides, with room above it to separate the groups (41.8 rule 7).
      className={cn("px-3 py-1 text-meta text-text-muted phone:px-4 phone:pt-3", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  const phoneList = React.useContext(PhoneSelectListContext)
  if (phoneList) {
    return (
      <PhoneSelectItem
        list={phoneList}
        value={props.value}
        disabled={props.disabled}
        className={typeof className === "string" ? className : undefined}
      >
        {children}
      </PhoneSelectItem>
    )
  }

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex h-control w-full cursor-pointer items-center gap-2 rounded-lg pr-8 pl-3 text-body outline-hidden select-none",
        // Hovered and keyboard-highlighted: neutral grey. Only when the
        // row is not the selected one, so selection stays visible.
        "[&[data-highlighted]:not([aria-selected='true'])]:bg-surface-control",
        // Selected: primary-subtle with a tick on the right.
        "[&[aria-selected='true']]:bg-primary-subtle [&[aria-selected='true']]:text-primary-text",
        "data-disabled:pointer-events-none data-disabled:text-text-muted",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-3 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none my-1 h-px bg-border-light", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-(--z-sticky) flex w-full cursor-default items-center justify-center bg-surface py-1 text-text-secondary [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-(--z-sticky) flex w-full cursor-default items-center justify-center bg-surface py-1 text-text-secondary [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  // The phone sheet's shared parts (41.8), for the kit's other pickers
  // and menus. Not for screens.
  CHOOSE_TITLE,
  phoneChangeDetails,
  phoneListKeyDown,
  phoneRowClassName,
  phoneRowLabelClassName,
  PhoneRowTick,
  PhoneSheetList,
  phoneSheetTitle,
  PhoneTriggerState,
  usePhoneSheetRoot,
  usePhoneTriggerProps,
  PHONE_ROW,
  Select,
  selectTriggerClassName,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
export type { PhoneSheetRoot }
