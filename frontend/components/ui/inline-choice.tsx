"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { ChevronDownIcon } from "lucide-react"

import { Select, SelectContent, SelectItem } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * Section 6.7: an inline text control. The actionable part of a sentence
 * - the 25 in "Show 25 records per page" - reading as part of it:
 *
 *   Show <InlineChoice label="Records per page" value={size}
 *     onValueChange={setSize} options={[10, 25, 50, 100].map(...)} /> records per page
 *
 * - The sentence's own font size, weight and line height: the trigger
 *   inherits the whole font rather than setting one.
 * - primary-text, underlined, with a 12px chevron-down after it; the
 *   chevron points up while open (16.1).
 * - It chooses a value, so it opens the kit's Select list (section 16):
 *   same rows, same selected tick, same keyboard, the same 6-option limit
 *   (16.3). Only the trigger is inline.
 * - The focus ring of 6.4 and the tap area of 9 rule 4.
 *
 * `label` names the choice for a screen reader, because the trigger shows
 * only the value: "Records per page", not "25".
 */

type Option<V extends string | number> = { value: V; label: string }

function InlineChoice<V extends string | number>({
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  label: string
  value: V
  onValueChange: (value: V) => void
  options: Option<V>[]
  className?: string
}) {
  const items = React.useMemo(
    () => Object.fromEntries(options.map((o) => [String(o.value), o.label])),
    [options]
  )

  return (
    <Select
      value={String(value)}
      items={items}
      onValueChange={(next) => {
        const picked = options.find((o) => String(o.value) === next)
        if (picked) onValueChange(picked.value)
      }}
    >
      <SelectPrimitive.Trigger
        data-slot="inline-choice"
        aria-label={label}
        className={cn(
          // The sentence's own type (6.7): inherit it whole.
          "tap-area inline-flex cursor-pointer items-baseline gap-1 [font:inherit]",
          "text-primary-text underline decoration-1 underline-offset-2",
          "rounded-sm outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
          className
        )}
      >
        <SelectPrimitive.Value />
        {/* 12px, the one size section 6.7 names; up while open (16.1).
            Drawn directly rather than through Select.Icon, which adds a
            text "▼" of its own to the trigger's content. */}
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none size-3 shrink-0 self-center in-data-popup-open:rotate-180"
        />
      </SelectPrimitive.Trigger>
      {/* Section 16.2 asks for the trigger's width, which for a two-digit
          trigger is narrower than the options; the list takes the width
          its options need, and never less than the trigger. */}
      <SelectContent className="w-auto min-w-(--anchor-width)">
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { InlineChoice }
