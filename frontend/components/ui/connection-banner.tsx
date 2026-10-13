"use client"

import * as React from "react"
import { CircleAlertIcon } from "lucide-react"

import { useLayout } from "@/lib/layout"
import { useServiceWorker } from "@/lib/service-worker"
import { PhoneAppBar } from "@/components/shell/app-bar"
import {
  Banner,
  BannerAction,
  BannerClose,
  BannerDescription,
} from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import type { Product } from "@/components/templates/sign-in-page"

/**
 * Section 41.14 rules 6 to 11 - the connection, on phone.
 *
 *   <ConnectionBanner />    the shell's banner above the content
 *   <OfflineScreen />       the screen the service worker serves offline
 *   <OfflineFailed />       the failed empty state for a screen not loaded
 *
 * THE OFFLINE BANNER (41.14 rule 6). While the phone has no connection
 * (navigator.onLine, kept current by the online and offline events) a
 * neutral banner sits above the content: "You are offline. Changes
 * cannot be saved until you are back online" (plan-phone's Gujarati, see
 * PHONE_WORDS.connection.banner). It goes by itself when the connection
 * returns. It explains why something cannot be done, so it is never
 * closed, and it outranks every other banner while it shows: the shell
 * hides the page's own page banners meanwhile (app-shell.tsx), and they
 * return with the connection. Its words show IN FULL: the sentence wraps
 * (BannerDescription's `wrap`) rather than being cut at two lines.
 * Nothing typed is touched: forms keep their values and their drafts,
 * and a save that fails keeps the form with its error toast.
 *
 * THE NEW-VERSION BANNER (41.14 rule 11). When a new release is waiting
 * (lib/service-worker.ts), a neutral banner says "A new version is
 * ready", with "Reload". TODO (reported, see Phase 5 handback): ideally
 * it never shows while a form on the page has unsaved changes
 * (useAnyUnsavedChanges from components/ui/unsaved-changes.tsx), which is
 * a Phase-2-owned file this phase does not edit; until that hook exists
 * here the banner can show over an unsaved form, same as the kit would
 * without it. It reports rather than explains, so it can be closed; the
 * close lasts for this opening of the app only.
 *
 * ONE AT A TIME: offline first, then the new version, never both. Each is
 * banner.tsx's one-line page banner (layout "line").
 *
 * PHONE ONLY. On a computer ConnectionBanner renders nothing, registers
 * no service worker and listens to nothing it acts on, so desktop is
 * unchanged.
 *
 * `text` (plan-phone D7): PHONE_WORDS.connection. The default below is
 * the kit's English, so any other caller is unaffected.
 */

type ConnectionText = {
  banner: string
  heading: string
  line: string
  retry: string
  newVersion: string
  reload: string
}

/** The kit's own English default (plan-phone D7). */
const WORDS: ConnectionText = {
  banner: "You are offline. Changes cannot be saved until you are back online.",
  heading: "Not available offline",
  line: "This screen opens once you are back online.",
  retry: "Try again",
  newVersion: "A new version is ready",
  reload: "Reload",
}

/* ------------------------------------------------------------------
   Whether the phone has a connection.
   ------------------------------------------------------------------ */

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/**
 * False while the phone reports no connection. The server cannot know, so
 * it answers online: the banner appears after hydration if the phone is
 * offline then, and never flashes for everyone else.
 */
function useOnline(): boolean {
  return React.useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  )
}

/* ------------------------------------------------------------------
   The new-version banner's close, for this opening of the app only.
   ------------------------------------------------------------------ */

let updateClosed = false
const closeListeners = new Set<() => void>()

function subscribeClosed(onChange: () => void) {
  closeListeners.add(onChange)
  return () => {
    closeListeners.delete(onChange)
  }
}

function closeUpdate() {
  updateClosed = true
  closeListeners.forEach((listener) => listener())
}

function useUpdateClosed(): boolean {
  return React.useSyncExternalStore(
    subscribeClosed,
    () => updateClosed,
    () => false
  )
}

/* ------------------------------------------------------------------
   The banners.
   ------------------------------------------------------------------ */

function OfflineBanner({ className, text }: { className?: string; text?: Partial<ConnectionText> }) {
  const t = text ? { ...WORDS, ...text } : WORDS
  return (
    <Banner variant="neutral" layout="line" data-shell="offline" className={className}>
      <CircleAlertIcon aria-hidden />
      <BannerDescription wrap>{t.banner}</BannerDescription>
    </Banner>
  )
}

