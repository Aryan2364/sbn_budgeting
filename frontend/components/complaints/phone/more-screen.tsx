"use client"

import * as React from "react"

import { PHONE_WORDS } from "@/lib/phone-words"
import { MoreScreen } from "@/components/shell/more-screen"
import { useSession } from "@/components/shell/session"
import { PageHeader } from "@/components/templates/page"

/**
 * More (plan-phone 5.7, L7): the account summary, then Sign out. Tracking
 * has no other phone screens to list, and Settings and Access stay on the
 * computer (41.11 rule 2), so there are no rows.
 *
 * HOOKS FOR LATER PHASES: Install app (Phase 5) and the Notifications
 * switch row (Phase 6) go in MoreScreen's `actions`, above Sign out.
 *
 * PageHeader is the first direct child of the fragment (top level: no
 * parent), so the app bar sticks and the tab bar shows.
 */
function PhoneMoreScreen() {
  const { user, signOut } = useSession()
  return (
    <>
      <PageHeader title={PHONE_WORDS.titles.more} />
      <MoreScreen
        items={[]}
        account={{
          name: user?.name ?? "",
          // The phone first: field staff sign in by it (CONTRACT §1).
          detail: user?.phone ?? user?.email ?? undefined,
        }}
        onSignOut={signOut}
        text={{ signOut: PHONE_WORDS.more.signOut }}
      />
    </>
  )
}

export { PhoneMoreScreen }
