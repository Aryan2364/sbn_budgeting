"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PHONE_TWO_LINES, Truncate } from "@/components/ui/truncate"

/**
 * Section 7.1, the banner: a condition that persists until it is
 * resolved. Named Banner, not Alert, because section 7.1 treats
 * banner, inline field error, toast and dialog as four distinct
 * patterns with a decision rule between them - a component called
 * Alert invites picking by feel instead of by the rule.
 *
 * The user can carry on, but it stays true - which is what separates a
 * banner from a toast (temporary) and a dialog (must act). One field
 * being wrong is InlineFieldError, not this.
 *
 * Section 7.2 rule 1: every banner carries an icon as well as a colour.
 * Colour alone is invisible to colour-blind users. Rule 3: no
 * exclamation marks, no "Error:" prefix, and never a raw technical
 * message.
 *
 * `neutral` is the default. There is deliberately no blue information
 * colour in this system (section 2.4) - neutral grey carries it.
 *
 * PERSISTENT BANNERS (Sadbhavna KIT-PENDING-banners.md, applied here
 * ahead of the kit; it overrides 7.1, 11.1 zone 1b and 40.8 on these
 * points):
 *
 *   1. One line, no lists. `layout="line"` puts the icon, the sentence,
 *      at most one action and the close on one row. The sentence
 *      truncates with an ellipsis (section 8, with the tooltip when it
 *      is cut) and never wraps. Names go on the page the action opens.
 *   2. A warning or neutral banner about a data condition can be
 *      closed: BannerClose, with useBannerDismissal remembering the
 *      close per user and per condition until the condition worsens.
 *   3. A banner that explains a disabled control or a locked record has
 *      no BannerClose. It still follows rule 1.
 *   4. At most one banner per page; a second message joins the first.
 *   5. The result of a save is a toast, not a banner.
 *
 * `layout="block"` (the default) is the stacked title, description and
 * action, for a message inside a form or a dialog that is read whole.
 *
 * ON PHONE (41.8 rule 15) `layout="line"` changes shape by itself; the
 * caller writes the same banner for both layouts (41.3 rule 4):
 *
 *     [icon]  The sentence, which may run onto a       [x]
 *             second line before it is cut...
 *             Review customers
 *
 *   - the sentence may wrap to two lines, then truncates;
 *   - the action moves to its own line below the sentence, drawn as a
 *     standing text link, still a button (6.6 rule 5);
 *   - the close sits top right.
 *
 * It is a three-column grid, icon | text | close, with no column gap
 * (an empty column then costs nothing): the icon and the close carry
 * their own 12px, the desktop row's gap-3. `layout="block"` is read
 * whole and wraps freely (7.5 rule 2), so it is the same on phone.
 */
const bannerVariants = cva(
  "group/banner relative w-full rounded-lg border px-4 text-left text-body",
  {
    variants: {
      variant: {
        neutral:
          "border-border bg-surface text-text-primary *:[svg]:text-text-secondary",
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        danger: "border-danger-border bg-danger-bg text-danger",
      },
      layout: {
        block: [
          "grid gap-1 py-3",
          "has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3",
          "has-data-[slot=banner-action]:pr-4",
          "*:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*='size-'])]:size-4",
        ],
        // One row: icon, sentence, action, close.
        line: [
          "flex items-center gap-3 py-2",
          "*:[svg]:shrink-0 *:[svg:not([class*='size-'])]:size-4",
          // Phone, 41.8 rule 15: the grid described above. 8px between
          // the sentence and its action: tightly related (5.1).
          "phone:grid phone:grid-cols-[auto_minmax(0,1fr)_auto] phone:items-start phone:gap-x-0 phone:gap-y-2",
          // The icon, top left, 12px from the sentence. One line tall
          // (h-lh) rather than 16px, so the 16px glyph sits centred on the
          // sentence's FIRST line, and stays there as the text-size setting
          // grows the line (41.9 rule 7). The svg keeps its 16px width.
          "phone:*:[svg]:col-start-1 phone:*:[svg]:row-start-1 phone:*:[svg]:mr-3",
          "phone:*:[svg:not([class*='size-'])]:h-lh",
        ],
      },
    },
    defaultVariants: {
      variant: "neutral",
      layout: "block",
    },
  }
)

type BannerLayout = NonNullable<VariantProps<typeof bannerVariants>["layout"]>

const BannerLayoutContext = React.createContext<BannerLayout>("block")

