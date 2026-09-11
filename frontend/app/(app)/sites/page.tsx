"use client"

import * as React from "react"

import { api, query, type ListResponse, type Matchable, type Site } from "@/lib/api"
import { formatDate, formatNumber } from "@/lib/format"
import { Truncate } from "@/components/ui/truncate"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"

/** Section 11.1. The list template, with data. */
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
    render: (row) => <Truncate>{row.projectName}</Truncate>,
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
    render: (row) => formatNumber(row.plannedTrees),
  },
  {
    key: "plantationStartDate",
    label: "Planted",
    numeric: true,
    sortKey: "plantationStartDate",
    priority: "secondary",
    render: (row) => formatDate(row.plantationStartDate),
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
      columns={COLUMNS}
      rowHref={(row) => `/sites/${row.id}`}
      load={load}
      emptyHeading="No sites yet"
      emptyBody="A site holds the tree count, the budget and the expenses for one location."
    />
  )
}
