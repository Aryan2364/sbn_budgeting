"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { ComplaintDetailPage } from "@/components/complaints/complaint-detail"

/** `/complaints/[id]`. `useSearchParams` below needs the Suspense boundary. */
export default function ComplaintPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <React.Suspense fallback={null}>
      {/* Keyed by id: another complaint is a fresh page, never the last
          one's state with a new title. */}
      <ComplaintDetailPage key={id} id={id} />
    </React.Suspense>
  )
}
