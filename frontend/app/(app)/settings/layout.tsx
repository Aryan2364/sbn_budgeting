"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { usePageGuard } from "@/lib/permissions"
import { PageHeader, PageScroller } from "@/components/templates/page"
import { SETTINGS_SECTIONS } from "@/components/shell/nav"
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

  /**
   * Kit 26 rule 1 and 26.6: the sidebar and the section menu already
   * hide what this user cannot open, but a typed URL has to be refused
   * too. That is either every section (nothing in Settings is theirs) or
   * the one in the address bar. `/settings` and the old site-locations
   * address only redirect, so they need any section at all.
   *
   * The API is the half that counts; this is the appearance.
   */
  const section = SETTINGS_SECTIONS.find((s) => pathname.startsWith(s.href))
  const denied = usePageGuard(
    section ? section.permission : SETTINGS_SECTIONS.map((s) => s.permission),
  )
  if (denied) return denied

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
