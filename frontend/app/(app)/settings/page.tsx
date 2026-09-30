"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { settingsSections, useSession } from "@/components/shell/session"

/**
 * /settings opens the first section this user may see (the sidebar and
 * every old bookmark point here). Which one that is depends on who is
 * signed in, so it is decided on the client. With no section at all,
 * the layout around this already shows the no-access state.
 */
export default function SettingsPage() {
  const router = useRouter()
  const { can } = useSession()
  const first = settingsSections(can)[0]?.href

  React.useEffect(() => {
    if (first) router.replace(first)
  }, [first, router])

  return null
}
