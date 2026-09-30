"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { TreePineIcon } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import { homeHref, RequireSession, useSession } from "@/components/shell/session"

/**
 * `/` goes to the first module the user can open (CONTRACT §4). There
 * is no landing screen of its own.
 *
 * A user with no module at all gets the no-access state here, with the
 * one way forward that can work: sign out (and back in as someone
 * else). The 11.8 no-access page's "Go to dashboard" would bounce them
 * off a dashboard they cannot open, which is a dead end with a button,
 * so the no-access state carries Sign out as its one action instead.
 */
function Home() {
  const { can, user, signOut } = useSession()
  const router = useRouter()
  const target = homeHref(can)

  React.useEffect(() => {
    if (target !== "/") router.replace(target)
  }, [target, router])

  if (target !== "/") return null

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-surface px-4 py-12">
      <div className="flex items-center gap-2 text-text-primary">
        <TreePineIcon aria-hidden="true" className="size-icon-empty" />
        <span className="text-section font-medium">Sadbhavna</span>
      </div>
      <EmptyState
        variant="no-access"
        heading="Your account has no access yet"
        actionLabel="Sign out"
        onAction={signOut}
      >
        {user ? `${user.name}, you` : "You"} are signed in, but not to Budget or
        Complaints. Ask an administrator to give you access, then sign in again.
      </EmptyState>
    </main>
  )
}

export default function HomePage() {
  return (
    <RequireSession>
      <Home />
    </RequireSession>
  )
}
