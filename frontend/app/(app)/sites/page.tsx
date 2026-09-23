"use client"

import * as React from "react"

import { api, query, type ListResponse, type Matchable, type Site } from "@/lib/api"
import { formatDate, formatNumber } from "@/lib/format"
import { Truncate } from "@/components/ui/truncate"
import type { ExportColumn } from "@/lib/pdf-export"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"

/**
 * Section 17.1: fixed widths go only to columns with a KNOWN maximum.
 * Site, Project and Location are free text with no bound on length, so
 * they are left undeclared and take the remainder, truncating (section
 * 8). Trees is a short digit-grouped count and Planted is a fixed
 * `DD/MM/YY` date — both bounded the same way the expenses page's Date
 * column is — so both take the `tight` (110px) token.
 */
const COLUMNS: RecordColumn<Site>[] = [
  {
    key: "name",
    label: "Site",
    sortKey: "name",
    render: (row) => <Truncate className="font-medium">{row.name}</Truncate>,
  },
  {
    key: "projectName",
    label: "Project",
    sortKey: "projectName",
    priority: "secondary",
    // A dash, exactly as Location below. A site need not belong to a
    // project, so this cell is empty in the ordinary course and must
    // not read as something left undone.
    render: (row) => <Truncate>{row.projectName ?? "—"}</Truncate>,
  },
  {
    key: "locationName",
    label: "Location",
    sortKey: "locationName",
    priority: "tertiary",
    render: (row) => <Truncate>{row.locationName ?? "—"}</Truncate>,
  },
  {
    key: "plannedTrees",
    label: "Trees",
    numeric: true,
    sortKey: "plannedTrees",
    width: "tight",
    render: (row) => formatNumber(row.plannedTrees),
  },
  {
    key: "plantationStartDate",
    label: "Planted",
    numeric: true,
    sortKey: "plantationStartDate",
    priority: "secondary",
    width: "tight",
    render: (row) => formatDate(row.plantationStartDate),
  },
]

/**
 * Mirrors COLUMNS above, same order, same headers, same formatted
 * strings (AGENTS.md section 17.1 / the expenses page's own comment) —
 * a PDF or spreadsheet formatted differently from the screen is a bug.
 */
const PDF_COLUMNS: ExportColumn<Site>[] = [
  { header: "Site", cell: (row) => row.name },
  {
    header: "Project",
    cell: (row) => row.projectName ?? "—",
    excelValue: (row) => row.projectName ?? null,
  },
  {
    header: "Location",
    cell: (row) => row.locationName ?? "—",
    excelValue: (row) => row.locationName ?? null,
  },
  {
    header: "Trees",
    cell: (row) => formatNumber(row.plannedTrees),
    numeric: true,
    // A real numeric cell, not the Indian-grouped display string.
    excelValue: (row) => row.plannedTrees,
  },
  {
    header: "Planted",
    cell: (row) => formatDate(row.plantationStartDate),
    // A real Excel date cell, not the dd/mm/yy display STRING —
    // lib/excel-export.ts applies the dd/mm/yy number format.
    excelValue: (row) => new Date(row.plantationStartDate),
  },
]

export default function SitesPage() {
  const load = React.useCallback(
    ({ page, search, sort, direction }: {
      page: number; search: string; sort: string; direction: "asc" | "desc"
    }) =>
      api.get<ListResponse<Site & Matchable>>(
        `/sites${query({ page, search, sort, direction })}`,
      ),
    [],
  )

  return (
    <RecordList
      title="Sites"
      countLabel={(total) =>
        `${formatNumber(total)} ${total === 1 ? "site" : "sites"}`
      }
      searchLabel="Search sites"
      searchPlaceholder="Search sites"
      createHref="/sites/new"
      createLabel="New site"
      exportPdf={{
        title: "Sites",
        columns: PDF_COLUMNS,
      }}
      printTitle="Sites"
      columns={COLUMNS}
      rowHref={(row) => `/sites/${row.id}`}
      load={load}
      emptyHeading="No sites yet"
      emptyBody="A site holds the tree count, the budget and the expenses for one location."
    />
  )
}
