"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"
import { BandScope, HeaderBand } from "@/components/ui/header-band"

/**
 * A popover is the container the filter panel and the date picker sit
 * in (sections 20.1 and 27.3). 12px radius, 1px border-light and
 * --shadow-menu (section 5.4): it floats, so it takes the menu level.
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    // Section 36.4: a banded region, scope over the whole subtree.
    <BandScope>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align={align}
          alignOffset={alignOffset}
          side={side}
          sideOffset={sideOffset}
          className="isolate z-(--z-popover)"
        >
          <PopoverPrimitive.Popup
            data-slot="popover-content"
            className={cn(
              "flex w-72 origin-(--transform-origin) flex-col gap-3",
              "rounded-xl border border-border-light bg-surface p-4 text-body text-text-primary shadow-menu outline-hidden",
              // Section 5.6: fade in with a 4px slide away from the trigger,
              // medium; out one step shorter, at fast. animation-duration-*,
              // not duration-*, for the reason given in dialog.tsx.
              "data-open:animate-in data-open:fade-in-0 data-open:animation-duration-(--duration-medium) data-open:ease-enter",
              "data-[side=bottom]:data-open:slide-in-from-top-1 data-[side=top]:data-open:slide-in-from-bottom-1 data-[side=left]:data-open:slide-in-from-right-1 data-[side=right]:data-open:slide-in-from-left-1",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:animation-duration-(--duration-fast) data-closed:ease-exit",
              className
            )}
            {...props}
          />
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </BandScope>
  )
}

/**
 * Section 36: a brand band, one row, description below it (36.3).
 *
 * The negative margins are neither a hack nor an arbitrary value.
 * `PopoverContent` carries `p-4`, and section 36.2 requires a band to
 * span the FULL WIDTH of its container - inset by the popup's own
 * padding it reads as a coloured box floating inside a panel rather
 * than as chrome across the top of one. `-mx-4 -mt-4` is exactly that
 * padding, on the section 5.1 scale.
 */
function PopoverHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const items = React.Children.toArray(children)
  const isDescription = (child: React.ReactNode) =>
    React.isValidElement(child) && child.type === PopoverDescription

  const description = items.filter(isDescription)
  const banded = items.filter((child) => !isDescription(child))

  return (
    <div
      data-slot="popover-header"
      className={cn("-mx-4 -mt-4 flex flex-col", className)}
      {...props}
    >
      <HeaderBand>{banded}</HeaderBand>
      {description.length > 0 ? (
        <div
          data-slot="popover-header-description"
          className="border-b border-border-light px-4 py-3"
        >
          {description}
        </div>
      ) : null}
    </div>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      // Inherits `on-brand` from the band (section 36).
      className={cn("text-card-heading font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-label text-text-secondary", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
