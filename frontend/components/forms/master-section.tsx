"use client"

import * as React from "react"
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react"

import { cn } from "@/lib/utils"
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
export interface MasterColumn<T> {
  key: string
  label: string
  numeric?: boolean
  className?: string
  render: (row: T) => React.ReactNode
}

export function MasterSection<T extends { id: string }>({
  title,
  description,
  createLabel,
  columns,
  rows,
  loading,
  canEdit,
  onCreate,
  onEdit,
  onDelete,
  deleteWhat,
  deleteName,
  deleteConsequences,
  emptyHeading,
  emptyBody,
  onChanged,
}: {
  title: string
  description: string
  createLabel: string
  columns: MasterColumn<T>[]
  rows: T[] | null
  loading: boolean
  /** Section 26: hide what the user cannot do, rather than failing after the click. */
  canEdit: boolean
  onCreate: () => void
  onEdit: (row: T) => void
  onDelete: (row: T) => Promise<void>
  deleteWhat: string
  deleteName: (row: T) => string
  deleteConsequences: (row: T) => React.ReactNode
  emptyHeading: string
  emptyBody: string
  onChanged: () => void
}) {
  const [deleting, setDeleting] = React.useState<T | null>(null)

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {canEdit ? (
          <CardAction>
            <Button variant="secondary" size="sm" onClick={onCreate}>
              <PlusIcon />
              {createLabel}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {loading || rows === null ? (
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
                    className={cn(column.className)}
                  >
                    {column.label}
                  </TableHead>
                ))}
                {canEdit ? (
                  <TableHead className="w-grid-cell text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      numeric={column.numeric}
                      className={cn(column.className)}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                  {canEdit ? (
                    <TableCell className="text-right">
                      {/* Section 6.3: an icon-only button carries a
                          hidden label and a tooltip. An icon alone is a
                          guess. */}
                      <span className="inline-flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${deleteName(row)}`}
                                onClick={() => onEdit(row)}
                              />
                            }
                          >
                            <PencilIcon />
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Delete ${deleteName(row)}`}
                                onClick={() => setDeleting(row)}
                              />
                            }
                          >
                            <TrashIcon />
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </span>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

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
export function useMasterRows<T>(
  load: () => Promise<T[]>,
): {
  rows: T[] | null
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [state, setState] = React.useState<{
    rows: T[] | null
    error: string | null
    /** Which request this result belongs to. */
    tick: number
  }>({ rows: null, error: null, tick: -1 })
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    load()
      .then((next) => {
        if (!cancelled) setState({ rows: next, error: null, tick })
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState({ rows: null, error: errorMessage(caught), tick })
        }
      })
    return () => {
      cancelled = true
    }
  }, [load, tick])

  return {
    rows: state.tick === tick ? state.rows : null,
    /* Derived: in flight whenever the newest result is not this
       request's. Setting a flag at the top of the effect would render
       the stale value once and then immediately render again. */
    loading: state.tick !== tick,
    error: state.tick === tick ? state.error : null,
    refresh: React.useCallback(() => setTick((t) => t + 1), []),
  }
}
