"use client"

import * as React from "react"
import Link from "next/link"
import { PencilIcon } from "lucide-react"

import { api, query, type SiteVariance } from "@/lib/api"
import { formatAmount, formatNumber } from "@/lib/format"
import { PERIODS, PERIOD_VALUES } from "@/lib/periods"
import { errorMessage } from "@/components/shell/session"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import {
  BudgetFigure,
  VarianceFigure,
  VariancePercentFigure,
} from "@/components/forms/variance-figures"

/**
 * Screen 2 of the variance report: the site detail page's Variance tab
 * (section 11.2 zone 4).
 *
 * ONE ROW PER COST HEAD, and the rows are driven from `cost_heads`
 * with the view joined onto it — never from the query result. The view
 * only emits a cell that exists, so a head with neither a budget row
 * nor an expense is simply absent from it; driving the table off that
 * would give two sites different row counts on the same tab and would
 * make an unbudgeted head vanish instead of reading "Budget not set".
 * All nineteen heads appear, always. The API does that join; this file
 * relies on it and does not re-create it.
 *
 * FIVE COLUMNS, whatever the period selector says. The selector
 * changes which period the five columns are showing, not how many
 * columns there are — a budget / actual / variance triple per period
 * would be fifteen columns and would force the horizontal scroll that
 * section 10 calls a last resort (question 8).
 *
 * The total row is the site's own total read from the same view at the
 * same period, not the sum of the rows above it. If the two ever
 * disagree the view is wrong, and that should be visible rather than
 * papered over by adding the column up here.
 */

/** "All periods" as a Select value. Empty string is the absent period. */
const ALL_PERIODS = ""

