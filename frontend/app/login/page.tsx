"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { TreePineIcon } from "lucide-react"

import { ApiError } from "@/lib/api"
import { SignInPage, type SignInResult } from "@/components/templates/sign-in-page"
import { errorMessage, homeHref, useSession } from "@/components/shell/session"

/**
 * Sign in (FRONTEND_RULES.md section 11.7), by email OR phone
 * (CONTRACT §1): the kit's sign-in template in its "email-or-phone"
 * form. Everything product-specific arrives as props; the page adds only
 * the session call and where to go afterwards.
 *
 * Deliberately outside the shell route group: there is no navigation
 * to offer somebody who is not signed in.
 */

/** Only a same-app path is followed, never an absolute URL. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null
}

function LoginForm() {
  const { signIn, status, can } = useSession()
  const router = useRouter()
  const params = useSearchParams()

  // Signed in (just now, or already): go where they meant, or to the
  // first module they can open.
  React.useEffect(() => {
    if (status === "in") {
      router.replace(safeNext(params.get("next")) ?? homeHref(can))
    }
  }, [status, can, router, params])

  async function submit({ login, password }: { login: string; password: string }): Promise<SignInResult> {
    try {
      await signIn(login, password)
      // The effect above navigates; the template keeps the button busy
      // until then.
      return "success"
    } catch (caught) {
      // A 401 (or a 400 on a malformed identifier) is "wrong
      // credentials" and gets the one fixed message. Anything else
      // (server down, timeout) is said as what it is.
      return caught instanceof ApiError && (caught.isAuth || caught.status === 400)
        ? "failure"
        : { error: errorMessage(caught) }
    }
  }

  return (
    <SignInPage
      identifier="email-or-phone"
      autoFocus
      product={{ name: "Sadbhavna", mark: <TreePineIcon /> }}
      headline="Every site and complaint, in one place"
      highlight="in one place"
      supportingLine="Plantation budgets and spending, and complaints from the field, tracked from raising to resolution."
      // No reset flow: an administrator sets passwords in Settings, People.
      forgotPasswordNote="Ask your administrator to reset it."
      onSubmit={submit}
    />
  )
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  )
}
