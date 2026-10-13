"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { PHONE_WORDS } from "@/lib/phone-words"
import { ChevronRightIcon, CheckIcon } from "lucide-react"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useSheetStep,
} from "@/components/ui/sheet"
import {
  PHONE_ROW,
  PhoneRowTick,
  PhoneSheetList,
  PhoneTriggerState,
  phoneChangeDetails,
  phoneListKeyDown,
  phoneRowClassName,
  phoneRowLabelClassName,
  phoneSheetTitle,
  usePhoneSheetRoot,
  usePhoneTriggerProps,
  type PhoneSheetRoot,
} from "@/components/ui/select"

/* ------------------------------------------------------------------
   PHONE - section 41.8. A dropdown menu, the three-dot menu included,
   becomes an action sheet: a bottom sheet titled by the control that
   opened it, its items as 48px rows (rule 7), a danger item in danger
   text, group labels as small labels between the rows, a radio or
   checkbox item with its tick, a sub-menu as a step (rule 9). Inside
   another bottom sheet the whole menu opens as a step of that sheet,
   never a sheet on a sheet (rule 9, 24 rule 4).

   The trigger is Base UI's, exactly as on desktop. Base UI's root is
   held closed on phone, and a press that would open it opens the sheet.
   The caller never chooses (41.3 rule 4). Desktop renders exactly what
   it did before: every part below is reached only after useLayout() has
   said phone.
   ------------------------------------------------------------------ */

/** What a menu sheet is called when nothing names its trigger. */
// Phone only (a sheet title), so in the phone's language (plan-phone D7).
const MENU_TITLE = PHONE_WORDS.a11y.actions

/** The rows' side: how an item closes the menu - its sheet, or its step. */
type PhoneMenu = { close: () => void }

const PhoneMenuContext = React.createContext<PhoneMenu | null>(null)

/** The sheet's side, from the root to DropdownMenuContent (select.tsx). */
type PhoneMenuSheet = PhoneSheetRoot<React.ReactNode>

const PhoneMenuSheetContext = React.createContext<PhoneMenuSheet | null>(null)

/** A sub-menu on phone: its content, handed up for the step it opens as. */
type PhoneSubmenu = {
  content: () => React.ReactNode
  registerContent: (children: React.ReactNode) => void
}

const PhoneSubmenuContext = React.createContext<PhoneSubmenu | null>(null)

/** The rows of a menu, as the content of a step (41.8 rule 9). */
function menuStep(title: string, menu: PhoneMenu, children: React.ReactNode) {
  return (
    <PhoneMenuContext.Provider value={menu}>
      <PhoneSheetList role="menu" label={title}>
        {children}
      </PhoneSheetList>
    </PhoneMenuContext.Provider>
  )
}

function PhoneDropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: MenuPrimitive.Root.Props) {
  const { sheet, onRootOpenChange, expanded } = usePhoneSheetRoot<
    React.ReactNode,
    MenuPrimitive.Root.ChangeEventDetails
  >({
    open,
    defaultOpen,
    onOpenChange,
    fallbackTitle: MENU_TITLE,
    // A menu button is named by its text: "Sort by", "Row actions"; a
    // three-dot button by its label: "Actions for INV-2041".
    nameFromContent: true,
    toStep: (name, content, back) => ({
      title: name,
      content: menuStep(name, { close: back }, content),
    }),
  })

  return (
    <PhoneTriggerState expanded={expanded}>
      <PhoneMenuSheetContext.Provider value={sheet}>
        <MenuPrimitive.Root
          data-slot="dropdown-menu"
          {...props}
          open={false}
          onOpenChange={onRootOpenChange}
        >
          {children}
        </MenuPrimitive.Root>
      </PhoneMenuSheetContext.Provider>
    </PhoneTriggerState>
  )
}

/**
 * The action sheet itself, or nothing inside another bottom sheet, where
 * the root opens the rows as a step instead.
 */
