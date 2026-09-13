"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  api,
  query,
  type BudgetGrid as BudgetGridData,
  type CostHead,
  type ListResponse,
  type Matchable,
} from "@/lib/api"
import { formatAmount, formatCurrency, formatNumber } from "@/lib/format"
import {
  multiplyPaise,
  paiseToRupeeInput,
  parseRupeesToPaise,
  sumPaise,
} from "@/lib/money"
import { PERIODS, PERIOD_VALUES } from "@/lib/periods"
import Link from "next/link"

import { errorMessage } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { FormError } from "@/components/forms/form-error"
import { PageColumn, PageHeader } from "@/components/templates/page"
import {
  FormFooter,
  FormFrame,
  FormScrollArea,
} from "@/components/templates/form-page"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"

/**
 * Per-tree budget entry. AGENTS.md section 31, agreed before building.
 *
 * 19 cost heads down the side, 5 periods across the top, 95 editable
 * cells. Every cell is a rupee amount per tree; each column is a period.
 * That structure is what buys the section 17 exception — see 31.1.
 *
 * The rule that shapes the whole component: **empty is not zero**
 * (31.2). A cell nobody filled in stores no row and reads "Not set"; a
 * cell holding 0 stores a row and reads 0.00. Clearing a cell that held
 * 0 DELETES the row. Those are different facts all the way down.
 */

/** Keyed `${costHeadId}:${period}`. The value is the raw text in the cell. */
type CellMap = Record<string, string>

function cellKey(costHeadId: string, period: number): string {
  return `${costHeadId}:${period}`
}

