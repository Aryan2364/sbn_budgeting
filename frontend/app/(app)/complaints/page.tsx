"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"
import { ComplaintList } from "@/components/complaints/complaint-list"
import { ComplaintsScreen } from "@/components/complaints/phone/complaints-screen"

/**
 * `/complaints`. The list reads its tab, search and filters from the
 * URL, and `useSearchParams` needs a Suspense boundary above it.
 *
 * Plan-phone D12: the phone tree is chosen HERE, by `useLayout()`.
 * `complaint-list.tsx` (desktop) is never edited for layout, so desktop
 * cannot regress through a file it never imports.
 */
export default function ComplaintsPage() {
  const { layout } = useLayout()
  return (
    <React.Suspense fallback={null}>
      {layout === "phone" ? <ComplaintsScreen /> : <ComplaintList />}
    </React.Suspense>
  )
}
