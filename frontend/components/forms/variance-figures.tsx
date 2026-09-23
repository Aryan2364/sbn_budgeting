import { Badge } from "@/components/ui/badge"
import { Truncate } from "@/components/ui/truncate"
import { EMPTY_VALUE, formatAmount, formatPercent } from "@/lib/format"

/**
 * The three cells that carry a variance figure, written once and used
 * by both variance screens (section 4 rules 2 and 4).
 *
 * They exist as one file because the zero-budget ruling is easy to get
 * subtly different in two places and impossible to notice afterwards:
 * a `0.00` where the answer is "nobody has decided yet" reads as a
 * decision, and it reads as one for ever.
 *
 * The ruling, from the plan's section 3:
 *
 *   - NO BUDGET ROWS AT ALL      -> "Budget not set", text-secondary.
 *   - A DELIBERATE ZERO          -> "0.00", text-primary.
 *     These two must look different.
 *   - Variance and Variance % in the first case -> an em-dash.
 *   - No badge and no danger colour in the first case. Missing data is
 *     not overspend.
 *
 * `null` arrives from SQL for the first case and `"0"` for the second,
 * because the view leaves budget_paise NULL where no site_budgets row
 * exists and SUM ignores NULLs all the way up the roll-up. Nothing
 * here has to reconstruct that distinction — it only has to not lose
 * it.
 */

/** Over, under, or no budget to be either. */
export type VarianceDirection = "over" | "under" | null

export function varianceDirection(paise: string | null): VarianceDirection {
  if (paise === null) return null
  // budget - actual, so a negative variance is spend above budget.
  return BigInt(paise) < 0n ? "over" : "under"
}

/**
 * Section 11.1: numbers right-aligned. The wording is the point —
 * "Budget not set" is a sentence about the data, not a number, so it
 * takes text-secondary and never tabular figures.
 */
export function BudgetFigure({ paise }: { paise: string | null }) {
  if (paise === null) {
    return <span className="text-text-secondary">Budget not set</span>
  }
  return <Truncate>{formatAmount(paise)}</Truncate>
}

/**
 * The amount, with the direction as a WORD beside it (section 7.2
 * rule 1 and the plan's locked ruling). Never colour alone: the danger
 * badge appears only where the row is genuinely over budget, so a site
 * at 40 percent spend is not styled as a problem.
 *
 * The badge sits to the LEFT of the number inside a right-aligned
 * cell, so the digits stay flush with the column edge and can still be
 * compared down the column without reading them.
 */
export function VarianceFigure({ paise }: { paise: string | null }) {
  const direction = varianceDirection(paise)

  if (direction === null || paise === null) return <>{EMPTY_VALUE}</>

  return (
    <span className="inline-flex min-w-0 items-center justify-end gap-2">
      <Badge className="shrink-0" variant={direction === "over" ? "danger" : "neutral"}>
        {direction}
      </Badge>
      <Truncate className="tabular-nums">{formatAmount(paise)}</Truncate>
    </span>
  )
}

/**
 * Variance as a percentage of budget, to one decimal (plan section 3).
 *
 * The API sends it as a string so it never rounds in transit; it
 * becomes a number here only to be formatted, never to be added to
 * anything. It is NULL both where there is no budget and where the
 * budget is an explicit zero — "infinitely over" is not a number — and
 * both render as an em-dash.
 */
export function VariancePercentFigure({ pct }: { pct: string | null }) {
  if (pct === null) return <>{EMPTY_VALUE}</>
  return <Truncate>{formatPercent(Number(pct))}</Truncate>
}
