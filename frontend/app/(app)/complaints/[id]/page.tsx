"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { useLayout } from "@/lib/layout"
import { ComplaintDetailPage } from "@/components/complaints/complaint-detail"
import { PhoneComplaintRecord } from "@/components/complaints/phone/complaint-record"
import { PageHeader } from "@/components/templates/page"

/**
 * `/complaints/[id]`. `useSearchParams` below needs the Suspense
 * boundary. The phone tree (plan-phone 5.3) is chosen here, by
 * `useLayout()`, never inside `complaint-detail.tsx` (D12): the desktop
 * component is never imported by, or imports from, the phone one, so
 * desktop cannot regress through a file it never opens.
 *
 * The Suspense fallback still renders a PageHeader (plan-phone section 9
 * item 4): a loading state is never without an app bar or a way back.
 */
export default function ComplaintPage() {
  const { id } = useParams<{ id: string }>()
  const { layout } = useLayout()
  return (
    <React.Suspense fallback={layout === "phone" ? <PageHeader title="" parent="/complaints" /> : null}>
      {/* Keyed by id: another complaint is a fresh page, never the last
          one's state with a new title. */}
      {layout === "phone" ? (
        <PhoneComplaintRecord key={id} id={id} />
      ) : (
        <ComplaintDetailPage key={id} id={id} />
      )}
    </React.Suspense>
  )
}
