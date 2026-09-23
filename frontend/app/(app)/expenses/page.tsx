"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { api, query, type Expense, type ListResponse, type Matchable } from "@/lib/api"
import { formatAmount, formatDate, formatNumber } from "@/lib/format"
import { paiseToRupeeInput } from "@/lib/money"
import { periodLabel } from "@/lib/periods"
import { Truncate } from "@/components/ui/truncate"
import type { ExportColumn, PdfTotalRow } from "@/lib/pdf-export"
import {
  RecordList,
  type ListState,
  type RecordColumn,
} from "@/components/templates/record-list"
import {
  ExpenseFilterButton,
  expenseFilterChips,
  expenseFilterLabels,
  type ExpenseFilterValues,
} from "@/components/forms/expense-filter"

/** Section 11.1. The list template, with data. */
const COLUMNS: RecordColumn<Expense>[] = [
  {
    key: "spentOn",
    label: "Date",
    numeric: true,
    sortKey: "spentOn",
    width: "tight",
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
    priority: "secondary",
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

/**
 * Mirrors COLUMNS above, same order, same headers, same formatted
 * strings — a PDF formatted differently from the screen is a bug.
 */
const PDF_COLUMNS: ExportColumn<Expense>[] = [
  {
    header: "Date",
    cell: (row) => formatDate(row.spentOn),
    // Excel: a real date cell, not the "dd/MM/yy" display STRING —
    // `lib/excel-export.ts` applies the dd/mm/yy number format so the
    // column still reads the same but sorts and filters as a date.
    excelValue: (row) => new Date(row.spentOn),
  },
  { header: "Site", cell: (row) => row.siteName },
  { header: "Cost head", cell: (row) => row.costHeadName },
  { header: "Period", cell: (row) => periodLabel(row.period) },
  {
    header: "Description",
    cell: (row) => row.description ?? "—",
    // Section 31.2's "empty is not zero" applies to text too: the Excel
    // cell must be truly empty, not the on-screen "—" placeholder,
    // which would defeat blank-cell filtering in a spreadsheet.
    excelValue: (row) => row.description ?? null,
  },
  {
    header: "Bill no.",
    cell: (row) => row.billNumber ?? "—",
    // A free-text reference (Postgres `text`, not an integer column), so
    // it stays a TEXT cell unless this specific value is a plain,
    // leading-zero-free integer — see `excelNumericSafe` in
    // lib/pdf-export.tsx. Never a blanket string->number conversion:
    // "007" and "INV/2026/001" must survive exactly as typed.
    excelValue: (row) => row.billNumber ?? null,
    excelNumericSafe: true,
  },
  {
    header: "Amount",
    cell: (row) => formatAmount(row.amountPaise),
    numeric: true,
    // Excel: a real number, in rupees, so it sums and sorts —
    // formatAmount's "1,49,162.00" is Indian-grouped text, not a number.
    // paiseToRupeeInput does the paise->rupees conversion by string
    // manipulation (lib/money.ts), never through Number()/float
    // multiplication; Number() on THAT exact decimal string is the only
    // conversion to a JS number, so no precision is lost beyond the
    // rounding any IEEE-754 spreadsheet cell already carries.
    excelValue: (row) => {
      const text = paiseToRupeeInput(row.amountPaise)
      return text === "" ? null : Number(text)
    },
  },
]

/**
 * Section 27.3: "filters, search and sort persist when the user opens a
 * record and comes back." The URL is the mechanism — the same one
 * `app/(app)/reports/page.tsx` already uses for its `?view=` tab — so
 * this needs `useSearchParams`, which requires the Suspense boundary
 * below (mirroring that page's own `<Reports />`/`<ReportsPage />` split).
 */
const FILTER_KEYS = ["spentOnFrom", "spentOnTo", "amountMin", "amountMax"] as const

function readListStateFromParams(params: URLSearchParams): ListState {
  const filters: Record<string, string | undefined> = {}
  for (const key of FILTER_KEYS) {
    const value = params.get(key)
    if (value) filters[key] = value
  }
  return {
    search: params.get("q") ?? "",
    sort: params.get("sort") ?? "spentOn",
    direction: params.get("dir") === "asc" ? "asc" : "desc",
    page: Number(params.get("page") ?? "1") || 1,
    filters,
  }
}

function writeListStateToParams(state: ListState): string {
  const params = new URLSearchParams()
  if (state.search) params.set("q", state.search)
  if (state.sort && state.sort !== "spentOn") params.set("sort", state.sort)
  if (state.direction !== "desc") params.set("dir", state.direction)
  if (state.page !== 1) params.set("page", String(state.page))
  for (const key of FILTER_KEYS) {
    const value = state.filters[key]
    if (value) params.set(key, value)
  }
  const text = params.toString()
  return text ? `?${text}` : ""
}

export default function ExpensesPage() {
  return (
    <React.Suspense fallback={null}>
      <ExpensesList />
    </React.Suspense>
  )
}

function ExpensesList() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read once on mount — after that this component owns the state and
  // pushes IT to the URL, rather than re-reading the URL on every
  // render (which would fight the user's typing).
  const [listState, setListState] = React.useState<ListState>(() =>
    readListStateFromParams(searchParams),
  )

  React.useEffect(() => {
    router.replace(`/expenses${writeListStateToParams(listState)}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listState])

  const load = React.useCallback(
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
    [],
  )

  const filterValues: ExpenseFilterValues = listState.filters

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
      listState={listState}
      onListStateChange={setListState}
      toolbarExtra={
        <ExpenseFilterButton
          filters={filterValues}
          onApply={(next) => setListState((s) => ({ ...s, filters: next, page: 1 }))}
        />
      }
      renderFilterChips={(applied) =>
        expenseFilterChips(
          applied,
          (next) => setListState((s) => ({ ...s, filters: next, page: 1 })),
          filterValues,
        )
      }
      describeFilters={expenseFilterLabels}
      exportPdf={{
        title: "Expenses",
        columns: PDF_COLUMNS,
        buildTotalRow: (_rows, aggregates): PdfTotalRow | undefined =>
          aggregates
            ? {
                cells: [
                  "",
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
      printTitle="Expenses"
      columns={COLUMNS}
      rowHref={(row) => `/expenses/${row.id}/edit`}
      load={load}
      emptyHeading="No expenses yet"
      emptyBody="An expense is booked against a site, a cost head and a budget period."
      metaTotal={(aggregates) => `Total ${formatAmount(aggregates.amountPaise)}`}
    />
  )
}
