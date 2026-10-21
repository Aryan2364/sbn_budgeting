"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { api, query } from "@/lib/api"
import { usePageGuard } from "@/lib/permissions"
import type {
  HeadPeriodReport,
  ListResponse,
  Matchable,
  PeriodSummary,
  VariancePeriodRow,
  VarianceRow,
} from "@/lib/api"
import { formatAmount, formatNumber } from "@/lib/format"
import { periodLabel } from "@/lib/periods"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButton } from "@/components/ui/export-button"
import type { ExportColumn, PdfTotalRow } from "@/lib/pdf-export"
import { PrintHeader } from "@/components/ui/print-header"
import { Truncate } from "@/components/ui/truncate"
import { PageFrame, PageHeader } from "@/components/templates/page"
import { ListDataArea, ListToolbar } from "@/components/templates/list-page"
import {
  RecordList,
  type ListState,
  type RecordColumn,
} from "@/components/templates/record-list"
import { SectionTabs, type SectionTab } from "@/components/templates/section-tabs"
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
import {
  HeadPeriodGrid,
  headPeriodExportColumns,
  headPeriodExportTotalRow,
} from "@/components/forms/head-period-grid"
import { PeriodSummaryTable } from "@/components/forms/period-summary-table"
import {
  PeriodSelect,
  ReportScopeControls,
  parseReportPeriod,
  reportPeriodLabel,
  reportPeriodParam,
  useReportScope,
  type ReportPeriod,
} from "@/components/forms/report-scope"

/**
 * The Reports section. Three reports over the same variance
 * definition, reached by the section 33 tab bar.
 *
 *   By site      — Phase 7, screen 1. Every site, at one period.
 *   By year      — Phase 7b, Report 1. Five periods.
 *   By cost head — Phase 7b, Report 2. Nineteen heads at one period,
 *                  the same grid the site detail Variance tab uses.
 *
 * Client instruction, 21 Oct 2026: By site and By cost head each take a
 * "Period" dropdown (All years, Plantation, Year 1 to Year 4; the shared
 * `PeriodSelect`), and all three carry a "% consumed" column after
 * Actual. The exports follow the screen column for column and name the
 * chosen period in their title.
 *
 * Every figure on all three comes from the one `variance` view written
 * in Phase 3 and the grains migration 0004 added. Nothing here adds two
 * amounts together.
 */

const TABS: SectionTab[] = [
  { value: "sites", label: "By site" },
  { value: "years", label: "By year" },
  { value: "heads", label: "By cost head" },
]

/**
 * Kit 26.7 rule 2: a report whose only purpose is the amounts is an
 * area, so without see amounts it is the 11.8 "No access" page, never a
 * page of blanks. Reports' own key already needs see amounts (plan O9);
 * this holds the rule for a role that somehow has one without the other.
 */
export default function ReportsPage() {
  const denied = usePageGuard("budget.amounts.see")
  return (
    denied ?? (
      <React.Suspense fallback={null}>
        <Reports />
      </React.Suspense>
    )
  )
}

function Reports() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requested = searchParams.get("view") ?? "sites"
  const view = TABS.some((t) => t.value === requested) ? requested : "sites"

  /**
   * Section 33.4: the toolbar's state belongs to its tab, so switching
   * tabs writes the new `view` and drops `period`, which only the by-site
   * tab keeps in the URL. Without this the by-site period would linger in
   * the address of the other two tabs and come back unasked.
   */
  const tabs = (
    <SectionTabs
      tabs={TABS}
      value={view}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("view", next)
        params.delete("period")
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      }}
    />
  )

  if (view === "sites") return <SitesReport tabs={tabs} />
  return <YearReport view={view} tabs={tabs} />
}

// ---------------------------------------------------------------
// Tab 1 — by site. Phase 7's screen 1, now read at a chosen period.
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
    render: (row) => <Truncate>{row.projectName ?? "—"}</Truncate>,
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
    key: "consumedPct",
    label: "% consumed",
    numeric: true,
    sortKey: "consumedPct",
    priority: "secondary",
    render: (row) => <ConsumedPercentFigure pct={row.consumedPct} />,
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

const SITES_EXPORT_COLUMNS: ExportColumn<VarianceSiteRow>[] = [
  { header: "Site", cell: (row) => row.siteName },
  { header: "Project", cell: (row) => row.projectName ?? "—" },
  {
    header: "Trees",
    cell: (row) => formatNumber(row.plannedTrees),
    numeric: true,
    excelValue: (row) => row.plannedTrees,
  },
  {
    header: "Budget",
    cell: (row) => pdfBudgetCell(row.budgetPaise),
    numeric: true,
    excelValue: (row) => excelAmountValue(row.budgetPaise),
  },
  {
    header: "Actual",
    cell: (row) => formatAmount(row.actualPaise),
    numeric: true,
    excelValue: (row) => excelAmountValue(row.actualPaise),
  },
  {
    header: "% consumed",
    cell: (row) => pdfConsumedPctCell(row.consumedPct),
    numeric: true,
    excelValue: (row) => excelPercentValue(row.consumedPct),
  },
  {
    header: "Variance",
    cell: (row) => pdfVarianceCell(row.variancePaise),
    numeric: true,
    excelValue: (row) => excelAmountValue(row.variancePaise),
  },
  {
    header: "Variance %",
    cell: (row) => pdfVariancePctCell(row.variancePct),
    numeric: true,
    excelValue: (row) => excelPercentValue(row.variancePct),
  },
]

