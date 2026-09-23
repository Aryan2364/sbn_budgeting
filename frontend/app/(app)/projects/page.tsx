"use client"

import * as React from "react"

import { api, query, type ListResponse, type Matchable, type Project } from "@/lib/api"
import { formatDate, formatNumber } from "@/lib/format"
import { Truncate } from "@/components/ui/truncate"
import type { ExportColumn } from "@/lib/pdf-export"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"

/**
 * Section 17.1: fixed widths go only to columns with a KNOWN maximum.
 * Project and Donor are free text with no bound on length, so they are
 * left undeclared and take the remainder, truncating (section 8).
 * Trees and Sites are digit-grouped counts and Created is a fixed
 * `DD/MM/YY` date — all bounded the same way the sites page's Trees
 * and Planted columns are — so all three take the `tight` (110px)
 * token.
 */
const COLUMNS: RecordColumn<Project>[] = [
  {
    key: "name",
    label: "Project",
    sortKey: "name",
    render: (row) => <Truncate className="font-medium">{row.name}</Truncate>,
  },
  {
    key: "donorName",
    label: "Donor",
    sortKey: "donorName",
    render: (row) => <Truncate>{row.donorName}</Truncate>,
  },
  {
    key: "plannedTrees",
    label: "Trees",
    numeric: true,
    sortKey: "plannedTrees",
    priority: "tertiary",
    width: "tight",
    render: (row) => formatNumber(row.plannedTrees),
  },
  {
    key: "siteCount",
    label: "Sites",
    numeric: true,
    sortKey: "siteCount",
    priority: "secondary",
    width: "tight",
    render: (row) => formatNumber(row.siteCount),
  },
  {
    key: "createdAt",
    label: "Created",
    numeric: true,
    sortKey: "createdAt",
    priority: "secondary",
    width: "tight",
    render: (row) => formatDate(row.createdAt),
  },
]

/**
 * Mirrors COLUMNS above, same order, same headers, same formatted
 * strings (AGENTS.md section 17.1 / the sites page's own comment) — a
 * PDF or spreadsheet formatted differently from the screen is a bug.
 */
const PDF_COLUMNS: ExportColumn<Project>[] = [
  { header: "Project", cell: (row) => row.name },
  { header: "Donor", cell: (row) => row.donorName },
  {
    header: "Trees",
    cell: (row) => formatNumber(row.plannedTrees),
    numeric: true,
    // A real numeric cell, not the Indian-grouped display string.
    excelValue: (row) => row.plannedTrees,
  },
  {
    header: "Sites",
    cell: (row) => formatNumber(row.siteCount),
    numeric: true,
    excelValue: (row) => row.siteCount,
  },
  {
    header: "Created",
    cell: (row) => formatDate(row.createdAt),
    numeric: true,
    // A real Excel date cell, not the dd/mm/yy display STRING —
    // lib/excel-export.ts applies the dd/mm/yy number format.
    excelValue: (row) => new Date(row.createdAt),
  },
]

export default function ProjectsPage() {
  const load = React.useCallback(
    ({ page, search, sort, direction }: {
      page: number; search: string; sort: string; direction: "asc" | "desc"
    }) =>
      api.get<ListResponse<Project & Matchable>>(
        `/projects${query({ page, search, sort, direction })}`,
      ),
    [],
  )

  return (
    <RecordList
      title="Projects"
      countLabel={(total) =>
        `${formatNumber(total)} ${total === 1 ? "project" : "projects"}`
      }
      searchLabel="Search projects"
      searchPlaceholder="Search projects"
      createHref="/projects/new"
      createLabel="New project"
      exportPdf={{
        title: "Projects",
        columns: PDF_COLUMNS,
      }}
      printTitle="Projects"
      columns={COLUMNS}
      rowHref={(row) => `/projects/${row.id}`}
      load={load}
      emptyHeading="No projects yet"
      emptyBody="A project is a donor and a number of trees. The trees are then split across one or more sites."
    />
  )
}
