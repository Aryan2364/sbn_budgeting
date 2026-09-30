"use client"

import * as React from "react"
import { OctagonXIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Banner, BannerDescription } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"

/**
 * Section 11.7, the sign-in page. One half says what the product is, the
 * other signs people in.
 *
 * Everything the brand panel says is the product's own (section 0.1 item
 * 5), so it arrives as props; the form's words are the system's and are
 * fixed here. The panel's colours all come from the brand block, so a
 * brand swap carries the whole panel.
 */

export type Product = {
  name: string
  /** The product mark, drawn at the 22px icon size beside the name. */
  mark: React.ReactNode
}

/**
 * "failure" is a wrong identifier or password: the one fixed banner
 * (11.7), never naming which field. `{ error }` is anything else, such
 * as the server being unreachable, said as what it is (cause, then the
 * next action, section 7.2) in the same banner.
 */
export type SignInResult = "success" | "failure" | { error: string }

/**
 * What the first field accepts. "email" is the kit default. A product
 * whose people sign in by email OR phone number passes "email-or-phone";
 * the label, keyboard, check, helper line and failure message follow.
 */
export type SignInIdentifier = "email" | "email-or-phone"

type SignInPageBaseProps = {
  product: Product
  /** Eight words or fewer (11.7). */
  headline: string
  /** One phrase inside the headline, shown in on-brand-accent. Only one. */
  highlight?: string
  /** One or two sentences under the headline. */
  supportingLine: string
  /** Put the cursor in the first field when the page opens. */
  autoFocus?: boolean
}

type ForgotPasswordProps =
  | { forgotPasswordHref: string; forgotPasswordNote?: never }
  | {
      forgotPasswordHref?: never
      /**
       * For a product with no reset flow, where a link would go nowhere
       * (6.6): the way forward, shown as plain text after "Forgot your
       * password?", e.g. "Ask your administrator to reset it."
       */
      forgotPasswordNote: string
    }

/**
 * `onSubmit` resolves "failure" for wrong credentials, which shows the
 * one failure banner. On "success" the caller navigates away; the button
 * stays in its loading state until it does, so it cannot be pressed twice.
 */
type IdentifierProps =
  | {
      identifier?: "email"
      onSubmit: (credentials: { email: string; password: string }) => Promise<SignInResult>
    }
  | {
      identifier: "email-or-phone"
      /** `login` is the trimmed email address or phone number, as typed. */
      onSubmit: (credentials: { login: string; password: string }) => Promise<SignInResult>
    }

type SignInPageProps = SignInPageBaseProps & ForgotPasswordProps & IdentifierProps

const FAILURE = "The email or password is not right. Check both and try again."

function emailError(value: string): string | null {
  const v = value.trim()
  if (v === "") return "Enter your email address, like name@company.com."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return "Enter a complete email address, like name@company.com."
  }
  return null
}

/**
 * An `@` means an email; anything else is read as a phone number, which
 * needs at least 10 digits (spaces, dashes and a +91 are allowed).
 */
function emailOrPhoneError(value: string): string | null {
  const v = value.trim()
  if (v === "") return "Enter your email address or phone number."
  if (v.includes("@")) return emailError(v)
  if (v.replace(/\D/g, "").length < 10) {
    return "Enter a 10-digit phone number, or an email address like name@company.com."
  }
  return null
}

/** Everything about the first field that changes with `identifier`. */
const IDENTIFIER = {
  email: {
    id: "sign-in-email",
    name: "email",
    label: "Email address",
    helper: "Use the email address your administrator invited.",
    failure: FAILURE,
    check: emailError,
    input: { type: "email", autoComplete: "username", inputMode: "email" },
  },
  "email-or-phone": {
    id: "sign-in-login",
    name: "username",
    label: "Email or phone",
    helper: "Use the email address or phone number your administrator added.",
    failure: "The email, phone or password is not right. Check them and try again.",
    check: emailOrPhoneError,
    // Plain text: an email keyboard hides the digits and a phone keypad
    // hides the @. Neither guess is right for both.
    input: { type: "text", autoComplete: "username", autoCapitalize: "none", spellCheck: false },
  },
} satisfies Record<
  SignInIdentifier,
  {
    id: string
    name: string
    label: string
    helper: string
    failure: string
    check: (value: string) => string | null
    input: React.InputHTMLAttributes<HTMLInputElement>
  }
>

function passwordError(value: string): string | null {
  return value === "" ? "Enter your password." : null
}

/** Splits the headline so the one highlighted phrase can be coloured. */
function Headline({ text, highlight }: { text: string; highlight?: string }) {
  if (process.env.NODE_ENV !== "production") {
    const words = text.trim().split(/\s+/).length
    if (words > 8) {
      console.warn(`[design-system] The sign-in headline has ${words} words. FRONTEND_RULES.md section 11.7: eight or fewer.`)
    }
    if (highlight && !text.includes(highlight)) {
      console.warn(`[design-system] The sign-in highlight "${highlight}" is not part of the headline, so nothing is highlighted (section 11.7).`)
    }
  }
  const at = highlight ? text.indexOf(highlight) : -1
  if (!highlight || at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className="text-on-brand-accent">{highlight}</span>
      {text.slice(at + highlight.length)}
    </>
  )
}