function PhoneMenuContent({
  sheet,
  children,
}: {
  sheet: PhoneMenuSheet
  children: React.ReactNode
}) {
  const { registerContent } = sheet
  React.useLayoutEffect(() => {
    registerContent(children)
  })

  if (sheet.inSheet) return null

  const close = () => sheet.onOpenChange(false, phoneChangeDetails("item-press"))

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(next, details) => {
        if (!next) sheet.onOpenChange(false, details)
      }}
    >
      <SheetContent
        side="bottom"
        // Section 16.4: focus returns to the trigger on close.
        finalFocus={sheet.trigger}
        onKeyDown={phoneListKeyDown}
      >
        <SheetHeader>
          <SheetTitle>{sheet.title}</SheetTitle>
        </SheetHeader>
        <SheetBody className="p-0">{menuStep(sheet.title, { close }, children)}</SheetBody>
      </SheetContent>
    </Sheet>
  )
}

/**
 * A Base UI item handler may call event.preventBaseUIHandler() to keep
 * the menu open. The phone rows are not Base UI items, so they give the
 * event that method themselves, and close only if it was not called.
 */
function runItemClick(
  event: React.MouseEvent<HTMLElement>,
  handler: ((event: never) => void) | undefined
) {
  let prevented = false
  Object.assign(event, {
    preventBaseUIHandler: () => {
      prevented = true
    },
    baseUIHandlerPrevented: false,
  })
  handler?.(event as never)
  return !prevented
}

/**
 * Phone: an inset row's text lines up with the text of a row that carries
 * an icon. That text sits after the row's 16px padding (space-4), the
 * 16px icon and the 8px gap (space-2): 40px, which is not on the spacing
 * scale (1 rule 9), and pl-8 (32px) or pl-12 (48px) would each miss it by
 * 8px. So an inset row keeps its own padding and gap and holds an empty
 * box the icon's size where the icon would be: every length is on the
 * scale, and the box grows with the icons at the largest text setting
 * (both are rem, 41.9 rule 7). An 18px icon (section 23's toolbar size)
 * is not used in a menu row.
 */
function PhoneInset() {
  return <span aria-hidden="true" data-slot="dropdown-menu-inset" className="size-4 shrink-0" />
}

function PhoneMenuItem({
  menu,
  className,
  inset,
  variant = "default",
  disabled,
  closeOnClick = true,
  onClick,
  render,
  children,
  ...props
}: MenuPrimitive.Item.Props & {
  menu: PhoneMenu
  inset?: boolean
  variant?: "default" | "danger"
}) {
  // Base UI's typeahead label and button mode mean nothing to a phone
  // row, and are not attributes.
  const attributes: Record<string, unknown> = { ...props }
  delete attributes.label
  delete attributes.nativeButton
  return useRender({
    render: render as useRender.RenderProp | undefined,
    defaultTagName: "button",
    props: {
      ...attributes,
      type: render ? undefined : "button",
      role: "menuitem",
      "data-slot": "dropdown-menu-item",
      "data-inset": inset || undefined,
      "data-variant": variant,
      ...PHONE_ROW,
      "aria-disabled": disabled || undefined,
      tabIndex: disabled ? -1 : 0,
      className: cn(
        phoneRowClassName({ danger: variant === "danger" }),
        typeof className === "string" ? className : undefined
      ),
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (disabled) return
        if (runItemClick(event, onClick as never) && closeOnClick) menu.close()
      },
      children: inset ? (
        <>
          <PhoneInset />
          {children}
        </>
      ) : (
        children
      ),
    },
  })
}

/** A tick row (menuitemcheckbox or menuitemradio): chosen with the tick (16.2). */
function PhoneTickRow({
  role,
  checked,
  disabled,
  inset,
  className,
  onToggle,
  children,
  slot,
}: {
  role: "menuitemcheckbox" | "menuitemradio"
  checked: boolean
  disabled?: boolean
  inset?: boolean
  className?: string
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
  slot: string
}) {
  return (
    <button
      type="button"
      role={role}
      data-slot={slot}
      data-inset={inset || undefined}
      {...PHONE_ROW}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className={cn(phoneRowClassName({ chosen: checked }), className)}
      onClick={(event) => {
        if (!disabled) onToggle(event)
      }}
    >
      {inset ? <PhoneInset /> : null}
      <span className={phoneRowLabelClassName}>{children}</span>
      <PhoneRowTick shown={checked} />
    </button>
  )
}

/**
 * A value a step was given when it opened, kept in step with the caller
 * while the caller can still reach it. A step is drawn as it was given
 * (sheet.tsx), so its rows keep their own copy and change it themselves.
 */
