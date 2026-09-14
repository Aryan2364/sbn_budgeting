"use client"

import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { DATE_FORMAT } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Sections 18 and 20.1.
 *
 * Displays and accepts DD Mon YYYY. The field is typeable as well as
 * selectable - forcing someone to click through a calendar for a date
 * they already know is slow, and section 20.1 forbids calendar-only.
 *
 * The calendar opens in a popover aligned to the left edge of the
 * field, starts the week on Monday, outlines today and fills the
 * selected day with primary.
 *
 * Field width: 4 columns (section 17).
 */
/**
 * Section 18 owns the format; it lives in lib/format.ts and is
 * imported, never restated. The two helpers below differ from
 * lib/format's on one point only: an empty field shows an empty
 * string, not the em-dash a read-only cell would show.
 */
function formatDate(date: Date | undefined) {
  return date && isValid(date) ? format(date, DATE_FORMAT) : ""
}

function parseDate(text: string) {
  const parsed = parse(text.trim(), DATE_FORMAT, new Date())
  return isValid(parsed) ? parsed : undefined
}

function DatePicker({
  value,
  onValueChange,
  id,
  disabled,
  invalid,
  placeholder = "12 Aug 2026",
  className,
}: {
  value?: Date
  onValueChange?: (date: Date | undefined) => void
  id?: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const formatted = formatDate(value)
  const [text, setText] = React.useState(formatted)
  const [lastFormatted, setLastFormatted] = React.useState(formatted)

  /**
   * Derived state, adjusted during render rather than in an effect.
   *
   * The typed text is the source of truth while the field has focus;
   * outside of that it follows the value. Resyncing that in an effect
   * renders the stale text once and then immediately renders again -
   * which is what React's set-state-in-effect rule is pointing at.
   *
   * The comparison is on the FORMATTED value, not the object. A parent
   * that builds a fresh Date object on every render would otherwise
   * change identity without changing meaning, and reset the field under
   * the user's hands on every keystroke elsewhere on the form.
   */
  if (formatted !== lastFormatted) {
    setLastFormatted(formatted)
    setText(formatted)
  }

  // Section 11.3 rule 6: validation runs when the user leaves the
  // field, not on every keystroke.
  function commit() {
    if (text.trim() === "") {
      onValueChange?.(undefined)
      return
    }
    const parsed = parseDate(text)
    if (parsed) {
      onValueChange?.(parsed)
      setText(formatDate(parsed))
    } else {
      setText(formatDate(value))
    }
  }

  return (
    <div
      data-slot="date-picker"
      className={cn("relative flex w-full max-w-field-max items-center", className)}
    >
      <Input
        id={id}
        value={text}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          }
        }}
        className="pr-11"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="in-field"
              size="icon-sm"
              disabled={disabled}
              aria-label="Choose a date"
              className="absolute right-1"
            />
          }
        >
          <CalendarIcon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value}
            onSelect={(date) => {
              onValueChange?.(date)
              setText(formatDate(date))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { DatePicker, formatDate, parseDate }
