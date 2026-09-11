"use client"

import * as React from "react"

import { SiteForm } from "@/components/forms/site-form"

/** Edit. The same component as Add (section 4 rule 1). */
export default function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)
  return (
    <React.Suspense fallback={null}>
      <SiteForm siteId={id} />
    </React.Suspense>
  )
}
