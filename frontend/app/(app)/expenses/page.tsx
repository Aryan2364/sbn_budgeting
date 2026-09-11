"use client"

import * as React from "react"

import { api, query, type Expense, type ListResponse, type Matchable } from "@/lib/api"
import { formatAmount, formatDate, formatNumber } from "@/lib/format"
import { periodLabel } from "@/lib/periods"
import { Truncate } from "@/components/ui/truncate"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"

/** Section 11.1. The list template, with data. */
const COLUMNS: RecordColumn<Expense>[] = [
  {
    key: "spentOn",
    label: "Date",
    numeric: true,
    sortKey: "spentOn",
    render: (row) => formatDate(row.spentOn),
  },
  {
    key: "siteName",
    label: "Site",
    sortKey: "siteName",
    render: (row) => <Truncate className="font-medium">{row.siteName}</Truncate>,
  },
  {
    key: "costHeadName",
    label: "Cost head",
    sortKey: "costHeadName",
    priority: "tertiary",
    render: (row) => <Truncate>{row.costHeadName}</Truncate>,
  },
  {
    key: "period",
    label: "Period",
    sortKey: "period",
    priority: "secondary",
    render: (row) => periodLabel(row.period),
  },
  {
    key: "billNumber",
    label: "Bill no.",
    priority: "secondary",
    render: (row) => <Truncate>{row.billNumber ?? "—"}</Truncate>,
  },
  {
    key: "amountPaise",
    label: "Amount",
    numeric: true,
    sortKey: "amountPaise",
    render: (row) => formatAmount(row.amountPaise),
  },
]

export default function ExpensesPage() {
  const load = React.useCallback(
    ({ page, search, sort, direction }: {
      page: number; search: string; sort: string; direction: "asc" | "desc"
    }) =>
      api.get<ListResponse<Expense & Matchable>>(
        `/expenses${query({ page, search, sort, direction })}`,
      ),
    [],
  )

  return (
    <RecordList
      title="Expenses"
      countLabel={(total) =>
        `${formatNumber(total)} ${total === 1 ? "expense" : "expenses"}`
      }
      searchLabel="Search expenses"
      searchPlaceholder="Search expenses"
      createHref="/expenses/new"
      createLabel="New expense"
      columns={COLUMNS}
      rowHref={(row) => `/expenses/${row.id}/edit`}
      load={load}
      emptyHeading="No expenses yet"
      emptyBody="An expense is booked against a site, a cost head and a budget period."
    />
  )
}
