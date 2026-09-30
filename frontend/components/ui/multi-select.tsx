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
import { Truncate } from "@/components/ui/truncate"

/**
 * Choosing several values from a searchable list (section 16).
 *
 * The same parts as SearchableSelect, not a second design: the trigger
 * is the select trigger (36px, chevron on the right, turning up while
 * open, grey placeholder, faded when disabled, danger border when
 * invalid - a class, as aria-invalid is not allowed on a button), and the menu is the SearchableSelect menu - as wide as the
 * trigger, search fixed above a list capped at seven rows, a chosen row
 * primary-subtle with the tick on the right, the highlighted row
 * neutral grey (16.1 to 16.3). The one difference is that choosing a
 * row does not close the menu, so several can be ticked in one go;
 * Escape or a click outside closes it and focus returns to the trigger
 * (16.4).
 *
 * The trigger lists the chosen labels in the options' own order, and
 * truncates with the full list in a tooltip when they do not fit (8).
 */
function MultiSelect({
  options,
  value,
  onValueChange,
  id,
  placeholder = "Choose",
  searchPlaceholder = "Search",
  emptyMessage = "Nothing matches that search.",
  disabled,
  invalid,
  className,
  describedBy,
}: {
  /** value to label, in display order. */
  options: Record<string, string>
  value: string[]
  onValueChange: (value: string[]) => void
  id?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  /** Draws the danger border; pair it with an InlineFieldError. */
  invalid?: boolean
  className?: string
  /** id of the helper or error text under the field. */
  describedBy?: string
}) {
  const [open, setOpen] = React.useState(false)
  const chosen = new Set(value)
  const labels = value.map((v) => options[v]).filter(Boolean)

  function toggle(v: string) {
    const next = new Set(chosen)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    // Keep the options' own order, so the trigger text is stable.
    onValueChange(Object.keys(options).filter((key) => next.has(key)))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            data-invalid={invalid || undefined}
            aria-describedby={describedBy}
            data-slot="multi-select-trigger"
            data-placeholder={labels.length ? undefined : ""}
            className={cn("group", selectTriggerClassName, invalid && "border-danger", className)}
          />
        }
      >
        {labels.length ? (
          <Truncate className="flex-1 text-left">{labels.join(", ")}</Truncate>
        ) : (
          <span className="flex-1 truncate text-left">{placeholder}</span>
        )}
        {/* The trigger carries data-popup-open, so the chevron reads it
            through the group (16.1: up while open). */}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-text-secondary transition-transform group-data-popup-open:rotate-180" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) gap-0 p-0">
        <Command>
          {/* Fixed at the top: a sibling of the list, not inside its
              scroll container. */}
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-menu-max overflow-y-auto" aria-multiselectable>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {Object.entries(options).map(([v, label]) => {
                const isSelected = chosen.has(v)
                return (
                  <CommandItem
                    key={v}
                    value={label}
                    // cmdk owns aria-selected for its highlight; ours is
                    // data-chosen, and data-checked draws CommandItem's tick.
                    data-chosen={isSelected || undefined}
                    data-checked={isSelected}
                    onSelect={() => toggle(v)}
                    className={cn(
                      "h-control rounded-lg px-3",
                      isSelected &&
                        "bg-primary-subtle text-primary-text data-selected:bg-primary-subtle data-selected:text-primary-text",
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

export { MultiSelect }
