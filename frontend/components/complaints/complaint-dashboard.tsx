"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { formatNumber } from "@/lib/format"
import { complaintsApi, type ComplaintSummary } from "@/lib/complaints-api"
import { errorMessage } from "@/components/shell/session"
import { CategoryBarChart } from "@/components/ui/bar-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardPanels, MetricTile, MetricTileRow } from "@/components/templates/dashboard-page"
import { PageHeader, PageScroller } from "@/components/templates/page"
import { STATUS_META } from "@/components/complaints/status"

/**
 * `/complaints/dashboard` — section 11.4, read-only, from
 * `GET /complaints/summary`, which covers only what the viewer can see.
 *
 *   1. tiles     open, in progress, awaiting approval, closed (with how
 *                many closed in the last 7 days); each links to the list
 *                that explains its number
 *   2. main      open and closed by location (the brand and ochre, 21:
 *                positions 1 and 2, direct labels, zero baseline)
 *   3. panels    by category, and how long the open ones have waited
 *
 * The charts are `CategoryBarChart`, which carries every section 21 rule;
 * this screen names series and never a colour. Each chart also has a
 * screen-reader table of the same numbers, so identity and value never
 * depend on colour or on seeing the bars.
 */

/** 6 series is the chart's limit; 12 categories keeps a panel readable. */
const MAX_ROWS = 12

type Row = { name: string; open: number; closed: number }

/** The biggest first, and past MAX_ROWS the rest fold into "Other" (21 rule 1). */
function fold(rows: Row[]): Row[] {
  const sorted = [...rows].sort((a, b) => b.open + b.closed - (a.open + a.closed))
  if (sorted.length <= MAX_ROWS) return sorted
  const head = sorted.slice(0, MAX_ROWS - 1)
  const tail = sorted.slice(MAX_ROWS - 1)
  return [
    ...head,
    {
      name: `Other (${tail.length})`,
      open: tail.reduce((n, r) => n + r.open, 0),
      closed: tail.reduce((n, r) => n + r.closed, 0),
    },
  ]
}

const OPEN_CLOSED = [
  { label: "Open", value: (r: Row) => r.open, format: (r: Row) => formatNumber(r.open) },
  { label: "Closed", value: (r: Row) => r.closed, format: (r: Row) => formatNumber(r.closed) },
]

export function ComplaintDashboard() {
  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState<{
    attempt: number
    summary: ComplaintSummary | null
    error: string | null
  }>({ attempt: -1, summary: null, error: null })

  React.useEffect(() => {
    let cancelled = false
    complaintsApi
      .summary()
      .then((summary) => {
        if (!cancelled) setState({ attempt, summary, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState({ attempt, summary: null, error: errorMessage(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const settled = state.attempt === attempt
  const summary = settled ? state.summary : null

  return (
    <PageScroller className="max-sm:[&>div]:px-4">
      <PageHeader title="Complaints dashboard" meta="Complaints sent to you, or that you can see" />

      {settled && state.error ? (
        <EmptyState
          variant="failed"
          heading="The dashboard could not be loaded"
          onAction={() => setAttempt((a) => a + 1)}
          className="mt-8"
        >
          {state.error}
        </EmptyState>
      ) : !summary ? (
        <DashboardSkeleton />
      ) : (
        <DashboardBody summary={summary} />
      )}
    </PageScroller>
  )
}

function DashboardBody({ summary }: { summary: ComplaintSummary }) {
  const router = useRouter()
  const byLocation = fold(
    summary.byLocation.map((r) => ({ name: r.location.name, open: r.open, closed: r.closed })),
  )
  const byCategory = fold(
    summary.byCategory.map((r) => ({ name: r.category.name, open: r.open, closed: r.closed })),
  )
  const ageing = [
    { name: "0 to 2 days", value: summary.openAgeing.d0_2 },
    { name: "3 to 7 days", value: summary.openAgeing.d3_7 },
    { name: "8 to 14 days", value: summary.openAgeing.d8_14 },
    { name: "15 days or more", value: summary.openAgeing.d15plus },
  ]
  const total = Object.values(summary.byStatus).reduce((n, v) => n + v, 0)

  if (total === 0) {
    return (
      <EmptyState
        variant="nothing-yet"
        heading="No complaints yet"
        actionLabel="Raise complaint"
        onAction={() => router.push("/complaints/new")}
        className="mt-8"
      >
        Once complaints are raised at your locations, their numbers appear here.
      </EmptyState>
    )
  }

  const list = (status: string) => `/complaints?tab=all&status=${status}`

  return (
    <div className="mt-8 flex flex-col gap-6">
      <MetricTileRow>
        <MetricTile
          label={STATUS_META.open.label}
          period="Right now"
          value={formatNumber(summary.byStatus.open)}
          href={list("open")}
        />
        <MetricTile
          label={STATUS_META.in_progress.label}
          period="Right now"
          value={formatNumber(summary.byStatus.in_progress)}
          href={list("in_progress")}
        />
        <MetricTile
          label={STATUS_META.awaiting_approval.label}
          period="Right now"
          value={formatNumber(summary.byStatus.awaiting_approval)}
          href={list("awaiting_approval")}
        />
        <MetricTile
          label="Closed"
          period="All time"
          value={formatNumber(summary.byStatus.closed)}
          change={`${formatNumber(summary.closedLast7Days)} in the last 7 days`}
          href={list("closed")}
        />
      </MetricTileRow>

      <ChartCard
        title="By location"
        description="Open counts every complaint not yet closed. All time."
        rows={byLocation}
        empty="No complaints at any location yet."
      />

      <DashboardPanels>
        <ChartCard
          title="By category"
          description="Open and closed, all time."
          rows={byCategory}
          empty="No complaints in any category yet."
        />
        <Card>
          <CardHeader>
            <CardTitle>How long open complaints have waited</CardTitle>
            <CardDescription>Since they were raised. Right now.</CardDescription>
          </CardHeader>
          <CardContent>
            {ageing.every((a) => a.value === 0) ? (
              <p className="text-body text-text-secondary">Nothing is open right now.</p>
            ) : (
              <>
                <CategoryBarChart
                  data={ageing}
                  category={(r) => r.name}
                  series={[
                    {
                      label: "Open complaints",
                      value: (r) => r.value,
                      format: (r) => formatNumber(r.value),
                    },
                  ]}
                  aria-hidden="true"
                />
                <table className="sr-only">
                  <caption>Open complaints by how long they have waited</caption>
                  <thead>
                    <tr>
                      <th scope="col">Waited</th>
                      <th scope="col">Open complaints</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ageing.map((a) => (
                      <tr key={a.name}>
                        <th scope="row">{a.name}</th>
                        <td>{formatNumber(a.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </CardContent>
        </Card>
      </DashboardPanels>
    </div>
  )
}

function ChartCard({
  title,
  description,
  rows,
  empty,
}: {
  title: string
  description: string
  rows: Row[]
  empty: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-text-secondary">{empty}</p>
        ) : (
          <>
            <CategoryBarChart data={rows} category={(r) => r.name} series={OPEN_CLOSED} aria-hidden="true" />
            <table className="sr-only">
              <caption>{title}</caption>
              <thead>
                <tr>
                  <th scope="col">{title.replace(/^By /, "")}</th>
                  <th scope="col">Open</th>
                  <th scope="col">Closed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <th scope="row">{r.name}</th>
                    <td>{formatNumber(r.open)}</td>
                    <td>{formatNumber(r.closed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="mt-8 flex flex-col gap-6" aria-hidden="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="block h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="block h-72 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="block h-64 w-full rounded-xl" />
        <Skeleton className="block h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
