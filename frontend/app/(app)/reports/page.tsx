"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { api, query } from "@/lib/api"
import type {
  HeadPeriodReport,
  HeadPeriodRow,
  ListResponse,
  Matchable,
  PeriodSummary,
  VariancePeriodRow,
  VarianceRow,
} from "@/lib/api"
import { EMPTY_VALUE, formatAmount, formatNumber, formatPercent } from "@/lib/format"
import { PERIODS, periodLabel } from "@/lib/periods"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportPdfButton } from "@/components/ui/export-pdf-button"
import type { PdfColumn, PdfTotalRow } from "@/lib/pdf-export"
import { PrintHeader } from "@/components/ui/print-header"
import { Truncate } from "@/components/ui/truncate"
import { PageFrame, PageHeader } from "@/components/templates/page"
import { ListDataArea, ListToolbar } from "@/components/templates/list-page"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"
import { SectionTabs, type SectionTab } from "@/components/templates/section-tabs"
import {
  BudgetFigure,
  VarianceFigure,
  VariancePercentFigure,
  varianceDirection,
} from "@/components/forms/variance-figures"
import { HeadPeriodGrid, measureLabel, type Measure } from "@/components/forms/head-period-grid"
import { PeriodSummaryTable } from "@/components/forms/period-summary-table"
import {
  ReportScopeControls,
  useReportScope,
} from "@/components/forms/report-scope"

/**
 * Shared PDF cell formatters, mirroring exactly what the on-screen
 * `variance-figures` components render (BudgetFigure, VarianceFigure,
 * VariancePercentFigure) but as plain strings for the PDF table.
 */
function pdfBudgetCell(paise: string | null): string {
  return paise === null ? "Budget not set" : formatAmount(paise)
}

function pdfVarianceCell(paise: string | null): string {
  if (paise === null) return EMPTY_VALUE
  return `${varianceDirection(paise)} ${formatAmount(paise)}`
}

function pdfVariancePctCell(pct: string | null): string {
  return pct === null ? EMPTY_VALUE : formatPercent(Number(pct))
}

function pdfPeriodCell(cell: VariancePeriodRow): string {
  return pdfBudgetCell(cell.budgetPaise)
}

/**
 * The head-period grid's export must carry whichever measure the user
 * is actually looking at (bug fix, Sep 2026) — never a hardcoded
 * "Budget" — so this mirrors `HeadPeriodGrid`'s own `Figure` switch,
 * one measure at a time, same as the screen.
 */
function pdfHeadCell(cell: VariancePeriodRow, measure: Measure): string {
  switch (measure) {
    case "budget":
      return pdfBudgetCell(cell.budgetPaise)
    case "actual":
      return formatAmount(cell.actualPaise)
    case "variance":
      return pdfVarianceCell(cell.variancePaise)
    case "variancePct":
      return pdfVariancePctCell(cell.variancePct)
  }
}

/**
 * The Reports section. Three reports over the same variance
 * definition, reached by the section 33 tab bar.
 *
 *   By site              — Phase 7, screen 1. Every site, all-time.
 *   By year              — Phase 7b, Report 1. Five periods.
 *   By cost head and year — Phase 7b, Report 2. Nineteen heads × five
 *                           periods, the same grid the site detail
 *                           Variance tab uses.
 *
 * Every figure on all three comes from the one `variance` view written
 * in Phase 3 and the grains migration 0004 added. Nothing here adds two
 * amounts together.
 */

const TABS: SectionTab[] = [
  { value: "sites", label: "By site" },
  { value: "years", label: "By year" },
  { value: "heads", label: "By cost head and year" },
]

export default function ReportsPage() {
  return (
    <React.Suspense fallback={null}>
      <Reports />
    </React.Suspense>
  )
}

function Reports() {
  const searchParams = useSearchParams()
  const requested = searchParams.get("view") ?? "sites"
  const view = TABS.some((t) => t.value === requested) ? requested : "sites"

  const tabs = <SectionTabs tabs={TABS} value={view} />

  if (view === "sites") return <SitesReport tabs={tabs} />
  return <YearReport view={view} tabs={tabs} />
}

// ---------------------------------------------------------------
// Tab 1 — by site. Phase 7's screen 1, unchanged apart from the tabs.
// ---------------------------------------------------------------

type VarianceSiteRow = VarianceRow & { id: string }

const COLUMNS: RecordColumn<VarianceSiteRow>[] = [
  {
    key: "site",
    label: "Site",
    sortKey: "site",
    render: (row) => <Truncate className="font-medium">{row.siteName}</Truncate>,
  },
  {
    key: "project",
    label: "Project",
    sortKey: "project",
    priority: "secondary",
    render: (row) => <Truncate>{row.projectName}</Truncate>,
  },
  {
    key: "trees",
    label: "Trees",
    numeric: true,
    sortKey: "trees",
    priority: "tertiary",
    render: (row) => formatNumber(row.plannedTrees),
  },
  {
    key: "budget",
    label: "Budget",
    numeric: true,
    sortKey: "budget",
    render: (row) => <BudgetFigure paise={row.budgetPaise} />,
  },
  {
    key: "actual",
    label: "Actual",
    numeric: true,
    sortKey: "actual",
    render: (row) => formatAmount(row.actualPaise),
  },
  {
    key: "variance",
    label: "Variance",
    numeric: true,
    sortKey: "variance",
    render: (row) => <VarianceFigure paise={row.variancePaise} />,
  },
  {
    key: "variancePct",
    label: "Variance %",
    numeric: true,
    sortKey: "variancePct",
    priority: "secondary",
    render: (row) => <VariancePercentFigure pct={row.variancePct} />,
  },
]

