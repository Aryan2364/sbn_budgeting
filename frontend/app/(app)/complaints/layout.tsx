"use client"

import * as React from "react"

import { useSession } from "@/components/shell/session"
import { EmptyState } from "@/components/ui/empty-state"
import { PageScroller } from "@/components/templates/page"

/**
 * Section 26 rule 1 for the whole Complaints area: someone with no
 * complaints access never sees it in the navigation, and a typed or
 * shared link lands on the no-access page (11.8) inside the shell, with
 * a way to somewhere they can go. The API refuses them too; this only
 * stops the screens being drawn.
 */
export default function ComplaintsLayout({ children }: { children: React.ReactNode }) {
  const { status, can } = useSession()

  if (status === "in" && !can.complaints) {
    return (
      <PageScroller>
        <EmptyState variant="no-access" dashboardHref="/" />
      </PageScroller>
    )
  }

  return <>{children}</>
}