function Banner({
  className,
  variant,
  layout,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof bannerVariants>) {
  const resolved = layout ?? "block"
  return (
    <BannerLayoutContext value={resolved}>
      <div
        data-slot="banner"
        data-layout={resolved}
        role="alert"
        className={cn(bannerVariants({ variant, layout: resolved }), className)}
        {...props}
      />
    </BannerLayoutContext>
  )
}

/**
 * The sentence of a one-line banner: one line, cut with an ellipsis,
 * the full sentence in a tooltip when it is cut (section 8). `wrap` lets
 * it run onto a second line instead, for the rare banner that explains
 * a disabled control in a narrow field and must be read whole. It is
 * never a list.
 *
 * On phone (41.8 rule 15) two lines, then cut, with no tooltip (41.8
 * rule 16): Truncate's `phoneLines`, or the same clamp on this div when
 * the sentence is not a plain string. Rule 15 is the route 41.8 rule 18
 * names for it, and 7.5 rule 1 keeps the sentence short enough that two
 * lines hold it: the records it counts are on the page its action opens.
 */
function LineText({
  slot,
  wrap,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { slot: string; wrap?: boolean }) {
  const plain = !wrap && typeof children === "string"
  return (
    <div
      data-slot={slot}
      className={cn(
        "min-w-0 flex-1",
        !wrap && "truncate",
        !wrap && !plain && PHONE_TWO_LINES,
        "phone:col-start-2",
        className
      )}
      {...props}
    >
      {plain ? <Truncate phoneLines={2}>{children}</Truncate> : children}
    </div>
  )
}

function BannerTitle({
  className,
  wrap,
  ...props
}: React.ComponentProps<"div"> & { wrap?: boolean }) {
  const layout = React.useContext(BannerLayoutContext)
  if (layout === "line") {
    return (
      <LineText slot="banner-title" wrap={wrap} className={cn("font-medium", className)} {...props} />
    )
  }
  return (
    <div
      data-slot="banner-title"
      className={cn(
        "font-medium group-has-[>svg]/banner:col-start-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 7.2 rule 2: state the cause, then the next action. "Enter a
 * complete email address, like name@company.com", not "Invalid email".
 */
function BannerDescription({
  className,
  wrap,
  ...props
}: React.ComponentProps<"div"> & { wrap?: boolean }) {
  const layout = React.useContext(BannerLayoutContext)
  if (layout === "line") {
    return <LineText slot="banner-description" wrap={wrap} className={className} {...props} />
  }
  return (
    <div
      data-slot="banner-description"
      className={cn(
        "text-body group-has-[>svg]/banner:col-start-2 [&_p:not(:last-child)]:mb-2",
        className
      )}
      {...props}
    />
  )
}

/*
 * 41.8 rule 15: on phone a page banner's action is a button drawn as a
 * standing text link (6.6 rule 5, the standing row of 6.6's table, as
 * TextLink and Clamp's "Show more" draw it). The caller still passes the
 * desktop's <Button size="sm" variant="secondary">, so the same banner
 * serves both layouts (41.3 rule 4); this restyles that button, and only
 * a direct child Button - a TextLink is already a link.
 *
 * Every class beats its button.tsx counterpart on specificity, not on
 * stylesheet order: the child selector adds an attribute, and the state
 * lines (hover, active, disabled) add their pseudo-class as button.tsx's
 * do. So no fill and no border in any state, body size and weight in
 * primary-text, and the height of its line rather than 44px: tap-area,
 * which every Button carries, still grows the TAP area to 44px (9 rule
 * 4, 41.20 check 9). The focus ring is button.tsx's own, primary-ring.
 *
 * Underline on hover, as a standing link, and on press: on phone the
 * pressed state is the only feedback a tap gets (41.9 rule 1), and the
 * underline is the link's own. Hover is inside (hover: hover) already.
 */
const PHONE_ACTION_AS_LINK = [
  "phone:col-start-2 phone:justify-self-start",
  "phone:[&>[data-slot=button]]:h-auto phone:[&>[data-slot=button]]:justify-start phone:[&>[data-slot=button]]:rounded-sm",
  "phone:[&>[data-slot=button]]:border-0 phone:[&>[data-slot=button]]:bg-transparent phone:[&>[data-slot=button]]:px-0",
  "phone:[&>[data-slot=button]]:text-left phone:[&>[data-slot=button]]:text-body phone:[&>[data-slot=button]]:font-normal phone:[&>[data-slot=button]]:text-primary-text",
  // A long label wraps rather than pushing past a 320px screen (41.13 rule 7).
  "phone:[&>[data-slot=button]]:whitespace-normal",
  "phone:[&>[data-slot=button]]:decoration-1 phone:[&>[data-slot=button]]:underline-offset-2",
  "phone:[&>[data-slot=button]]:hover:bg-transparent phone:[&>[data-slot=button]]:hover:underline",
  "phone:[&>[data-slot=button]]:active:bg-transparent phone:[&>[data-slot=button]]:active:underline",
  "phone:[&>[data-slot=button]]:disabled:bg-transparent phone:[&>[data-slot=button]]:disabled:text-text-muted",
].join(" ")

/** Section 13: no dead ends. A banner offers a way forward. */
function BannerAction({ className, ...props }: React.ComponentProps<"div">) {
  const layout = React.useContext(BannerLayoutContext)
  return (
    <div
      data-slot="banner-action"
      className={cn(
        layout === "line"
          ? ["flex shrink-0 items-center gap-2", PHONE_ACTION_AS_LINK]
          : "mt-2 flex items-center gap-2 group-has-[>svg]/banner:col-start-2",
        className
      )}
      {...props}
    />
  )
}

/**
 * Pending rule 2: the close (x) of a banner about a data condition. A
 * quiet 36px icon button (sections 6.2 and 6.3) with its hidden label
 * and tooltip; on a touch screen the button's own tap-area grows it to
 * 44px. For `layout="line"`, as the last item of the row.
 *
 * Never on a banner that explains why a control is disabled or a record
 * is locked (pending rule 3): hiding it would leave that unexplained.
 *
 * On phone (41.8 rule 15) it sits top right, 12px from the sentence, in
 * the third column of the grid. The phone's icon button is 44px (41.9
 * rule 2); -my-2 lets it reach 8px into the banner's own padding above
 * and below, so its x lines up with the sentence's first line and a
 * one-line banner does not grow to fit the button. The tooltip does not
 * open on phone (tooltip.tsx); the x needs none (41.9 rule 9) and keeps
 * its screen-reader label.
 */
function BannerClose({
  className,
  label = "Close",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "variant" | "size"> & {
  label?: string
}) {
  const layout = React.useContext(BannerLayoutContext)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            data-slot="banner-close"
            className={cn(
              "shrink-0",
              layout === "line" &&
                "phone:col-start-3 phone:row-start-1 phone:-my-2 phone:ml-3 phone:self-start",
              className
            )}
            {...props}
          />
        }
      >
        <XIcon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------
// Pending rule 2: remembering a close, per user and per condition
// ---------------------------------------------------------------------

const DISMISS_PREFIX = "banner.dismissed"

/** Same-tab writes: the `storage` event reports only other tabs. */
const dismissListeners = new Set<() => void>()

function subscribeDismissals(onChange: () => void) {
  dismissListeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    dismissListeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

function readStored(key: string | null): string | null {
  if (!key) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** The level the banner was closed at; null when never closed or unreadable. */
function parseLevel(raw: string | null): number | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && "level" in parsed) {
      const level = (parsed as { level: unknown }).level
      if (typeof level === "number" && Number.isFinite(level)) return level
    }
  } catch {
    // A value this code did not write reads as never closed.
  }
  return null
}

/**
 * Whether a closable banner is hidden, and how to close it.
 *
 * `userId` is the signed-in person, so a close on a shared computer is
 * that person's alone. `condition` names the condition and what it is
 * about ("over-plan.<projectId>"). `level` is how bad it is now, as a
 * number that rises when it worsens (a count, an amount over).
 *
 * Closing stores `{ level }` under a key holding both. The banner stays
 * hidden only while the current level is at or below the stored one,
 * so it returns the moment the condition gets worse. Every storage
 * access is in try/catch: storage that cannot be read shows the banner,
 * and a close that cannot be written hides it for this visit only.
 * Without a user id nothing is stored, and the banner shows.
 *
 * Read through useSyncExternalStore: the server render and the
 * hydrating render both show the banner (no mismatch), and a close in
 * this tab or another reaches every mounted copy.
 */
function useBannerDismissal({
  userId,
  condition,
  level,
}: {
  userId: string | null | undefined
  condition: string
  level: number
}): { hidden: boolean; dismiss: () => void } {
  const key = userId ? `${DISMISS_PREFIX}.${userId}.${condition}` : null
  const raw = React.useSyncExternalStore(
    subscribeDismissals,
    () => readStored(key),
    () => null
  )
  // A close that storage refused still closes the banner, for this visit.
  const [closedHere, setClosedHere] = React.useState<{
    key: string | null
    level: number
  } | null>(null)

  const stored = parseLevel(raw)
  const here = closedHere && closedHere.key === key ? closedHere.level : null
  const hidden =
    (stored !== null && level <= stored) || (here !== null && level <= here)

  const dismiss = React.useCallback(() => {
    setClosedHere({ key, level })
    if (!key) return
    try {
      window.localStorage.setItem(key, JSON.stringify({ level }))
    } catch {
      return
    }
    for (const listener of dismissListeners) listener()
  }, [key, level])

  return { hidden, dismiss }
}

export {
  Banner,
  BannerTitle,
  BannerDescription,
  BannerAction,
  BannerClose,
  useBannerDismissal,
}
