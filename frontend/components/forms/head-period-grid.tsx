"use client"

import * as React from "react"

import {
  api,
  query,
  type HeadPeriodReport,
  type HeadPeriodRow,
  type VariancePeriodRow,
} from "@/lib/api"
import { formatAmount } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ExportColumn, PdfTotalRow } from "@/lib/pdf-export"
import { errorMessage } from "@/components/shell/session"
import { EmptyState } from "@/components/ui/empty-state"
import { useBandLevel } from "@/components/ui/header-band"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import {
  BudgetFigure,
  ConsumedPercentFigure,
  VarianceFigure,
  VariancePercentFigure,
  excelAmountValue,
  excelPercentValue,
  pdfBudgetCell,
  pdfConsumedPctCell,
  pdfVarianceCell,
  pdfVariancePctCell,
} from "@/components/forms/variance-figures"
import { PeriodSelect, type ReportPeriod } from "@/components/forms/report-scope"

/**
 * Cost head down the side; Budget, Actual, % consumed, Variance and
 * Variance % across the top, for ONE period at a time.
 *
 * **WRITTEN ONCE AND USED TWICE** (section 4 rules 2 and 4): as
 * the "By cost head" report on the Reports section, scoped to a project,
 * and as the site detail page's Variance tab, scoped to one site. They
 * are the same table asking the same question at two scopes, so they are
 * the same component. There is no second version.
 *
 * **THE PERIOD IS A DROPDOWN, NOT A SET OF COLUMNS** (client instruction,
 * 21 Oct 2026; it replaces the earlier five-period-columns-and-a-Total
 * layout with its "Showing" measure selector). "All years" is the
 * default and shows each head's `total` and the grand `total`; a period
 * shows `cells[period]` and `periodTotals[period]`. The one response
 * already carries every period, so changing it redraws and never
 * refetches. The `PeriodSelect` is the shared one in `report-scope.tsx`.
 *
 * ROWS COME FROM THE COST-HEAD SPINE, never from the query result. All
 * nineteen heads appear whether or not they carry a budget or an
 * expense. The API does that join; this file relies on it.
 *
 * COLUMN PRIORITY (section 10 rule 4): **every column is essential and
 * none may be dropped.** That is the declaration, not an omission: the
 * five figures answer one question together, and hiding one leaves a
 * Total row whose parts cannot be read. A screen where a column CAN be
 * dropped must drop it instead of scrolling.
 *
 * Widths come from the section 17.1 vocabulary: `col-amount` for Budget
 * and Actual, `col-narrow` for the two percentages, and Variance, which
 * carries a badge beside its figure, takes what is left. These column
 * widths have NOT been measured for this shape and must be re-measured
 * at 1280, 1024 and 768 before this is called done; section 34.3
 * freezes the first column so, if the table still scrolls sideways at
 * 768, the numbers never lose their label.
 */

/** A head's figures at the chosen period: the total, or one period's cell. */
function pickCell(
  row: { cells: VariancePeriodRow[]; total: VariancePeriodRow },
  period: ReportPeriod,
): VariancePeriodRow {
  return period === "all" ? row.total : row.cells[period]
}

function pickTotal(
  result: Pick<HeadPeriodReport, "periodTotals" | "total">,
  period: ReportPeriod): VariancePeriodRow {
  return period === "all" ? result.total : result.periodTotals[period]
}

/**
 * The export, built here beside the screen it mirrors so the Reports
 * page and the site Variance tab share it: same columns, same order,
 * same wording as the table (client instruction, 21 Oct 2026). The
 * Excel cells are numeric, via the shared helpers.
 */
export function headPeriodExportColumns(
  period: ReportPeriod,
): ExportColumn<HeadPeriodRow>[] {
  return [
    { header: "Cost head", cell: (row) => row.costHeadName },
    {
      header: "Budget",
      cell: (row) => pdfBudgetCell(pickCell(row, period).budgetPaise),
      numeric: true,
      excelValue: (row) => excelAmountValue(pickCell(row, period).budgetPaise),
    },
    {
      header: "Actual",
      cell: (row) => formatAmount(pickCell(row, period).actualPaise),
      numeric: true,
      excelValue: (row) => excelAmountValue(pickCell(row, period).actualPaise),
    },
    {
      header: "% consumed",
      cell: (row) => pdfConsumedPctCell(pickCell(row, period).consumedPct),
      numeric: true,
      excelValue: (row) => excelPercentValue(pickCell(row, period).consumedPct),
    },
    {
      header: "Variance",
      cell: (row) => pdfVarianceCell(pickCell(row, period).variancePaise),
      numeric: true,
      excelValue: (row) => excelAmountValue(pickCell(row, period).variancePaise),
    },
    {
      header: "Variance %",
      cell: (row) => pdfVariancePctCell(pickCell(row, period).variancePct),
      numeric: true,
      excelValue: (row) => excelPercentValue(pickCell(row, period).variancePct),
    },
  ]
}

/** The pinned Total row of the export, from the response's SQL totals. */
export function headPeriodExportTotalRow(
  report: Pick<HeadPeriodReport, "periodTotals" | "total">,
  period: ReportPeriod,
): PdfTotalRow {
  const t = pickTotal(report, period)
  return {
    cells: [
      "Total",
      pdfBudgetCell(t.budgetPaise),
      formatAmount(t.actualPaise),
      pdfConsumedPctCell(t.consumedPct),
      pdfVarianceCell(t.variancePaise),
      pdfVariancePctCell(t.variancePct),
    ],
  }
}

