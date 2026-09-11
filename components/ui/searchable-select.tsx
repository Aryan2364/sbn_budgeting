"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { selectTriggerClassName } from "@/components/ui/select"

/**
 * Section 16.3.
 *
 * "More than 6 options: the menu gets a search box fixed at the top,
 * which does not scroll with the options. More than about 20 options:
 * it should not be a dropdown. Use a searchable picker or a dialog."
 *
 * This is that picker. The trigger is the plain Select's trigger -
 * imported, not copied, so the two cannot drift apart - and the search
 * box sits outside the scrolling list, so it stays put while the
 * options move underneath it.
 *
 * Selected and hovered stay distinct, as in section 16.2: selected is
 * primary-subtle with a tick, hovered is neutral grey.
 */
function SearchableSelect({
  options,
  value,
  onValueChange,
  id,
  placeholder = "Select an option",
  searchPlaceholder = "Search",
  emptyMessage = "Nothing matches that search.",
  disabled,
  className,
}: {
  /** value to label. */
  options: Record<string, string>
  value?: string
  onValueChange?: (value: string) => void
  id?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const entries = Object.entries(options)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            data-slot="searchable-select-trigger"
            data-placeholder={value ? undefined : ""}
            className={cn(selectTriggerClassName, className)}
          />
        }
      >
        <span className="flex-1 truncate text-left">
          {value ? options[value] : placeholder}
        </span>
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-text-secondary transition-transform data-popup-open:rotate-180" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--anchor-width) gap-0 p-0"
      >
        <Command>
          {/* Fixed at the top: it is a sibling of the list, not inside
              its scroll container. */}
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-menu-max overflow-y-auto">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {entries.map(([v, label]) => {
                const isSelected = v === value
                return (
                  <CommandItem
                    key={v}
                    value={label}
                    // Not aria-selected: cmdk owns that attribute for
                    // its own highlight, and section 16.2 needs the
                    // chosen row and the highlighted row to stay
                    // visually distinct. `data-chosen` carries ours.
                    data-chosen={isSelected || undefined}
                    // CommandItem already renders the tick, keyed to
                    // data-checked. Rule 4: do not build it twice.
                    data-checked={isSelected}
                    onSelect={() => {
                      onValueChange?.(v)
                      setOpen(false)
                    }}
                    className={cn(
                      "h-control rounded-lg px-3",
                      isSelected && "bg-primary-subtle text-primary-pressed"
                    )}
                  >
                    <span className="flex-1 truncate">{label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { SearchableSelect }
