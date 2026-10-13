"use client"

import * as React from "react"

import { useProgress } from "@/components/shell/progress-bar"
import { useLayout } from "@/lib/layout"

/**
 * A phone-only address in the browser (41.2 rule 5): More, the phone
 * search page and the personal settings screens.
 *
 * The server renders these only for a phone guess (redirectOnDesktop in
 * lib/layout.server.ts). If the device then turns out to be a computer
 * (the one correction of 41.2 rule 3), or a foldable is unfolded while
 * the screen is open, the layout becomes desktop here: the screen is not
 * drawn in the desktop shell, and the address is replaced by its desktop
 * form through the shell's navigation, as the server would have done.
 *
 * Needs the shell's ProgressProvider above it (AppShell provides one).
 */
function PhoneOnly({ desktopHref, children }: { desktopHref: string; children: React.ReactNode }) {
  const { layout } = useLayout()
  const { navigate } = useProgress()

  React.useEffect(() => {
    if (layout === "desktop") navigate(desktopHref, { replace: true })
  }, [layout, navigate, desktopHref])

  if (layout === "desktop") return null
  return <>{children}</>
}

export { PhoneOnly }
