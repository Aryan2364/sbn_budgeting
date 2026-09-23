"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  api,
  query,
  type BudgetGrid,
  type Expense,
  type HeadPeriodReport,
  type HeadPeriodRow,
  type ListResponse,
  type Matchable,
  type Project,
  type Site,
  type VariancePeriodRow,
} from "@/lib/api"
import { EMPTY_VALUE, formatAmount, formatCurrency, formatDate, formatNumber, formatPercent } from "@/lib/format"
import { paiseToRupeeInput, multiplyPaise, sumPaise } from "@/lib/money"
import { anchorLabel, PERIODS, periodAnchor, periodLabel } from "@/lib/periods"
import type { ExportColumn, PdfColumn, PdfTotalRow } from "@/lib/pdf-export"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"
import {
  ExpenseFilterButton,
  expenseFilterChips,
  expenseFilterLabels,
  type ExpenseFilterValues,
} from "@/components/forms/expense-filter"
import { errorMessage, useSession } from "@/components/shell/session"
import { Badge } from "@/components/ui/badge"
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButton } from "@/components/ui/export-button"
import { PrintHeader } from "@/components/ui/print-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Truncate } from "@/components/ui/truncate"
import { PageHeader, PageScroller } from "@/components/templates/page"
import {
  DetailColumns,
  DetailField,
  DetailFieldList,
} from "@/components/templates/detail-page"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { HeadPeriodGrid, measureLabel, type Measure } from "@/components/forms/head-period-grid"
import { DeleteRecordDialog } from "@/components/forms/delete-record-dialog"
import { PermissionTooltip } from "@/components/forms/permission-tooltip"
import { varianceDirection } from "@/components/forms/variance-figures"


/**
 * PDF cell formatters for the Variance tab's export, mirroring exactly
 * what `HeadPeriodGrid`'s `Figure` renders — for WHICHEVER measure the
 * grid is currently showing (bug fix, Sep 2026). The export used to be
 * hardcoded to "Budget" regardless of the on-screen selector; now the
 * measure is lifted to this page (see `varianceMeasure` below) and
 * these formatters switch on it exactly as `Figure` does.
 */
function pdfBudgetCell(cell: VariancePeriodRow): string {
  return cell.budgetPaise === null ? "Budget not set" : formatAmount(cell.budgetPaise)
}

function pdfVarianceCellText(paise: string | null): string {
  const direction = varianceDirection(paise)
  if (direction === null || paise === null) return EMPTY_VALUE
  return `${direction} ${formatAmount(paise)}`
}

function pdfVariancePctCellText(pct: string | null): string {
  return pct === null ? EMPTY_VALUE : formatPercent(Number(pct))
}

function pdfMeasureCell(cell: VariancePeriodRow, measure: Measure): string {
  switch (measure) {
    case "budget":
      return pdfBudgetCell(cell)
    case "actual":
      return formatAmount(cell.actualPaise)
    case "variance":
      return pdfVarianceCellText(cell.variancePaise)
    case "variancePct":
      return pdfVariancePctCellText(cell.variancePct)
  }
}

function varianceExportColumns(measure: Measure): PdfColumn<HeadPeriodRow>[] {
  return [
    { header: "Cost head", cell: (row) => row.costHeadName },
    ...PERIODS.map(
      (label, index): PdfColumn<HeadPeriodRow> => ({
        header: label,
        cell: (row) => pdfMeasureCell(row.cells[index], measure),
        numeric: true,
      }),
    ),
    { header: "Total", cell: (row) => pdfMeasureCell(row.total, measure), numeric: true },
  ]
}

/**
 * The site page's Expenses tab, in `RecordList` columns — mirrors
 * `app/(app)/expenses/page.tsx`'s COLUMNS/PDF_COLUMNS, minus the Site
 * column (every row here is already this site, so repeating its name
 * would say nothing a screen full of identical values doesn't already
 * say) and with Cost head promoted out of `tertiary` since this is the
 * client's specifically requested sort column and it should not be the
 * first thing dropped on a narrower screen.
 */
