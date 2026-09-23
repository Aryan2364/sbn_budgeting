import {
  addDays,
  endOfMonth,
  format,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns"

/**
 * Section 27.4. The same preset list on every screen that offers a date
 * range, in this exact order. Computed from the user's LOCAL today, not
 * the server's — the backend deliberately has no preset vocabulary
 * (section 27.4/AGENTS.md) and only ever receives concrete `YYYY-MM-DD`
 * bounds, built here.
 */
export const DATE_RANGE_PRESET_KEYS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "last3Months",
  "thisFinancialYear",
  "custom",
] as const

export type DateRangePresetKey = (typeof DATE_RANGE_PRESET_KEYS)[number]

export interface DateRangePreset {
  key: DateRangePresetKey
  label: string
  /** Undefined for "custom" - it has no fixed bounds of its own. */
  range?: () => { from: Date; to: Date }
}

/** Financial year: April to March (section 27.4). */
function thisFinancialYearStart(today: Date): Date {
  const year = today.getFullYear()
  // getMonth() is 0-based: April is 3.
  const fyStartYear = today.getMonth() >= 3 ? year : year - 1
  return new Date(fyStartYear, 3, 1)
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  { key: "today", label: "Today", range: () => ({ from: new Date(), to: new Date() }) },
  {
    key: "yesterday",
    label: "Yesterday",
    range: () => {
      const y = subDays(new Date(), 1)
      return { from: y, to: y }
    },
  },
  {
    key: "last7",
    label: "Last 7 days",
    range: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    key: "last30",
    label: "Last 30 days",
    range: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    key: "thisMonth",
    label: "This month",
    range: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    key: "lastMonth",
    label: "Last month",
    range: () => {
      const lastMonth = subMonths(new Date(), 1)
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) }
    },
  },
  {
    key: "last3Months",
    label: "Last 3 months",
    range: () => ({ from: startOfMonth(subMonths(new Date(), 2)), to: new Date() }),
  },
  {
    key: "thisFinancialYear",
    label: "This financial year",
    range: () => ({ from: thisFinancialYearStart(new Date()), to: new Date() }),
  },
  { key: "custom", label: "Custom range" },
]

/** `YYYY-MM-DD`, what the API's `spentOnFrom`/`spentOnTo` expect. */
export function toApiDate(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

/** Reverses `toApiDate` into a local `Date` at midnight, for the calendar. */
export function fromApiDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/**
 * Which preset (if any) the current `from`/`to` API date strings match
 * exactly. Recomputed against a fresh "today" each call rather than
 * cached, so a session left open overnight still matches correctly.
 */
export function matchingPreset(
  from: string | undefined,
  to: string | undefined,
): DateRangePresetKey | undefined {
  if (!from && !to) return undefined
  for (const preset of DATE_RANGE_PRESETS) {
    if (!preset.range) continue
    const { from: pFrom, to: pTo } = preset.range()
    if (toApiDate(pFrom) === from && toApiDate(pTo) === to) return preset.key
  }
  return undefined
}

/** `addDays` re-exported so callers building a two-month default don't
 * need a second import of date-fns for one call. */
export { addDays }
