"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleAlertIcon, TreePineIcon } from "lucide-react"

import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { errorMessage, useSession } from "@/components/shell/session"

/**
 * Sign in.
 *
 * Deliberately outside the shell route group: there is no navigation to
 * offer somebody who is not signed in, and a sidebar full of links that
 * all bounce back here is worse than no sidebar.
 *
 * Not on any phase checklist — Phase 3 built the auth API and said "no
 * product screens", and Phases 4 to 6 assume a signed-in user without
 * saying where the signing in happens. Flagged rather than quietly
 * skipped.
 */
function LoginForm() {
  const { signIn, status } = useSession()
  const router = useRouter()
  const params = useSearchParams()

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Already signed in and arrived here anyway — go where they meant.
  React.useEffect(() => {
    if (status === "in") router.replace(params.get("next") ?? "/dashboard")
  }, [status, router, params])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await signIn(email, password)
      router.replace(params.get("next") ?? "/dashboard")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-sunken p-6">
      <div className="w-full max-w-field-max">
        <div className="flex items-center gap-2">
          <TreePineIcon aria-hidden="true" className="size-icon-nav text-primary" />
          <span className="text-card-heading font-medium text-text-primary">
            Sadbhavna
          </span>
        </div>

        <h1 className="mt-8 text-page-title font-medium text-text-primary">
          Sign in
        </h1>
        <p className="mt-1 text-label text-text-secondary">
          Tree plantation project and site tracking.
        </p>

        {/* Section 7.1: a sign-in failure is a condition that persists
            until resolved, so it is a banner, not a toast. */}
        {error ? (
          <Banner variant="danger" className="mt-6">
            <CircleAlertIcon />
            <BannerTitle>Could not sign in</BannerTitle>
            <BannerDescription>{error}</BannerDescription>
          </Banner>
        ) : null}

        <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" required>
              Email address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password" required>
              Password
            </Label>
            {/* Section 32: never a bare password input. */}
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? (
              <InlineFieldError>
                Check the email address and password and try again.
              </InlineFieldError>
            ) : null}
          </div>

          {/* Section 14 rule 2: the button shows its own loading state
              and disables, so nobody submits three times. */}
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  )
}
