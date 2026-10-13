"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { useLayout } from "@/lib/layout"

/**
 * Plan-phone D9: the language the page says it is in, so a browser
 * never offers to translate typed Gujarati "from English".
 *
 *   - Phone: every screen but Login is Gujarati, so <html lang="gu">. The
 *     server already set it for a phone guess (app/layout.tsx); this keeps
 *     it right after the one layout correction (41.2 rule 3).
 *   - Desktop: Gujarati while a complaints page is open (the whole
 *     Complaints area is Gujarati), English everywhere else.
 *
 * Whole screens are never locked against translation (no translate="no"
 * here): a person who wants a translation can still have one. Mounted
 * once, in AppShell. Renders nothing.
 */
function DocumentLanguage(): null {
  const { layout } = useLayout()
  const pathname = usePathname()
  const complaints = pathname === "/complaints" || pathname.startsWith("/complaints/")
  const lang = layout === "phone" || complaints ? "gu" : "en"

  React.useEffect(() => {
    const root = document.documentElement
    if (root.lang !== lang) root.lang = lang
  }, [lang])

  return null
}

export { DocumentLanguage }