function useStepValue<T>(controlled: T | undefined, initial: T) {
  const [value, setValue] = React.useState<T>(controlled !== undefined ? controlled : initial)
  const [seen, setSeen] = React.useState(controlled)
  if (!Object.is(controlled, seen)) {
    setSeen(controlled)
    if (controlled !== undefined) setValue(controlled)
  }
  return [value, setValue] as const
}

function PhoneCheckboxItem({
  menu,
  className,
  children,
  checked,
  defaultChecked,
  onCheckedChange,
  onClick,
  closeOnClick = false,
  disabled,
  inset,
}: MenuPrimitive.CheckboxItem.Props & { menu: PhoneMenu; inset?: boolean }) {
  const [value, setValue] = useStepValue(checked, defaultChecked ?? false)
  return (
    <PhoneTickRow
      role="menuitemcheckbox"
      slot="dropdown-menu-checkbox-item"
      checked={value}
      disabled={disabled}
      inset={inset}
      className={typeof className === "string" ? className : undefined}
      onToggle={(event) => {
        const open = runItemClick(event, onClick as never)
        const details = phoneChangeDetails("item-press", event.nativeEvent)
        onCheckedChange?.(!value, details as unknown as MenuPrimitive.CheckboxItem.ChangeEventDetails)
        if (!details.isCanceled) setValue(!value)
        if (open && closeOnClick) menu.close()
      }}
    >
      {children}
    </PhoneTickRow>
  )
}

/** A phone radio group's value, for its rows. */
type PhoneRadio = {
  value: unknown
  /** False when the caller's onValueChange cancelled the choice. */
  choose: (value: unknown, event: React.MouseEvent<HTMLElement>) => boolean
}

const PhoneRadioContext = React.createContext<PhoneRadio | null>(null)

function PhoneRadioGroup({
  value: valueProp,
  defaultValue,
  onValueChange,
  ...props
}: MenuPrimitive.RadioGroup.Props) {
  const [value, setValue] = useStepValue<unknown>(valueProp, defaultValue)
  const radio: PhoneRadio = {
    value,
    choose(next, event) {
      const details = phoneChangeDetails("item-press", event.nativeEvent)
      onValueChange?.(next, details as unknown as MenuPrimitive.RadioGroup.ChangeEventDetails)
      if (details.isCanceled) return false
      setValue(next)
      return true
    },
  }
  return (
    <PhoneRadioContext.Provider value={radio}>
      {/* Base UI's group still renders: role="group", and the context
          DropdownMenuLabel needs, so a label with no group still throws
          on phone exactly as on desktop. It is told nothing of the value;
          the phone rows never reach it. */}
      <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
    </PhoneRadioContext.Provider>
  )
}

/**
 * A radio row on phone. Unlike desktop, where Base UI keeps the menu
 * open, choosing one closes the sheet (or returns from the step), as a
 * select does: a Sort sheet is "one tick" (41.5 rule 19, decision 31).
 * A caller that passes closeOnClick={false} keeps it open. Checkbox rows
 * stay open, because several can be ticked.
 */
function PhoneRadioItem({
  menu,
  className,
  children,
  value,
  onClick,
  closeOnClick = true,
  disabled,
  inset,
}: MenuPrimitive.RadioItem.Props & { menu: PhoneMenu; inset?: boolean }) {
  const radio = React.useContext(PhoneRadioContext)
  if (!radio) {
    throw new Error(
      "DropdownMenuRadioItem must be used within a DropdownMenuRadioGroup, on phone as on desktop."
    )
  }
  const checked = Object.is(radio.value, value)
  return (
    <PhoneTickRow
      role="menuitemradio"
      slot="dropdown-menu-radio-item"
      checked={checked}
      disabled={disabled}
      inset={inset}
      className={typeof className === "string" ? className : undefined}
      onToggle={(event) => {
        const open = runItemClick(event, onClick as never)
        const chosen = radio.choose(value, event)
        if (open && chosen && closeOnClick) menu.close()
      }}
    >
      {children}
    </PhoneTickRow>
  )
}

/**
 * The root. On desktop it is Base UI's root, untouched; on phone,
 * PhoneDropdownMenu above (useLayout, 41.3 rule 4). Two different
 * components, so a layout switch mounts the other one fresh.
 */
