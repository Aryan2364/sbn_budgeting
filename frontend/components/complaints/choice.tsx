"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface ChoiceOption {
  value: string
  label: string
}

/**
 * One value from a list, with section 16.3's rule applied for the
 * caller: 6 options or fewer is `select.tsx`, 7 or more is
 * `searchable-select.tsx`. The complaint screens pick from masters
 * whose size is not known in advance (sites, categories, people),
 * so the choice is made from the data, not guessed per screen.
 *
 * Not a new control: it renders one of the two existing ones.
 */
export function Choice({
  id,
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled,
  invalid,
  className,
  onBlur,
}: {
  id?: string
  options: ChoiceOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  searchPlaceholder?: string
  /** What the search box says when nothing matches (searchable list only). */
  emptyMessage?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  onBlur?: () => void
}) {
  const items = React.useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.label])),
    [options],
  )

  if (options.length > 6) {
    return (
      <div
        className={cn("w-full max-w-field-max min-w-0", className)}
        aria-invalid={invalid || undefined}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.()
        }}
      >
        <SearchableSelect
          id={id}
          options={items}
          value={value || undefined}
          onValueChange={onValueChange}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          disabled={disabled}
          className={cn(invalid && "border-danger", "max-sm:text-base")}
        />
      </div>
    )
  }

  return (
    <Select
      value={value || null}
      items={items}
      disabled={disabled}
      onValueChange={(next: string | null) => {
        if (next !== null) onValueChange(next)
      }}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        onBlur={onBlur}
        className={cn("max-sm:text-base", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
