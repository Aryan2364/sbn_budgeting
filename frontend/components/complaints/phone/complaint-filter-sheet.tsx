"use client"

import * as React from "react"

import type { ComplaintTab } from "@/lib/complaints-api"
import { complaintsApi } from "@/lib/complaints-api"
import { Label } from "@/components/ui/label"
import type { PhoneListFilter, PhoneListFilterChip } from "@/components/ui/phone-list"
import { Choice, type ChoiceOption } from "@/components/complaints/choice"
import { STATUS_ORDER, statusLabel } from "@/components/complaints/status"
import type { ComplaintFilters } from "@/components/complaints/complaint-filter"
import { PHONE_WORDS } from "@/lib/phone-words"

/**
 * Plan-phone 5.2: the filter bottom sheet shared by My work and
 * Complaints — status, site (searchable past 6), category — wired as a
 * PhoneList `filter` prop. It never touches `complaint-filter.tsx` (the
 * desktop dialog): the fields are drawn afresh here with `Choice`, the
 * one control both forms already share, so neither can drift from the
 * other's options.
 *
 * "Show N results" counts the DRAFT against the server with the same
 * list call at `pageSize=1` (plan 5.2) — no backend change, and the
 * count is exact rather than guessed from a stale total.
 */
const ANY = "any"

function nameOf(options: ChoiceOption[], id: string | undefined, fallback: string): string {
  if (!id) return fallback
  return options.find((o) => o.value === id)?.label ?? fallback
}

function ComplaintFilterFields({
  draft,
  onChange,
  sites,
  categories,
}: {
  draft: ComplaintFilters
  onChange: (next: ComplaintFilters) => void
  sites: ChoiceOption[]
  categories: ChoiceOption[]
}) {
  const WORDS = PHONE_WORDS.filter
  const statusOptions: ChoiceOption[] = [
    { value: ANY, label: WORDS.any },
    ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) })),
  ]
  const siteOptions: ChoiceOption[] = [{ value: ANY, label: WORDS.any }, ...sites]
  const categoryOptions: ChoiceOption[] = [{ value: ANY, label: WORDS.any }, ...categories]

  const pick = (key: keyof ComplaintFilters) => (value: string) =>
    onChange({ ...draft, [key]: value === ANY ? undefined : value })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone-filter-status">{WORDS.status}</Label>
        <Choice
          id="phone-filter-status"
          options={statusOptions}
          value={draft.status ?? ANY}
          onValueChange={pick("status")}
          placeholder={WORDS.any}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone-filter-site">{WORDS.site}</Label>
        <Choice
          id="phone-filter-site"
          options={siteOptions}
          value={draft.siteId ?? ANY}
          onValueChange={pick("siteId")}
          placeholder={WORDS.any}
          searchPlaceholder={WORDS.searchSites}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone-filter-category">{WORDS.category}</Label>
        <Choice
          id="phone-filter-category"
          options={categoryOptions}
          value={draft.categoryId ?? ANY}
          onValueChange={pick("categoryId")}
          placeholder={WORDS.any}
        />
      </div>
    </div>
  )
}

/**
 * Builds the `filter` prop PhoneList needs, from the applied filters and
 * the one `onApply` that writes them. Owns the draft and the "Show N
 * results" count itself (rule 18); the caller only supplies what is
 * applied now and what to do when the draft is applied.
 */
function useComplaintFilterSheet({
  tab,
  search,
  applied,
  onApply,
  sites,
  categories,
}: {
  tab: ComplaintTab
  /** The list's current search text, so the count matches what the list shows. */
  search: string
  applied: ComplaintFilters
  onApply: (next: ComplaintFilters) => void
  sites: ChoiceOption[]
  categories: ChoiceOption[]
}): PhoneListFilter {
  const [draft, setDraft] = React.useState<ComplaintFilters>(applied)
  const draftKey = JSON.stringify({ tab, search, status: draft.status, siteId: draft.siteId, categoryId: draft.categoryId })
  const [draftCount, setDraftCount] = React.useState<{ key: string; value: number | undefined }>({
    key: "",
    value: undefined,
  })

  React.useEffect(() => {
    let cancelled = false
    complaintsApi
      .list({
        tab,
        pageSize: 1,
        search: search.trim() || undefined,
        status: draft.status,
        siteId: draft.siteId,
        categoryId: draft.categoryId,
      })
      .then((result) => {
        if (!cancelled) setDraftCount({ key: draftKey, value: result.total })
      })
      .catch(() => {
        if (!cancelled) setDraftCount({ key: draftKey, value: undefined })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  const resolvedDraftCount = draftCount.key === draftKey ? draftCount.value : undefined

  const active: PhoneListFilterChip[] = []
  if (applied.status) {
    active.push({
      key: "status",
      label: statusLabel(applied.status),
      onRemove: () => onApply({ ...applied, status: undefined }),
    })
  }
  if (applied.siteId) {
    active.push({
      key: "siteId",
      label: nameOf(sites, applied.siteId, PHONE_WORDS.filter.site),
      onRemove: () => onApply({ ...applied, siteId: undefined }),
    })
  }
  if (applied.categoryId) {
    active.push({
      key: "categoryId",
      label: nameOf(categories, applied.categoryId, PHONE_WORDS.filter.category),
      onRemove: () => onApply({ ...applied, categoryId: undefined }),
    })
  }

  return {
    active,
    onClearAll: () => onApply({}),
    content: (
      <ComplaintFilterFields draft={draft} onChange={setDraft} sites={sites} categories={categories} />
    ),
    draftCount: resolvedDraftCount,
    onClearDraft: () => setDraft({}),
    onApply: () => onApply(draft),
    onOpenChange: (open) => {
      if (open) setDraft(applied)
    },
  }
}

export { useComplaintFilterSheet }
