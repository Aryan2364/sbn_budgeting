"use client"

import * as React from "react"

import { api, query, type HeadPeriodReport, type VariancePeriodRow } from "@/lib/api"
import { formatAmount, formatPercent, EMPTY_VALUE } from "@/lib/format"
import { PERIODS } from "@/lib/periods"
import { errorMessage } from "@/components/shell/session"
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
import { VarianceFigure } from "@/components/forms/variance-figures"

/**
 * Cost head down the side, budget period across the top.
 *
 * **WRITTEN ONCE AND USED TWICE** (section 4 rules 2 and 4): as
 * Report 2 on the Reports section, scoped to a project, and as the
 * site detail page's Variance tab, scoped to one site. They are the
 * same table asking the same question at two scopes, so they are the
 * same component. There is no second version.
 *
 * ONE MEASURE AT A TIME, chosen by the selector. Five period columns
 * and a Total, not a budget / actual / variance triple per period —
 * that is fifteen columns and question 8 ruled it out by name. All
 * four measures arrive together in one response, so changing the
 * selector redraws rather than refetching.
 *
 * **THE TOTAL COLUMN IS WHY THERE IS NO "ALL PERIODS" OPTION.** The
 * Variance tab this replaces had a period selector defaulting to
 * "All periods"; here the periods ARE the columns, so that default has
 * no equivalent — the sixth column is all-time, visible at all times
 * without changing a selection.
 *
 * ROWS COME FROM THE COST-HEAD SPINE, never from the query result. All
 * nineteen heads appear whether or not they carry a budget or an
 * expense. The API does that join; this file relies on it.
 *
 * COLUMN PRIORITY (section 10 rule 4): **every column is essential and
 * none may be dropped.** That is the declaration, not an omission.
 * Each of the five is a period carrying real money, no period is
 * optional, and hiding one hides a figure the Total still includes —
 * the same argument section 31.4 makes for the data entry grid. A
 * screen where a column CAN be dropped must drop it instead of
 * scrolling.
 *
 * Because nothing can be dropped, the table scrolls sideways under
 * section 10 rule 2, and section 34.3 freezes the first column so the
 * numbers never lose their label. Measured at 1024 and 768: 959px of
 * table against 901 and 709 of container.
 */

export type Measure = "budget" | "actual" | "variance" | "variancePct"

export const MEASURES: { value: Measure; label: string }[] = [
  { value: "budget", label: "Budget" },
  { value: "actual", label: "Actual" },
  { value: "variance", label: "Variance" },
  { value: "variancePct", label: "Variance %" },
]

export function measureLabel(measure: Measure): string {
  return MEASURES.find((m) => m.value === measure)?.label ?? "Budget"
}

/**
 * One cell, for whichever measure is showing.
 *
 * The zero-budget ruling travels through every measure, not just the
 * budget one: where no budget rows exist the budget reads "Budget not
 * set" and the variance and the percentage read an em-dash. The actual
 * is the exception and always a number — a head with no budget and no
 * expenses has still spent nothing, which is 0.00.
 */
function Figure({ cell, measure }: { cell: VariancePeriodRow; measure: Measure }) {
  switch (measure) {
    case "budget":
      return cell.budgetPaise === null ? (
        <span className="text-text-secondary">Budget not set</span>
      ) : (
        <>{formatAmount(cell.budgetPaise)}</>
      )
    case "actual":
      return <>{formatAmount(cell.actualPaise)}</>
    case "variance":
      return <VarianceFigure paise={cell.variancePaise} />
    case "variancePct":
      return (
        <>
          {cell.variancePct === null
            ? EMPTY_VALUE
            : formatPercent(Number(cell.variancePct))}
        </>
      )
  }
}

