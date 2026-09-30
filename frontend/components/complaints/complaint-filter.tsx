"use client"

import * as React from "react"
import { FunnelIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge, Count } from "@/components/ui/badge"
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
import { Label } from "@/components/ui/label"
import { Choice, type ChoiceOption } from "@/components/complaints/choice"
import { STATUS_ORDER, statusLabel } from "@/components/complaints/status"

/**
 * Section 27.3 for the complaints list: one Filter button opening a
 * panel, a Count on the button while filters are active, removable
 * chips below the toolbar, and "Clear all".
 *
 * The panel edits a draft; nothing applies until "Apply filters", so
 * closing it with Escape never half-changes the list.
 */
export interface ComplaintFilters {
  status?: string
  locationId?: string
  categoryId?: string
}

const ANY = "any"

export function countFilters(filters: ComplaintFilters): number {
  return [filters.status, filters.locationId, filters.categoryId].filter(Boolean).length
}

export function ComplaintFilterButton({
  filters,
  locations,
  categories,
  onApply,
}: {
  filters: ComplaintFilters
  locations: ChoiceOption[]
  categories: ChoiceOption[]
  onApply: (next: ComplaintFilters) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<ComplaintFilters>(filters)
  const active = countFilters(filters)

  const statusOptions: ChoiceOption[] = [
    { value: ANY, label: "Any status" },
    ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) })),
  ]
  const locationOptions: ChoiceOption[] = [{ value: ANY, label: "Any location" }, ...locations]
  const categoryOptions: ChoiceOption[] = [{ value: ANY, label: "Any category" }, ...categories]

  const pick = (key: keyof ComplaintFilters) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value === ANY ? undefined : value }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(filters)
        setOpen(next)
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="secondary" className="max-sm:flex-1">
            <FunnelIcon />
            Filter
            {active > 0 ? <Count value={active} /> : null}
          </Button>
        }
      />
      <DialogContent size="md" className="max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>Filter complaints</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-status">Status</Label>
            <Choice
              id="filter-status"
              options={statusOptions}
              value={draft.status ?? ANY}
              onValueChange={pick("status")}
              placeholder="Any status"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-location">Location</Label>
            <Choice
              id="filter-location"
              options={locationOptions}
              value={draft.locationId ?? ANY}
              onValueChange={pick("locationId")}
              placeholder="Any location"
              searchPlaceholder="Search locations"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="filter-category">Category</Label>
            <Choice
              id="filter-category"
              options={categoryOptions}
              value={draft.categoryId ?? ANY}
              onValueChange={pick("categoryId")}
              placeholder="Any category"
              searchPlaceholder="Search categories"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setDraft({})}>
            Clear
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(draft)
              setOpen(false)
            }}
          >
            Apply filters
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The chips below the toolbar, one per active filter. */
export function ComplaintFilterChips({
  filters,
  locations,
  categories,
  onChange,
}: {
  filters: ComplaintFilters
  locations: ChoiceOption[]
  categories: ChoiceOption[]
  onChange: (next: ComplaintFilters) => void
}) {
  if (countFilters(filters) === 0) return null

  const nameOf = (options: ChoiceOption[], id: string, fallback: string) =>
    options.find((o) => o.value === id)?.label ?? fallback

  const chips: { key: keyof ComplaintFilters; label: string }[] = []
  if (filters.status) chips.push({ key: "status", label: statusLabel(filters.status) })
  if (filters.locationId) {
    chips.push({ key: "locationId", label: nameOf(locations, filters.locationId, "Location") })
  }
  if (filters.categoryId) {
    chips.push({ key: "categoryId", label: nameOf(categories, filters.categoryId, "Category") })
  }

  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="neutral" className="gap-2 py-1 pr-1 text-label">
          {chip.label}
          <button
            type="button"
            aria-label={`Remove filter: ${chip.label}`}
            onClick={() => onChange({ ...filters, [chip.key]: undefined })}
            className={cn(
              "tap-area flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary",
              "hover:bg-surface-control-pressed hover:text-text-primary",
              "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-1 focus-visible:outline-primary-ring",
            )}
          >
            <XIcon className="size-4" />
          </button>
        </Badge>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={() => onChange({})}>
        Clear all
      </Button>
    </div>
  )
}
