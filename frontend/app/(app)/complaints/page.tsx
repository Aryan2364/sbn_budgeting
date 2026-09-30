"use client"

import * as React from "react"

import { ComplaintList } from "@/components/complaints/complaint-list"

/**
 * `/complaints`. The list reads its tab, search and filters from the
 * URL, and `useSearchParams` needs a Suspense boundary above it.
 */
export default function ComplaintsPage() {
  return (
    <React.Suspense fallback={null}>
      <ComplaintList />
    </React.Suspense>
  )
}
