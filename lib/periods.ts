/**
 * The five budget periods, named once.
 *
 * The plan (section 3) stores a period as a smallint 0 to 4 rather than
 * an enum, on the grounds that "the labels live in one place in the
 * client". This is that place.
 */
export const PERIODS = ['Initial', 'Year 1', 'Year 2', 'Year 3', 'Year 4'] as const

export type Period = 0 | 1 | 2 | 3 | 4

export const PERIOD_VALUES: Period[] = [0, 1, 2, 3, 4]

export function periodLabel(period: number | null | undefined): string {
  if (period === null || period === undefined) return '—'
  return PERIODS[period] ?? `Period ${period}`
}

/**
 * What the expense form pre-fills the period with (question 6).
 *
 * Initial is everything up to the plantation start date; Year 1 is the
 * twelve months after it, and so on. Past Year 4 it stops at Year 4
 * rather than inventing a sixth period — the budget has five, and an
 * expense outside them still has to land somewhere a person can see and
 * correct.
 *
 * This is a SUGGESTION ONLY. The value the user confirms is stored on
 * the row, and nothing re-derives it later: a corrected start date must
 * not silently re-bucket expenses somebody has already read in a report.
 */
export function derivePeriod(spentOn: string, plantationStartDate: string): Period {
  const spent = new Date(`${spentOn}T00:00:00Z`)
  const start = new Date(`${plantationStartDate}T00:00:00Z`)

  if (Number.isNaN(spent.getTime()) || Number.isNaN(start.getTime())) return 0
  if (spent < start) return 0

  // Whole years elapsed, counted on the calendar rather than in
  // milliseconds, so a leap day cannot shift a boundary.
  let years = spent.getUTCFullYear() - start.getUTCFullYear()
  const monthDelta = spent.getUTCMonth() - start.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && spent.getUTCDate() < start.getUTCDate())) {
    years -= 1
  }

  const period = years + 1
  if (period < 1) return 0
  return (period > 4 ? 4 : period) as Period
}