const SITES_EXPORT_COLUMNS: PdfColumn<VarianceSiteRow>[] = [
  { header: "Site", cell: (row) => row.siteName },
  { header: "Project", cell: (row) => row.projectName },
  { header: "Trees", cell: (row) => formatNumber(row.plannedTrees), numeric: true },
  { header: "Budget", cell: (row) => pdfBudgetCell(row.budgetPaise), numeric: true },
  { header: "Actual", cell: (row) => formatAmount(row.actualPaise), numeric: true },
  { header: "Variance", cell: (row) => pdfVarianceCell(row.variancePaise), numeric: true },
  {
    header: "Variance %",
    cell: (row) => pdfVariancePctCell(row.variancePct),
    numeric: true,
  },
]

function SitesReport({ tabs }: { tabs: React.ReactNode }) {
  /**
   * The variance endpoint predates the shared list convention's
   * response shape. `totalPages` and `matchedField` are derived here
   * rather than by widening the API, because the missing pieces are
   * presentation: the API already sent everything it knows.
   *
   * `matchedField` is null throughout on purpose — the endpoint's
   * search covers the site name and the project name, and both are
   * already columns, so there is no field a user could match on that
   * they cannot see.
   */
  const load = React.useCallback(
    async ({
      page,
      search,
      sort,
      direction,
    }: {
      page: number
      search: string
      sort: string
      direction: "asc" | "desc"
    }): Promise<ListResponse<VarianceSiteRow & Matchable>> => {
      const response = await api.get<{
        data: VarianceRow[]
        total: number
        page: number
        pageSize: number
      }>(`/reports/variance${query({ page, search, sort, direction })}`)

      return {
        ...response,
        totalPages: Math.max(1, Math.ceil(response.total / response.pageSize)),
        sort,
        direction,
        search: search || null,
        appliedFilters: {},
        data: response.data.map((row) => ({
          ...row,
          id: row.siteId,
          matchedField: null,
          matchedValue: null,
        })),
      }
    },
    [],
  )

  return (
    <RecordList
      title="Variance report"
      countLabel={(total) =>
        `${formatNumber(total)} ${total === 1 ? "site" : "sites"} · all time`
      }
      searchLabel="Search sites"
      searchPlaceholder="Search sites"
      sectionTabs={tabs}
      printTitle="Variance report — By site"
      exportPdf={{
        title: "Variance report — By site",
        columns: SITES_EXPORT_COLUMNS,
      }}
      columns={COLUMNS}
      /*
       * Variance ASCENDING, worst first, so the most overspent site is
       * on screen without anyone touching a control. The API sorts
       * NULLS LAST in both directions, so a site with no budget sits at
       * the bottom rather than posing as the worst.
       */
      defaultSort="variance"
      defaultDirection="asc"
      rowHref={(row) => `/sites/${row.siteId}?tab=variance`}
      load={load}
      emptyHeading="No sites yet"
      emptyBody="A variance compares a site's budget against what has been spent on it. Add a site and this fills in."
      emptyActionLabel="New site"
      emptyActionHref="/sites/new"
    />
  )
}

// ---------------------------------------------------------------
// Tabs 2 and 3 — the year-wise reports. Same frame, same scope
// controls, different table, so they are one component with a switch
// rather than two that drift apart.
// ---------------------------------------------------------------

const YEAR_EXPORT_COLUMNS: PdfColumn<VariancePeriodRow>[] = [
  { header: "Period", cell: (row) => periodLabel(row.period) },
  { header: "Budget", cell: pdfPeriodCell, numeric: true },
  { header: "Actual", cell: (row) => formatAmount(row.actualPaise), numeric: true },
  { header: "Variance", cell: (row) => pdfVarianceCell(row.variancePaise), numeric: true },
  {
    header: "Variance %",
    cell: (row) => pdfVariancePctCell(row.variancePct),
    numeric: true,
  },
]

function headExportColumns(measure: Measure): PdfColumn<HeadPeriodRow>[] {
  return [
    { header: "Cost head", cell: (row) => row.costHeadName },
    ...PERIODS.map(
      (label, index): PdfColumn<HeadPeriodRow> => ({
        header: label,
        cell: (row) => pdfHeadCell(row.cells[index], measure),
        numeric: true,
      }),
    ),
    { header: "Total", cell: (row) => pdfHeadCell(row.total, measure), numeric: true },
  ]
}