const SITE_EXPENSE_COLUMNS: RecordColumn<Expense>[] = [
  {
    key: "spentOn",
    label: "Date",
    numeric: true,
    sortKey: "spentOn",
    width: "tight",
    render: (row) => formatDate(row.spentOn),
  },
  {
    key: "costHeadName",
    label: "Cost head",
    sortKey: "costHeadName",
    render: (row) => <Truncate>{row.costHeadName}</Truncate>,
  },
  {
    key: "period",
    label: "Period",
    sortKey: "period",
    priority: "secondary",
    width: "tight",
    render: (row) => periodLabel(row.period),
  },
  {
    key: "description",
    label: "Description",
    priority: "secondary",
    render: (row) => <Truncate>{row.description ?? "—"}</Truncate>,
  },
  {
    key: "billNumber",
    label: "Bill no.",
    priority: "tertiary",
    width: "narrow",
    render: (row) => <Truncate>{row.billNumber ?? "—"}</Truncate>,
  },
  {
    key: "amountPaise",
    label: "Amount",
    numeric: true,
    sortKey: "amountPaise",
    width: "amount",
    render: (row) => formatAmount(row.amountPaise),
  },
]

/** Mirrors `SITE_EXPENSE_COLUMNS` exactly, same order and text. */
const SITE_EXPENSE_PDF_COLUMNS: ExportColumn<Expense>[] = [
  {
    header: "Date",
    cell: (row) => formatDate(row.spentOn),
    // Excel: a real date cell (see the same column in app/(app)/expenses/page.tsx).
    excelValue: (row) => new Date(row.spentOn),
  },
  { header: "Cost head", cell: (row) => row.costHeadName },
  { header: "Period", cell: (row) => periodLabel(row.period) },
  {
    header: "Description",
    cell: (row) => row.description ?? "—",
    // Section 31.2's "empty is not zero" applies to text too: the Excel
    // cell must be truly empty, not the on-screen "—" placeholder.
    excelValue: (row) => row.description ?? null,
  },
  {
    header: "Bill no.",
    cell: (row) => row.billNumber ?? "—",
    // See the same column in app/(app)/expenses/page.tsx: a free-text
    // reference stays TEXT unless this specific value is a plain
    // leading-zero-free integer (`excelNumericSafe`, lib/pdf-export.tsx).
    excelValue: (row) => row.billNumber ?? null,
    excelNumericSafe: true,
  },
  {
    header: "Amount",
    cell: (row) => formatAmount(row.amountPaise),
    numeric: true,
    // Excel: a real number, in rupees, via the exact string conversion
    // (see the same column in app/(app)/expenses/page.tsx for why).
    excelValue: (row) => {
      const text = paiseToRupeeInput(row.amountPaise)
      return text === "" ? null : Number(text)
    },
  },
]

/** Section 11.2. The detail template, with data. */
export default function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <React.Suspense fallback={null}>
      <SiteDetail params={params} />
    </React.Suspense>
  )
}

function SiteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAdmin } = useSession()

  /**
   * Which tab is open lives in the URL, not in component state.
   *
   * The Reports list drills into a specific site's VARIANCE tab
   * (`/sites/:id?tab=variance`), so the target tab has to be
   * addressable. Keeping it in the URL also means the browser's own
   * back button returns to the tab the user came from — which is the
   * navigation the product has instead of a back BUTTON (section 1
   * rule 11).
   */
  const tab = searchParams.get("tab") === "variance" ? "variance" : "expenses"

  const [site, setSite] = React.useState<Site | null>(null)
  const [project, setProject] = React.useState<Project | null>(null)
  const [budget, setBudget] = React.useState<BudgetGrid | null>(null)
  /**
   * The Expenses tab is now `RecordList` in embedded mode (see
   * `record-list.tsx`'s `embedded`/`onResult` props) — it owns its own
   * fetch, paging, sort and export. This page only needs the two
   * figures `RecordList` has no header to display them in: the tab's
   * count badge and the "Total spent" line, read back via `onResult`.
   *
   * The total used to be `sumPaise` over whatever 25-row PAGE happened
   * to be loaded — a per-page sum labelled as if it were the site's
   * total. `aggregates.amountPaise` is the server's SUM across every
   * matching row (backend/src/expenses/expenses.controller.ts), so this
   * is now the true site total, not just "on this page" — a real change
   * in the number shown, not only in how it is produced.
   */
  const [expenseTotal, setExpenseTotal] = React.useState(0)
  const [expenseAmountPaise, setExpenseAmountPaise] = React.useState<string | null>(null)

  /**
   * The Variance tab's PDF export. `HeadPeriodGrid` (section 34) already
   * fetches every cost head in one call — not paginated, per 34.2 — so
   * `fetchPage` just returns everything on page 1. The grand total
   * (section 34.1) is computed in SQL by the same endpoint, so it is
   * captured in a ref here rather than summed client-side, and read back
   * by `buildTotalRow`.
   */
  const varianceTotalsRef = React.useRef<{
    periodTotals: VariancePeriodRow[]
    total: VariancePeriodRow
  } | null>(null)

  /**
   * BUG FIX: the measure selector used to live only inside
   * `HeadPeriodGrid`'s own state, invisible to this page, so the
   * export always shipped "Budget" no matter what was on screen.
   * `HeadPeriodGrid` now accepts `measure`/`onMeasureChange` as a
   * controlled-with-internal-default pair; this page controls it so
   * the grid and the export below always read the same value.
   */
  const [varianceMeasure, setVarianceMeasure] = React.useState<Measure>("budget")

  /**
   * The Expenses tab's `RecordList.load`. Closes over `id`, so `siteId`
   * rides along on every page fetch this component makes — including
   * the export's own `fetchPage` calls in `record-list.tsx`, which call
   * this SAME function. That is what stops the Download button from
   * silently exporting every site's expenses under this site's heading.
   */
  const siteExpensesLoad = React.useCallback(
    ({
      page,
      search,
      sort,
      direction,
      pageSize,
      filters,
    }: {
      page: number
      search: string
      sort: string
      direction: "asc" | "desc"
      pageSize?: number
      filters?: Record<string, string | undefined>
    }) =>
      api.get<ListResponse<Expense & Matchable>>(
        `/expenses${query({
          siteId: id,
          page,
          search,
          sort,
          direction,
          pageSize,
          spentOnFrom: filters?.spentOnFrom,
          spentOnTo: filters?.spentOnTo,
          amountMin: filters?.amountMin,
          amountMax: filters?.amountMax,
        })}`,
      ),
    [id],
  )

  /**
   * Section 27.3's filter panel, reused as-is on this embedded list
   * (section 4 rule 1: never build the same thing twice). Local state
   * only — not synced to the URL like the `/expenses` page's — because
   * this tab already has its own `?tab=` param and this list is one
   * card on a detail page, not a screen someone bookmarks a filtered
   * view of. `siteId` never enters this `filters` bag (it rides along
   * separately, above), so it can never surface as a removable chip —
   * a user on this page must not be able to remove the very filter
   * that makes it this site's page.
   */
  const [siteExpenseListState, setSiteExpenseListState] = React.useState<{
    search: string
    sort: string
    direction: "asc" | "desc"
    page: number
    filters: Record<string, string | undefined>
  }>({ search: "", sort: "spentOn", direction: "desc", page: 1, filters: {} })

  const varianceFetchPage = React.useCallback(async () => {
    const result = await api.get<HeadPeriodReport>(
      `/reports/variance/head-periods${query({ siteId: id })}`,
    )
    varianceTotalsRef.current = { periodTotals: result.periodTotals, total: result.total }
    return { data: result.rows, total: result.rows.length }
  }, [id])

  const varianceTotalRow = React.useCallback((): PdfTotalRow | undefined => {
    const t = varianceTotalsRef.current
    if (!t) return undefined
    return {
      cells: [
        "Total",
        ...t.periodTotals.map((cell) => pdfMeasureCell(cell, varianceMeasure)),
        pdfMeasureCell(t.total, varianceMeasure),
      ],
    }
  }, [varianceMeasure])
  const [varianceRows, setVarianceRows] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const reload = React.useCallback(() => {
    let cancelled = false
    api
      .get<Site>(`/sites/${id}`)
      .then(async (found) => {
        if (cancelled) return
        setSite(found)
        // No project is the ordinary case (migration 0007), so there
        // is nothing to fetch and no over-allocation to check. Asking
        // for /projects/null would fail the whole load and put this
        // site's page into the error state over a field it does not
        // have.
        const [proj, grid] = await Promise.all([
          found.projectId
            ? api.get<Project>(`/projects/${found.projectId}`)
            : null,
          api.get<BudgetGrid>(`/sites/${id}/budget`),
        ])
        if (cancelled) return
        setProject(proj)
        setBudget(grid)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  React.useEffect(() => reload(), [reload])

  if (error) {
    return (
      <PageScroller>
        <EmptyState
          variant="failed"
          heading="This site could not be loaded"
          onAction={() => reload()}
        >
          {error}
        </EmptyState>
      </PageScroller>
    )
  }

  // Per-tree total across all heads and periods. Null when nothing is
  // budgeted, which reads "Budget not set" rather than 0.00.
  const perTree = budget ? sumPaise(budget.cells.map((c) => c.perTreePaise)) : null
  const siteBudget = site ? multiplyPaise(perTree, site.plannedTrees) : null
  const spent = expenseAmountPaise

  const over =
    project !== null && project.allocatedTrees > project.plannedTrees

  return (
    <PageScroller>
      <RecordBreadcrumb
        trail={[{ label: "Sites", href: "/sites" }]}
        current={site ? site.name : <Skeleton className="h-4 w-32" />}
      />

      <PageHeader
        className="mt-4"
        title={site ? site.name : <Skeleton className="h-8 w-64 max-w-full" />}
        badges={
          site?.projectName ? (
            <Badge variant="neutral">{site.projectName}</Badge>
          ) : null
        }
        meta={
          site ? (
            `${formatNumber(site.plannedTrees)} trees · planted ${formatDate(
              site.plantationStartDate,
            )}`
          ) : (
            <Skeleton className="h-3 w-48 max-w-full" />
          )
        }
        actions={
          <>
            <Button render={<Link href={`/sites/${id}/edit`} />}>
              <PencilIcon />
              Edit
            </Button>
            <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" aria-label="More actions" />
                        }
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">More actions</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    {/*
                      Section 26: DISABLED with the reason, not hidden.
                      A staff member who cannot find this does not know
                      whether it exists; greyed and explained, they do.
                    */}
                    <PermissionTooltip
                      allowed={isAdmin}
                      reason="Only an administrator can delete a site"
                    >
                      <DropdownMenuItem
                        variant="danger"
                        disabled={!isAdmin}
                        onClick={() => setDeleting(true)}
                      >
                        <TrashIcon />
                        Delete site
                      </DropdownMenuItem>
                    </PermissionTooltip>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/*
        Question 5: over-allocation warns and never blocks. It stays
        true until somebody changes a number, so section 7.1 makes it a
        banner rather than a toast that vanishes. Section 7.2 rule 1
        gives it an icon as well as a colour.
      */}
      {over && project ? (
        <Banner variant="warning" className="mt-6">
          <TriangleAlertIcon />
          <BannerTitle>
            {project.name} is over its planned tree count
          </BannerTitle>
          <BannerDescription>
            Its sites cover {formatNumber(project.allocatedTrees)} trees against a
            plan of {formatNumber(project.plannedTrees)} —{" "}
            {formatNumber(project.allocatedTrees - project.plannedTrees)} over.
            Nothing is blocked; adjust a tree count if that is wrong.
          </BannerDescription>
        </Banner>
      ) : null}

      <DetailColumns
        className="mt-8"
        main={
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Budget</CardTitle>
              </div>
              <Button
                variant="secondary"
                size="sm"
                render={<Link href={`/sites/${id}/budget`} />}
              >
                <PencilIcon />
                Edit budget
              </Button>
            </CardHeader>
            <CardContent>
              {budget === null || site === null ? (
                <Skeleton className="h-4 w-3/4" />
              ) : perTree === null ? (
                <p className="text-body text-text-secondary">
                  Budget not set. Nothing has been entered for this site yet.
                </p>
              ) : (
                <>
                  <p className="text-page-title font-medium tabular-nums text-text-primary">
                    {formatCurrency(siteBudget)}
                  </p>
                  {/* Section 3: every budget figure states its basis. */}
                  <p className="mt-1 text-label text-text-secondary">
                    {formatCurrency(perTree)} per tree ×{" "}
                    {formatNumber(site.plannedTrees)} trees, across all five
                    periods
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        }
        aside={
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailFieldList className="sm:grid-cols-1">
                <DetailField label="Project">
                  {!site ? (
                    <Skeleton className="h-4 w-3/4" />
                  ) : site.projectId ? (
                    <Link
                      href={`/projects/${site.projectId}`}
                      className="text-primary hover:text-primary-hover"
                    >
                      {site.projectName}
                    </Link>
                  ) : (
                    // A dash, as Location does below. The field stays
                    // rather than disappearing: a row that vanishes for
                    // some sites makes the summary a different shape
                    // per record.
                    "—"
                  )}
                </DetailField>
                <DetailField label="Location">
                  {site ? (site.locationName ?? "—") : <Skeleton className="h-4 w-1/2" />}
                </DetailField>
                <DetailField label="Trees">
                  {site ? formatNumber(site.plannedTrees) : <Skeleton className="h-4 w-1/2" />}
                </DetailField>
                <DetailField label="Plantation started">
                  {site ? formatDate(site.plantationStartDate) : <Skeleton className="h-4 w-2/3" />}
                </DetailField>
                <DetailField label="Plantation completed">
                  {site ? (
                    site.plantationCompleteDate ? (
                      formatDate(site.plantationCompleteDate)
                    ) : (
                      <span className="font-normal text-text-secondary">
                        Not yet recorded
                      </span>
                    )
                  ) : (
                    <Skeleton className="h-4 w-2/3" />
                  )}
                </DetailField>
                {/*
                  WHICH DATE THE PERIODS ARE MEASURED FROM, said out
                  loud. Client instruction, 7 Sep 2026: the complete
                  date anchors them, with the start date as her own
                  stated fallback until it exists.

                  Two sites can put the same expense date in different
                  periods, and without this the reason is invisible —
                  somebody would have to know the rule AND know which
                  of the two dates this site has. Section 19 is the
                  same argument: if the only way to learn something is
                  to already know it, nobody learns it.
                */}
                <DetailField label="Budget periods run from">
                  {site ? (
                    <>
                      {formatDate(periodAnchor(site).date)}
                      <span className="mt-0.5 block text-meta font-normal text-text-muted">
                        the {anchorLabel(periodAnchor(site).source)}
                        {periodAnchor(site).source === "start"
                          ? " — until a complete date is recorded"
                          : ""}
                      </span>
                    </>
                  ) : (
                    <Skeleton className="h-4 w-2/3" />
                  )}
                </DetailField>
                <DetailField label="Site manager">
                  {site ? (site.managerName ?? "—") : <Skeleton className="h-4 w-2/3" />}
                </DetailField>
                <DetailField label="Site supervisor">
                  {site ? (site.supervisorName ?? "—") : <Skeleton className="h-4 w-2/3" />}
                </DetailField>
              </DetailFieldList>
            </CardContent>
          </Card>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          // replace, not push: flipping a tab is not a place the back
          // button should have to walk through one step at a time.
          // scroll: false keeps the page where the user left it.
          router.replace(`/sites/${id}?tab=${String(value)}`, { scroll: false })
        }}
        className="mt-8"
      >
        {/* Sibling tabs are styled and behave identically: if one
            carries a count badge, they all do. */}
        <TabsList>
          <TabsTrigger value="expenses">
            Expenses
            <Badge variant="neutral">{formatNumber(expenseTotal)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="variance">
            Variance
            <Badge variant="neutral">{formatNumber(varianceRows)}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Expenses</CardTitle>
                {spent !== null ? (
                  <p className="text-meta text-text-muted">
                    {formatCurrency(spent)} total
                  </p>
                ) : null}
              </div>
              <Button
                variant="secondary"
                size="sm"
                render={<Link href={`/expenses/new?siteId=${id}`} />}
              >
                <PlusIcon />
                New expense
              </Button>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {/*
                The SAME list machinery `/expenses` uses (section 1 rule
                4) — `RecordList` in embedded mode (no page header, no
                page-owned data-area scroller: see that prop's doc
                comment for why). The Site column is dropped: every row
                on this screen already IS this site, so repeating its
                name in every row would say nothing a screen full of
                identical values doesn't already say.

                `load` closes over `id`, so `siteId` rides along on
                every page fetch AND on the export's own paging calls —
                the export can never silently widen to every site's
                expenses under this site's heading.
              */}
              <RecordList<Expense>
                embedded
                title="Expenses"
                countLabel={(total) =>
                  `${formatNumber(total)} ${total === 1 ? "expense" : "expenses"}`
                }
                searchLabel="Search expenses"
                searchPlaceholder="Search expenses"
                defaultSort="spentOn"
                defaultDirection="desc"
                listState={siteExpenseListState}
                onListStateChange={setSiteExpenseListState}
                toolbarExtra={
                  <ExpenseFilterButton
                    filters={siteExpenseListState.filters as ExpenseFilterValues}
                    onApply={(next) =>
                      setSiteExpenseListState((s) => ({ ...s, filters: next, page: 1 }))
                    }
                  />
                }
                renderFilterChips={(applied) =>
                  expenseFilterChips(
                    applied,
                    (next) =>
                      setSiteExpenseListState((s) => ({ ...s, filters: next, page: 1 })),
                    siteExpenseListState.filters as ExpenseFilterValues,
                  )
                }
                describeFilters={expenseFilterLabels}
                columns={SITE_EXPENSE_COLUMNS}
                rowHref={(row) => `/expenses/${row.id}/edit`}
                load={siteExpensesLoad}
                onResult={({ total, aggregates }) => {
                  setExpenseTotal(total)
                  setExpenseAmountPaise(aggregates?.amountPaise ?? null)
                }}
                emptyHeading="No expenses yet"
                emptyBody="Expenses are booked against a cost head and a budget period."
                emptyActionLabel="New expense"
                emptyActionHref={`/expenses/new?siteId=${id}`}
                exportPdf={{
                  title: site ? `${site.name} — Expenses` : "Expenses",
                  columns: SITE_EXPENSE_PDF_COLUMNS,
                  buildTotalRow: (_rows, aggregates): PdfTotalRow | undefined =>
                    aggregates
                      ? {
                          cells: [
                            "",
                            "",
                            "",
                            "",
                            "Total for all matching expenses",
                            formatAmount(aggregates.amountPaise),
                          ],
                        }
                      : undefined,
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/*
          keepMounted so the tab's count badge is right before anybody
          opens it. Its sibling's badge is always accurate — a peer
          reading 0 until clicked would be worse than no badge at all.
        */}
        <TabsContent value="variance" keepMounted>
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Variance by cost head and year</CardTitle>
                {site ? (
                  <PrintHeader
                    title={`${site.name} — Variance by cost head and year`}
                  />
                ) : null}
                {/*
                  Section 3: every budget figure states its basis, and
                  with five periods the basis names the period too —
                  which here is the column the figure sits in. Stated
                  once for the table rather than nineteen times.
                */}
                {site ? (
                  <p className="mt-1 text-meta text-text-muted">
                    Budgets are the per-tree amount ×{" "}
                    {formatNumber(site.plannedTrees)} trees, per period.
                    Tree counts are live — change one and these move.
                  </p>
                ) : null}
              </div>
              <ExportButton
                title={
                  site
                    ? `${site.name} — Variance by cost head and year — ${measureLabel(varianceMeasure)}`
                    : `Variance by cost head and year — ${measureLabel(varianceMeasure)}`
                }
                contextDescription={site ? `Site: ${site.name}` : undefined}
                columns={varianceExportColumns(varianceMeasure)}
                fetchPage={varianceFetchPage}
                buildTotalRow={varianceTotalRow}
              />
            </CardHeader>
            {/*
              `overflow-x-auto` because this host cannot scroll and the
              grid is wider than it.

              On /reports the grid sits in the list page's data area,
              which scrolls both axes, so the seven columns are
              reachable at 1024 and 768. Here it sits in a Card, and
              Card is `overflow-hidden` — so at 768 the table stayed
              960px wide inside a 709px box and the Total column was
              simply cut off at 985px with no way to reach it. Section
              34.3's frozen first column was present and useless:
              nothing to freeze against.

              Section 1 rule 8 permits this — the page scrolls
              vertically, this scrolls horizontally, and two different
              axes never compete for the same gesture.

              The trade: on THIS screen the sticky header and total row
              resolve against this container rather than the page, so
              they do not pin as they do on /reports. Reachable content
              beats a pinned total; if both are wanted, the tab needs a
              height-constrained data area of its own, which is a
              section 30 question rather than a class name.
            */}
            <CardContent className="overflow-x-auto p-0">
              {/* The SAME component Report 2 uses, scoped to this site
                  instead of to a project. Not a second version. */}
              <HeadPeriodGrid
                siteId={id}
                onRowCount={setVarianceRows}
                measure={varianceMeasure}
                onMeasureChange={setVarianceMeasure}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {site ? (
        <DeleteRecordDialog
          open={deleting}
          onOpenChange={setDeleting}
          recordName={site.name}
          what="site"
          consequences={
            <>
              This will also remove the site&rsquo;s budget
              {budget && budget.cells.length > 0
                ? ` (${formatNumber(budget.cells.length)} budgeted cells)`
                : ""}
              . Expenses booked against it are not deleted, and the site cannot
              be removed while any exist.
            </>
          }
          onConfirm={() => api.delete(`/sites/${id}`)}
          onDeleted={() => router.push("/sites")}
        />
      ) : null}
    </PageScroller>
  )
}
