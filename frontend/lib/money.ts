/**
 * Rupee text to bigint paise, and back, for form fields.
 *
 * `lib/format.ts` turns paise into something a person reads. This is
 * the other direction — what a person typed into what is stored — and
 * it is the more dangerous one, because the obvious implementation is
 * `Math.round(parseFloat(text) * 100)` and that is wrong.
 *
 * `parseFloat("340.55") * 100` is 34054.999999999996. Rounding hides it
 * at two decimals and stops hiding it the moment anyone multiplies by a
 * tree count. **No float ever touches an amount here.** The string is
 * split on its decimal point and the two halves are handled as digits.
 */

/** What a field holds before anyone types in it, and after it is cleared. */
export const EMPTY_AMOUNT = ''

export type ParsedAmount =
  | { ok: true; paise: string | null }
  | { ok: false; error: string }

/**
 * Accepts what people actually type: `340`, `340.5`, `340.50`,
 * `1,234.00`, `₹1,234`, and whitespace around any of it.
 *
 * An empty string parses to `null`, which is **not zero** — it is the
 * absence AGENTS.md 31.2 keeps distinct from a deliberate `0`. The
 * caller decides what absence means; here it is simply not a number.
 */
export function parseRupeesToPaise(input: string): ParsedAmount {
  const text = input.trim().replace(/^₹/, '').replace(/,/g, '').trim()

  if (text === '') return { ok: true, paise: null }

  if (!/^\d*(\.\d*)?$/.test(text) || text === '.') {
    return { ok: false, error: 'Enter an amount in rupees, like 340.00' }
  }

  const [whole = '', fraction = ''] = text.split('.')

  if (fraction.length > 2) {
    return { ok: false, error: 'An amount has at most two decimal places' }
  }

  const rupees = whole === '' ? '0' : whole
  const paise = fraction.padEnd(2, '0')

  // BigInt, not multiplication, so a large amount cannot lose precision.
  return { ok: true, paise: (BigInt(rupees) * 100n + BigInt(paise)).toString() }
}

/**
 * Paise to the text a field shows for editing.
 *
 * Deliberately NOT `formatAmount` from lib/format.ts: that inserts
 * Indian digit grouping, which is right for reading and wrong for a
 * field somebody is about to edit — the commas move under the cursor as
 * they type. This is the same number without the grouping.
 */
export function paiseToRupeeInput(paise: string | null | undefined): string {
  if (paise === null || paise === undefined || paise === '') return EMPTY_AMOUNT

  const value = BigInt(paise)
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const whole = (magnitude / 100n).toString()
  const fraction = (magnitude % 100n).toString().padStart(2, '0')

  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** Sums paise strings without ever making one a number. */
export function sumPaise(values: (string | null | undefined)[]): string | null {
  let total = 0n
  let sawOne = false
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    total += BigInt(value)
    sawOne = true
  }
  // A total over nothing is not zero (AGENTS.md 31.3). The caller
  // renders null as "Budget not set" rather than as 0.00.
  return sawOne ? total.toString() : null
}

/** Multiplies a per-tree amount by a tree count. Both stay exact. */
export function multiplyPaise(paise: string | null, count: number): string | null {
  if (paise === null) return null
  return (BigInt(paise) * BigInt(Math.round(count))).toString()
}
