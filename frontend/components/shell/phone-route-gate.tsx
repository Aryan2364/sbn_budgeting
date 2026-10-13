"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { useLayout } from "@/lib/layout"
import { usePermissions } from "@/lib/permissions"
import { PHONE_WORDS } from "@/lib/phone-words"
import { phoneHomeHref, screenTitle } from "@/components/shell/nav"
import { isPhoneRoute } from "@/components/shell/phone-routes"
import { useSession } from "@/components/shell/session"
import { ComputerOnlyPage } from "@/components/templates/computer-only-page"

/**
 * Plan-phone D2: the ONE place computer-only screens are wired. On phone,
 * an address in the shell that is not in phone-routes.ts shows the
 * computer-only page of kit 41.11 instead of the page, at the same
 * address (41.2 rule 4), never a squeezed desktop layout (41.1 rule 3).
 * Its title is the screen's own, from nav.ts, and its parent is My work.
 *
 * Plan Q4: someone with no phone home (no Complaints View) gets this page
 * on EVERY address, with Sign out in place of "Go to home", which would
 * only bring them back here.
 *
 * On desktop it renders its children untouched and adds no element, so
 * no desktop page changes. It is always in the tree, in both layouts, so
 * a foldable switching layout does not remount the page under it.
 */
function PhoneRouteGate({ children }: { children: React.ReactNode }) {
  const { layout } = useLayout()
  const pathname = usePathname()
  const { can } = usePermissions()
  const { signOut } = useSession()

  if (layout !== "phone") return <>{children}</>

  const home = phoneHomeHref(can)
  if (home !== null && isPhoneRoute(pathname)) return <>{children}</>

  return (
    <ComputerOnlyPage
      // A screen with no phone home is shown as itself, top level.
      title={screenTitle(pathname)}
      homeHref={home}
      onSignOut={signOut}
      text={PHONE_WORDS.emptyState}
    />
  )
}

export { PhoneRouteGate }
