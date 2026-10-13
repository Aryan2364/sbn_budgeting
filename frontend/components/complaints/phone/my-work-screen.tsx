"use client"

import * as React from "react"

import { PHONE_WORDS } from "@/lib/phone-words"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/templates/page"

/**
 * My work (plan-phone 5.1). A STUB from Phase 1: the app bar and the
 * nothing-waiting state (41.15 rule 9). Phase 3a replaces it with the
 * phone list of complaints assigned to me that are still open.
 *
 * PageHeader is the first direct child of the fragment (top level: no
 * parent), so the app bar sticks and the tab bar shows.
 */
function MyWorkScreen() {
  return (
    <>
      <PageHeader title={PHONE_WORDS.titles.myWork} />
      <EmptyState variant="nothing-waiting" text={PHONE_WORDS.emptyState} />
    </>
  )
}

export { MyWorkScreen }