export function HeadPeriodGrid({
  projectId,
  siteId,
  onRowCount,
  measure: controlledMeasure,
  onMeasureChange,
}: {
  /** Scope. Omit both for every site; the screens always pass one. */
  projectId?: string
  siteId?: string
  /** Reported up so a tab's count badge can show the real row count. */
  onRowCount?: (count: number) => void
  /**
   * Controlled-with-internal-default (section 4): omit both this and
   * `onMeasureChange` and the grid owns its own "Showing" selector
   * exactly as before. Pass both and a caller — an exporting page that
   * needs to know which measure is on screen — can read and drive the
   * same value the grid renders, so the grid and the export can never
   * disagree about what "Showing" currently means.
   */
  measure?: Measure
  onMeasureChange?: (measure: Measure) => void
}) {
  const [internalMeasure, setInternalMeasure] = React.useState<Measure>("budget")
  const measure = controlledMeasure ?? internalMeasure
  const setMeasure = onMeasureChange ?? setInternalMeasure
  const [attempt, setAttempt] = React.useState(0)
  const [answer, setAnswer] = React.useState<{
    result: HeadPeriodReport | null
    failure: string | null
    request: string
  }>({ result: null, failure: null, request: "" })

  const request = `${projectId ?? ""}|${siteId ?? ""}|${attempt}`

  React.useEffect(() => {
    let cancelled = false
    api
      .get<HeadPeriodReport>(
        `/reports/variance/head-periods${query({ projectId, siteId })}`,
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

  // Derived in render. Setting a loading flag at the top of the effect
  // renders the stale table once and then immediately renders again.
  const settled = answer.request === request
  const result = settled ? answer.result : null
  const failure = settled ? answer.failure : null

  const rowCount = result?.rows.length
  React.useEffect(() => {
    if (rowCount !== undefined) onRowCount?.(rowCount)
  }, [rowCount, onRowCount])

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
    <>
      {/*
        The measure selector sits with the table it changes, not in a
        detached corner. Four options, so a plain Select — section
        16.3's search box starts past six.
      */}
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-3">
        <Label htmlFor="measure">Showing</Label>
        <Select
          value={measure}
          onValueChange={(value: string | null) => {
            if (value !== null) setMeasure(value as Measure)
          }}
        >
          <SelectTrigger id="measure" className="w-field-min">
            <SelectValue>
              {(value: string | null) => measureLabel((value as Measure) ?? "budget")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MEASURES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {/*
              Section 34.3: the first column freezes so scrolling
              sideways never leaves the numbers unlabelled. z-30 because
              this cell is the intersection of two sticky axes — the
              header row and the frozen column — and has to sit above
              both.
            */}
            <TableHead className="sticky left-0 z-30 w-grid-head min-w-grid-head border-r border-border-light bg-surface-sunken">
              Cost head
            </TableHead>
            {PERIODS.map((label) => (
              <TableHead key={label} numeric>
                {label}
              </TableHead>
            ))}
            {/* All-time, always visible. This is what replaces the old
                tab's "All periods" default. */}
            <TableHead numeric>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result === null
            ? /* Section 14: the shape of what is coming. Nineteen heads
                 is the known row count. */
              Array.from({ length: 19 }, (_, row) => (
                <TableRow key={`skeleton-${row}`}>
                  <TableCell className="sticky left-0 z-10 w-grid-head min-w-grid-head border-r border-border-light bg-surface">
                    <Skeleton className="h-4 w-3/4" />
                  </TableCell>
                  {Array.from({ length: 6 }, (_, cell) => (
                    <TableCell key={cell} numeric>
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : result.rows.map((row) => (
                <TableRow key={row.costHeadId}>
                  <TableCell className="sticky left-0 z-10 w-grid-head min-w-grid-head border-r border-border-light bg-surface">
                    <Truncate>{row.costHeadName}</Truncate>
                  </TableCell>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.period ?? "x"} numeric>
                      <Figure cell={cell} measure={measure} />
                    </TableCell>
                  ))}
                  <TableCell numeric>
                    <Figure cell={row.total} measure={measure} />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
        {/* Section 3 rule 5: a total row carries body-strong weight,
            which TableFooter supplies. Every figure in it was summed in
            SQL beside the cells above, not added up here. */}
        <TableFooter sticky>
          <TableRow>
            <TableCell className="sticky left-0 z-30 w-grid-head min-w-grid-head border-r border-border-light bg-surface-sunken">
              Total
            </TableCell>
            {result === null
              ? Array.from({ length: 6 }, (_, cell) => (
                  <TableCell key={cell} numeric>
                    <Skeleton className="ml-auto h-4 w-20" />
                  </TableCell>
                ))
              : [
                  ...result.periodTotals.map((cell) => (
                    <TableCell key={cell.period ?? "x"} numeric>
                      <Figure cell={cell} measure={measure} />
                    </TableCell>
                  )),
                  <TableCell key="grand" numeric>
                    <Figure cell={result.total} measure={measure} />
                  </TableCell>,
                ]}
          </TableRow>
        </TableFooter>
      </Table>
    </>
  )
}
