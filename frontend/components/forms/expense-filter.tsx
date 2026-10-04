"use client"

import * as React from "react"
import { FilterIcon } from "lucide-react"

import { formatAmount } from "@/lib/format"
import { parseRupeesToPaise, paiseToRupeeInput } from "@/lib/money"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { DateRangeField, dateRangeLabel } from "@/components/forms/date-range-field"

/**
 * Sections 27.3 and 27.4: the expenses list's filter panel.
 *
 * **Dialog, large (800px, section 24).** A popover's fixed 288px would
 * clip the section 20.1 two-month calendar outright, and a sheet's
 * ~384px is not much better once the preset column sits beside it. The
 * content here is exactly what section 24 reserves "large" for: two
 * calendar months side by side, plus a preset list, plus the amount
 * range — nothing this product puts in a medium (560px) form comes
 * close to that width. It is not a confirmation and it is not a short
 * form, so small and medium are both wrong.
 *
 * Filter VALUES themselves (`spentOnFrom`/`spentOnTo`/`amountMin`/
 * `amountMax`) live in the caller's `listState.filters` — this
 * component is a controlled editor over a draft copy of them, committed
 * only on "Apply", per section 11.3's read on validation: it runs when
 * the user leaves a field (or here, tries to submit), not while typing.
 */

export interface ExpenseFilterValues {
  spentOnFrom?: string
  spentOnTo?: string
  amountMin?: string
  amountMax?: string
  [key: string]: string | undefined
}

function countActive(filters: Record<string, string | undefined>): number {
  // The date range counts once (from/to together are one filter, in the
  // user's mind), same for the amount range.
  let count = 0
  if (filters.spentOnFrom || filters.spentOnTo) count += 1
  if (filters.amountMin || filters.amountMax) count += 1
  return count
}

