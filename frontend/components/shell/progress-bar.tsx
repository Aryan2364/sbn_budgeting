"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * Section 5.6, "Page changes and slow loads".
 *
 *   1. The current page stays on screen while the next one loads. That
 *      is what a transition does: `router.push` inside `startTransition`
 *      keeps the old tree until the new one has rendered.
 *   2. Past 300ms a bar appears under the top bar and advances.
 *   3. Once visible it stays at least 500ms.
 *   4. Under 300ms nothing shows at all.
 *   6. A list reload after a search, filter, sort or page change uses the
 *      same bar and timing: `useProgress().track(promise)`.
 *
 * Both thresholds are durations, so they are tokens in globals.css
 * (5.6: no duration is written anywhere else), read at runtime:
 * --progress-delay and --progress-min-visible. The fade is --duration-fast.
 */

type Phase = "idle" | "visible"

type ProgressApi = {
  /** Starts one piece of loading. Call the returned function when it ends. */
  start: () => () => void
  /** Shows the bar for as long as `promise` is unsettled. */
  track: <T>(promise: Promise<T>) => Promise<T>
  /** Client-side navigation that keeps the current page and drives the bar. */
  navigate: (href: string, options?: { replace?: boolean; scroll?: boolean }) => void
}

const ProgressContext = React.createContext<ProgressApi | null>(null)

/** The shell's loading bar, for anything that loads (5.6 rule 6). */
function useProgress(): ProgressApi {
  const api = React.useContext(ProgressContext)
  if (!api) {
    throw new Error(
      "useProgress needs a ProgressProvider above it. AppShell provides one (FRONTEND_RULES.md section 5.6)."
    )
  }
  return api
}

function ProgressProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [isNavigating, startTransition] = React.useTransition()
  const [active, setActive] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [amount, setAmount] = React.useState(0)
  const shownAt = React.useRef(0)

  const start = React.useCallback(() => {
    let ended = false
    setActive((n) => n + 1)
    return () => {
      if (ended) return
      ended = true
      setActive((n) => n - 1)
    }
  }, [])

  const track = React.useCallback(
    <T,>(promise: Promise<T>) => {
      const end = start()
      return promise.finally(end)
    },
    [start]
  )

  const navigate = React.useCallback<ProgressApi["navigate"]>(
    (href, options) => {
      startTransition(() => {
        if (options?.replace) router.replace(href, { scroll: options.scroll })
        else router.push(href, { scroll: options?.scroll })
      })
    },
    [router]
  )

  const loading = active > 0 || isNavigating

  // Rule 4: nothing is shown until --progress-delay has passed. A load that
  // ends first clears the timer, and the user saw nothing at all.
  React.useEffect(() => {
    if (!loading || phase !== "idle") return
    const t = window.setTimeout(() => {
      shownAt.current = performance.now()
      setAmount(0.08)
      setPhase("visible")
    }, readMs("--progress-delay"))
    return () => window.clearTimeout(t)
  }, [loading, phase])

  // Rule 2: advances while loading, towards 90%, slowing as it goes.
  React.useEffect(() => {
    if (phase !== "visible" || !loading) return
    let frame = 0
    const from = performance.now()
    const tick = (now: number) => {
      const t = now - from
      setAmount((a) => Math.max(a, 0.08 + 0.82 * (1 - Math.exp(-t / 1500))))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, loading])

  // Rules 2 and 3: complete, stay until visible --progress-min-visible - and long
  // enough to be seen reaching the end - then fade. A new load arriving
  // meanwhile cancels the fade and the bar carries on.
  React.useEffect(() => {
    if (phase !== "visible" || loading) return
    const held = Math.max(
      readMs("--duration-fast"),
      readMs("--progress-min-visible") - (performance.now() - shownAt.current)
    )
    const t = window.setTimeout(() => setPhase("idle"), held)
    return () => window.clearTimeout(t)
  }, [phase, loading])

  const api = React.useMemo(() => ({ start, track, navigate }), [start, track, navigate])
  const state = React.useMemo(
    () => ({ shown: phase === "visible", complete: phase === "visible" && !loading, amount }),
    [phase, loading, amount]
  )

  return (
    <ProgressContext.Provider value={api}>
      <ProgressStateContext.Provider value={state}>{children}</ProgressStateContext.Provider>
    </ProgressContext.Provider>
  )
}

/** A duration token from globals.css, in milliseconds. */
function readMs(name: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const ms = raw.endsWith("ms") ? parseFloat(raw) : parseFloat(raw) * 1000
  return Number.isFinite(ms) ? ms : 0
}

const ProgressStateContext = React.createContext({ shown: false, complete: false, amount: 0 })

/**
 * The bar itself: full width of the content area, directly below the top
 * bar, --spacing-progress tall, primary-text, on the shell layer. Only
 * transform and opacity move (5.6 rule 1). Under reduce motion it does
 * not advance - it fades in full width and fades out (5.6 rule 3).
 */
function ProgressBar({ className }: { className?: string }) {
  const { shown, complete, amount: advancing } = React.useContext(ProgressStateContext)
  const amount = complete ? 1 : advancing
  return (
    <div
      data-slot="progress-bar"
      data-state={shown ? (complete ? "complete" : "loading") : "idle"}
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!shown}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown ? Math.round(amount * 100) : undefined}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-full z-(--z-shell) h-progress overflow-hidden",
        "transition-opacity duration-(--duration-fast)",
        shown ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div
        className="h-full origin-left bg-primary-text transition-transform duration-(--duration-fast) ease-enter motion-reduce:transform-none!"
        style={{ transform: `scaleX(${shown ? amount : 0})` }}
      />
    </div>
  )
}

type ShellLinkProps = Omit<React.ComponentProps<typeof Link>, "href"> & {
  href: string
}

/**
 * A Next.js Link whose client-side navigations drive the progress bar and
 * keep the current page until the next is ready. Modified clicks (a new
 * tab, a download) are not client-side navigations and are left alone,
 * because onNavigate never fires for them.
 */
const ShellLink = React.forwardRef<HTMLAnchorElement, ShellLinkProps>(
  function ShellLink({ href, onNavigate, replace, scroll, ...props }, ref) {
    const api = React.useContext(ProgressContext)
    return (
      <Link
        ref={ref}
        href={href}
        replace={replace}
        scroll={scroll}
        onNavigate={(event) => {
          onNavigate?.(event)
          if (!api) return
          event.preventDefault()
          api.navigate(href, { replace, scroll })
        }}
        {...props}
      />
    )
  }
)

export { ProgressProvider, ProgressBar, ShellLink, useProgress }
export type { ProgressApi }
