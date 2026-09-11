"use client"

import * as React from "react"

import { SiteForm } from "@/components/forms/site-form"

/** Add. The same component as Edit (section 4 rule 1). */
export default function NewSitePage() {
  return (
    <React.Suspense fallback={null}>
      <SiteForm />
    </React.Suspense>
  )
}
