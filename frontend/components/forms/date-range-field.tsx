"use client"

import * as React from "react"
import type { DateRange } from "react-day-picker"

import { formatDate } from "@/lib/format"
import {
  DATE_RANGE_PRESETS,
  fromApiDate,
  matchingPreset,
  toApiDate,
  type DateRangePresetKey,
} from "@/lib/date-range-presets"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"

/**
 * Section 27.4's date range, in one place: the same preset list on every
 * screen (Today … This financial year, Custom range), the active preset
 * tinted primary-subtle with a primary border, Custom range opening the
 * two-month calendar (20.1), and the chosen range always shown as
 * readable text, never only as "Custom".
 *
 * A controlled editor over two API dates (`YYYY-MM-DD`). It sits inside a
 * filter panel's draft; the panel decides when to apply. Used by the
 * expenses filter and the access History filter.
 */
export function DateRangeField({
  label = "Date range",
  from,
  to,
  onChange,
  error,
}: {
  label?: string
  from?: string
  to?: string
  onChange: (from: string | undefined, to: string | undefined) => void
  error?: string | null
}) {
  // The calendar's own selection, so a half-picked custom range (a start
  // with no end yet) is kept while the user picks the end.
  const [range, setRange] = React.useState<DateRange>({
    from: fromApiDate(from ?? ""),
    to: fromApiDate(to ?? ""),
  })
  const [custom, setCustom] = React.useState(false)
  const activePreset = custom ? "custom" : matchingPreset(from, to)

  function choosePreset(key: DateRangePresetKey) {
    const preset = DATE_RANGE_PRESETS.find((p) => p.key === key)
    if (!preset?.range) {
      // "Custom range": keep whatever is picked and let the calendar drive.
      setCustom(true)
      return
    }
    setCustom(false)
    const next = preset.range()
    setRange(next)
    onChange(toApiDate(next.from), toApiDate(next.to))
  }

  function onCalendarSelect(selected: DateRange | undefined) {
    setCustom(true)
    setRange(selected ?? { from: undefined, to: undefined })
    onChange(
      selected?.from ? toApiDate(selected.from) : undefined,
      selected?.to ? toApiDate(selected.to) : undefined,
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex shrink-0 flex-col gap-1">
          {DATE_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              aria-pressed={activePreset === preset.key}
              onClick={() => choosePreset(preset.key)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-body transition-colors",
                "hover:bg-surface-control",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ring",
                activePreset === preset.key
                  ? "border-primary bg-primary-subtle text-text-primary"
                  : "border-transparent text-text-secondary",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {activePreset === "custom" || activePreset === undefined ? (
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            defaultMonth={range.from}
            onSelect={onCalendarSelect}
          />
        ) : null}
      </div>
      <p className="text-label text-text-secondary">{dateRangeLabel(from, to) ?? "No date range chosen"}</p>
      <InlineFieldError>{error}</InlineFieldError>
    </section>
  )
}

/**
 * The one place a date range becomes readable text (27.4): the field,
 * a filter chip and an export heading all say it the same way.
 */
export function dateRangeLabel(from?: string, to?: string): string | null {
  if (!from && !to) return null
  return from && to
    ? `${formatDate(from)} to ${formatDate(to)}`
    : from
      ? `From ${formatDate(from)}`
      : `Until ${formatDate(to!)}`
}
