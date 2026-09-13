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
 * WHICH DATE A PERIOD IS MEASURED FROM. Decided in one place.
 *
 * **Client instruction, 7 Sep 2026, not an inference:** years are
 * calculated from the plantation COMPLETE date, and the client offered
 * the start date as her own fallback where that provision does not
 * exist.
 *
 * These are two different dates and the difference is not pedantic.
 * Planting takes time, so Year 1 begins at a different point depending
 * on which one anchors it — an expense a fortnight after planting
 * finishes is Initial under one anchor and Year 1 under the other.
 *
 * `plantationCompleteDate` is nullable because a site still being
 * planted has not got one, which is exactly the case the fallback
 * covers.
 */
export type PeriodAnchor = {
  date: string
  /** Which field it came from, so a screen can say so out loud. */
  source: 'complete' | 'start'
}

export function periodAnchor(site: {
  plantationStartDate: string
  plantationCompleteDate: string | null
}): PeriodAnchor {
  return site.plantationCompleteDate
    ? { date: site.plantationCompleteDate, source: 'complete' }
    : { date: site.plantationStartDate, source: 'start' }
}

/** The words a screen shows for an anchor. Never a bare date alone. */
export function anchorLabel(source: PeriodAnchor['source']): string {
  return source === 'complete'
    ? 'plantation complete date'
    : 'plantation start date'
}

/**
 * What the expense form pre-fills the period with (question 6).
 *
 * Initial is everything up to the anchor date; Year 1 is the twelve
 * months after it, and so on. Past Year 4 it stops at Year 4
 * rather than inventing a sixth period — the budget has five, and an
 * expense outside them still has to land somewhere a person can see and
 * correct.
 *
 * This is a SUGGESTION ONLY. The value the user confirms is stored on
 * the row, and nothing re-derives it later: a corrected anchor must not
 * silently re-bucket expenses somebody has already read in a report.
 *
 * **That decision is what made adding the complete-date anchor safe.**
 * Existing expenses keep the period they were stored with; only new
 * ones derive from the new anchor, and the user can still override.
 */
export function derivePeriod(spentOn: string, anchorDate: string): Period {
  const spent = new Date(`${spentOn}T00:00:00Z`)
  const start = new Date(`${anchorDate}T00:00:00Z`)

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
