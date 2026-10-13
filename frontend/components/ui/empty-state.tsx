"use client"

import * as React from "react"
import {
  CircleAlertIcon,
  FileQuestionMarkIcon,
  InboxIcon,
  LockIcon,
  MonitorIcon,
  SearchIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"

/**
 * Sections 13 and 11.8. There are three empty states, not one, and
 * using the wrong one makes the software look unintelligent - never
 * offer "Add your first record" to someone whose filter simply matched
 * nothing. The error pages of 11.8 are built from the same component.
 *
 * The variant is the whole point of this component, so it is a closed
 * set rather than free-form props. Each variant fixes its own icon and
 * the shape of its actions; the caller supplies the words and the
 * handler. A component that can be used wrongly will be.
 *
 *   nothing-yet   - what would normally be here. Secondary: create. The
 *                   page header's Add stays the one primary (13, 6.1).
 *   nothing-found - the filters matched no records. Clear filters.
 *   failed        - what went wrong. Retry.
 *   not-found     - the 11.8 "Page not found" page. Primary: dashboard.
 *   no-access     - the 11.8 no-access page (26). Primary: dashboard.
 *   nothing-waiting - My work with nothing waiting (41.15 rule 9): the
 *                   one empty state with no action, because there is
 *                   nothing to create.
 *   desktop-only  - a computer-only screen opened on a phone (41.11
 *                   rule 1, 41.1 rule 3). Primary: "Share link", the
 *                   phone's share sheet, or "Copy link" where the browser
 *                   has none. Secondary: "Go to home", My work.
 *
 * `failed` has two forms. In a list or a card (13) it offers one
 * secondary "Try again". As the 11.8 "Something went wrong" PAGE - given
 * a `dashboardHref` - "Try again" becomes primary, "Go to dashboard"
 * sits beside it as secondary, and the `reference` code shows below the
 * actions in meta style (11.8 rule 3).
 *
 * not-found and no-access carry 11.8's fixed wording by default, and
 * `failed` in its page form does too; the caller may still pass its own.
 *
 * ON PHONE (11.8 rule 6), through useLayout() (41.3 rule 4): the page
 * forms' "Go to dashboard" reads "Go to home" and opens `homeHref`, My
 * work (41.15), where one is given; without one it still opens
 * `dashboardHref`. On desktop the label and the address are exactly
 * `dashboardHref`'s "Go to dashboard", whatever `homeHref` holds.
 */
type EmptyStateVariant =
  | "nothing-yet"
  | "nothing-found"
  | "failed"
  | "not-found"
  | "no-access"
  | "nothing-waiting"
  | "desktop-only"

const ICONS: Record<EmptyStateVariant, React.ReactNode> = {
  "nothing-yet": <InboxIcon />,
  "nothing-found": <SearchIcon />,
  failed: <CircleAlertIcon />,
  "not-found": <FileQuestionMarkIcon />,
  "no-access": <LockIcon />,
  "nothing-waiting": <InboxIcon />,
  // 23.2: the computer-only screen.
  "desktop-only": <MonitorIcon />,
}

const DASHBOARD_LABEL = "Go to dashboard"

/**
 * The words this component shows on phone, where a product's phone
 * screens may be in another language (37.6 rule 2, Tracking plan D7).
 * Each defaults to the kit's English, so a caller that passes nothing,
 * and every desktop screen, is unchanged.
 */
type EmptyStateText = {
  /** 11.8 rule 6: "Go to dashboard" on phone, where home is My work. */
  goHome: string
  shareLink: string
  copyLink: string
  linkCopied: string
  copyFailed: string
  /** Plan Q4: the desktop-only page's secondary for someone with no phone home. */
  signOut: string
  desktopOnlyHeading: string
  desktopOnlyLine: string
  nothingWaitingHeading: string
  nothingWaitingLine: string
}

const EMPTY_STATE_TEXT: EmptyStateText = {
  goHome: "Go to home",
  shareLink: "Share link",
  copyLink: "Copy link",
  linkCopied: "Link copied",
  copyFailed: "The link could not be copied. Copy it from the address bar instead.",
  signOut: "Sign out",
  desktopOnlyHeading: "This screen works on a computer",
  desktopOnlyLine: "Open it on a computer to use it. This link opens the same screen there.",
  nothingWaitingHeading: "Nothing is waiting for you",
  nothingWaitingLine: "New approvals and tasks will appear here.",
}

type Base = Omit<React.ComponentProps<"div">, "children"> & {
  /**
   * The heading element. An error page (11.8) is the page, so its heading
   * defaults to h1; an empty state inside a screen defaults to h2. Set it
   * to fit the outline around it. The look does not change. On phone, in
   * the shell, an error page passes 2: its title is the app bar's h1.
   */
  headingLevel?: 1 | 2 | 3
  /** Overrides the component's own words (EmptyStateText); defaults are English. */
  text?: Partial<EmptyStateText>
}

type EmptyStateProps = Base &
  (
    | {
        variant: "nothing-yet" | "nothing-found"
        /** Short. "No customers yet", not a sentence. */
        heading: string
        /** One line explaining how to change the situation. */
        children: React.ReactNode
        /**
         * Overrides only the wording. `nothing-yet` should name the
         * record ("Add customer", section 37.2).
         */
        actionLabel?: string
        onAction?: () => void
      }
    | {
        variant: "failed"
        /** Defaults to 11.8's "Something went wrong". */
        heading?: string
        /** What went wrong. Defaults to 11.8's line in the page form. */
        children?: React.ReactNode
        actionLabel?: string
        onAction?: () => void
        /** Turns this into the 11.8 page: adds "Go to dashboard". */
        dashboardHref?: string
        /** Page form, phone only: where "Go to home" leads (11.8 rule 6). */
        homeHref?: string
        /** 11.8 rule 3: the code the server recorded with the error. */
        reference?: string
      }
    | ({
        variant: "not-found" | "no-access"
        heading?: string
        children?: React.ReactNode
      } & (
        | {
            dashboardHref: string
            /** Phone only: where "Go to home" leads, My work (11.8 rule 6). */
            homeHref?: string
            actionLabel?: never
            onAction?: never
          }
        /*
         * Tracking extension (fe-kit): the one primary action as a handler
         * instead of a link, for a product with more than one "home" (a
         * complaints-only user has no budget dashboard to go to). Still
         * exactly one primary, as 11.8 requires; the label defaults to
         * "Go to dashboard".
         */
        | { dashboardHref?: never; homeHref?: never; actionLabel?: string; onAction: () => void }
      ))
    | {
        variant: "nothing-waiting"
        /** Defaults to 41.15 rule 9's "Nothing is waiting for you". */
        heading?: string
        children?: React.ReactNode
      }
    | {
        variant: "desktop-only"
        /** Defaults to 41.11 rule 1's "This screen works on a computer". */
        heading?: string
        children?: React.ReactNode
        /**
         * Where "Go to home" leads: My work, the phone's home (41.15).
         * Tracking (plan Q4): without one, a person with no phone home
         * gets `onSignOut` as the secondary instead, never a loop.
         */
        homeHref?: string
        onSignOut?: () => void
      }
  )

const DEFAULT_WORDS: Partial<
  Record<EmptyStateVariant, { heading: string; line: string }>
> = {
  "not-found": {
    heading: "Page not found",
    line: "The link may be old, or the page may have moved.",
  },
  "no-access": {
    heading: "You don't have access to this page",
    line: "Ask an administrator if you need it.",
  },
  "nothing-waiting": {
    heading: "Nothing is waiting for you",
    line: "New approvals and tasks will appear here.",
  },
  "desktop-only": {
    heading: "This screen works on a computer",
    line: "Open it on a computer to use it. This link opens the same screen there.",
  },
  failed: {
    heading: "Something went wrong",
    line: "Try again. If it keeps happening, share the reference below with your support team.",
  },
}

/**
 * The words a variant shows when the caller passes none. The 11.8 error
 * page reads its heading from here for the phone app bar's title, so the
 * two can never differ.
 */
function emptyStateWords(variant: EmptyStateVariant) {
  return DEFAULT_WORDS[variant]
}

/**
 * "Go to dashboard" on desktop; "Go to home" on phone, opening `homeHref`
 * where there is one (11.8 rule 6).
 */
function DashboardLink({
  href,
  homeHref,
  homeLabel,
  variant,
}: {
  href: string
  homeHref?: string
  homeLabel: string
  variant: "primary" | "secondary"
}) {
  const phone = useLayout().layout === "phone"
  return (
    <Button
      variant={variant}
      size="sm"
      nativeButton={false}
      render={<a href={phone ? (homeHref ?? href) : href} />}
    >
      {phone ? homeLabel : DASHBOARD_LABEL}
    </Button>
  )
}

/*
 * Whether the browser has a share sheet (navigator.share). It never
 * changes while the page is open, so nothing is subscribed. The server
 * cannot know, so it guesses yes: this button shows on phones (41.11),
 * and phone browsers have a share sheet, so the label almost never
 * changes after the first paint.
 */
const shareSheet = {
  subscribe: () => () => {},
  read: () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  server: () => true,
}

/** The person closed the share sheet without sharing: not a failure. */
function isCancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

async function copyAddress(url: string, text: EmptyStateText) {
  try {
    await navigator.clipboard.writeText(url)
    // 37.4: a confirmation says what happened, in the past tense.
    toast.success(text.linkCopied)
  } catch {
    // 7.2 rule 2: the cause, then the next action.
    toast.error(text.copyFailed)
  }
}

/**
 * 41.11 rule 1: "Share link" opens the phone's share sheet with this
 * page's address and title, so the person can send it to themselves.
 * Where the browser has no share sheet it reads "Copy link" and copies
 * the address. Closing the sheet without sharing is not an error; a
 * share sheet that fails for any other reason copies the address instead.
 */
function ShareLinkButton({ text }: { text: EmptyStateText }) {
  const canShare = React.useSyncExternalStore(
    shareSheet.subscribe,
    shareSheet.read,
    shareSheet.server
  )

  const share = async () => {
    const url = window.location.href
    if (canShare) {
      try {
        await navigator.share({ title: document.title, url })
        return
      } catch (error) {
        if (isCancelled(error)) return
      }
    }
    await copyAddress(url, text)
  }

  return (
    <Button variant="primary" size="sm" onClick={() => void share()}>
      {canShare ? text.shareLink : text.copyLink}
    </Button>
  )
}

function EmptyState(props: EmptyStateProps) {
  const { className, variant, heading, children, headingLevel, text, ...rest } = props
  const t: EmptyStateText = text ? { ...EMPTY_STATE_TEXT, ...text } : EMPTY_STATE_TEXT

  // Pull the variant-specific props out of the DOM spread.
  const {
    actionLabel,
    onAction,
    dashboardHref,
    homeHref,
    reference,
    onSignOut,
    ...divProps
  } = rest as Base & {
    actionLabel?: string
    onAction?: () => void
    dashboardHref?: string
    homeHref?: string
    reference?: string
    onSignOut?: () => void
  }

  const words =
    variant === "desktop-only"
      ? { heading: t.desktopOnlyHeading, line: t.desktopOnlyLine }
      : variant === "nothing-waiting"
        ? { heading: t.nothingWaitingHeading, line: t.nothingWaitingLine }
        : DEFAULT_WORDS[variant]
  const isPage =
    variant === "not-found" ||
    variant === "no-access" ||
    variant === "desktop-only" ||
    (variant === "failed" && dashboardHref !== undefined)

  const Heading = `h${headingLevel ?? (isPage ? 1 : 2)}` as "h1" | "h2" | "h3"

  let actions: React.ReactNode = null
  if (variant === "nothing-waiting") {
    // 41.15 rule 9: nothing to create, so no button.
  } else if (variant === "desktop-only") {
    // 41.11 rule 1. "Go to home" in both layouts: this page only ever
    // shows on a phone, where home is My work (11.8 rule 6, 41.15). A
    // plain link, as the page forms' "Go to dashboard" is: this component
    // sits below the shell and never reaches into it, and leaving a page
    // that cannot be used here with a full load is right.
    actions = (
      <>
        <ShareLinkButton text={t} />
        {homeHref !== undefined ? (
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<a href={homeHref} />}
          >
            {t.goHome}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onSignOut}>
            {t.signOut}
          </Button>
        )}
      </>
    )
  } else if (variant === "not-found" || variant === "no-access") {
    actions =
      dashboardHref !== undefined ? (
        <DashboardLink href={dashboardHref} homeHref={homeHref} homeLabel={t.goHome} variant="primary" />
      ) : (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel ?? DASHBOARD_LABEL}
        </Button>
      )
  } else if (variant === "failed") {
    actions = (
      <>
        <Button
          variant={dashboardHref !== undefined ? "primary" : "secondary"}
          size="sm"
          onClick={onAction}
        >
          {actionLabel ?? "Try again"}
        </Button>
        {dashboardHref !== undefined ? (
          <DashboardLink href={dashboardHref} homeHref={homeHref} homeLabel={t.goHome} variant="secondary" />
        ) : null}
      </>
    )
  } else {
    actions = (
      <Button variant="secondary" size="sm" onClick={onAction}>
        {actionLabel ?? (variant === "nothing-yet" ? "Add" : "Clear filters")}
      </Button>
    )
  }

  return (
    <div
      data-slot="empty-state"
      data-variant={variant}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className
      )}
      {...divProps}
    >
      {/* Section 23: 22px is the empty-state icon size. */}
      <div
        className="text-text-muted [&_svg:not([class*='size-'])]:size-icon-empty"
        aria-hidden="true"
      >
        {ICONS[variant]}
      </div>
      <Heading className="text-card-heading font-medium text-text-primary">
        {heading ?? words?.heading}
      </Heading>
      <p className="max-w-[46ch] text-body text-text-secondary">
        {children ?? (isPage || variant !== "failed" ? words?.line : "Try again.")}
      </p>
      {actions ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
      {variant === "failed" && reference ? (
        <p className="text-meta text-text-muted">Reference: {reference}</p>
      ) : null}
    </div>
  )
}

export { EmptyState, emptyStateWords, type EmptyStateVariant, type EmptyStateText }
