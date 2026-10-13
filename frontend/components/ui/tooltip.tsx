"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { useLayout } from "@/lib/layout"
import { cn } from "@/lib/utils"

/**
 * Section 19. text-primary ground, surface text, 13px, 240px maximum,
 * 8px radius, --shadow-menu. Appears 400ms after hover begins and
 * immediately on keyboard focus.
 *
 * A tooltip never contains a button or a link, and never carries
 * information available nowhere else - the single exception being the
 * label of an icon-only button. If the only way to learn something is
 * to hover, touch and keyboard users never learn it.
 */
function TooltipProvider({
  delay = 400,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

/**
 * ON PHONE (41.8 rules 16 to 18) A TOOLTIP NEVER OPENS. A phone has no
 * hover, so nothing there may depend on one: an icon-only button relies
 * on its screen-reader label and the phone icon set (41.9 rule 9), and
 * cut text is clamped or shown in full one tap away.
 *
 * The one exception is the reason a control is disabled (section 26),
 * which opens on a tap (41.8 rule 17). Only permission-tooltip.tsx sets
 * `disabledReason`; nothing else should.
 *
 * It is done through Base UI's own `disabled`, which wins over a
 * controlled `open` as well as over hover and focus, so a caller that
 * holds its own open state cannot open one on phone either. On desktop
 * the caller's `disabled` passes through untouched.
 */
function Tooltip({
  disabledReason = false,
  disabled,
  ...props
}: TooltipPrimitive.Root.Props & {
  /** This tooltip is the reason a control is disabled: the one tooltip shown on phone. */
  disabledReason?: boolean
}) {
  const { layout } = useLayout()
  const closedOnPhone = layout === "phone" && !disabledReason
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      disabled={closedOnPhone ? true : disabled}
      {...props}
    />
  )
}

/**
 * The 400ms is set here as well as on the provider. Base UI's trigger
 * defaults to 600ms, so a tooltip rendered outside TooltipProvider (a
 * test harness, a portal root) would otherwise quietly miss section 19.
 */
function TooltipTrigger({
  delay = 400,
  ...props
}: TooltipPrimitive.Trigger.Props) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      delay={delay}
      {...props}
    />
  )
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-(--z-tooltip)"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "inline-flex w-fit max-w-tooltip-max origin-(--transform-origin) items-center gap-2",
            "rounded-lg bg-text-primary px-3 py-1.5 text-label text-surface shadow-menu",
            // Section 5.6: fade only, fast, both ways.
            "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-fast) data-open:ease-enter",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-fast) data-closed:ease-exit",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="size-2.5 rotate-45 rounded-none bg-text-primary fill-current data-[side=bottom]:top-1 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-1" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
