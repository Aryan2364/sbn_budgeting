"use client"

import * as React from "react"

import { api, query, type ListResponse, type Matchable, type Project } from "@/lib/api"
import { formatDate, formatNumber } from "@/lib/format"
import { Truncate } from "@/components/ui/truncate"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"

/** Section 11.1. The list template, with data. */
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
    render: (row) => formatNumber(row.plannedTrees),
  },
  {
    key: "siteCount",
    label: "Sites",
    numeric: true,
    sortKey: "siteCount",
    priority: "secondary",
    render: (row) => formatNumber(row.siteCount),
  },
  {
    key: "createdAt",
    label: "Created",
    numeric: true,
    sortKey: "createdAt",
    priority: "secondary",
    render: (row) => formatDate(row.createdAt),
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
      columns={COLUMNS}
      rowHref={(row) => `/projects/${row.id}`}
      load={load}
      emptyHeading="No projects yet"
      emptyBody="A project is a donor and a number of trees. The trees are then split across one or more sites."
    />
  )
}
