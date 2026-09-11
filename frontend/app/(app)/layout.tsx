import * as React from "react"

import { AppShell } from "@/components/shell/app-shell"
import { RequireSession } from "@/components/shell/session"

/**
 * Section 12. Every product screen sits inside the shell. The route
 * group carries no path segment, so the shell wraps /dashboard,
 * /projects and the rest without appearing in any URL.
 *
 * /kitchen-sink stays outside it deliberately: it is the component
 * reference, not a product screen, and the shell would frame it as one.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  )
}
