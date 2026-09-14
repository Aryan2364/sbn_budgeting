"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { api, query } from "@/lib/api"
import type { ListResponse, Matchable, VarianceRow } from "@/lib/api"
import { formatAmount, formatNumber } from "@/lib/format"
import { EmptyState } from "@/components/ui/empty-state"
import { Truncate } from "@/components/ui/truncate"
import { PageFrame, PageHeader } from "@/components/templates/page"
import { ListDataArea, ListToolbar } from "@/components/templates/list-page"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"
import { SectionTabs, type SectionTab } from "@/components/templates/section-tabs"
import {
  BudgetFigure,
  VarianceFigure,
  VariancePercentFigure,
} from "@/components/forms/variance-figures"
import { HeadPeriodGrid } from "@/components/forms/head-period-grid"
import { PeriodSummaryTable } from "@/components/forms/period-summary-table"
import {
  ReportScopeControls,
  useReportScope,
} from "@/components/forms/report-scope"

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

function YearReport({ view, tabs }: { view: string; tabs: React.ReactNode }) {
  const scope = useReportScope()
  const { projectId, siteId } = scope.scope

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

      {tabs}

      {/*
        Section 33.2: the toolbar belongs to the ACTIVE TAB, which is
        why the scope controls sit here and not above the tab bar. The
        by-site report has no scope — it is every site, all-time — so
        its toolbar carries a search box instead.
      */}
      <ListToolbar>
        <ReportScopeControls {...scope} />
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
          />
        )}
      </ListDataArea>
    </PageFrame>
  )
}
