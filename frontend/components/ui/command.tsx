"use client"

import * as React from "react"
import { flushSync } from "react-dom"
import { Command as CommandPrimitive } from "cmdk"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
} from "@/components/ui/input-group"
import { SearchIcon, CheckIcon } from "lucide-react"

/*
 * ON PHONE (41.8) a command list sits in a bottom sheet (searchable-select,
 * multi-select) or fills the full-screen layer CommandDialog becomes
 * (part of dialog.tsx). So, on phone only, through the `phone:` variant
 * and useLayout(), with desktop unchanged:
 *
 *   - no box: no radius, no padding round the list - the sheet or layer
 *     is the box, and its rows run edge to edge (41.5 rule 8);
 *   - the list loses its seven-row cap and fills the space below the
 *     search box, which stays fixed above it (41.8 rule 8);
 *   - rows are 48px at least and grow when their text wraps (41.8 rule
 *     7, 41.9 rule 7), with 16px sides;
 *   - the search box never takes focus by itself (41.8 rule 19, 41.7
 *     rule 17), and asks for the search keyboard (41.7 rule 5);
 *   - moving a finger over a row does not highlight it, because that is
 *     a hover and stays stuck after a tap (41.9 rule 1). The arrow keys
 *     still move the highlight;
 *   - nothing is highlighted until a key moves the highlight - see
 *     usePhoneHighlight below.
 */

/** Keys with which cmdk moves its highlight (its vim bindings included). */
function movesHighlight(event: React.KeyboardEvent) {
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return true
  return event.ctrlKey && ["n", "j", "p", "k"].includes(event.key)
}

/**
 * cmdk always highlights a row: the first one when the list opens and
 * again on every search, and that highlight is both its data-selected
 * grey and its aria-selected. On phone, with no key pressed, that grey
 * first row reads as chosen (16.2: chosen and highlighted look different;
 * 41.9 rule 1), and a screen reader hears it as selected.
 *
 * So on phone, until a key moves the highlight, cmdk's highlight is held
 * on `chosenValue` - the chosen row of a single-choice list, which is
 * then the one row cmdk marks aria-selected, so TalkBack and VoiceOver
 * hear the chosen row as selected (41.20 check 24) - or on nothing.
 * A highlight cmdk moves by itself (opening, searching, a tap) is put
 * back.
 *
 * The first key that moves the highlight hands it back to cmdk for good
 * (until the list closes): a keyboard user gets desktop's arrows, Home,
 * End, and Enter on the highlighted row (16.4). That switch is flushed
 * before cmdk handles the key, so the key itself already moves cmdk's
 * own highlight, with its scrolling and aria-activedescendant.
 *
 * Desktop, and a caller that controls `value` itself: untouched.
 */
function usePhoneHighlight({
  active,
  chosenValue,
  onValueChange,
  onKeyDown,
}: {
  active: boolean
  chosenValue: string | undefined
  onValueChange: ((value: string) => void) | undefined
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement> | undefined
}) {
  const [keys, setKeys] = React.useState(false)
  // cmdk takes its value trimmed, and re-reads it only when the prop
  // changes. A space that comes and goes changes the prop and not the
  // value, so a highlight cmdk moved by itself is put back.
  const [nudge, setNudge] = React.useState(false)

  if (!active || keys) return { value: undefined, onValueChange, onKeyDown }

  const held = chosenValue ?? ""
  return {
    value: nudge ? `${held} ` : held,
    onValueChange: () => setNudge((was) => !was),
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented || !movesHighlight(event)) return
      flushSync(() => setKeys(true))
    },
  }
}

