"use client"

import * as React from "react"
import { format, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { DATE_FORMAT } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Sections 18 and 20.1.
 *
 * Displays and accepts DD/MM/YY. The field is typeable as well as
 * selectable - forcing someone to click through a calendar for a date
 * they already know is slow, and section 20.1 forbids calendar-only.
 *
 * Typing is digits only: the field inserts the slashes itself as the
 * user types (`210326` becomes `21/03/26`). Backspace deletes through a
 * trailing slash in one press rather than trapping the caret on it.
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

/**
 * Rejects impossible dates, not just unparseable ones.
 *
 * Parsed by hand rather than via date-fns `parse` with a `yy` token:
 * date-fns picks whichever century falls within 50 years of "now",
 * which silently reads a far-off two-digit year as last century -
 * exactly the ambiguity section 18 accepts the trade on, and it must
 * always land in the 2000s (`26` -> 2026), not float with the clock.
 *
 * `Date` itself rolls an out-of-range day or month over into the next
 * one (`32/03` becomes 1 April) instead of failing, so the constructed
 * date is read back apart and compared against what was typed. A
 * mismatch means the input was never a real date.
 */
function parseDate(text: string) {
  const trimmed = text.trim()
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(trimmed)
  if (!match) return undefined

  const day = Number(match[1])
  const month = Number(match[2])
  const year = 2000 + Number(match[3])

  const parsed = new Date(year, month - 1, day)
  const roundTrips =
    isValid(parsed) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day

  return roundTrips ? parsed : undefined
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/**
 * Section 20.1 requires the error to name the actual problem rather than
 * a single one-size-fits-all message: a genuinely incomplete entry, an
 * out-of-range month, an out-of-range day, and a day that does not exist
 * in the given month are four different mistakes and get four different
 * messages. Returns `undefined` when the text is a valid date.
 */
function getDateError(text: string): string | undefined {
  const trimmed = text.trim()
  const digitCount = trimmed.replace(/\D/g, "").length

  if (digitCount < 6) {
    return "Enter a complete date, like 21/03/26."
  }

  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(trimmed)
  if (!match) {
    return "Enter a complete date, like 21/03/26."
  }

  const day = Number(match[1])
  const month = Number(match[2])
  const year = 2000 + Number(match[3])

  if (month < 1 || month > 12) {
    return "Enter a month between 01 and 12."
  }

  if (day < 1 || day > 31) {
    return "Enter a day between 01 and 31."
  }

  const parsed = new Date(year, month - 1, day)
  const roundTrips =
    isValid(parsed) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day

  if (!roundTrips) {
    return `${MONTH_NAMES[month - 1]} does not have ${day} days.`
  }

  return undefined
}

/**
 * Digits-only masking. Strips everything but digits, caps at 6 (ddmmyy),
 * and inserts `/` after the 2nd and 4th digit as they arrive: `2` -> `2`,
 * `21` -> `21/`, `2103` -> `21/03/`, `210326` -> `21/03/26`.
 */
function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)].filter(
    (part) => part.length > 0,
  )
  let result = parts[0] ?? ""
  if (digits.length >= 2) result = `${parts[0]}/`
  if (parts[1]) result += parts[1]
  if (digits.length >= 4) result += "/"
  if (parts[2]) result += parts[2]
  return result
}

function DatePicker({
  value,
  onValueChange,
  id,
  disabled,
  invalid,
  placeholder = "dd/mm/yy",
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
  // Section 20.1: an unparseable or impossible entry shows an inline
  // error rather than silently reverting the field to the old value.
  const [error, setError] = React.useState<string | null>(null)

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
    setError(null)
  }

  // Section 11.3 rule 6: validation runs when the user leaves the
  // field, not on every keystroke.
  function commit() {
    if (text.trim() === "") {
      setError(null)
      onValueChange?.(undefined)
      return
    }
    const parsed = parseDate(text)
    if (parsed) {
      setError(null)
      onValueChange?.(parsed)
      setText(formatDate(parsed))
    } else {
      setError(getDateError(text) ?? "Enter a complete date, like 21/03/26.")
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      commit()
      return
    }
    // Backspace over a trailing slash removes the digit before it too,
    // so deleting never traps the caret on a separator the user didn't
    // type and never needs a second press to make progress.
    if (e.key === "Backspace") {
      const input = e.currentTarget
      const caret = input.selectionStart ?? text.length
      if (caret === input.selectionEnd && caret > 0 && text[caret - 1] === "/") {
        e.preventDefault()
        const digitsOnly = text.slice(0, caret - 1).replace(/\D/g, "").slice(0, -1)
        setText(maskDateInput(digitsOnly))
      }
    }
  }

  return (
    <div
      data-slot="date-picker"
      className={cn("relative flex w-full max-w-field-max flex-col", className)}
    >
      <div className="relative flex items-center">
        <Input
          id={id}
          value={text}
          disabled={disabled}
          aria-invalid={invalid || !!error || undefined}
          placeholder={placeholder}
          inputMode="numeric"
          onChange={(e) => {
            setText(maskDateInput(e.target.value))
            if (error) setError(null)
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
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
                setError(null)
                onValueChange?.(date)
                setText(formatDate(date))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <InlineFieldError>{error}</InlineFieldError>
    </div>
  )
}

export { DatePicker, formatDate, parseDate }