export function ExpenseFilterButton({
  filters,
  onApply,
  showAmounts,
}: {
  filters: ExpenseFilterValues
  onApply: (next: ExpenseFilterValues) => void
  /**
   * Kit 26.7: without see amounts the amount range is ABSENT, not
   * disabled, and never sent (the server refuses filtering on an
   * amount it does not show).
   */
  showAmounts: boolean
}) {
  const [open, setOpen] = React.useState(false)

  // Draft state, reset from the live filters every time the dialog opens
  // — so cancelling (Escape, backdrop, the close button) never leaks a
  // half-typed edit into the applied filters.
  const [draft, setDraft] = React.useState<ExpenseFilterValues>(filters)
  // Bumped to start the date range field afresh (opening, Clear), so its
  // half-picked calendar selection never outlives the draft it belonged to.
  const [rangeKey, setRangeKey] = React.useState(0)
  const [minText, setMinText] = React.useState(paiseToRupeeInput(filters.amountMin ?? null))
  const [maxText, setMaxText] = React.useState(paiseToRupeeInput(filters.amountMax ?? null))
  const [dateError, setDateError] = React.useState<string | null>(null)
  const [amountError, setAmountError] = React.useState<string | null>(null)

  function openDialog(next: boolean) {
    setOpen(next)
    if (next) {
      setDraft(filters)
      setRangeKey((k) => k + 1)
      setMinText(paiseToRupeeInput(filters.amountMin ?? null))
      setMaxText(paiseToRupeeInput(filters.amountMax ?? null))
      setDateError(null)
      setAmountError(null)
    }
  }

  function handleApply() {
    // Section 27.3/27.4 + the inverted-range guard: the backend silently
    // returns zero rows for `from` after `to` or `amountMin` above
    // `amountMax` rather than rejecting it, which is precisely the
    // "missing records reported as a bug" failure section 27.3 exists
    // to prevent. Caught here, before the request is ever sent.
    let hasError = false

    if (draft.spentOnFrom && draft.spentOnTo && draft.spentOnFrom > draft.spentOnTo) {
      setDateError("The end of the range must be on or after the start.")
      hasError = true
    } else {
      setDateError(null)
    }

    const minParsed = parseRupeesToPaise(showAmounts ? minText : "")
    const maxParsed = parseRupeesToPaise(showAmounts ? maxText : "")
    let amountMin: string | null | undefined
    let amountMax: string | null | undefined

    if (!minParsed.ok) {
      setAmountError(minParsed.error)
      hasError = true
    } else if (!maxParsed.ok) {
      setAmountError(maxParsed.error)
      hasError = true
    } else {
      amountMin = minParsed.paise
      amountMax = maxParsed.paise
      if (
        amountMin !== null &&
        amountMax !== null &&
        amountMin !== undefined &&
        amountMax !== undefined &&
        BigInt(amountMin) > BigInt(amountMax)
      ) {
        setAmountError("The maximum amount must be at least the minimum.")
        hasError = true
      } else {
        setAmountError(null)
      }
    }

    if (hasError) return

    onApply({
      spentOnFrom: draft.spentOnFrom,
      spentOnTo: draft.spentOnTo,
      amountMin: amountMin ?? undefined,
      amountMax: amountMax ?? undefined,
    })
    setOpen(false)
  }

  const activeCount = countActive(filters)

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger
        render={
          <Button type="button" variant="secondary">
            <FilterIcon />
            Filter
            {activeCount > 0 ? (
              <Badge variant="primary" className="ml-1">
                {activeCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Filter expenses</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-6">
            <DateRangeField
              key={rangeKey}
              from={draft.spentOnFrom}
              to={draft.spentOnTo}
              onChange={(spentOnFrom, spentOnTo) => {
                setDraft((d) => ({ ...d, spentOnFrom, spentOnTo }))
                setDateError(null)
              }}
              error={dateError}
            />

            {showAmounts ? (
            <section className="flex flex-col gap-2">
              <Label>Amount (₹)</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="filter-amount-min">Minimum</Label>
                  <InputGroup className="w-40">
                    <InputGroupAddon>₹</InputGroupAddon>
                    <InputGroupInput
                      id="filter-amount-min"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={minText}
                      aria-invalid={!!amountError || undefined}
                      onChange={(event) => {
                        setMinText(event.target.value)
                        setAmountError(null)
                      }}
                    />
                  </InputGroup>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="filter-amount-max">Maximum</Label>
                  <InputGroup className="w-40">
                    <InputGroupAddon>₹</InputGroupAddon>
                    <InputGroupInput
                      id="filter-amount-max"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={maxText}
                      aria-invalid={!!amountError || undefined}
                      onChange={(event) => {
                        setMaxText(event.target.value)
                        setAmountError(null)
                      }}
                    />
                  </InputGroup>
                </div>
              </div>
              <InlineFieldError>{amountError}</InlineFieldError>
            </section>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft({})
              setRangeKey((k) => k + 1)
              setMinText("")
              setMaxText("")
              setDateError(null)
              setAmountError(null)
            }}
          >
            Clear
          </Button>
          <Button type="button" onClick={handleApply}>
            Apply filters
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Same reasoning as `dateRangeLabel`, for the amount range. */
function amountRangeLabel(min?: string, max?: string): string | null {
  if (!min && !max) return null
  return min && max
    ? `₹${formatAmount(min)} to ₹${formatAmount(max)}`
    : min
      ? `Min ₹${formatAmount(min)}`
      : `Max ₹${formatAmount(max!)}`
}

/**
 * Section 27.3/27.4's active filters, described in plain words, in the
 * SAME order and the same phrasing `expenseFilterChips` below renders as
 * chips. Used to build the PDF export's heading (defect: a filtered
 * export whose heading does not mention the filter). Kept here, next to
 * the chip labeller, rather than re-derived in `record-list.tsx`, so the
 * two can never drift apart (section 1 rule 4).
 */
export function expenseFilterLabels(appliedFilters: Record<string, string>): string[] {
  const labels: string[] = []
  const date = dateRangeLabel(appliedFilters.spentOnFrom, appliedFilters.spentOnTo)
  if (date) labels.push(date)
  const amount = amountRangeLabel(appliedFilters.amountMin, appliedFilters.amountMax)
  if (amount) labels.push(amount)
  return labels
}

/**
 * Section 27.3: the removable chips below the toolbar, driven off the
 * server's `appliedFilters` so a chip can never disagree with what was
 * actually applied. The date pair and the amount pair are each ONE chip
 * — removing "from" but leaving "to" behind would silently change the
 * filter's meaning rather than clear it.
 */
export function expenseFilterChips(
  appliedFilters: Record<string, string>,
  onChange: (next: ExpenseFilterValues) => void,
  current: ExpenseFilterValues,
): React.ReactNode {
  const chips: React.ReactNode[] = []

  const dateLabel = dateRangeLabel(appliedFilters.spentOnFrom, appliedFilters.spentOnTo)
  if (dateLabel) {
    chips.push(
      <FilterChip
        key="date"
        label={dateLabel}
        onRemove={() =>
          onChange({ ...current, spentOnFrom: undefined, spentOnTo: undefined })
        }
      />,
    )
  }

  const amountLabel = amountRangeLabel(appliedFilters.amountMin, appliedFilters.amountMax)
  if (amountLabel) {
    chips.push(
      <FilterChip
        key="amount"
        label={amountLabel}
        onRemove={() =>
          onChange({ ...current, amountMin: undefined, amountMax: undefined })
        }
      />,
    )
  }

  return chips
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="neutral" className="gap-1.5 py-1 pr-1">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors",
          "hover:bg-surface-control hover:text-text-primary",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-ring",
        )}
      >
        ×
      </button>
    </Badge>
  )
}
