"use client"

import * as React from "react"
import { ArrowUpDownIcon, FilterIcon, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  PaginationBar,
  PaginationCount,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageFrame, PageHeader } from "@/components/templates/page"
import {
  ListDataArea,
  ListSearch,
  ListToolbar,
  ListViewSwitcher,
  type ListView,
} from "@/components/templates/list-page"

/**
 * PHASE 2 SCAFFOLDING. Delete when Phase 3 lands the API.
 *
 * The list template with no data behind it. It renders the section
 * 14 loading state - skeleton blocks in the shape of the rows that are
 * coming, never a spinning wheel - because that is honestly what this
 * screen is: a list page whose data source does not exist yet.
 *
 * It exists once and is imported by every list route, so the four
 * list screens cannot drift apart before they have any content
 * (section 4 rule 2).
 */
type ColumnPriority = "essential" | "secondary" | "tertiary"

export type PlaceholderColumn = {
  label: string
  numeric?: boolean
  /**
   * Section 10 rule 4: every table declares which columns are
   * essential, which are secondary (hidden below 1024px) and which are
   * tertiary (hidden below 768px). Dropping columns is what keeps
   * horizontal scroll a last resort.
   */
  priority?: ColumnPriority
}

const PRIORITY_CLASS: Record<ColumnPriority, string> = {
  essential: "",
  secondary: "hidden lg:table-cell",
  tertiary: "hidden md:table-cell",
}

/** Page size is 25 (section 11.1), so the loading state is 25 rows tall. */
const PAGE_SIZE = 25

const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-4/5", "w-1/2"]

function RecordListPlaceholder({
  title,
  /** "Search projects" - names the record type, not the field list. */
  searchPlaceholder,
  searchLabel,
  createLabel,
  columns,
}: {
  title: string
  searchPlaceholder: string
  searchLabel: string
  /** Section 6.1: the one primary button on the screen. */
  createLabel?: string
  columns: PlaceholderColumn[]
}) {
  const [view, setView] = React.useState<ListView>("list")

  return (
    <PageFrame>
      {/* Zone 1. Does not scroll. */}
      <PageHeader
        title={title}
        meta="Loading records"
        actions={
          createLabel ? (
            <Button>
              <PlusIcon />
              {createLabel}
            </Button>
          ) : undefined
        }
      />

      {/* Zone 2. Does not scroll. */}
      <ListToolbar>
        <ListSearch placeholder={searchPlaceholder} label={searchLabel} />
        <Button variant="secondary">
          <FilterIcon />
          Filter
        </Button>
        <Button variant="secondary">
          <ArrowUpDownIcon />
          Sort
        </Button>
        <ListViewSwitcher
          value={view}
          onValueChange={setView}
          className="ml-auto"
        />
      </ListToolbar>

      {/* Zone 3 scrolls. Zone 4, below it, does not. */}
      <ListDataArea
        aria-busy="true"
        footer={
          <PaginationBar>
            <PaginationCount>Loading records</PaginationCount>
            <Skeleton className="h-control w-search max-w-full" />
          </PaginationBar>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.label}
                  numeric={column.numeric}
                  className={cn(PRIORITY_CLASS[column.priority ?? "essential"])}
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: PAGE_SIZE }, (_, row) => (
              <TableRow key={row}>
                {columns.map((column, index) => (
                  <TableCell
                    key={column.label}
                    numeric={column.numeric}
                    className={cn(
                      PRIORITY_CLASS[column.priority ?? "essential"]
                    )}
                  >
                    <Skeleton
                      className={cn(
                        "h-4",
                        SKELETON_WIDTHS[(row + index) % SKELETON_WIDTHS.length],
                        column.numeric && "ml-auto"
                      )}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListDataArea>
    </PageFrame>
  )
}

export { RecordListPlaceholder }