function SitesReport({ tabs }: { tabs: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * The period lives in the URL (`?view=sites&period=2`, omitted for
   * All years), written with replace rather than push like the tab
   * (section 33.4), so opening a site and coming back keeps it.
   */
  const period = parseReportPeriod(searchParams.get("period"))

  /**
   * RecordList's own search / sort / page state, lifted here only so a
   * period change can send the list back to page 1. The period itself is
   * deliberately NOT in `filters`: that bag would raise RecordList's
   * "Clear all" zone for a control that is not a filter. It reaches the
   * list through `load` and, so the table shows its loading state on a
   * change, through `refreshKey`.
   */
  const [listState, setListState] = React.useState<ListState>({
    search: "",
    sort: "variance",
    direction: "asc",
    page: 1,
    filters: {},
  })

  const changePeriod = (next: ReportPeriod) => {
    const params = new URLSearchParams(searchParams.toString())
    const value = reportPeriodParam(next)
    if (value === undefined) params.delete("period")
    else params.set("period", value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    setListState((state) => ({ ...state, page: 1 }))
  }

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
      }>(
        `/reports/variance${query({ page, search, sort, direction, period: reportPeriodParam(period) })}`,
      )

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
    [period],
  )

  const periodName = reportPeriodLabel(period)

  return (
    <RecordList
      title="Variance report"
      countLabel={(total) =>
        `${formatNumber(total)} ${total === 1 ? "site" : "sites"} · ${periodName}`
      }
      searchLabel="Search sites"
      searchPlaceholder="Search sites"
      sectionTabs={tabs}
      printTitle={`Variance report — By site — ${periodName}`}
      toolbarExtra={<PeriodSelect value={period} onChange={changePeriod} />}
      listState={listState}
      onListStateChange={setListState}
      refreshKey={period === "all" ? 0 : period + 1}
      exportPdf={{
        title: `Variance report — By site — ${periodName}`,
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

const YEAR_EXPORT_COLUMNS: ExportColumn<VariancePeriodRow>[] = [
  { header: "Period", cell: (row) => periodLabel(row.period) },
  {
    header: "Budget",
    cell: (row) => pdfBudgetCell(row.budgetPaise),
    numeric: true,
    excelValue: (row) => excelAmountValue(row.budgetPaise),
  },
  {
    header: "Actual",
    cell: (row) => formatAmount(row.actualPaise),
    numeric: true,
    excelValue: (row) => excelAmountValue(row.actualPaise),
  },
  {
    header: "% consumed",
    cell: (row) => pdfConsumedPctCell(row.consumedPct),
    numeric: true,
    excelValue: (row) => excelPercentValue(row.consumedPct),
  },
  {
    header: "Variance",
    cell: (row) => pdfVarianceCell(row.variancePaise),
    numeric: true,
    excelValue: (row) => excelAmountValue(row.variancePaise),
  },
  {
    header: "Variance %",
    cell: (row) => pdfVariancePctCell(row.variancePct),
    numeric: true,
    excelValue: (row) => excelPercentValue(row.variancePct),
  },
]

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
   * The period selector lives inside `HeadPeriodGrid`, but this page
   * controls its value (`period` / `onPeriodChange`) so the grid on
   * screen and the export below read the exact same value. Local state,
   * not the URL: only the by-site tab keeps its period in the address.
   */
  const [headPeriod, setHeadPeriod] = React.useState<ReportPeriod>("all")
  const headExportColumnsForPeriod = React.useMemo(
    () => headPeriodExportColumns(headPeriod),
    [headPeriod],
  )
  const headTitle = `Variance report — By cost head — ${reportPeriodLabel(headPeriod)}`

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
        pdfBudgetCell(t.budgetPaise),
        formatAmount(t.actualPaise),
        pdfConsumedPctCell(t.consumedPct),
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
    return t ? headPeriodExportTotalRow(t, headPeriod) : undefined
  }, [headPeriod])

  return (
    <PageFrame>
      <PageHeader
        title="Variance report"
        meta={
          view === "years"
            ? "Budget against actual for each budget period"
            : "Budget against actual for each cost head, for one period or all years"
        }
      />

      <PrintHeader
        title={view === "years" ? "Variance report — By year" : headTitle}
      />

      {tabs}

      {/*
        Section 33.2: the toolbar belongs to the ACTIVE TAB, which is
        why the scope controls sit here and not above the tab bar. The
        by-site report has no scope — it is every site — so its toolbar
        carries a search box and the period instead.
      */}
      <ListToolbar>
        <ReportScopeControls {...scope} />
        {/* The by-cost-head period sits here, beside Project and Site,
            in the same toolbar position as the by-site tab's. */}
        {view === "heads" ? (
          <PeriodSelect value={headPeriod} onChange={setHeadPeriod} />
        ) : null}
        {view === "years" ? (
          <ExportButton
            className="ml-auto"
            title="Variance report — By year"
            contextDescription={scopeDescription}
            columns={YEAR_EXPORT_COLUMNS}
            fetchPage={periodFetchPage}
            buildTotalRow={periodTotalRow}
          />
        ) : (
          <ExportButton
            className="ml-auto"
            title={headTitle}
            contextDescription={scopeDescription}
            columns={headExportColumnsForPeriod}
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
            period={headPeriod}
            onPeriodChange={setHeadPeriod}
            showPeriodSelect={false}
          />
        )}
      </ListDataArea>
    </PageFrame>
  )
}
