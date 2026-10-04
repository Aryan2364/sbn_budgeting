"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import {
  api,
  ApiError,
  getToken,
  login,
  setToken,
  type AuthUser,
  type Me,
} from "@/lib/api"
import {
  forgetPermissions,
  PermissionsProvider,
  receiveMe,
  usePermissions,
} from "@/lib/permissions"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * Who is signed in, for the whole app.
 *
 * WHO, never WHAT THEY MAY DO. Permissions are asked through
 * lib/permissions.ts (kit 26.3) and nowhere else: this file no longer
 * carries a `can`, a level or an admin flag. It does read `/auth/me`
 * as soon as the token is read and hands the `access` it carries to
 * the permissions store, so one request serves both (access plan 3.3,
 * the first-paint exception).
 *
 * Kit 26: permissions in the interface are appearance. The real check is
 * on the server.
 */
type SessionState =
  | { status: "loading"; user: null }
  | { status: "out"; user: null }
  /**
   * A token is present but could not be verified — the server is down
   * or unreachable, NOT a rejected session.
   *
   * These have to be different states. Treating an outage as "signed
   * out" clears a perfectly good token and makes an unreachable server
   * look like a login problem, which sends the user hunting for a
   * password that was never wrong.
   */
  | { status: "unreachable"; user: null; message: string }
  | { status: "in"; user: AuthUser }

interface SessionValue {
  status: SessionState["status"]
  user: AuthUser | null
  /** Set only while `status` is "unreachable". */
  message: string | null
  /** `login` is an email or a phone number (CONTRACT §1). */
  signIn: (login: string, password: string) => Promise<void>
  signOut: () => void
  retry: () => void
}

const SessionContext = React.createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  /**
   * Always "loading" on the first render, on the server and on the
   * client alike. Reading localStorage in the initialiser would make
   * the two disagree and break hydration — the server has no storage
   * to read.
   */
  const [state, setState] = React.useState<SessionState>({
    status: "loading",
    user: null,
  })
  const router = useRouter()
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false

    /**
     * The token is re-checked against the server rather than decoded
     * here: a role change or a revoked login has to take effect before
     * the token expires, not after.
     *
     * The no-token case goes through the same promise rather than
     * calling setState straight out of the effect body — a synchronous
     * setState in an effect renders once with the wrong value and then
     * immediately renders again.
     */
    Promise.resolve()
      .then(() => (getToken() ? api.get<Me>("/auth/me") : null))
      .then((me) => {
        if (cancelled) return
        if (me) {
          receiveMe(me)
          setState({ status: "in", user: me })
        } else {
          setState({ status: "out", user: null })
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return

        /**
         * ONLY a 401 or 403 means the session is no good. A network
         * failure or a 500 means the server could not answer, and
         * throwing the token away for that logs somebody out of a
         * working account because the API restarted.
         */
        const rejected =
          error instanceof ApiError && (error.isAuth || error.isForbidden)

        if (rejected) {
          setToken(null)
          setState({ status: "out", user: null })
          return
        }

        setState({
          status: "unreachable",
          user: null,
          message:
            error instanceof ApiError
              ? error.message
              : "Could not reach the server.",
        })
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  /**
   * The login answer carries the person but not their access, so `/me`
   * is read straight after it: the screen the user lands on is drawn
   * from their permissions, never from a guess. If that read fails they
   * are still signed in, and the shell shows the failed-permissions
   * banner with its "Try again" (kit 26.1 rule 5).
   */
  const signIn = React.useCallback(async (identifier: string, password: string) => {
    const result = await login({ login: identifier, password })
    setToken(result.token)
    forgetPermissions()
    const me = await api.get<Me>("/auth/me").catch(() => null)
    receiveMe(me ?? {})
    setState({ status: "in", user: me ?? result.user })
  }, [])

  const signOut = React.useCallback(() => {
    setToken(null)
    forgetPermissions()
    setState({ status: "out", user: null })
    router.replace("/login")
  }, [router])

  const value = React.useMemo<SessionValue>(
    () => ({
      status: state.status,
      user: state.user,
      message: state.status === "unreachable" ? state.message : null,
      signIn,
      signOut,
      retry: () => setAttempt((a) => a + 1),
    }),
    [state, signIn, signOut],
  )

  return (
    <SessionContext value={value}>
      <PermissionsProvider initial={null}>{children}</PermissionsProvider>
    </SessionContext>
  )
}

export function useSession(): SessionValue {
  const value = React.useContext(SessionContext)
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider")
  }
  return value
}

/**
 * Keeps a signed-out visitor off the product screens.
 *
 * It renders nothing while the session is resolving rather than
 * flashing the shell and then replacing it — section 14's point about
 * the layout arriving before the data, applied to the whole frame.
 *
 * And nothing until the permissions have landed either (access plan
 * 3.3 item 1, the declared first-paint exception): the sidebar, the
 * module switcher and every gated control then render with their final
 * answer, and nothing is drawn as "not known yet" only to be hidden
 * (kit 12.1, 26.1 rule 4). A failed load is not waited out: the shell
 * renders with controls disabled and the failed banner (26.1 rule 5).
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { status, message, retry } = useSession()
  const permissions = usePermissions()
  const router = useRouter()
  const pathname = usePathname()

  React.useEffect(() => {
    if (status === "out") {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""
      router.replace(`/login${next}`)
    }
  }, [status, router, pathname])

  /**
   * The server could not be reached. Section 13's "something failed":
   * say what went wrong and offer the way forward, rather than
   * redirecting to a sign-in screen the user does not need.
   */
  if (status === "unreachable") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-sunken p-6">
        <div className="w-full max-w-content-max rounded-xl border border-border-light bg-surface">
          <EmptyState
            variant="failed"
            heading="Could not reach the server"
            actionLabel="Try again"
            onAction={retry}
          >
            {message} You are still signed in — nothing has been lost.
          </EmptyState>
        </div>
      </main>
    )
  }

  if (status !== "in" || permissions.status === "loading") return null
  return <>{children}</>
}

/** Turns any thrown value into something worth showing a person. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return "That did not work. Try again."
}
