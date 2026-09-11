"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { api, ApiError, getToken, setToken, type AuthUser } from "@/lib/api"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * Who is signed in, for the whole app.
 *
 * AGENTS.md section 26: permissions in the interface are appearance —
 * the real check is on the server, which is where `RolesGuard` lives.
 * This exists so a control the user cannot use is never shown, not so
 * that it is enforced.
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
  isAdmin: boolean
  /** Set only while `status` is "unreachable". */
  message: string | null
  signIn: (email: string, password: string) => Promise<void>
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
      .then(() => (getToken() ? api.get<AuthUser>("/auth/me") : null))
      .then((user) => {
        if (cancelled) return
        if (user) setState({ status: "in", user })
        else setState({ status: "out", user: null })
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

  const signIn = React.useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: AuthUser }>(
      "/auth/login",
      { email, password },
    )
    setToken(result.token)
    setState({ status: "in", user: result.user })
  }, [])

  const signOut = React.useCallback(() => {
    setToken(null)
    setState({ status: "out", user: null })
    router.replace("/login")
  }, [router])

  const value = React.useMemo<SessionValue>(
    () => ({
      status: state.status,
      user: state.user,
      isAdmin: state.user?.role === "admin",
      message: state.status === "unreachable" ? state.message : null,
      signIn,
      signOut,
      retry: () => setAttempt((a) => a + 1),
    }),
    [state, signIn, signOut],
  )

  return <SessionContext value={value}>{children}</SessionContext>
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
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { status, message, retry } = useSession()
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

  if (status !== "in") return null
  return <>{children}</>
}

/** Turns any thrown value into something worth showing a person. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return "That did not work. Try again."
}