function ProductName({ product }: { product: Product }) {
  return (
    <div className="flex items-center gap-2 text-on-brand">
      <span aria-hidden="true" className="flex [&_svg]:size-icon-empty">
        {product.mark}
      </span>
      <span className="text-section font-medium">{product.name}</span>
    </div>
  )
}

function SignInPage(props: SignInPageProps) {
  const { product, headline, highlight, supportingLine, forgotPasswordHref, forgotPasswordNote, autoFocus } = props
  const field = IDENTIFIER[props.identifier ?? "email"]
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [errors, setErrors] = React.useState<{ email?: string | null; password?: string | null }>({})
  const [failure, setFailure] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const next = { email: field.check(email), password: passwordError(password) }
    setErrors(next)
    // 39.3: when a submit fails validation, focus moves to the first field with an error.
    if (next.email) return emailRef.current?.focus()
    if (next.password) return passwordRef.current?.focus()

    setFailure(null)
    setPending(true)
    const result =
      props.identifier === "email-or-phone"
        ? await props.onSubmit({ login: email.trim(), password })
        : await props.onSubmit({ email: email.trim(), password })
    if (result !== "success") {
      setPending(false)
      setFailure(result === "failure" ? field.failure : result.error)
    }
  }

  const year = new Date().getFullYear()

  return (
    <div data-slot="sign-in-page" className="flex min-h-full flex-1 flex-col lg:grid lg:grid-cols-2">
      {/* The brand panel. Below 1024px it is a strip holding only the
          mark and the name; the headline and footer need the full half. */}
      <section
        aria-label={product.name}
        className="relative isolate flex flex-col overflow-hidden bg-linear-to-br from-primary to-primary-pressed px-6 py-4 lg:justify-between lg:p-12"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(var(--on-brand)_1px,transparent_1px),linear-gradient(90deg,var(--on-brand)_1px,transparent_1px)] bg-size-[32px_32px] opacity-(--brand-pattern-opacity)"
        />
        <ProductName product={product} />
        <div className="hidden max-w-md flex-col gap-4 lg:flex">
          {/* Section 3: Display, 40px at 500, on-brand. The only place it is used. */}
          <p className="text-display font-medium text-on-brand">
            <Headline text={headline} highlight={highlight} />
          </p>
          <p className="text-card-heading font-normal text-on-brand-muted">{supportingLine}</p>
        </div>
        <p className="hidden text-meta text-on-brand-muted lg:block">
          © {year} {product.name}
        </p>
      </section>

      <main className="flex flex-1 items-center justify-center bg-surface px-4 py-12">
        <form noValidate onSubmit={submit} className="w-full max-w-auth-form" aria-describedby="sign-in-helper">
          <h1 className="text-page-title font-medium text-text-primary">Sign in to your workspace</h1>
          <p id="sign-in-helper" className="mt-2 text-body text-text-secondary">
            {field.helper}
          </p>

          <div className="mt-8">
            <Label htmlFor={field.id} required>
              {field.label}
            </Label>
            <Input
              ref={emailRef}
              id={field.id}
              name={field.name}
              {...field.input}
              autoFocus={autoFocus}
              className="mt-2 max-w-none"
              value={email}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${field.id}-error` : undefined}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setErrors((c) => ({ ...c, email: field.check(email) }))}
            />
            <InlineFieldError id={`${field.id}-error`}>{errors.email}</InlineFieldError>
          </div>

          <div className="mt-6">
            <Label htmlFor="sign-in-password" required>
              Password
            </Label>
            <PasswordInput
              ref={passwordRef}
              id="sign-in-password"
              name="password"
              autoComplete="current-password"
              className="mt-2 max-w-none"
              value={password}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "sign-in-password-error" : undefined}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setErrors((c) => ({ ...c, password: passwordError(password) }))}
            />
            <InlineFieldError id="sign-in-password-error">{errors.password}</InlineFieldError>
            {forgotPasswordHref !== undefined ? (
              <div className="mt-2 flex justify-end">
                {/* 6.6: a standing link - primary-text, body weight, underline on hover. */}
                <a
                  href={forgotPasswordHref}
                  className={cn(
                    "tap-area rounded-sm text-body text-primary-text hover:underline",
                    "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
                  )}
                >
                  Forgot your password?
                </a>
              </div>
            ) : (
              // No reset flow, so no link that goes nowhere (6.6): the same
              // words as plain text, with the way forward.
              <p className="mt-2 text-right text-label text-text-secondary">
                Forgot your password? {forgotPasswordNote}
              </p>
            )}
          </div>

          {failure ? (
            <Banner variant="danger" className="mt-6">
              <OctagonXIcon />
              <BannerDescription>{failure}</BannerDescription>
            </Banner>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="mt-6 w-full"
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? "Signing in" : "Sign in"}
          </Button>
        </form>
      </main>
    </div>
  )
}

export { SignInPage }