function Command({
  className,
  chosenValue,
  value,
  onValueChange,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof CommandPrimitive> & {
  /**
   * The cmdk value (the row's `value`, usually its label) of the chosen
   * row in a single-choice list. Used on phone only, where it is the row
   * cmdk marks while no key has moved the highlight (usePhoneHighlight).
   * Leave it out for a multiple choice; there each row carries its own
   * aria-checked.
   */
  chosenValue?: string
}) {
  const phone = useLayout().layout === "phone"
  const highlight = usePhoneHighlight({
    active: phone && value === undefined,
    chosenValue,
    onValueChange,
    onKeyDown,
  })
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
        // Phone: no box - the sheet or layer is the box. It keeps the
        // surface, which phone rows sit on (41.5 rule 8), and fills the
        // space it is given by flex, so the list below can take the rest.
        "phone:min-h-0 phone:flex-1 phone:rounded-none! phone:p-0",
        className
      )}
      {...(phone && props.disablePointerSelection === undefined
        ? { disablePointerSelection: true }
        : {})}
      {...props}
      // Desktop and a controlled caller: exactly the caller's own.
      {...(phone && value === undefined ? highlight : { value, onValueChange, onKeyDown })}
    />
  )
}

function CommandDialog({
  title = "Command palette",
  description = "Search for a command to run",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
  children: React.ReactNode
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        className={cn(
          "top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0",
          className
        )}
        showCloseButton={showCloseButton}
      >
        {/* Inside the popup, where Base UI wires them to aria-labelledby
            and aria-describedby; outside it they were page content.
            Bare Title and Description rather than DialogHeader, which
            would make DialogContent build a padded scrolling body
            around a palette that brings its own. */}
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  const phone = useLayout().layout === "phone"
  return (
    <div
      data-slot="command-input-wrapper"
      // Phone: the content's 16px sides, and a line between the fixed
      // search box and the rows scrolling under it.
      className="p-1 pb-0 phone:shrink-0 phone:border-b phone:border-border-light phone:px-4 phone:py-3"
    >
      {/* The plain InputGroup: 36px, border and surface (sections 6.2,
          6.5). No faded fill, no opacity on the icon. */}
      <InputGroup className="*:data-[slot=input-group-addon]:pl-3">
        {/* The group's focus ring is keyed to input-group-control, so
            the search box has to carry that slot to show one (6.4). */}
        <CommandPrimitive.Input
          data-slot="input-group-control"
          className={cn(
            "h-full w-full min-w-0 bg-transparent px-2 text-body text-text-primary outline-hidden placeholder:text-text-muted disabled:cursor-default disabled:text-text-muted",
            className
          )}
          // 41.7 rule 5: the search keyboard, its Enter key saying
          // Search. Phone only: desktop's input is unchanged.
          {...(phone ? { inputMode: "search" as const, enterKeyHint: "search" as const } : {})}
          {...props}
          // 41.8 rule 19 and 41.7 rule 17: never focused by itself on
          // phone, so the keyboard stays shut until the box is tapped.
          {...(phone ? { autoFocus: false } : {})}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        // Section 16.2: seven rows, then it scrolls on the styled
        // scrollbar of section 10.1 - not a hidden one.
        "max-h-menu-max scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        // Phone: no cap - the list fills the sheet or layer below the
        // search box and is the one thing that scrolls there.
        "phone:max-h-none phone:min-h-0 phone:flex-1 phone:overscroll-contain",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-body text-text-muted", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-text-primary **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-1 **:[[cmdk-group-heading]]:text-meta **:[[cmdk-group-heading]]:text-text-muted",
        // Phone: rows edge to edge, the heading a small label in line
        // with their 16px sides (41.8 rule 7).
        "phone:p-0 phone:**:[[cmdk-group-heading]]:px-4 phone:**:[[cmdk-group-heading]]:pt-3",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border-light", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // Section 16.2 rows: 36px, 12px sides. data-selected is cmdk's
        // HIGHLIGHT (pointer or arrow keys), so it takes the neutral
        // hover grey; a chosen value is the caller's to mark.
        "group/command-item relative flex h-control cursor-pointer items-center gap-2 rounded-lg px-3 text-body outline-hidden select-none",
        "data-selected:bg-surface-control data-[disabled=true]:pointer-events-none data-[disabled=true]:text-text-muted",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Phone (41.8 rule 7, 41.9 rule 7): 48px at least, growing when
        // the text wraps; square, edge to edge, 16px sides; pressed is
        // the feedback (41.9 rule 1).
        "phone:h-auto phone:min-h-12 phone:rounded-none phone:px-4 phone:py-2 phone:active:bg-surface-control",
        className
      )}
      {...props}
    >
      {children}
      <CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
    </CommandPrimitive.Item>
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-meta tracking-widest text-text-muted",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
