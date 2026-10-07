"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { formatNumber } from "@/lib/format"
import { complaintsApi, type ComplaintSummary } from "@/lib/complaints-api"
import { CategoryBarChart } from "@/components/ui/bar-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardPanels, MetricTile, MetricTileRow } from "@/components/templates/dashboard-page"
import { PageHeader, PageScroller } from "@/components/templates/page"
import { STATUS_META } from "@/components/complaints/status"
import { GU_COMMON, GU_STATUS, guError } from "@/components/complaints/gu"

/**
 * `/complaints/dashboard` — section 11.4, read-only, from
 * `GET /complaints/summary`, which covers only what the viewer can see.
 *
 *   1. tiles     open, in progress, closed (with how many closed in
 *                the last 7 days); each links to the list that explains
 *                its number
 *   2. main      open and closed by site (the brand and ochre, 21:
 *                positions 1 and 2, direct labels, zero baseline)
 *   3. panels    by category, and how long the open ones have waited
 *
 * The charts are `CategoryBarChart`, which carries every section 21 rule;
 * this screen names series and never a colour. Each chart also has a
 * screen-reader table of the same numbers, so identity and value never
 * depend on colour or on seeing the bars.
 *
 * In Gujarati (owner, 7 Oct 2026). The bucket of complaints raised before
 * sites is recognised by its null id and named here, not by the server.
 */

const GU = {
  title: "ફરિયાદ ડેશબોર્ડ",
  meta: "તમને મોકલાયેલી, અથવા તમે જોઈ શકો તે ફરિયાદો",
  loadFailed: "ડેશબોર્ડ ખૂલી શક્યું નથી",
  empty: "હજી કોઈ ફરિયાદ નથી",
  emptyBody: "તમારી સાઇટ્સ પર ફરિયાદો નોંધાશે ત્યારે તેના આંકડા અહીં દેખાશે.",
  rightNow: "અત્યારે",
  allTime: "શરૂઆતથી અત્યાર સુધી",
  lastWeek: (n: string) => `છેલ્લા 7 દિવસમાં ${n}`,
  bySite: "સાઇટ પ્રમાણે",
  bySiteColumn: "સાઇટ",
  bySiteNote: "બંધ ન થઈ હોય તે દરેક ફરિયાદ ખુલ્લી ગણાય છે. શરૂઆતથી અત્યાર સુધી.",
  bySiteEmpty: "હજી કોઈ સાઇટ પર ફરિયાદ નથી.",
  olderBucket: "સાઇટ વગરની (જૂની ફરિયાદો)",
  byCategory: "ફરિયાદના પ્રકાર પ્રમાણે",
  byCategoryColumn: "ફરિયાદનો પ્રકાર",
  byCategoryNote: "ખુલ્લી અને બંધ, શરૂઆતથી અત્યાર સુધી.",
  byCategoryEmpty: "હજી કોઈ પ્રકારમાં ફરિયાદ નથી.",
  ageingTitle: "ખુલ્લી ફરિયાદો કેટલા દિવસથી રાહ જુએ છે",
  ageingNote: "નોંધાઈ ત્યારથી. અત્યારે.",
  nothingOpen: "અત્યારે કોઈ ફરિયાદ ખુલ્લી નથી.",
  openComplaints: "ખુલ્લી ફરિયાદો",
  ageingCaption: "ખુલ્લી ફરિયાદો, કેટલા દિવસથી રાહ જુએ છે તે પ્રમાણે",
  waited: "રાહ",
  buckets: ["0 થી 2 દિવસ", "3 થી 7 દિવસ", "8 થી 14 દિવસ", "15 કે વધુ દિવસ"] as const,
  other: (n: number) => `અન્ય (${formatNumber(n)})`,
}

/** 6 series is the chart's limit; 12 categories keeps a panel readable. */
const MAX_ROWS = 12

type Row = { name: string; open: number; closed: number }

/** The biggest first, and past MAX_ROWS the rest fold into "Other" (21 rule 1). */
function fold(rows: Row[], max = MAX_ROWS): Row[] {
  const sorted = [...rows].sort((a, b) => b.open + b.closed - (a.open + a.closed))
  if (sorted.length <= max) return sorted
  const head = sorted.slice(0, max - 1)
  const tail = sorted.slice(max - 1)
  return [
    ...head,
    {
      name: GU.other(tail.length),
      open: tail.reduce((n, r) => n + r.open, 0),
      closed: tail.reduce((n, r) => n + r.closed, 0),
    },
  ]
}

