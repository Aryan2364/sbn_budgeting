"use client"

import * as React from "react"

import { MODULE_KEYS } from "@/lib/permission-keys"
import { usePageGuard } from "@/lib/permissions"

/**
 * Kit 26 rule 1 and 26.6 for the whole Complaints area: someone who
 * holds nothing in Complaints never sees it in the navigation, and a
 * typed or shared link lands on the no-access page (11.8) inside the
 * shell, with a way to somewhere they can go. A Pick alone does not
 * open the area (plan 5.3.5). The API refuses them too; this only stops
 * the screens being drawn.
 *
 * The shell checks each page's own permission as well (app-shell.tsx):
 * the list and dashboard need View, a new complaint needs Raise.
 */
export default function ComplaintsLayout({ children }: { children: React.ReactNode }) {
  const denied = usePageGuard(MODULE_KEYS.complaints)
  // Plan-phone D9: the Complaints area is Gujarati on both layouts, and
  // says so in the server's HTML, before DocumentLanguage (in the shell)
  // sets <html lang>. display: contents, so the box adds nothing to the
  // layout: each page's frame, and on phone its PageHeader's sticky app
  // bar, behave exactly as if the wrapper were not there.
  return (
    <div lang="gu" className="contents">
      {denied ?? children}
    </div>
  )
}
