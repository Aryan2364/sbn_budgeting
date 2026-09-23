"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon } from "lucide-react"

import {
  api,
  ApiError,
  query,
  type DashboardSummary,
  type VarianceRow,
} from "@/lib/api"
import { formatAmount, formatCurrency, formatDate, formatNumber } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { CategoryBarChart } from "@/components/ui/bar-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { PageHeader, PageScroller } from "@/components/templates/page"
import {
  DashboardPanels,
  MetricTile,
  MetricTileRow,
} from "@/components/templates/dashboard-page"

/**
 * Section 11.4. Four tiles, the budget-versus-actual summary, two
 * panels, and then it ends.
 *
 * READ-ONLY. No editing and no forms anywhere on it.
 *
 * **This screen used to be a static server component full of hardcoded
 * `<Skeleton>` elements with no fetch at all**, which is why it sat on
 * skeletons for ever: there was nothing to wait for. The states below
 * exist because a screen that can only render "loading" is a screen
 * that cannot tell you it failed.
 *
 * Every sum is done in SQL by `/reports/variance/summary`. Nothing here
 * adds two amounts together.
 */
/** How many sites zone 2 plots before it says it is showing a subset. */
const CHART_SITES = 6

type Load =
  | { state: "loading" }
  | { state: "failed"; message: string }
  | { state: "ready"; data: DashboardSummary }

