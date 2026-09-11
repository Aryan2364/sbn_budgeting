"use client"

import * as React from "react"

import { PageHeader, PageScroller } from "@/components/templates/page"
import { EmptyState } from "@/components/ui/empty-state"
import { useSession } from "@/components/shell/session"
import { SettingsLayout } from "@/components/templates/settings-page"
import { SettingsNav } from "./settings-nav"

/**
 * Section 11.5. Two columns: the section menu on the left at about
 * 200px, the section's cards on the right. The page owns the scroll;
 * the cards do not.
 *
 * The header sits in the layout rather than in each section, so the
 * title does not flicker or shift as the user moves between sections.
 */
export default function SettingsSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAdmin, status } = useSession()

  /**
   * Section 26: the sidebar already hides Settings from staff, but a
   * typed URL has to be refused too. Hiding a link is appearance; this
   * is the second half of it, and the API is the half that counts.
   */
  if (status === "in" && !isAdmin) {
    return (
      <PageScroller>
        <EmptyState variant="failed" heading="Settings is for administrators">
          Your account does not have access to this area. Ask an administrator
          if you need something changed here.
        </EmptyState>
      </PageScroller>
    )
  }

  return (
    <PageScroller>
      <PageHeader
        title="Settings"
        meta="Changes apply to everyone in the organisation"
      />
      <SettingsLayout className="mt-8" menu={<SettingsNav />}>
        {children}
      </SettingsLayout>
    </PageScroller>
  )
}
