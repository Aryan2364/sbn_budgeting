"use client"

import * as React from "react"

import { GU_PHONE } from "@/components/complaints/gu"
import { api } from "@/lib/api"
import { PHONE_WORDS } from "@/lib/phone-words"
import { MoreScreen } from "@/components/shell/more-screen"
import { PhoneNotificationsSetting } from "@/components/ui/notification-permission-sheet"
import { useSession } from "@/components/shell/session"
import { PageHeader } from "@/components/templates/page"

/**
 * More (plan-phone 5.7, L7): the account summary, then the
 * Notifications row (Phase 6b), then Sign out. Tracking has no other
 * phone screens to list, and Settings and Access stay on the computer
 * (41.11 rule 2), so there are no rows.
 *
 * HOOK FOR LATER PHASE: Install app (Phase 5) goes in MoreScreen's
 * `actions`, alongside the Notifications row below, above Sign out —
 * the install agent's own worktree adds it there.
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
        actions={
          user ? (
            <PhoneNotificationsSetting
              person={user.id}
              appName={PHONE_WORDS.titles.product}
              installHref="/more"
              text={GU_PHONE.notifications}
              onSubscribe={(subscription) => api.post("/push/subscriptions", subscription)}
              onUnsubscribe={(endpoint) => api.delete("/push/subscriptions", { endpoint })}
            />
          ) : null
        }
      />
    </>
  )
}

export { PhoneMoreScreen }
