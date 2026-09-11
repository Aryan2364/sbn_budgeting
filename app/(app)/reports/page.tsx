"use client"

import * as React from "react"

import { api, query } from "@/lib/api"
import type { ListResponse, Matchable, VarianceRow } from "@/lib/api"
import { formatAmount, formatNumber } from "@/lib/format"
import { Truncate } from "@/components/ui/truncate"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"
import {
  BudgetFigure,
  VarianceFigure,
  VariancePercentFigure,
} from "@/components/forms/variance-figures"

/**
 * Screen 1 of the variance report. Section 11.1's list page, and the
 * plan's locked report shape: a site list first, each row drilling
 * into that site's head-wise Variance tab.
 *
 * NO PRIMARY ACTION — this screen is read-only, so the header carries
 * the title and the record count and nothing else.
 *
 * ALL-TIME, with no filter of any kind (question 8). No date range, no
 * period selector, no filter panel. The period selector belongs on the
 * site detail Variance tab and only there.
 *
 * Every figure comes from the one variance definition written in
 * Phase 3 — `GET /reports/variance` reads the `variance` view at the
 * 'site' grain. Nothing on this screen adds two amounts together.
 */

/** What the list template needs on a row, and what the API sends. */
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

export default function ReportsPage() {
  /**
   * The variance endpoint predates the shared list convention's
   * response shape and answers with `{ data, total, page, pageSize }`.
   * The template needs `totalPages` for its page controls and a
   * `matchedField` per row for section 27.1. Both are derived here
   * rather than by widening the API, because the missing pieces are
   * presentation: the API already sent everything it knows.
   *
   * `matchedField` is null throughout on purpose. The endpoint's
   * search covers the site name and the project name, and both are
   * already columns on this table — there is no field the user could
   * match on that they cannot see, so there is nothing to say about
   * where the match landed.
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
      columns={COLUMNS}
      /*
       * Section 27.2 and the plan's locked report shape: variance
       * ASCENDING, worst first, so the most overspent site is on
       * screen without anyone touching a control. The API sorts
       * NULLS LAST in both directions, so a site with no budget at
       * all sits at the bottom rather than posing as the worst.
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
