"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
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
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
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