export function BudgetGrid({
  siteId,
  plannedTrees,
  siteName,
}: {
  siteId: string
  plannedTrees: number
  siteName: string
}) {
  const [heads, setHeads] = React.useState<CostHead[] | null>(null)
  const [cells, setCells] = React.useState<CellMap>({})
  const [initial, setInitial] = React.useState<CellMap>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /**
   * Section 13: kept apart from `error`, which carries save failures.
   * A failed load leaves `heads` null forever, and rendering the
   * skeleton on null alone turns that into a grid that never arrives.
   */
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<ListResponse<CostHead & Matchable>>(
        `/cost-heads${query({ pageSize: 100, sort: "sortOrder", direction: "asc", isActive: "true" })}`,
      ),
      api.get<BudgetGridData>(`/sites/${siteId}/budget`),
    ])
      .then(([headList, grid]) => {
        if (cancelled) return
        const loaded: CellMap = {}
        for (const cell of grid.cells) {
          loaded[cellKey(cell.costHeadId, cell.period)] = paiseToRupeeInput(
            cell.perTreePaise,
          )
        }
        setHeads(headList.data)
        setCells(loaded)
        setInitial(loaded)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [siteId, reloadTick])

  /** Paise for one cell, or null when the cell is empty or unreadable. */
  const paiseAt = React.useCallback(
    (headId: string, period: number): string | null => {
      const raw = cells[cellKey(headId, period)]
      if (raw === undefined) return null
      const parsed = parseRupeesToPaise(raw)
      return parsed.ok ? parsed.paise : null
    },
    [cells],
  )

  // Section 31.3: totals recalculate as the user types. A total over
  // nothing stays null, which renders "Budget not set" rather than 0.00.
  const rowTotal = React.useCallback(
    (headId: string) => sumPaise(PERIOD_VALUES.map((p) => paiseAt(headId, p))),
    [paiseAt],
  )

  const columnTotal = React.useCallback(
    (period: number) =>
      sumPaise((heads ?? []).map((head) => paiseAt(head.id, period))),
    [heads, paiseAt],
  )

  const grandTotal = React.useMemo(
    () => sumPaise(PERIOD_VALUES.map((p) => columnTotal(p))),
    [columnTotal],
  )

  const dirty = React.useMemo(() => {
    const keys = new Set([...Object.keys(cells), ...Object.keys(initial)])
    for (const key of keys) {
      if ((cells[key] ?? "") !== (initial[key] ?? "")) return true
    }
    return false
  }, [cells, initial])

  function setCell(headId: string, period: number, value: string) {
    const key = cellKey(headId, period)
    setCells((current) => {
      const next = { ...current }
      // An empty string is a CLEARED cell, and is kept as such rather
      // than deleted from the map — the save has to know the difference
      // between "cleared" (delete the row) and "never mentioned".
      next[key] = value
      return next
    })
  }

  /** Section 11.3 rule 6: validate when the field is left, not per keystroke. */
  function validateCell(headId: string, period: number, value: string) {
    const key = cellKey(headId, period)
    const parsed = parseRupeesToPaise(value)
    setErrors((current) => {
      const next = { ...current }
      if (!parsed.ok) next[key] = parsed.error
      else delete next[key]
      return next
    })
  }

  async function save() {
    const bad = Object.keys(errors).length > 0
    if (bad) return

    setSaving(true)
    setError(null)
    try {
      const payload: {
        costHeadId: string
        period: number
        perTreePaise: string | null
      }[] = []

      for (const head of heads ?? []) {
        for (const period of PERIOD_VALUES) {
          const key = cellKey(head.id, period)
          const raw = cells[key]
          const before = initial[key]
          if ((raw ?? "") === (before ?? "")) continue

          const parsed = parseRupeesToPaise(raw ?? "")
          payload.push({
            costHeadId: head.id,
            period,
            // null is a DELETE, not a zero (section 31.2).
            perTreePaise: parsed.ok ? parsed.paise : null,
          })
        }
      }

      const saved = await api.put<BudgetGridData>(`/sites/${siteId}/budget`, {
        cells: payload,
      })

      const reloaded: CellMap = {}
      for (const cell of saved.cells) {
        reloaded[cellKey(cell.costHeadId, cell.period)] = paiseToRupeeInput(
          cell.perTreePaise,
        )
      }
      setCells(reloaded)
      setInitial(reloaded)
      toast.success("Budget saved")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const hasErrors = Object.keys(errors).length > 0

  return (
    <FormFrame>
      <FormScrollArea>
        <PageColumn>
          <RecordBreadcrumb
            trail={[
              { label: "Sites", href: "/sites" },
              { label: siteName, href: `/sites/${siteId}` },
            ]}
            current="Budget"
          />

          <PageHeader
            className="mt-4"
            title="Per-tree budget"
            meta={`${formatNumber(plannedTrees)} trees. Every amount below is rupees per tree.`}
          />

          <FormError message={error} />

          {loadError !== null ? (
            <div className="mt-8">
              <EmptyState
                variant="failed"
                heading="Could not load this budget"
                actionLabel="Retry"
                onAction={() => {
                  setLoadError(null)
                  setReloadTick((t) => t + 1)
                }}
              >
                {loadError}
              </EmptyState>
            </div>
          ) : heads === null ? (
            <div className="mt-8 flex flex-col gap-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-4/5" />
            </div>
          ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-border-light bg-surface">

      {/*
        Section 31.4: the container scrolls sideways when it must and
        does not when it need not, with the first column frozen
        throughout. Driven by available space, not by a breakpoint —
        the same width fits or does not depending on whether the
        sidebar is open or railed.
      */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead className="bg-surface-sunken">
            <tr className="border-b border-border-light">
              <th
                scope="col"
                className="sticky left-0 z-10 w-grid-head min-w-grid-head border-r border-border-light bg-surface-sunken px-4 py-3 text-left text-label font-normal text-text-secondary"
              >
                Cost head
              </th>
              {PERIODS.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="w-grid-cell min-w-grid-cell px-3 py-3 text-right text-label font-normal text-text-secondary"
                >
                  {label}
                </th>
              ))}
              <th
                scope="col"
                className="w-grid-cell min-w-grid-cell px-3 py-3 text-right text-label font-normal text-text-secondary"
              >
                Per tree
              </th>
            </tr>
          </thead>

          <tbody>
            {heads.map((head) => {
              const total = rowTotal(head.id)
              return (
                <tr key={head.id} className="border-b border-border-light">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-grid-head min-w-grid-head border-r border-border-light bg-surface px-4 py-2 text-left text-body font-normal text-text-primary"
                  >
                    <span className="block truncate">{head.name}</span>
                  </th>

                  {PERIOD_VALUES.map((period) => {
                    const key = cellKey(head.id, period)
                    const invalid = Boolean(errors[key])
                    return (
                      <td key={period} className="px-1 py-1">
                        <input
                          inputMode="decimal"
                          aria-label={`${head.name}, ${PERIODS[period]}, rupees per tree`}
                          aria-invalid={invalid || undefined}
                          value={cells[key] ?? ""}
                          /* Section 31.2: the placeholder says what the
                             absence means. Never "0". */
                          placeholder="Not set"
                          onChange={(event) =>
                            setCell(head.id, period, event.target.value)
                          }
                          onBlur={(event) =>
                            validateCell(head.id, period, event.target.value)
                          }
                          className={cn(
                            "h-control w-grid-cell rounded-lg border border-border bg-surface px-3",
                            "text-right text-body tabular-nums text-text-primary transition-colors",
                            "placeholder:text-text-muted",
                            "outline-none focus-visible:border-primary-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-ring",
                            "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
                          )}
                        />
                      </td>
                    )
                  })}

                  {/* Section 31.3: row total, body strong, never editable. */}
                  <td className="px-3 py-2 text-right text-body font-medium tabular-nums text-text-primary">
                    {total === null ? (
                      <span className="text-label font-normal text-text-secondary">
                        Budget not set
                      </span>
                    ) : (
                      formatAmount(total)
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>

          <tfoot>
            <tr className="border-t border-border bg-surface-sunken">
              <th
                scope="row"
                className="sticky left-0 z-10 w-grid-head min-w-grid-head border-r border-border-light bg-surface-sunken px-4 py-3 text-left text-body font-medium text-text-primary"
              >
                Total per tree
              </th>
              {PERIOD_VALUES.map((period) => {
                const total = columnTotal(period)
                return (
                  <td
                    key={period}
                    className="px-3 py-3 text-right text-body font-medium tabular-nums text-text-primary"
                  >
                    {total === null ? (
                      <span className="text-label font-normal text-text-secondary">
                        Not set
                      </span>
                    ) : (
                      formatAmount(total)
                    )}
                  </td>
                )
              })}
              <td className="px-3 py-3 text-right text-body font-medium tabular-nums text-text-primary">
                {grandTotal === null ? (
                  <span className="text-label font-normal text-text-secondary">
                    Budget not set
                  </span>
                ) : (
                  formatAmount(grandTotal)
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

          </div>
          )}

          {hasErrors ? (
            <div className="mt-3">
              {/* Section 31.5: the message sits below the grid; the
                  cell itself carries the danger border. */}
              <InlineFieldError>
                Some amounts could not be read. Check the cells outlined in red.
              </InlineFieldError>
            </div>
          ) : null}
        </PageColumn>
      </FormScrollArea>

      {/*
        Section 31.5: ONE save for the whole grid, in a FIXED footer.
        Ninety-five cells is far past the twelve-field threshold in
        section 11.3 rule 8, and a Save that scrolls out of reach on a
        screen this tall is a Save nobody finds.

        Section 3: every budget figure states its basis, and with five
        periods the basis names the tree count too. A budget number with
        nothing beside it is incomplete.
      */}
      <FormFooter className="[&>div]:justify-between">
        <p className="min-w-0 text-label text-text-secondary">
          {grandTotal === null ? (
            <>Nothing entered yet for {siteName}.</>
          ) : (
            <>
              <span className="font-medium text-text-primary">
                {formatCurrency(multiplyPaise(grandTotal, plannedTrees))}
              </span>{" "}
              for this site — {formatCurrency(grandTotal)} per tree ×{" "}
              {formatNumber(plannedTrees)} trees, all five periods.
            </>
          )}
        </p>

        <span className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" render={<Link href={`/sites/${siteId}`} />}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !dirty || hasErrors}>
            {saving ? "Saving…" : "Save budget"}
          </Button>
        </span>
      </FormFooter>
    </FormFrame>
  )
}