function YearReport({ view, tabs }: { view: string; tabs: React.ReactNode }) {
  const scope = useReportScope()
  const { projectId, siteId } = scope.scope

  const scopeDescription = `Project: ${scope.projects[projectId] ?? "—"} · ${
    siteId ? `Site: ${scope.sites[siteId] ?? "All sites"}` : "All sites"
  }`

  /**
   * These report tables (section 34) are not paginated — the endpoint
   * already returns every row in one call — so the export's `fetchPage`
   * just returns everything on page 1 with `total = data.length`, which
   * ends the button's paging loop immediately.
   *
   * The API's grand total (section 34.1) is computed in SQL, not summed
   * from the fetched rows, so it is captured in a ref by `fetchPage` and
   * read back by `buildTotalRow` rather than recomputed client-side.
   */
  const periodTotalRef = React.useRef<VariancePeriodRow | null>(null)
  const headTotalsRef = React.useRef<{
    periodTotals: VariancePeriodRow[]
    total: VariancePeriodRow
  } | null>(null)

  /**
   * BUG FIX: the measure selector used to live only inside
   * `HeadPeriodGrid`'s own state, invisible to this page — so the
   * export always shipped "Budget" no matter what the grid was
   * showing. `HeadPeriodGrid` now accepts `measure`/`onMeasureChange`
   * as a controlled-with-internal-default pair; this page controls it
   * so the grid on screen and the export below read the exact same
   * value.
   */
  const [headMeasure, setHeadMeasure] = React.useState<Measure>("budget")
  const headExportColumnsForMeasure = React.useMemo(
    () => headExportColumns(headMeasure),
    [headMeasure],
  )

  const periodFetchPage = React.useCallback(async () => {
    const result = await api.get<PeriodSummary>(
      `/reports/variance/periods-summary${query({ projectId, siteId })}`,
    )
    periodTotalRef.current = result.total
    return { data: result.rows, total: result.rows.length }
  }, [projectId, siteId])

  const periodTotalRow = React.useCallback((): PdfTotalRow | undefined => {
    const t = periodTotalRef.current
    if (!t) return undefined
    return {
      cells: [
        "Total",
        pdfPeriodCell(t),
        formatAmount(t.actualPaise),
        pdfVarianceCell(t.variancePaise),
        pdfVariancePctCell(t.variancePct),
      ],
    }
  }, [])

  const headFetchPage = React.useCallback(async () => {
    const result = await api.get<HeadPeriodReport>(
      `/reports/variance/head-periods${query({ projectId, siteId })}`,
    )
    headTotalsRef.current = { periodTotals: result.periodTotals, total: result.total }
    return { data: result.rows, total: result.rows.length }
  }, [projectId, siteId])

  const headTotalRow = React.useCallback((): PdfTotalRow | undefined => {
    const t = headTotalsRef.current
    if (!t) return undefined
    return {
      cells: [
        "Total",
        ...t.periodTotals.map((cell) => pdfHeadCell(cell, headMeasure)),
        pdfHeadCell(t.total, headMeasure),
      ],
    }
  }, [headMeasure])

  return (
    <PageFrame>
      <PageHeader
        title="Variance report"
        meta={
          view === "years"
            ? "Budget against actual for each budget period"
            : "Budget against actual for each cost head, period by period"
        }
      />

      <PrintHeader
        title={
          view === "years"
            ? "Variance report — By year"
            : "Variance report — By cost head and year"
        }
      />

      {tabs}

      {/*
        Section 33.2: the toolbar belongs to the ACTIVE TAB, which is
        why the scope controls sit here and not above the tab bar. The
        by-site report has no scope — it is every site, all-time — so
        its toolbar carries a search box instead.
      */}
      <ListToolbar>
        <ReportScopeControls {...scope} />
        {view === "years" ? (
          <ExportPdfButton
            className="ml-auto"
            title="Variance report — By year"
            contextDescription={scopeDescription}
            columns={YEAR_EXPORT_COLUMNS}
            fetchPage={periodFetchPage}
            buildTotalRow={periodTotalRow}
          />
        ) : (
          <ExportPdfButton
            className="ml-auto"
            title={`Variance report — By cost head and year — ${measureLabel(headMeasure)}`}
            contextDescription={scopeDescription}
            columns={headExportColumnsForMeasure}
            fetchPage={headFetchPage}
            buildTotalRow={headTotalRow}
          />
        )}
      </ListToolbar>

      <ListDataArea>
        {scope.failure !== null ? (
          /* Section 13: this was a bare paragraph — a failure with no
             way forward, which is the state the variant exists for. */
          <EmptyState
            variant="failed"
            heading="The report scope could not be loaded"
            onAction={scope.retry}
          >
            {scope.failure}
          </EmptyState>
        ) : view === "years" ? (
          <PeriodSummaryTable
            projectId={projectId || undefined}
            siteId={siteId || undefined}
          />
        ) : (
          /* The SAME grid the site detail Variance tab renders, scoped
             to a project instead of to one site. Not a second version. */
          <HeadPeriodGrid
            projectId={projectId || undefined}
            siteId={siteId || undefined}
            measure={headMeasure}
            onMeasureChange={setHeadMeasure}
          />
        )}
      </ListDataArea>
    </PageFrame>
  )
}
