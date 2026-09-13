"use client"

import { usePathname } from "next/navigation"

import {
  SettingsMenu,
  SettingsMenuItem,
} from "@/components/templates/settings-page"

/**
 * Section 11.5's vertical section menu. It is a second-level
 * navigation: whichever section is open, the sidebar keeps Settings
 * highlighted and does not move (section 12.1).
 */
const SECTIONS = [
  { label: "Cost heads", href: "/settings/cost-heads" },
  { label: "Site locations", href: "/settings/site-locations" },
  { label: "People", href: "/settings/people" },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <SettingsMenu>
      {SECTIONS.map((section) => (
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
