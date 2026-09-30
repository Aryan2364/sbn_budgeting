"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { PageHeader, PageScroller } from "@/components/templates/page"
import { EmptyState } from "@/components/ui/empty-state"
import {
  homeHref,
  settingsSections,
  useSession,
} from "@/components/shell/session"
import { SettingsLayout } from "@/components/templates/settings-page"
import { SettingsNav } from "./settings-nav"

/**
 * Section 11.5. Two columns: the section menu on the left at 200px,
 * the section's cards on the right. The page owns the scroll; the cards
 * do not.
 *
 * The header sits in the layout rather than in each section, so the
 * title does not flicker or shift as the user moves between sections.
 */
export default function SettingsSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { can, status } = useSession()
  const sections = settingsSections(can)

  /**
   * Section 26 rule 1 and 11.8 rule 4: the sidebar and the section menu
   * already hide what this user cannot open, but a typed URL has to be
   * refused too. That is either every section (nothing in Settings is
   * theirs) or the one in the address bar. `/settings` and the old
   * site-locations address only redirect, so they are let through.
   *
   * The API is the half that counts; this is the appearance.
   */
  const onSection =
    pathname === "/settings" ||
    // The old address; its page only redirects to /settings/locations,
    // and that page is guarded like any other.
    pathname === "/settings/site-locations" ||
    sections.some((section) => pathname.startsWith(section.href))
  if (status === "in" && (sections.length === 0 || !onSection)) {
    return (
      <PageScroller>
        <div className="flex flex-1 items-center justify-center py-12">
          <EmptyState variant="no-access" dashboardHref={homeHref(can)} />
        </div>
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
