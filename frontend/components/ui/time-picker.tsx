"use client"

import * as React from "react"
import { ClockIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * Section 20.2. There is no ready-made time picker in the component
 * library, so this is built to the rule:
 *
 *   - 12-hour format with AM and PM, matching the date and time format
 *     in section 18.
 *   - Separate hour and minute controls, both typeable and selectable.
 *   - Minutes step in 15-minute intervals.
 *   - No seconds.
 *   - Field width: 3 columns (section 17).
 *
 * "Typeable and selectable" is why each control is an input with a
 * list beside it rather than one or the other: data entry staff type,
 * everyone else picks.
 */
const HOURS = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
const MINUTES = ["00", "15", "30", "45"]
const MERIDIEMS = ["AM", "PM"] as const

type Meridiem = (typeof MERIDIEMS)[number]

export type TimeValue = {
  /** 1 to 12, as displayed. */
  hour: number
  /** 0, 15, 30 or 45. */
  minute: number
  meridiem: Meridiem
}

function formatTime(value: TimeValue | undefined) {
  if (!value) return ""
  return `${value.hour}:${String(value.minute).padStart(2, "0")} ${value.meridiem}`
}

/** Accepts 9, 9:30, 9:30 pm, 0930pm and similar. Returns undefined if it cannot. */
function parseTime(text: string): TimeValue | undefined {
  const cleaned = text.trim().toLowerCase().replace(/\s+/g, "")
  if (!cleaned) return undefined
  const match = cleaned.match(/^(\d{1,2})[:.]?(\d{2})?(am|pm)?$/)
  if (!match) return undefined

  let hour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  let meridiem = match[3]?.toUpperCase() as Meridiem | undefined

  if (hour === 0 || hour > 24) return undefined
  if (minute > 59) return undefined

  // A 24-hour entry is folded into 12-hour, since that is what the
  // system displays everywhere.
  if (hour > 12) {
    hour -= 12
    meridiem = meridiem ?? "PM"
  } else if (hour === 12) {
    meridiem = meridiem ?? "PM"
  } else {
    meridiem = meridiem ?? "AM"
  }

  // Minutes step in 15s; anything typed is snapped to the nearest step
  // rather than rejected, which is kinder than an error for "9:20".
  const snapped = (Math.round(minute / 15) * 15) % 60
  const rolled = Math.round(minute / 15) === 4

  return {
    hour: rolled ? (hour === 12 ? 1 : hour + 1) : hour,
    minute: snapped,
    meridiem,
  }
}

function OptionList({
  options,
  selected,
  onSelect,
  label,
}: {
  options: readonly string[]
  selected: string
  onSelect: (value: string) => void
  label: string
}) {
  return (
    <div className="flex flex-col">
      <p className="px-3 py-1 text-meta text-text-muted">{label}</p>
      {/*
        TRACKING'S A11Y, KEPT OVER THE KIT'S aria-pressed. A list of
        mutually exclusive values IS a listbox, and `option` is the one
        role where `aria-selected` means what it says; `aria-pressed`
        announces a toggle button, which a chosen hour is not.
      */}
      <div
        role="listbox"
        aria-label={label}
        className="max-h-menu-max overflow-y-auto"
      >
        {options.map((option) => {
          const isSelected = option === selected
          return (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(option)}
              className={cn(
                "flex h-control w-full cursor-pointer items-center rounded-lg px-3 text-body outline-none",
                "not-aria-selected:hover:bg-surface-control not-aria-selected:active:bg-surface-control-pressed",
                "focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:-outline-offset-2 focus-visible:outline-primary-ring",
                isSelected && "bg-primary-subtle text-primary-text"
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimePicker({
  value,
  onValueChange,
  id,
  disabled,
  invalid,
  onInvalidEntry,
  placeholder = "9:30 AM",
  className,
}: {
  value?: TimeValue
  onValueChange?: (value: TimeValue | undefined) => void
  id?: string
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  className?: string
  /**
   * Called on leaving the field when what was typed cannot be read as a
   * time. The field keeps the text and marks itself invalid; the caller
   * shows the section 11.3 rule 6 inline error and does not save.
   */
  onInvalidEntry?: (typed: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [unreadable, setUnreadable] = React.useState(false)
  const [text, setText] = React.useState(() => formatTime(value))

  // The typed text is the source of truth while the user edits; when the
  // value itself changes it follows. Adjusted during render rather than
  // in an effect, so there is no extra render with stale text.
  //
  // Compared on the FORMATTED value, not the object (Tracking): a parent
  // that builds a fresh TimeValue on every render would otherwise reset
  // the field under the user's hands on every keystroke elsewhere.
  const formatted = formatTime(value)
  const [shownValue, setShownValue] = React.useState(formatted)
  if (formatted !== shownValue) {
    setShownValue(formatted)
    setText(formatted)
    setUnreadable(false)
  }

  /*
   * Section 20.1: an entry that cannot be read keeps what was typed and
   * shows the inline error. It used to be replaced silently with the
   * previous value, so a mistyped entry vanished and the old one looked
   * as if it had been accepted.
   */
  function commit() {
    if (text.trim() === "") {
      setUnreadable(false)
      onValueChange?.(undefined)
      return
    }
    const parsed = parseTime(text)
    if (parsed) {
      setUnreadable(false)
      onValueChange?.(parsed)
      setText(formatTime(parsed))
    } else {
      setUnreadable(true)
      onInvalidEntry?.(text)
    }
  }

  const current: TimeValue = value ?? { hour: 9, minute: 0, meridiem: "AM" }

  function set(part: Partial<TimeValue>) {
    onValueChange?.({ ...current, ...part })
  }

  return (
    <div
      data-slot="time-picker"
      className={cn("relative flex w-full max-w-field-max items-center", className)}
    >
      <Input
        id={id}
        value={text}
        disabled={disabled}
        aria-invalid={invalid || unreadable || undefined}
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
              aria-label="Choose a time"
              className="absolute right-1"
            />
          }
        >
          <ClockIcon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto gap-0 p-1">
          <div className="flex gap-1">
            <OptionList
              label="Hour"
              options={HOURS}
              selected={String(current.hour)}
              onSelect={(h) => set({ hour: Number(h) })}
            />
            <OptionList
              label="Minute"
              options={MINUTES}
              selected={String(current.minute).padStart(2, "0")}
              onSelect={(m) => set({ minute: Number(m) })}
            />
            <OptionList
              label="AM/PM"
              options={MERIDIEMS}
              selected={current.meridiem}
              onSelect={(m) => set({ meridiem: m as Meridiem })}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { TimePicker, formatTime, parseTime, MINUTES, HOURS }