export default function DashboardPage() {
  const router = useRouter()
  const [attempt, setAttempt] = React.useState(0)
  const [load, setLoad] = React.useState<Load>({ state: "loading" })
  /**
   * Zone 2's rows: the same `variance` view at the 'site' grain, which
   * is the same definition the summary and the Reports list read.
   * Not a second definition and not a second endpoint — the existing
   * list endpoint, asked for the biggest six.
   *
   * Section 21 caps a chart at six series; six CATEGORIES is a
   * separate judgement, and it is where a horizontal bar chart stops
   * being readable in a dashboard card. The card says so out loud when
   * it is showing fewer sites than exist, rather than silently
   * truncating.
   */
  const [chart, setChart] = React.useState<VarianceRow[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    api
      .get<{ data: VarianceRow[] }>(
        `/reports/variance${query({ pageSize: CHART_SITES, sort: "budget", direction: "desc" })}`,
      )
      .then((response) => {
        if (!cancelled) setChart(response.data)
      })
      // The chart is one card on a read-only page. If it alone fails,
      // the tiles and the panels are still worth showing, so this does
      // not take the whole screen to the failed state.
      .catch(() => {
        if (!cancelled) setChart([])
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  React.useEffect(() => {
    let cancelled = false
    api
      .get<DashboardSummary>("/reports/variance/summary")
      .then((data) => {
        if (!cancelled) setLoad({ state: "ready", data })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoad({
          state: "failed",
          message:
            error instanceof ApiError
              ? error.message
              : "The dashboard could not be loaded.",
        })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  /**
   * Section 13, the "something failed" state, with a Retry.
   *
   * This is the state that was missing. Without it a failed request is
   * indistinguishable from a slow one, for ever.
   */
  if (load.state === "failed") {
    return (
      <PageScroller>
        <PageHeader title="Dashboard" />
        <div className="mt-8 rounded-xl border border-border-light bg-surface">
          <EmptyState
            variant="failed"
            heading="The dashboard could not be loaded"
            onAction={() => {
              setLoad({ state: "loading" })
              setAttempt((a) => a + 1)
            }}
          >
            {load.message} Nothing has changed.
          </EmptyState>
        </div>
      </PageScroller>
    )
  }

  /**
   * Section 13, "nothing yet": what would normally be here, and a
   * primary action to create it. Offered only when there genuinely is
   * nothing — never to somebody whose filter simply matched nothing,
   * which is the mistake section 13 is written to prevent. A dashboard
   * has no filters, so the third state ("nothing found") cannot arise
   * here and is deliberately absent.
   *
   * EMPTY MEANS NO SITES, not no projects. It was `projectCount` until
   * a site stopped needing a project (migration 0007), and that made
   * this screen lie: every tile, the chart and both panels below are
   * built from sites and expenses, so a client with ten sites and no
   * project saw a full Reports screen and a Dashboard insisting there
   * was nothing to report — offering to create the one record type
   * this page does not measure.
   */
  if (load.state === "ready" && load.data.siteCount === 0) {
    return (
      <PageScroller>
        <PageHeader title="Dashboard" />
        <div className="mt-8 rounded-xl border border-border-light bg-surface">
          <EmptyState
            variant="nothing-yet"
            heading="Nothing to report yet"
            actionLabel="New site"
            onAction={() => router.push("/sites/new")}
          >
            A site holds the tree count, the budget and the expenses for one
            location. Create the first site and this fills in.
          </EmptyState>
        </div>
      </PageScroller>
    )
  }

  const data = load.state === "ready" ? load.data : null

  /**
   * Month over month, computed from two figures the API summed in SQL.
   * `null` where there is no previous month to compare against — a
   * change indicator against zero is a meaningless "infinity up".
   *
   * **A REAL ZERO MUST NOT READ AS A FAILURE.** A tile showing ₹0.00
   * under "100.0% on last month" is indistinguishable from one whose
   * request died: both are an empty number and a red-looking drop. It
   * is not a failure — early in a month there is genuinely nothing
   * booked yet, which is the ordinary case for the first few days of
   * every month and was the live state on 7 Sep.
   *
   * So zero gets its own words. The percentage is arithmetically
   * correct and still useless here: "-100%" describes the maths, not
   * what happened.
   */
  const spendChange = (() => {
    if (!data) return null
    const now = BigInt(data.spendThisMonthPaise)
    const before = BigInt(data.spendLastMonthPaise)
    if (now === 0n) {
      return {
        label:
          before === 0n
            ? "Nothing booked yet"
            : `Nothing booked yet · ${formatCurrency(data.spendLastMonthPaise)} last month`,
        direction: undefined,
      }
    }
    if (before === 0n) {
      return { label: "Nothing booked last month", direction: undefined }
    }
    const pct = Number(((now - before) * 1000n) / before) / 10
    return {
      label: `${Math.abs(pct).toFixed(1)}% on last month`,
      direction: now >= before ? ("up" as const) : ("down" as const),
    }
  })()

  return (
    <PageScroller>
      <PageHeader
        title="Dashboard"
        meta="Every figure states the period it covers"
      />

      {/* Zone 1: a row of four. Each links to the list that explains it. */}
      <MetricTileRow className="mt-8">
        <MetricTile
          href="/sites"
          label="Trees planned"
          period="All time"
          value={
            data ? formatNumber(data.plannedTrees) : <Skeleton className="h-8 w-24" />
          }
        />
        <MetricTile
          href="/sites"
          label="Sites"
          period="All time"
          value={data ? formatNumber(data.siteCount) : <Skeleton className="h-8 w-16" />}
        />
        <MetricTile
          href="/expenses"
          label="Spend"
          period="This month"
          value={
            data ? (
              formatCurrency(data.spendThisMonthPaise)
            ) : (
              <Skeleton className="h-8 w-28" />
            )
          }
          change={spendChange?.label}
          direction={spendChange?.direction}
        />
        <MetricTile
          href="/reports"
          label="Sites over budget"
          period="All time"
          value={
            data ? (
              formatNumber(data.sitesOverBudget)
            ) : (
              <Skeleton className="h-8 w-16" />
            )
          }
        />
      </MetricTileRow>

      {/*
        Zone 2. Section 11.4's one full-width chart.

        Recharts arrived for this (rule 10 — asked and agreed), and
        every section 21 decision lives in CategoryBarChart rather than
        here: the categorical palette in order, the six-series cap, the
        zero baseline, direct labels instead of a legend. This card
        chooses its data and its words and nothing else.

        The totals above the chart are the WHOLE estate; the bars are
        the biggest six sites. Different questions, so not the same
        value twice.
      */}
      <Card className="mt-6">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Budget against actual</CardTitle>
            {data && chart && chart.length < data.siteCount ? (
              <p className="mt-1 text-meta text-text-muted">
                The {formatNumber(chart.length)} largest budgets of{" "}
                {formatNumber(data.siteCount)} sites. The full list is on
                the variance report.
              </p>
            ) : null}
          </div>
          <span className="shrink-0 text-meta text-text-muted">All time</span>
        </CardHeader>
        <CardContent>
          {!data || !chart ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              {/* Section 14: the shape of the chart that is coming, so
                  the card does not change height when it lands. */}
              <Skeleton className="mt-4 h-40 w-full" />
            </div>
          ) : data.budgetPaise === null ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-body text-text-secondary">
                Budget not set. No site has a per-tree budget entered yet, so
                there is nothing to compare spend against.
              </p>
              <Button variant="secondary" size="sm" render={<Link href="/sites" />}>
                Set a site budget
              </Button>
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-label text-text-secondary">Budget</dt>
                <dd className="mt-1 text-section font-medium tabular-nums text-text-primary">
                  {formatCurrency(data.budgetPaise)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label text-text-secondary">Actual</dt>
                <dd className="mt-1 text-section font-medium tabular-nums text-text-primary">
                  {formatCurrency(data.actualPaise)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label text-text-secondary">Variance</dt>
                <dd className="mt-1 text-section font-medium tabular-nums text-text-primary">
                  {formatCurrency(data.variancePaise)}
                  {/* Section 7.2 rule 1 and the plan's locked ruling:
                      the direction is a WORD, never colour alone. */}
                  {data.variancePaise !== null ? (
                    <span className="ml-2 align-middle text-label font-normal">
                      {BigInt(data.variancePaise) < 0n ? (
                        <Badge variant="danger">over</Badge>
                      ) : (
                        <Badge variant="neutral">under</Badge>
                      )}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          )}

          {/*
            The bars. Rendered only where there is something to plot:
            a chart of one bar at zero is a worse answer than the
            sentence above it, which already says the budget is not
            set.

            Amounts go in as RUPEES, not paise, and only as a bar
            LENGTH — a pixel measurement, which cannot be anything but
            a number. Every figure a person reads beside a bar is
            formatted from the paise string it came as.
          */}
          {data && data.budgetPaise !== null && chart && chart.length > 0 ? (
            <CategoryBarChart
              className="mt-6"
              data={chart}
              category={(row) => row.siteName}
              series={[
                {
                  label: "Budget",
                  value: (row) =>
                    row.budgetPaise === null
                      ? 0
                      : Number(BigInt(row.budgetPaise) / 100n),
                  format: (row) =>
                    row.budgetPaise === null
                      ? "Budget not set"
                      : formatCurrency(row.budgetPaise),
                },
                {
                  label: "Actual",
                  value: (row) => Number(BigInt(row.actualPaise) / 100n),
                  format: (row) => formatCurrency(row.actualPaise),
                },
              ]}
            />
          ) : null}
        </CardContent>
      </Card>

      {/* Zone 3: two panels. Attention on the left, activity on the right. */}
      <DashboardPanels className="mt-6">
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Sites needing attention</CardTitle>
            </div>
            <span className="shrink-0 text-meta text-text-muted">All time</span>
          </CardHeader>
          <CardContent className="p-0">
            {!data ? (
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : data.attention.length === 0 ? (
              /*
                Not a section 13 empty state. "No site is over budget" is
                good news and a complete answer, and there is nothing to
                create — offering "add your first overspend" would be
                exactly the nonsense section 13 warns about.
              */
              <p className="flex items-center gap-2 p-4 text-body text-text-secondary">
                <CheckIcon aria-hidden="true" className="size-icon text-success" />
                No site is over its budget.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead numeric>Over by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attention.map((row) => (
                    <TableRow
                      key={row.siteId}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ring"
                      onClick={() => router.push(`/sites/${row.siteId}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          router.push(`/sites/${row.siteId}`)
                        }
                      }}
                    >
                      <TableCell>
                        <Truncate>{row.siteName}</Truncate>
                        {/* Dropped entirely, not dashed, where the site
                            has no project. This is a meta line beneath
                            the name rather than a table cell: an em-dash
                            on its own under a site name says a field is
                            missing, and a bare empty span leaves a line
                            of space that makes the rows uneven. */}
                        {row.projectName ? (
                          <span className="mt-0.5 block text-meta text-text-muted">
                            {row.projectName}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell numeric>
                        {row.variancePaise === null
                          ? "—"
                          : formatAmount(
                              (-BigInt(row.variancePaise)).toString(),
                            )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Recent activity</CardTitle>
            </div>
            <span className="shrink-0 text-meta text-text-muted">
              Last 5 expenses
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {!data ? (
              <div className="flex flex-col gap-3 p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : data.recent.length === 0 ? (
              /* Section 13 "nothing yet": here there IS something to
                 create, so the state carries the action. */
              <EmptyState
                variant="nothing-yet"
                heading="No expenses yet"
                actionLabel="New expense"
                onAction={() => router.push("/expenses/new")}
              >
                An expense is booked against a site, a cost head and a budget
                period.
              </EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead numeric>Date</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Cost head
                    </TableHead>
                    <TableHead numeric>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell numeric>{formatDate(row.spentOn)}</TableCell>
                      <TableCell>
                        <Truncate>{row.siteName}</Truncate>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Truncate>{row.costHeadName}</Truncate>
                      </TableCell>
                      <TableCell numeric>{formatAmount(row.amountPaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </DashboardPanels>

      {/* Zone 4. Nothing. Dashboards end. */}
    </PageScroller>
  )
}