/** One head's five figures, as the five numeric cells of a table row. */
function FigureCells({ cell }: { cell: VariancePeriodRow }) {
  return (
    <>
      <TableCell numeric>
        <BudgetFigure paise={cell.budgetPaise} />
      </TableCell>
      <TableCell numeric>
        {/* The actual is always a number: a head with no budget and no
            expenses has still spent nothing, which is 0.00. */}
        <Truncate>{formatAmount(cell.actualPaise)}</Truncate>
      </TableCell>
      <TableCell numeric>
        <ConsumedPercentFigure pct={cell.consumedPct} />
      </TableCell>
      <TableCell numeric>
        <VarianceFigure paise={cell.variancePaise} />
      </TableCell>
      <TableCell numeric>
        <VariancePercentFigure pct={cell.variancePct} />
      </TableCell>
    </>
  )
}

export function HeadPeriodGrid({
  projectId,
  siteId,
  onRowCount,
  period: controlledPeriod,
  onPeriodChange,
  showPeriodSelect = true,
}: {
  /** Scope. Omit both for every site; the screens always pass one. */
  projectId?: string
  siteId?: string
  /** Reported up so a tab's count badge can show the real row count. */
  onRowCount?: (count: number) => void
  /**
   * Controlled-with-internal-default (section 4): omit both this and
   * `onPeriodChange` and the grid owns its own "Period" selector. Pass
   * both and a caller — an exporting page that needs to know which
   * period is on screen — can read and drive the same value the grid
   * renders, so the grid and the export can never disagree about it.
   */
  period?: ReportPeriod
  onPeriodChange?: (period: ReportPeriod) => void
  /**
   * False where the page already shows the same `PeriodSelect` in its
   * own toolbar (the Reports section, beside Project and Site, where
   * the by-site tab also has it). The site Variance tab has no toolbar,
   * so there the grid shows it above the table.
   */
  showPeriodSelect?: boolean
}) {
  // The frozen header cell must paint the band's own ground, or the
  // header label sits white-on-white (the band is on the <thead>, which
  // a sticky cell does not inherit). Same rule as permission-grid.tsx.
  const headerLevel = useBandLevel() + 1
  const [internalPeriod, setInternalPeriod] = React.useState<ReportPeriod>("all")
  const period = controlledPeriod ?? internalPeriod
  const setPeriod = onPeriodChange ?? setInternalPeriod
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
        The period selector sits with the table it changes, not in a
        detached corner (section 4 rule 2: the one shared PeriodSelect).
      */}
      {showPeriodSelect ? (
        <div className="flex items-center gap-2 border-b border-border-light px-4 py-3">
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>
      ) : null}

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
            <TableHead
              className={cn(
                "sticky left-0 z-30 w-grid-head min-w-grid-head",
                "after:absolute after:top-0 after:right-0 after:h-full after:border-r after:border-border",
                headerLevel <= 1 ? "bg-primary" : "bg-surface",
              )}
            >
              Cost head
            </TableHead>
            <TableHead numeric className="w-col-amount">
              Budget
            </TableHead>
            <TableHead numeric className="w-col-amount">
              Actual
            </TableHead>
            <TableHead numeric className="w-col-narrow">
              % consumed
            </TableHead>
            <TableHead numeric>Variance</TableHead>
            <TableHead numeric className="w-col-narrow">
              Variance %
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result === null
            ? /* Section 14: the shape of what is coming. Nineteen heads
                 is the known row count. */
              Array.from({ length: 19 }, (_, row) => (
                <TableRow key={`skeleton-${row}`}>
                  <TableRowHeader frozen className="min-w-grid-head">
                    <Skeleton className="h-4 w-3/4" />
                  </TableRowHeader>
                  {Array.from({ length: 5 }, (_, cell) => (
                    <TableCell key={cell} numeric>
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : result.rows.map((row) => (
                <TableRow key={row.costHeadId}>
                  <TableRowHeader frozen className="min-w-grid-head">
                    <Truncate>{row.costHeadName}</Truncate>
                  </TableRowHeader>
                  <FigureCells cell={pickCell(row, period)} />
                </TableRow>
              ))}
        </TableBody>
        {/* Section 3 rule 5: a total row carries body-strong weight,
            which TableFooter supplies. Every figure in it was summed in
            SQL beside the cells above, not added up here. */}
        <TableFooter sticky>
          <TableRow>
            {/* The spine drops its tint in a footer, so the sticky cell
                paints the footer's own ground to cover what scrolls under. */}
            <TableRowHeader frozen className="min-w-grid-head bg-surface-sunken">
              Total
            </TableRowHeader>
            {result === null ? (
              Array.from({ length: 5 }, (_, cell) => (
                <TableCell key={cell} numeric>
                  <Skeleton className="ml-auto h-4 w-20" />
                </TableCell>
              ))
            ) : (
              <FigureCells cell={pickTotal(result, period)} />
            )}
          </TableRow>
        </TableFooter>
      </Table>
    </>
  )
}
