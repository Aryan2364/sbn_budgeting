"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Section 16.
 *
 * Trigger is 36px, matching an input, with the chevron on the right;
 * it points down when closed and up when open. The menu is exactly the
 * trigger's width, 12px radius, capped at about seven rows before it
 * scrolls on the styled scrollbar from section 10, and it flips upward
 * when there is no room below.
 *
 * Selected and hovered must look different (16.2). Selected is
 * primary-subtle with a tick on the right; hovered is neutral grey.
 * They are two different meanings and never share one style.
 *
 * The trigger shows the raw value unless Root is given an `items` map
 * of value to label. Pass it whenever the value is a code rather than
 * the words the user should read.
 *
 * Not covered here: section 16.3 says a list of more than six options
 * needs a search box fixed at the top, and more than about twenty
 * should not be a dropdown at all. That is a composite of Popover and
 * Command rather than a primitive, and is not built yet.
 */
/**
 * The trigger's appearance, shared so the searchable picker in
 * section 16.3 cannot drift away from the plain dropdown.
 */
const selectTriggerClassName = [
  "flex h-control w-full max-w-field-max min-w-0 cursor-pointer items-center justify-between gap-2",
  "rounded-lg border border-border bg-surface px-3 text-body text-text-primary whitespace-nowrap transition-colors select-none",
  "outline-none focus-visible:border-primary-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-ring",
  "disabled:cursor-default disabled:border-border-light disabled:bg-surface-sunken disabled:text-text-muted",
  "data-disabled:cursor-default data-disabled:border-border-light data-disabled:bg-surface-sunken data-disabled:text-text-muted",
  "data-placeholder:text-text-muted",
  "aria-invalid:border-danger",
].join(" ")

/**
 * Section 16.3, made self-enforcing.
 *
 * "More than 6 options: the menu gets a search box fixed at the top.
 * More than about 20 options: it should not be a dropdown at all."
 *
 * Choosing the right control was the caller's job, which means it gets
 * forgotten by the fourth screen. This warns in development, once per
 * mounted Select, and compiles away in production.
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
          `AGENTS.md section 16.3: past six options the menu needs a search ` +
          `box fixed at the top, and past about twenty it should not be a ` +
          `dropdown at all. Use SearchableSelect from ` +
          `components/ui/searchable-select.tsx instead.`
      )
    }
  }, [children])
}

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
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
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(selectTriggerClassName, className)}
      {...props}
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
  useLongListWarning(children)

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative isolate z-50 flex w-(--anchor-width) origin-(--transform-origin) flex-col",
            "rounded-xl border border-border bg-surface text-body text-text-primary shadow-lg",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
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
      className={cn("px-3 py-1 text-meta text-text-muted", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex h-control w-full cursor-pointer items-center gap-2 rounded-lg pr-8 pl-3 text-body outline-hidden select-none",
        // Hovered and keyboard-highlighted: neutral grey. Only when the
        // row is not the selected one, so selection stays visible.
        "[&[data-highlighted]:not([aria-selected='true'])]:bg-surface-control",
        // Selected: primary-subtle with a tick on the right.
        "[&[aria-selected='true']]:bg-primary-subtle [&[aria-selected='true']]:text-primary-pressed",
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
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-surface py-1 text-text-secondary [&_svg:not([class*='size-'])]:size-4",
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
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-surface py-1 text-text-secondary [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
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
