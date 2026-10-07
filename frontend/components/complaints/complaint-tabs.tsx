"use client"

import type { ComplaintCounts, ComplaintTab } from "@/lib/complaints-api"
import { SectionTabs } from "@/components/ui/section-tabs"

/**
 * Section 33 section tabs for the complaints list, each with its count
 * (6.8, 33.3: if one tab carries a count, they all do).
 *
 * Built on the one `SectionTabs` (33.1: there is no second tab
 * component). The list page owns the URL, because it writes the tab
 * together with search, filters and page in a single replace, and a
 * tab switch clears that toolbar state (33.4) — hence `onValueChange`.
 *
 * Tabs are never hidden (logged in CONTRACT §9): every tab is shown to
 * everyone and an empty one says why it is empty.
 */
export const COMPLAINT_TABS: { value: ComplaintTab; label: string }[] = [
  { value: "assigned", label: "મને સોંપેલી" },
  { value: "raised", label: "મેં નોંધાવેલી" },
  { value: "all", label: "બધી" },
]

export function ComplaintTabs({
  value,
  counts,
  onValueChange,
}: {
  value: ComplaintTab
  /** Null while the counts are loading: the pills wait rather than show 0. */
  counts: ComplaintCounts | null
  onValueChange: (tab: ComplaintTab) => void
}) {
  return (
    <SectionTabs
      param="tab"
      value={value}
      onValueChange={(next) => onValueChange(next as ComplaintTab)}
      tabs={COMPLAINT_TABS.map((tab) => ({
        ...tab,
        count: counts ? counts[tab.value] : null,
      }))}
    />
  )
}
