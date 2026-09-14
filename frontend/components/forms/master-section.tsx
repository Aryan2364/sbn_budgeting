"use client"

import * as React from "react"
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { errorMessage } from "@/components/shell/session"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Pagination,
  PaginationBar,
  PaginationContent,
  PaginationCount,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DeleteRecordDialog } from "@/components/forms/delete-record-dialog"
import { PermissionTooltip } from "@/components/forms/permission-tooltip"

/** Section 10 rule 4, applied the same way `record-list` applies it. */
const PRIORITY_CLASS = {
  essential: "",
  secondary: "hidden lg:table-cell",
  tertiary: "hidden md:table-cell",
} as const

/**
 * A master list inside Settings: cost heads, site locations, people.
 *
 * The three differ in their columns and their edit dialog and in
 * nothing else, so this exists once and takes those two as props
 * (section 4 rule 2). Building three of these separately is how the
 * delete confirmation ends up worded three different ways.
 *
 * Section 11.5: a card per group of related settings, and each card
 * carries its own action — the Save lives inside the edit dialog here,
 * because the rows are edited one at a time rather than as a sheet.
 */
/** Section 11.1: the product's page size is 25 everywhere. */
export const MASTER_PAGE_SIZE = 25

export interface MasterColumn<T> {
  key: string
  label: string
  numeric?: boolean
  className?: string
  /**
   * Section 10 rule 4: every table declares which columns are
   * essential, which are secondary (hidden below 1024) and which are
   * tertiary (hidden below 768). Undeclared means essential.
   */
  priority?: "essential" | "secondary" | "tertiary"
  render: (row: T) => React.ReactNode
}

export function MasterSection<T extends { id: string }>({
  title,
  description,
  createLabel,
  columns,
  rows,
  loading,
  error,
  onRetry,
  canEdit,
  cannotEditReason,
  onCreate,
  onEdit,
  onDelete,
  deleteWhat,
  deleteName,
  deleteConsequences,
  emptyHeading,
  emptyBody,
  onChanged,
  page,
  totalPages,
  total,
  onPageChange,
}: {
  title: string
  description: string
  createLabel: string
  columns: MasterColumn<T>[]
  rows: T[] | null
  loading: boolean
  /**
   * Section 13: "something failed" is its OWN state, not a quieter kind
   * of loading. `rows` is null both before the first response and after
   * a failed one, so rendering the skeleton on null alone leaves a
   * failure spinning forever with the reason computed and discarded.
   * That is exactly what happened on a cold first request.
   */
  error: string | null
  onRetry: () => void
  /**
   * Section 26: the user SEES the action and cannot use it. Disabled
   * with a reason, never hidden and never failing after the click.
   */
  canEdit: boolean
  /** Why, in §26's own shape: "Only an administrator can ...". */
  cannotEditReason: string
  onCreate: () => void
  onEdit: (row: T) => void
  onDelete: (row: T) => Promise<void>
  deleteWhat: string
  deleteName: (row: T) => string
  deleteConsequences: (row: T) => React.ReactNode
  emptyHeading: string
  emptyBody: string
  onChanged: () => void
  /** Section 1 rule 7. Omit only for a list that genuinely cannot grow. */
  page?: number
  totalPages?: number
  total?: number
  onPageChange?: (page: number) => void
}) {
  const [deleting, setDeleting] = React.useState<T | null>(null)

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {/*
          Section 26: shown and DISABLED, not hidden. Two people looking
          at this screen see the same software; only one of them can use
          this button, and the tooltip is what tells the other why.
        */}
        <CardAction>
          <PermissionTooltip allowed={canEdit} reason={cannotEditReason}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canEdit}
              onClick={onCreate}
            >
              <PlusIcon />
              {createLabel}
            </Button>
          </PermissionTooltip>
        </CardAction>
      </CardHeader>

      <CardContent className="p-0">
        {error !== null && !loading ? (
          <EmptyState
            variant="failed"
            heading="Could not load this list"
            actionLabel="Retry"
            onAction={onRetry}
          >
            {error}
          </EmptyState>
        ) : loading || rows === null ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            variant="nothing-yet"
            heading={emptyHeading}
            actionLabel={createLabel}
            onAction={canEdit ? onCreate : undefined}
          >
            {emptyBody}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    numeric={column.numeric}
                    className={cn(PRIORITY_CLASS[column.priority ?? "essential"], column.className)}
                  >
                    {column.label}
                  </TableHead>
                ))}
                <TableHead className="w-grid-cell text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      numeric={column.numeric}
                      className={cn(
                        PRIORITY_CLASS[column.priority ?? "essential"],
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                      {/* Section 6.3: an icon-only button carries a
                          hidden label and a tooltip. An icon alone is a
                          guess. */}
                      <span className="inline-flex items-center gap-2">
                        <PermissionTooltip
                          allowed={canEdit}
                          reason={cannotEditReason}
                        >
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Edit ${deleteName(row)}`}
                                  disabled={!canEdit}
                                  onClick={() => onEdit(row)}
                                />
                              }
                            >
                              <PencilIcon />
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        </PermissionTooltip>
                        <PermissionTooltip
                          allowed={canEdit}
                          reason={cannotEditReason}
                        >
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Delete ${deleteName(row)}`}
                                  disabled={!canEdit}
                                  onClick={() => setDeleting(row)}
                                />
                              }
                            >
                              <TrashIcon />
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </PermissionTooltip>
                      </span>
                    </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/*
        Section 11.1 zone 4. Rendered whenever there is more than one
        page: the count is the API's own total, not the length of what
        came back, so it cannot quietly under-report.
      */}
      {onPageChange && page !== undefined && totalPages !== undefined && totalPages > 1 ? (
        <PaginationBar>
          <PaginationCount>
            {formatNumber(total ?? 0)} in total
          </PaginationCount>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={page <= 1}
                  className={cn(page <= 1 && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault()
                    onPageChange(Math.max(1, page - 1))
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-3 text-label text-text-secondary">
                  Page {formatNumber(page)} of {formatNumber(totalPages)}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={page >= totalPages}
                  className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault()
                    onPageChange(Math.min(totalPages, page + 1))
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </PaginationBar>
      ) : null}

      {deleting ? (
        <DeleteRecordDialog
          /* Keyed by row: a different row gets a fresh dialog rather
             than one whose error banner belongs to the last attempt. */
          key={deleting.id}
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          recordName={deleteName(deleting)}
          what={deleteWhat}
          consequences={deleteConsequences(deleting)}
          onConfirm={() => onDelete(deleting)}
          onDeleted={() => {
            setDeleting(null)
            onChanged()
          }}
        />
      ) : null}
    </Card>
  )
}

