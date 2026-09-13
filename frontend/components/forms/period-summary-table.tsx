"use client"

import * as React from "react"

import { api, query, type PeriodSummary } from "@/lib/api"
import { formatAmount } from "@/lib/format"
import { periodLabel } from "@/lib/periods"
import { errorMessage } from "@/components/shell/session"
import { EmptyState } from "@/components/ui/empty-state"
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
import {
  BudgetFigure,
  VarianceFigure,
  VariancePercentFigure,
} from "@/components/forms/variance-figures"

/**
 * Report 1: year-wise budget against variance.
 *
 * Five rows, one per period, and a total. Scoped to a project by
 * default and narrowed by a site — the client's "total year wise"
 * reads as a rollup, so the project is the default view.
 *
 * **THE FIVE PERIODS ARE A SPINE**, not whatever the data carries. A
 * project with nothing budgeted in Year 3 still shows a Year 3 row
 * reading "Budget not set" — the same reason the head grain is driven
 * from the cost-head master. The API supplies the spine; this file
 * relies on it and does not pad the list.
 *
 * The cells are the same three components both other variance screens
 * use, so the zero-budget ruling cannot drift between them.
 */
export function PeriodSummaryTable({
  projectId,
  siteId,
}: {
  projectId?: string
  siteId?: string
}) {
  const [attempt, setAttempt] = React.useState(0)
  const [answer, setAnswer] = React.useState<{
    result: PeriodSummary | null
    failure: string | null
    request: string
  }>({ result: null, failure: null, request: "" })

  const request = `${projectId ?? ""}|${siteId ?? ""}|${attempt}`

  React.useEffect(() => {
    let cancelled = false
    api
      .get<PeriodSummary>(
        `/reports/variance/periods-summary${query({ projectId, siteId })}`,
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
  }, [projectId, siteId, request])

  const settled = answer.request === request
  const result = settled ? answer.result : null
  const failure = settled ? answer.failure : null

  if (failure !== null) {
    return (
      <EmptyState
        variant="failed"
        heading="The report could not be loaded"
        onAction={() => setAttempt((a) => a + 1)}
      >
        {failure}
      </EmptyState>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
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
          ? /* Section 14: the shape of what is coming. Five is the
               known row count — the periods are fixed. */
            Array.from({ length: 5 }, (_, row) => (
              <TableRow key={`skeleton-${row}`}>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                {Array.from({ length: 4 }, (_, cell) => (
                  <TableCell key={cell} numeric>
                    <Skeleton className="ml-auto h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : result.rows.map((row) => (
              <TableRow key={row.period ?? "x"}>
                <TableCell>{periodLabel(row.period)}</TableCell>
                <TableCell numeric>
                  <BudgetFigure paise={row.budgetPaise} />
                </TableCell>
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
      {/* Section 3 rule 5. Summed in SQL with the period axis
          collapsed, not added up from the rows above it. */}
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell numeric>
            {result === null ? (
              <Skeleton className="ml-auto h-4 w-24" />
            ) : (
              <BudgetFigure paise={result.total.budgetPaise} />
            )}
          </TableCell>
          <TableCell numeric>
            {result === null ? (
              <Skeleton className="ml-auto h-4 w-24" />
            ) : (
              formatAmount(result.total.actualPaise)
            )}
          </TableCell>
          <TableCell numeric>
            {result === null ? (
              <Skeleton className="ml-auto h-4 w-24" />
            ) : (
              <VarianceFigure paise={result.total.variancePaise} />
            )}
          </TableCell>
          <TableCell numeric className="hidden md:table-cell">
            {result === null ? (
              <Skeleton className="ml-auto h-4 w-12" />
            ) : (
              <VariancePercentFigure pct={result.total.variancePct} />
            )}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