function UpdateBanner({
  className,
  reload,
  text,
}: {
  className?: string
  reload: () => void
  text?: Partial<ConnectionText>
}) {
  const t = text ? { ...WORDS, ...text } : WORDS
  const [reloading, setReloading] = React.useState(false)
  return (
    <Banner variant="neutral" layout="line" data-shell="update" className={className}>
      <CircleAlertIcon aria-hidden />
      <BannerDescription>{t.newVersion}</BannerDescription>
      <BannerAction>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={reloading}
          aria-busy={reloading || undefined}
          onClick={() => {
            setReloading(true)
            reload()
          }}
        >
          {t.reload}
        </Button>
      </BannerAction>
      <BannerClose onClick={closeUpdate} />
    </Banner>
  )
}

/**
 * The shell's one banner above the content (41.14 rules 6 and 11), on
 * phone. Drawn by AppShell right after the screen's app bar; it
 * registers the service worker (lib/service-worker.ts) while mounted.
 * On desktop it renders nothing.
 */
function ConnectionBanner({ className, text }: { className?: string; text?: Partial<ConnectionText> }) {
  const phone = useLayout().layout === "phone"
  const online = useOnline()
  const { updateReady, reload } = useServiceWorker()
  const closed = useUpdateClosed()

  if (!phone) return null
  if (!online) return <OfflineBanner className={className} text={text} />
  if (updateReady && !closed) {
    return <UpdateBanner className={className} reload={reload} text={text} />
  }
  return null
}

/* ------------------------------------------------------------------
   The failed empty state for a screen that could not be fetched
   (41.14 rule 10), shared by the offline screen and the shell.
   ------------------------------------------------------------------ */

function OfflineFailed({
  onRetry,
  headingLevel,
  className,
  text,
}: {
  onRetry: () => void
  /** 2 under an app bar whose title is the screen's h1; 1 where the bar's title is not a heading. */
  headingLevel: 1 | 2
  className?: string
  text?: Partial<ConnectionText>
}) {
  const t = text ? { ...WORDS, ...text } : WORDS
  return (
    <EmptyState
      variant="failed"
      heading={t.heading}
      actionLabel={t.retry}
      onAction={onRetry}
      headingLevel={headingLevel}
      className={className}
    >
      {t.line}
    </EmptyState>
  )
}

/**
 * The offline screen (app/offline/page.tsx): what public/sw.js answers
 * with when a navigation finds no connection, or the server has not
 * answered within 8 seconds, including the installed app opened offline
 * (41.14 rule 9, 41.20 check 20). The address bar still holds the address
 * the person asked for.
 *
 * Self-contained: it reads nothing of the shell's (no tab bar, no
 * permissions, no person), because none of that can be fetched offline.
 *
 *   - a static app bar with the product name (PhoneAppBar): no back
 *     arrow and no actions, since every one of them needs the network.
 *     Its title is the screen's one h1, so the empty state's heading is
 *     an h2;
 *   - no tab bar: every tab is a screen that needs the network;
 *   - then the offline banner, as on every screen while offline, and the
 *     failed empty state, whose "Try again" reloads the address asked
 *     for - the real screen once the connection is back, this one again
 *     until then.
 *
 * It is the same in both layouts: only a phone is ever served it, and
 * its static HTML is drawn before the layout is known.
 */
function OfflineScreen({ product, text }: { product: Product; text?: Partial<ConnectionText> }) {
  return (
    <>
      <PhoneAppBar
        title={product.name}
        titleAs="h1"
        className="phone:-mt-safe-top phone:-mr-safe-right phone:-ml-safe-left"
      />
      <main
        data-slot="error-page"
        className="flex min-h-full flex-1 flex-col items-stretch justify-start gap-6 bg-surface px-4 pt-4 pb-12"
      >
        <OfflineBanner text={text} />
        <OfflineFailed
          headingLevel={2}
          className="my-auto"
          onRetry={() => window.location.reload()}
          text={text}
        />
      </main>
    </>
  )
}

export {
  ConnectionBanner,
  OfflineBanner,
  OfflineFailed,
  OfflineScreen,
  useOnline,
}
export type { ConnectionText }
