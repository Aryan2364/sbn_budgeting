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
import { ExportButton } from "@/components/ui/export-button"
import type { ExportColumn } from "@/lib/pdf-export"
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
  deleteBlocked,
  deleteAlternative,
  emptyHeading,
  emptyBody,
  onChanged,
  page,
  totalPages,
  total,
  onPageChange,
  exportList,
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
  /**
   * Section 15 rule 2: what ELSE a real deletion takes with it. It is
   * not the place to explain that a deletion is impossible — that is
   * `deleteBlocked`, and the two were conflated until 15 Sep 2026.
   */
  deleteConsequences: (row: T) => React.ReactNode
  /**
   * Why the SERVER will refuse to delete this row, or null when it will
   * not. Section 26: never show a control that fails after being
   * clicked — and the only thing that knows is the row, so the API
   * carries the counts and this turns them into the sentence.
   *
   * Cause then next action (§7.2 rule 2), and one sentence used twice:
   * as the disabled control's tooltip, and as the body of the dialog
   * when there is an alternative worth opening one for.
   */
  deleteBlocked?: (row: T) => string | null
  /**
   * What to do INSTEAD, where the product has an answer — deactivating
   * a cost head is one, and changing a site's location is not.
   *
   * Per ROW, because the answer can run out: a cost head that is
   * already inactive has nothing left to offer, and its delete goes
   * back to disabled-with-a-reason.
   *
   * With it, the delete control stays enabled on a blocked row and
   * opens a dialog that explains and offers this. Without it, the
   * control is disabled and the reason is the tooltip, which §26 and
   * the brief both prefer: a dialog whose only outcome is "no" is a
   * click that led nowhere.
   */
  deleteAlternative?: (row: T) => {
    label: string
    run: () => Promise<void>
    /** The toast after it succeeds (§7.1). */
    done: string
  } | null
  emptyHeading: string
  emptyBody: string
  onChanged: () => void
  /** Section 1 rule 7. Omit only for a list that genuinely cannot grow. */
  page?: number
  totalPages?: number
  total?: number
  onPageChange?: (page: number) => void
  /**
   * Optional and additive: a caller that omits this is completely
   * unaffected (no button renders). Section 26 reasoning: reading a
   * list the user can already see on screen is not an admin-only
   * action, so this is deliberately NOT gated on `canEdit` — every
   * caller so far (cost heads, people, site locations) passes it
   * unconditionally, independent of the edit permission.
   *
   * `fetchPage` mirrors `ExportButton`'s own `fetchPage` shape exactly
   * (`(page, pageSize) => Promise<{ data, total }>`) so the SAME paging
   * loop in `components/ui/export-button.tsx` is reused rather than a
   * second one written here (AGENTS.md section 1 rule 4). `rows` on
   * this component is only ever the current page — the page owns
   * fetching, not `MasterSection` — so the export MUST go through this
   * separate fetch rather than exporting `rows` as given, which would
   * silently produce a file containing only the page on screen.
   */
  exportList?: {
    /** The PDF heading and the downloaded filename's seed. */
    title: string
    /** Mirrors the on-screen `columns`, same order, same headers. */
    columns: ExportColumn<T>[]
    fetchPage: (
      page: number,
      pageSize: number,
    ) => Promise<{ data: T[]; total: number }>
  }
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
          {exportList ? (
            <ExportButton
              title={exportList.title}
              columns={exportList.columns}
              fetchPage={exportList.fetchPage}
            />
          ) : null}
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
              {rows.map((row) => {
                /*
                 * Three different reasons a delete may not happen, and
                 * they are not interchangeable:
                 *
                 *   - the user may not act at all      -> disabled, §26
                 *   - the record refuses and there is
                 *     something to do instead          -> enabled, opens
                 *                                         the explaining
                 *                                         dialog
                 *   - the record refuses and there is
                 *     nothing to do from here          -> disabled, §26
                 *
                 * Only the middle one leaves the control live, and it
                 * is not a control that fails: clicking it reaches the
                 * next action rather than an error.
                 */
                const blockedReason = deleteBlocked?.(row) ?? null
                const hasAlternative =
                  blockedReason !== null && deleteAlternative?.(row) != null
                const deleteDenial = !canEdit
                  ? cannotEditReason
                  : blockedReason !== null && !hasAlternative
                    ? blockedReason
                    : null

                return (
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
                          allowed={deleteDenial === null}
                          reason={deleteDenial ?? ""}
                        >
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Delete ${deleteName(row)}`}
                                  disabled={deleteDenial !== null}
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
                )
              })}
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
          /* Recomputed here rather than carried in state: the row is
             the same object the control read, so the two can never
             disagree about whether this is a confirmation. */
          blocked={(() => {
            const reason = deleteBlocked?.(deleting) ?? null
            const alternative = reason === null ? null : deleteAlternative?.(deleting)
            if (reason === null || !alternative) return undefined
            return {
              reason,
              actionLabel: alternative.label,
              run: alternative.run,
              done: alternative.done,
            }
          })()}
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
