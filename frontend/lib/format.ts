import { format, isValid } from "date-fns"

/**
 * Section 18. One format across the whole software.
 *
 * | Type          | Format                | Example              |
 * |---------------|-----------------------|----------------------|
 * | Date          | DD/MM/YY              | 21/03/26             |
 * | Date and time | DD/MM/YY, h:mm A      | 21/03/26, 3:45 PM    |
 * | Number        | Indian grouping       | 12,45,680            |
 * | Amount        | Two decimals always   | 4,200.00             |
 * | Currency      | Symbol before, no gap | ₹4,200.00            |
 *
 * A number, amount or date that reaches a screen without passing
 * through this file is a bug. Nothing formats inline.
 *
 * Money is stored as bigint paise everywhere - never a float, never a
 * decimal type, never rupees. These functions are the only place it
 * turns into something a person reads, and they do the arithmetic in
 * bigint so no amount is ever rounded on the way to the screen.
 */

/**
 * Section 18: day-first numeric, two-digit year. Overruled 23 Sep 2026 by
 * the client — day-first numeric is the form everyone here already reads
 * and writes. Widening `yy` to `yyyy` is a one-line change if that ever
 * bites.
 */
export const DATE_FORMAT = "dd/MM/yy"
export const DATE_TIME_FORMAT = "dd/MM/yy, h:mm a"

/** What renders in place of a value that is genuinely absent. */
export const EMPTY_VALUE = "—"

export const RUPEE = "₹"

type DateInput = Date | string | number | null | undefined

/**
 * What an amount can arrive as.
 *
 * **A string is the canonical form**, because that is how bigint paise
 * cross the wire: `pg` hands `bigint` back as a string and the API
 * passes it through untouched, so an amount reaches a screen having
 * never been a JS `number`. `bigint` and `number` are accepted for
 * amounts built locally.
 */
type AmountInput = string | number | bigint | null | undefined

/** Parses without ever going through a float. Returns null if unreadable. */
function toBigInt(value: AmountInput): bigint | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "bigint") return value
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.round(value)) : null
  }
  const text = value.trim()
  return /^-?\d+$/.test(text) ? BigInt(text) : null
}

function toDate(value: DateInput): Date | undefined {
  if (value === null || value === undefined) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return isValid(date) ? date : undefined
}

/**
 * Indian digit grouping: the last three digits, then pairs.
 * 1245680 -> 12,45,680. Done on the digit string rather than through
 * Intl so a bigint amount can use exactly the same code path as a
 * plain number and the two can never disagree.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits
  const head = digits.slice(0, -3)
  const tail = digits.slice(-3)
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`
}

function splitSign(value: bigint): { negative: boolean; magnitude: bigint } {
  return value < 0n
    ? { negative: true, magnitude: -value }
    : { negative: false, magnitude: value }
}

/** 12,45,680. Whole numbers only - tree counts, record counts, quantities. */
export function formatNumber(value: AmountInput): string {
  const rounded = toBigInt(value)
  if (rounded === null) return EMPTY_VALUE

  const { negative, magnitude } = splitSign(rounded)
  return `${negative ? "-" : ""}${groupIndian(magnitude.toString())}`
}

/**
 * 4,200.00 from 420000 paise. Two decimals always, including .00 -
 * a column of amounts only lines up if every one of them has them.
 */
export function formatAmount(paise: AmountInput): string {
  const exact = toBigInt(paise)
  if (exact === null) return EMPTY_VALUE

  const { negative, magnitude } = splitSign(exact)
  const rupees = groupIndian((magnitude / 100n).toString())
  const fraction = (magnitude % 100n).toString().padStart(2, "0")
  return `${negative ? "-" : ""}${rupees}.${fraction}`
}

/**
 * ₹4,200.00 from 420000 paise. The symbol sits before the number with
 * no gap. A negative amount reads -₹4,200.00: the sign leads, because
 * ₹-4,200.00 is read as a typo.
 */
export function formatCurrency(paise: AmountInput): string {
  const amount = formatAmount(paise)
  if (amount === EMPTY_VALUE) return EMPTY_VALUE
  return amount.startsWith("-")
    ? `-${RUPEE}${amount.slice(1)}`
    : `${RUPEE}${amount}`
}

/**
 * One decimal: 12.4%.
 *
 * Rounded half-up on the DECIMAL value, not with toFixed. 12.35 is held
 * in binary as 12.34999999999999964..., so `(12.35).toFixed(1)` is
 * "12.3" - defensible arithmetic and an indefensible answer to hand
 * somebody checking a variance percentage against a calculator. Going
 * through the exponent form rounds the number that was written, not the
 * number that could be stored.
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EMPTY_VALUE
  }
  // Rounded on the magnitude and re-signed, so -4.05 reads -4.1 in the
  // same way 4.05 reads 4.1. Math.round breaks ties towards positive
  // infinity, which would otherwise round an overspend and an underspend
  // of the same size in opposite directions.
  const magnitude = Number(`${Math.round(Number(`${Math.abs(value)}e1`))}e-1`)
  const rounded = magnitude === 0 ? 0 : (value < 0 ? -magnitude : magnitude)
  return `${rounded.toFixed(1)}%`
}

/** 21/03/26. */
export function formatDate(value: DateInput): string {
  const date = toDate(value)
  return date ? format(date, DATE_FORMAT) : EMPTY_VALUE
}

/** 21/03/26, 3:45 PM. */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value)
  return date ? format(date, DATE_TIME_FORMAT) : EMPTY_VALUE
}

/**
 * `Expenses-2026-09-22.pdf` / `Expenses-2026-09-22.xlsx` — the one place
 * an export's downloaded filename is built, shared by `lib/pdf-export.tsx`
 * and `lib/excel-export.ts` (AGENTS.md section 1 rule 4: never build the
 * same thing twice). ISO date, not `DATE_FORMAT` — a filename cannot
 * carry a space, and Windows additionally rejects `\ / : * ? " < > |`.
 */
export function buildExportFilename(title: string, extension: string): string {
  const now = new Date()
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`
  const safeTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
  return `${safeTitle}-${isoDate}.${extension}`
}
