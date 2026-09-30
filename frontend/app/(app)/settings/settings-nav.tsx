"use client"

import { usePathname } from "next/navigation"

import { settingsSections, useSession } from "@/components/shell/session"
import {
  SettingsMenu,
  SettingsMenuItem,
} from "@/components/templates/settings-page"

/**
 * Section 11.5's vertical section menu. It is a second-level
 * navigation: whichever section is open, the sidebar keeps Settings
 * highlighted and does not move (section 12.1).
 *
 * Section 26 rule 1: a section the user cannot open is an AREA, so it
 * is hidden, not disabled. The list and its rules live in
 * `settingsSections` (session.tsx), shared with the layout's guard.
 */
export function SettingsNav() {
  const pathname = usePathname()
  const { can } = useSession()

  return (
    <SettingsMenu>
      {settingsSections(can).map((section) => (
        <SettingsMenuItem
          key={section.href}
          href={section.href}
          active={pathname.startsWith(section.href)}
        >
          {section.label}
        </SettingsMenuItem>
      ))}
    </SettingsMenu>
  )
}
