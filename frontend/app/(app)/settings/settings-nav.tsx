"use client"

import { usePathname } from "next/navigation"

import { usePermissions } from "@/lib/permissions"
import { settingsSections } from "@/components/shell/nav"
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
 * is hidden, not disabled. The list and the permission that opens each
 * section live in `SETTINGS_SECTIONS` (nav.ts), shared with the layout's
 * guard and the sidebar.
 */
export function SettingsNav() {
  const pathname = usePathname()
  const { can } = usePermissions()

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