/** Turns a load-and-refresh pair into the props MasterSection wants. */
/**
 * Rows for a master list, PAGED.
 *
 * It used to take a loader returning a bare array, and every caller
 * fetched `pageSize: 100` and rendered whatever came back. That is not
 * an unbounded list — it is worse. **At 101 rows the hundred-and-first
 * silently vanished**, with nothing on screen to say the list was
 * incomplete: no count, no page controls, no empty slot. Nothing looked
 * broken, which is what made it dangerous.
 *
 * Raising the page size only moves the cliff. The loader now takes a
 * page and hands back the API's own `total`, so the count is the real
 * one and the page controls exist.
 */
export function useMasterRows<T>(
  load: (page: number) => Promise<{ data: T[]; total: number; pageSize: number }>,
): {
  rows: T[] | null
  loading: boolean
  error: string | null
  refresh: () => void
  page: number
  setPage: (page: number) => void
  total: number
  totalPages: number
  pageSize: number
} {
  const [state, setState] = React.useState<{
    rows: T[] | null
    error: string | null
    total: number
    pageSize: number
    /** Which request this result belongs to. */
    tick: number
  }>({ rows: null, error: null, total: 0, pageSize: MASTER_PAGE_SIZE, tick: -1 })
  const [tick, setTick] = React.useState(0)
  const [page, setPageState] = React.useState(1)

  React.useEffect(() => {
    let cancelled = false
    load(page)
      .then((next) => {
        if (!cancelled) {
          setState({
            rows: next.data,
            error: null,
            total: next.total,
            pageSize: next.pageSize || MASTER_PAGE_SIZE,
            tick,
          })
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState({
            rows: null,
            error: errorMessage(caught),
            total: 0,
            pageSize: MASTER_PAGE_SIZE,
            tick,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [load, tick, page])

  const settled = state.tick === tick
  return {
    rows: settled ? state.rows : null,
    /* Derived: in flight whenever the newest result is not this
       request's. Setting a flag at the top of the effect would render
       the stale value once and then immediately render again. */
    loading: !settled,
    error: settled ? state.error : null,
    refresh: React.useCallback(() => setTick((t) => t + 1), []),
    page,
    setPage: setPageState,
    total: settled ? state.total : 0,
    totalPages: Math.max(1, Math.ceil((settled ? state.total : 0) / (state.pageSize || MASTER_PAGE_SIZE))),
    pageSize: state.pageSize || MASTER_PAGE_SIZE,
  }
}