export function SiteVarianceTab({
  siteId,
  plannedTrees,
  onRowCount,
}: {
  siteId: string
  /** For the basis line. Budgets recompute from it live — no snapshot. */
  plannedTrees: number | null
  /**
   * How many rows this tab has, reported up so the tab's own count
   * badge can show it.
   *
   * Sibling tabs are styled and behave identically — if Expenses
   * carries a count, Variance carries one too — and the count has to
   * be the real row count rather than a hardcoded nineteen, because
   * the head list is master data an admin can edit in Settings.
   */
  onRowCount?: (count: number) => void
}) {
  const [period, setPeriod] = React.useState<string>(ALL_PERIODS)
  const [attempt, setAttempt] = React.useState(0)
  const [answer, setAnswer] = React.useState<{
    result: SiteVariance | null
    failure: string | null
    request: string
  }>({ result: null, failure: null, request: "" })

  const request = `${siteId}|${period}|${attempt}`

  React.useEffect(() => {
    let cancelled = false
    api
      .get<SiteVariance>(
        `/reports/variance/sites/${siteId}${query({ period: period || undefined })}`,
      )
      .then((result) => {
        if (!cancelled) setAnswer({ result, failure: null, request })
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setAnswer({ result: null, failure: errorMessage(caught), request })
        }
      })
    return () => {
      cancelled = true
    }
  }, [siteId, period, request])

  // Derived in render, never resynced in an effect: setting a loading
  // flag at the top of the effect renders the stale table once and then
  // immediately renders again.
  const settled = answer.request === request
  const result = settled ? answer.result : null
  const failure = settled ? answer.failure : null

  const total = result?.total ?? null
  const rows = result?.rows ?? []

  /**
   * Genuinely nothing: no budget anywhere and nothing spent.
   *
   * Tested on the MONEY, not on whether a row came back. The view
   * LEFT JOINs sites, so the 'site' grain always emits a row for a
   * site that exists — a site with no budget at all still has a total
   * row, holding a null budget. Only the period grains are absent
   * when there is nothing, so `total === null` alone showed this note
   * for "Initial" and hid it for "All periods" on the same empty site.
   */
  const nothingAtAll =
    total === null ||
    (total.budgetPaise === null && BigInt(total.actualPaise) === 0n)

  const rowCount = result?.rows.length
  React.useEffect(() => {
    if (rowCount !== undefined) onRowCount?.(rowCount)
  }, [rowCount, onRowCount])

  /**
   * Section 3: every budget figure states its basis, and with five
   * periods the basis has to name the period as well.
   *
   * Stated once for the table rather than once per cell. Nineteen rows
   * of "₹40.00 per tree × 3,000 trees, Year 1" would bury the numbers
   * the table exists to show, and the basis is the same sentence for
   * every one of them: the same tree count, the same period.
   */
  const basis =
    plannedTrees === null
      ? null
      : `Budgets are the per-tree amount × ${formatNumber(plannedTrees)} trees, ${
          period === ALL_PERIODS
            ? "summed across all five periods"
            : PERIODS[Number(period)]
        }. Tree counts are live — change one and these move.`

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Variance by cost head</CardTitle>
          {basis ? (
            <p className="mt-1 text-meta text-text-muted">{basis}</p>
          ) : null}
        </div>
        {/*
          Section 27.3 and the "place an action next to what it
          controls" rule: the period selector sits on the header of the
          table it changes, not in a detached corner. It belongs to
          THIS tab and nowhere else — the Reports landing list is
          all-time with no filter of any kind (question 8).

          Six options exactly, which is the section 16.3 line: a plain
          Select, no search box.
        */}
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor="variance-period">Period</Label>
          <Select
            value={period}
            onValueChange={(value: string | null) => {
              if (value === null) return
              setPeriod(value)
            }}
          >
            <SelectTrigger id="variance-period" className="w-field-min">
              {/* Base UI renders the raw value unless given a
                  formatter, and these values are "" and 0 to 4. */}
              <SelectValue>
                {(value: string | null) =>
                  value === null || value === ALL_PERIODS
                    ? "All periods"
                    : PERIODS[Number(value)]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PERIODS}>All periods</SelectItem>
              {PERIOD_VALUES.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {PERIODS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {failure !== null ? (
          /* Section 13's third state. A failed request must not be
             indistinguishable from a slow one. */
          <EmptyState
            variant="failed"
            heading="The variance could not be loaded"
            onAction={() => setAttempt((a) => a + 1)}
          >
            {failure}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cost head</TableHead>
                <TableHead numeric>Budget</TableHead>
                <TableHead numeric>Actual</TableHead>
                <TableHead numeric>Variance</TableHead>
                <TableHead numeric className="hidden md:table-cell">
                  Variance %
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result === null
                ? /* Section 14: the shape of what is coming, so the
                     layout arrives first and nothing jumps. Nineteen
                     heads is the known row count. */
                  Array.from({ length: 19 }, (_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton className="h-4 w-3/4" />
                      </TableCell>
                      <TableCell numeric>
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell numeric>
                        <Skeleton className="ml-auto h-4 w-20" />
                      </TableCell>
                      <TableCell numeric>
                        <Skeleton className="ml-auto h-4 w-24" />
                      </TableCell>
                      <TableCell numeric className="hidden md:table-cell">
                        <Skeleton className="ml-auto h-4 w-12" />
                      </TableCell>
                    </TableRow>
                  ))
                : rows.map((row) => (
                    <TableRow key={row.costHeadId ?? row.siteId}>
                      <TableCell>
                        <Truncate>{row.costHeadName ?? ""}</Truncate>
                      </TableCell>
                      <TableCell numeric>
                        <BudgetFigure paise={row.budgetPaise} />
                      </TableCell>
                      {/* A budgeted head with no expenses has spent
                          nothing. That is 0.00, not a dash. */}
                      <TableCell numeric>{formatAmount(row.actualPaise)}</TableCell>
                      <TableCell numeric>
                        <VarianceFigure paise={row.variancePaise} />
                      </TableCell>
                      <TableCell numeric className="hidden md:table-cell">
                        <VariancePercentFigure pct={row.variancePct} />
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
            {/* Section 3 rule 5: a total row carries body-strong
                weight, which TableFooter supplies. */}
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell numeric>
                  {result === null ? (
                    <Skeleton className="ml-auto h-4 w-20" />
                  ) : (
                    <BudgetFigure paise={total?.budgetPaise ?? null} />
                  )}
                </TableCell>
                <TableCell numeric>
                  {result === null ? (
                    <Skeleton className="ml-auto h-4 w-20" />
                  ) : (
                    /* Null total means the site has neither a budget
                       nor an expense in this period. Nothing spent is
                       0.00; nothing budgeted is "Budget not set". */
                    formatAmount(total?.actualPaise ?? "0")
                  )}
                </TableCell>
                <TableCell numeric>
                  {result === null ? (
                    <Skeleton className="ml-auto h-4 w-24" />
                  ) : (
                    <VarianceFigure paise={total?.variancePaise ?? null} />
                  )}
                </TableCell>
                <TableCell numeric className="hidden md:table-cell">
                  {result === null ? (
                    <Skeleton className="ml-auto h-4 w-12" />
                  ) : (
                    <VariancePercentFigure pct={total?.variancePct ?? null} />
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>

      {/*
        Not a section 13 empty state, and deliberately so.

        The tab always has nineteen rows, because the rows come from
        the cost head master rather than from the data. "Nothing yet"
        cannot arise: there is no such thing as an empty variance
        table. What CAN be empty is the money in it, and the cells
        already say that in the words the rest of the product uses —
        "Budget not set" against 0.00.
      */}
      {result !== null && nothingAtAll ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-light px-4 py-3">
          <p className="min-w-0 text-label text-text-secondary">
            Nothing is budgeted and nothing has been spent
            {period === ALL_PERIODS
              ? " on this site."
              : ` in ${PERIODS[Number(period)]}.`}
          </p>
          {/* No dead ends: the state that has nothing to show still
              offers the way to change it. */}
          <Button
            variant="secondary"
            size="sm"
            render={<Link href={`/sites/${siteId}/budget`} />}
          >
            <PencilIcon />
            Set the budget
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