const OPEN_CLOSED = [
  { label: GU_STATUS.open, value: (r: Row) => r.open, format: (r: Row) => formatNumber(r.open) },
  { label: GU_STATUS.closed, value: (r: Row) => r.closed, format: (r: Row) => formatNumber(r.closed) },
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
        if (!cancelled) setState({ attempt, summary: null, error: guError(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const settled = state.attempt === attempt
  const summary = settled ? state.summary : null

  return (
    <PageScroller className="max-sm:[&>div]:px-4">
      <PageHeader title={GU.title} meta={GU.meta} />

      {settled && state.error ? (
        <EmptyState
          variant="failed"
          heading={GU.loadFailed}
          actionLabel={GU_COMMON.tryAgain}
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
  // Complaints raised before sites share one bucket with no site id
  // (CONTRACT §10). It is not a site: it never folds into "Other", is
  // never ranked among the sites, and always comes last.
  const older = summary.bySite.find((r) => r.site.id === null)
  const bySite = [
    ...fold(
      summary.bySite
        .filter((r) => r.site.id !== null)
        .map((r) => ({ name: r.site.name, open: r.open, closed: r.closed })),
      older ? MAX_ROWS - 1 : MAX_ROWS,
    ),
    ...(older ? [{ name: GU.olderBucket, open: older.open, closed: older.closed }] : []),
  ]
  const byCategory = fold(
    summary.byCategory.map((r) => ({ name: r.category.name, open: r.open, closed: r.closed })),
  )
  const ageing = [
    { name: GU.buckets[0], value: summary.openAgeing.d0_2 },
    { name: GU.buckets[1], value: summary.openAgeing.d3_7 },
    { name: GU.buckets[2], value: summary.openAgeing.d8_14 },
    { name: GU.buckets[3], value: summary.openAgeing.d15plus },
  ]
  const total = Object.values(summary.byStatus).reduce((n, v) => n + v, 0)

  if (total === 0) {
    return (
      <EmptyState
        variant="nothing-yet"
        heading={GU.empty}
        actionLabel={GU_COMMON.raise}
        onAction={() => router.push("/complaints/new")}
        className="mt-8"
      >
        {GU.emptyBody}
      </EmptyState>
    )
  }

  const list = (status: string) => `/complaints?tab=all&status=${status}`

  return (
    <div className="mt-8 flex flex-col gap-6">
      <MetricTileRow className="sm:grid-cols-3 lg:grid-cols-3">
        <MetricTile
          label={STATUS_META.open.label}
          period={GU.rightNow}
          value={formatNumber(summary.byStatus.open)}
          href={list("open")}
        />
        <MetricTile
          label={STATUS_META.in_progress.label}
          period={GU.rightNow}
          value={formatNumber(summary.byStatus.in_progress)}
          href={list("in_progress")}
        />
        <MetricTile
          label={STATUS_META.closed.label}
          period={GU.allTime}
          value={formatNumber(summary.byStatus.closed)}
          change={GU.lastWeek(formatNumber(summary.closedLast7Days))}
          href={list("closed")}
        />
      </MetricTileRow>

      <ChartCard
        title={GU.bySite}
        column={GU.bySiteColumn}
        description={GU.bySiteNote}
        rows={bySite}
        empty={GU.bySiteEmpty}
      />

      <DashboardPanels>
        <ChartCard
          title={GU.byCategory}
          column={GU.byCategoryColumn}
          description={GU.byCategoryNote}
          rows={byCategory}
          empty={GU.byCategoryEmpty}
        />
        <Card>
          <CardHeader>
            <CardTitle>{GU.ageingTitle}</CardTitle>
            <CardDescription>{GU.ageingNote}</CardDescription>
          </CardHeader>
          <CardContent>
            {ageing.every((a) => a.value === 0) ? (
              <p className="text-body text-text-secondary">{GU.nothingOpen}</p>
            ) : (
              <>
                <CategoryBarChart
                  data={ageing}
                  category={(r) => r.name}
                  series={[
                    {
                      label: GU.openComplaints,
                      value: (r) => r.value,
                      format: (r) => formatNumber(r.value),
                    },
                  ]}
                  aria-hidden="true"
                />
                <table className="sr-only">
                  <caption>{GU.ageingCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{GU.waited}</th>
                      <th scope="col">{GU.openComplaints}</th>
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
  column,
  description,
  rows,
  empty,
}: {
  title: string
  /** The screen-reader table's first column: what each row is. */
  column: string
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
                  <th scope="col">{column}</th>
                  <th scope="col">{GU_STATUS.open}</th>
                  <th scope="col">{GU_STATUS.closed}</th>
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
