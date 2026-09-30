"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

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

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
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