function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  const { layout } = useLayout()
  if (layout === "phone") return <PhoneDropdownMenu {...props} />
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  // Phone, while the sheet is open: aria-expanded (Base UI's root is
  // held closed there). Nothing on desktop.
  const phoneTrigger = usePhoneTriggerProps()
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} {...phoneTrigger} />
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const phoneSheet = React.useContext(PhoneMenuSheetContext)
  if (phoneSheet) {
    return <PhoneMenuContent sheet={phoneSheet}>{props.children}</PhoneMenuContent>
  }

  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-(--z-popover) outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "max-h-menu-max min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto",
            "rounded-xl border border-border bg-surface p-1 text-body text-text-primary shadow-menu outline-none",
            // Section 5.6: fade in with a 4px slide away from the trigger,
            // medium; out one step shorter, at fast. animation-duration-*,
            // not duration-*, for the reason given in dialog.tsx.
            "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-medium) data-open:ease-enter",
            "data-[side=bottom]:data-open:slide-in-from-top-1 data-[side=top]:data-open:slide-in-from-bottom-1 data-[side=left]:data-open:slide-in-from-right-1 data-[side=right]:data-open:slide-in-from-left-1",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-fast) data-closed:ease-exit",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

/**
 * REQUIRES A `DropdownMenuGroup` PARENT. This renders Base UI's
 * `Menu.GroupLabel`, which reads `MenuGroupContext` and THROWS when it
 * is absent - it does not degrade, it takes the render down, React
 * unwinds the tree and the page goes blank. The trigger disappears with
 * it, so the symptom reads as "the menu will not open" rather than as a
 * markup error, which is why this is worth a comment rather than a
 * lesson each time.
 *
 * The reason it is not optional: the group is the thing the label is
 * the accessible name OF. `Menu.Group` holds the `aria-labelledby`
 * that this label's id fills in, so a label with no group is a name
 * pointing at nothing.
 *
 *   <DropdownMenuGroup>
 *     <DropdownMenuLabel>Halcyon Supplies</DropdownMenuLabel>
 *     <DropdownMenuItem>...</DropdownMenuItem>
 *   </DropdownMenuGroup>
 *
 * This kit's own kitchen sink got it wrong and crashed on open, on
 * every React version, until 17 Sep 2026. It is not a React 18 issue.
 */
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-3 py-1 text-meta text-text-muted data-inset:pl-9",
        // Phone: a small label between the rows (41.8 rule 7), in line
        // with their 16px sides, with room above it to part the groups.
        // Inset, it lines up with an icon row's text as an inset row does
        // (PhoneInset): the 16px side, an icon-sized blank, the 8px gap.
        "phone:px-4 phone:pt-3",
        "phone:data-inset:flex phone:data-inset:gap-2 phone:data-inset:pl-4 phone:data-inset:before:size-4 phone:data-inset:before:shrink-0 phone:data-inset:before:content-['']",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "danger"
}) {
  const phoneMenu = React.useContext(PhoneMenuContext)
  if (phoneMenu) {
    return (
      <PhoneMenuItem menu={phoneMenu} className={className} inset={inset} variant={variant} {...props} />
    )
  }

  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex h-control cursor-pointer items-center gap-2 rounded-lg px-3 text-body outline-hidden select-none",
        "data-[highlighted]:bg-surface-control data-inset:pl-9",
        "data-[variant=danger]:text-danger data-[variant=danger]:data-[highlighted]:bg-danger-bg data-[variant=danger]:*:[svg]:text-danger",
        "data-disabled:pointer-events-none data-disabled:text-text-muted",
        // TRACKING KEEPS THIS (the kit lacks it). A DISABLED DANGER ITEM
        // MUST STILL LOOK DISABLED (6.4). The two rules above are both a
        // single attribute selector, so they tie on specificity and the
        // danger colour wins on source order - leaving a dead "Delete" at
        // full-strength red. These carry both attributes, so they outrank
        // it by specificity rather than by where they happen to sit.
        "data-disabled:data-[variant=danger]:text-text-muted",
        "data-disabled:data-[variant=danger]:*:[svg]:text-text-muted",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  const phoneMenu = React.useContext(PhoneMenuContext)
  if (phoneMenu) return <PhoneSubmenu>{props.children}</PhoneSubmenu>
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

/**
 * A sub-menu on phone (41.8 rule 9): no second sheet and no fly-out. Its
 * trigger is a row with a chevron, and its items open as a step of the
 * same sheet, with the back arrow to return.
 */
function PhoneSubmenu({ children }: { children?: React.ReactNode }) {
  const content = React.useRef<React.ReactNode>(null)
  const submenu: PhoneSubmenu = {
    content: () => content.current,
    registerContent: (next) => {
      content.current = next
    },
  }
  return <PhoneSubmenuContext.Provider value={submenu}>{children}</PhoneSubmenuContext.Provider>
}

/** Hands a sub-menu's items up to its trigger, and draws nothing. */
function PhoneSubmenuContent({ children }: { children: React.ReactNode }) {
  const register = React.useContext(PhoneSubmenuContext)?.registerContent
  React.useLayoutEffect(() => {
    register?.(children)
  })
  return null
}

function PhoneSubmenuTrigger({
  menu,
  className,
  inset,
  disabled,
  children,
}: {
  menu: PhoneMenu
  className?: string
  inset?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  const submenu = React.useContext(PhoneSubmenuContext)
  const step = useSheetStep()
  return (
    <button
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset || undefined}
      {...PHONE_ROW}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className={cn(phoneRowClassName(), className)}
      onClick={(event) => {
        if (disabled || !submenu) return
        const title = phoneSheetTitle(event.currentTarget, { content: true }) ?? MENU_TITLE
        // An item chosen in the sub-menu closes the menu as one in the
        // main list does.
        step.open({ title, content: menuStep(title, menu, submenu.content()) })
      }}
    >
      {inset ? <PhoneInset /> : null}
      <span className={phoneRowLabelClassName}>{children}</span>
      <ChevronRightIcon aria-hidden="true" />
    </button>
  )
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  const phoneMenu = React.useContext(PhoneMenuContext)
  if (phoneMenu) {
    return (
      <PhoneSubmenuTrigger
        menu={phoneMenu}
        className={typeof className === "string" ? className : undefined}
        inset={inset}
        disabled={props.disabled}
      >
        {children}
      </PhoneSubmenuTrigger>
    )
  }

  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex h-control cursor-pointer items-center gap-2 rounded-lg px-3 text-body outline-hidden select-none",
        "data-[highlighted]:bg-surface-control data-inset:pl-9 data-popup-open:bg-surface-control",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  const phoneMenu = React.useContext(PhoneMenuContext)
  if (phoneMenu) return <PhoneSubmenuContent>{props.children}</PhoneSubmenuContent>

  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) {
  const phoneMenu = React.useContext(PhoneMenuContext)
  if (phoneMenu) {
    return (
      <PhoneCheckboxItem menu={phoneMenu} className={className} checked={checked} inset={inset} {...props}>
        {children}
      </PhoneCheckboxItem>
    )
  }

  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex h-control cursor-pointer items-center gap-2 rounded-lg pr-9 pl-3 text-body outline-hidden select-none",
        // Section 16.2: selected and hovered never share a look. The
        // hover fill is withheld from a checked row, or hovering (or
        // arrowing onto) the chosen item turned it the same neutral grey
        // as every other hovered row and only the tick was left.
        "[&[data-highlighted]:not([data-checked])]:bg-surface-control data-inset:pl-9",
        "data-checked:bg-primary-subtle data-checked:text-primary-text",
        "data-disabled:pointer-events-none data-disabled:text-text-muted",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-3 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  const phoneMenu = React.useContext(PhoneMenuContext)
  if (phoneMenu) return <PhoneRadioGroup {...props} />

  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) {
  const phoneMenu = React.useContext(PhoneMenuContext)
  if (phoneMenu) {
    return (
      <PhoneRadioItem menu={phoneMenu} className={className} inset={inset} {...props}>
        {children}
      </PhoneRadioItem>
    )
  }

  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex h-control cursor-pointer items-center gap-2 rounded-lg pr-9 pl-3 text-body outline-hidden select-none",
        // Section 16.2: selected and hovered never share a look. The
        // hover fill is withheld from a checked row, or hovering (or
        // arrowing onto) the chosen item turned it the same neutral grey
        // as every other hovered row and only the tick was left.
        "[&[data-highlighted]:not([data-checked])]:bg-surface-control data-inset:pl-9",
        "data-checked:bg-primary-subtle data-checked:text-primary-text",
        "data-disabled:pointer-events-none data-disabled:text-text-muted",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-3 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("my-1 h-px bg-border-light", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-meta tracking-widest text-text-muted",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
