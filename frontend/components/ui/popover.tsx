"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import { PHONE_WORDS } from "@/lib/phone-words"
import { BandScope, HeaderBand } from "@/components/ui/header-band"
import { Separator } from "@/components/ui/separator"
import {
  SHARE_THE_WIDTH,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  textOf,
} from "@/components/ui/sheet"
import {
  PhoneTriggerState,
  usePhoneSheetRoot,
  usePhoneTriggerProps,
  type PhoneSheetRoot,
} from "@/components/ui/select"

/**
 * A popover is the container the filter panel and the date picker sit
 * in (sections 20.1 and 27.3). 12px radius, 1px border-light and
 * --shadow-menu (section 5.4): it floats, so it takes the menu level.
 *
 * ON PHONE (41.8) a popover is a bottom sheet, and the caller never
 * chooses (41.3 rule 4): PopoverHeader becomes the sheet's header - its
 * title in the band, its description below it - the content becomes the
 * sheet's body, and a PopoverFooter becomes the sheet's footer, its
 * buttons sharing the width with the primary on the right (rule 6).
 * Inside another bottom sheet it opens as a step of that sheet instead
 * (rule 9). The trigger is Base UI's, exactly as on desktop; Base UI's
 * root is held closed there, and a press that would open it opens the
 * sheet. Desktop renders exactly what it did before.
 */

/** What a popover sheet is called when it has no header and nothing names its trigger. */
// Phone only (a sheet title), so in the phone's language (plan-phone D7).
const POPOVER_TITLE = PHONE_WORDS.a11y.details

/** A popover's content, sorted into the three places of a sheet. */
type PopoverParts = {
  header: React.ReactElement<{ children?: React.ReactNode }> | null
  body: React.ReactNode[]
  footer: React.ReactElement<{ children?: React.ReactNode }> | null
  className?: string
}

/** The sheet's side, from the root to PopoverContent (select.tsx). */
type PhonePopoverSheet = PhoneSheetRoot<PopoverParts>

const PhonePopoverContext = React.createContext<PhonePopoverSheet | null>(null)

function isType(
  child: React.ReactNode,
  type: unknown
): child is React.ReactElement<{ children?: React.ReactNode }> {
  return React.isValidElement(child) && child.type === type
}

function popoverParts(children: React.ReactNode, className?: string): PopoverParts {
  const items = React.Children.toArray(children)
  const header = items.find((child) => isType(child, PopoverHeader))
  const footer = items.find((child) => isType(child, PopoverFooter))
  return {
    header: isType(header, PopoverHeader) ? header : null,
    footer: isType(footer, PopoverFooter) ? footer : null,
    body: items.filter((child) => child !== header && child !== footer),
    className,
  }
}

/**
 * A popover's content as a step of the sheet it sits in (41.8 rule 9).
 * The step's header is the back arrow and the title; the description and
 * the popover's own buttons go in the body, because the sheet's footer
 * stays the sheet's. A step renders under the sheet, outside the
 * popover's root, so Base UI's Description cannot come with it - it is
 * drawn as plain text here.
 */
function PopoverStep({ parts }: { parts: PopoverParts }) {
  const header = parts.header ? React.Children.toArray(parts.header.props.children) : []
  const descriptions = header.filter((child) => isType(child, PopoverDescription))
  return (
    <SheetBody className={cn("flex flex-col gap-3", parts.className, "w-auto")}>
      {descriptions.map((child, i) => (
        <p key={i} className="text-label text-text-secondary">
          {isType(child, PopoverDescription) ? child.props.children : null}
        </p>
      ))}
      {parts.body}
      {parts.footer ? (
        // The footer's arrangement (41.8 rule 6), in the body.
        <div
          data-slot="popover-footer"
          className={cn("flex items-stretch gap-2", SHARE_THE_WIDTH)}
        >
          {parts.footer.props.children}
        </div>
      ) : null}
    </SheetBody>
  )
}

function PhonePopover({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: PopoverPrimitive.Root.Props) {
  const { sheet, onRootOpenChange, expanded } = usePhoneSheetRoot<
    PopoverParts,
    PopoverPrimitive.Root.ChangeEventDetails
  >({
    open,
    defaultOpen,
    onOpenChange,
    fallbackTitle: POPOVER_TITLE,
    nameFromContent: true,
    toStep: (name, parts) => {
      // No PopoverContent: the caller draws its own phone form, as
      // SearchableSelect and MultiSelect do, and has just been told.
      if (!parts) return null
      const titles = parts.header
        ? React.Children.toArray(parts.header.props.children).filter((child) =>
            isType(child, PopoverTitle)
          )
        : []
      return { title: textOf(titles) || name, content: <PopoverStep parts={parts} /> }
    },
  })

  return (
    <PhoneTriggerState expanded={expanded}>
      <PhonePopoverContext.Provider value={sheet}>
        <PopoverPrimitive.Root
          data-slot="popover"
          {...props}
          open={false}
          onOpenChange={onRootOpenChange}
        >
          {children}
        </PopoverPrimitive.Root>
      </PhonePopoverContext.Provider>
    </PhoneTriggerState>
  )
}

/** The popover as a bottom sheet; nothing inside another one (a step instead). */
function PhonePopoverContent({
  sheet,
  className,
  children,
}: {
  sheet: PhonePopoverSheet
  className?: string
  children: React.ReactNode
}) {
  const parts = popoverParts(children, className)
  const { registerContent } = sheet
  React.useLayoutEffect(() => {
    registerContent(parts)
  })

  if (sheet.inSheet) return null

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(next, details) => {
        if (!next) sheet.onOpenChange(false, details)
      }}
    >
      <SheetContent
        side="bottom"
        // 16.4 and 39.3: focus returns to the trigger on close.
        finalFocus={sheet.trigger}
      >
        {parts.header ? (
          // 36.3 and 36.4: the title in the sheet's band, which takes its
          // form from the band level; the description below the band.
          <SheetHeader>
            {React.Children.map(parts.header.props.children, (child) =>
              isType(child, PopoverTitle) ? (
                <SheetTitle {...(child.props as React.ComponentProps<typeof SheetTitle>)} />
              ) : isType(child, PopoverDescription) ? (
                <SheetDescription
                  {...(child.props as React.ComponentProps<typeof SheetDescription>)}
                />
              ) : (
                child
              )
            )}
          </SheetHeader>
        ) : (
          // Every sheet is named (41.8 rule 6), by the control that opened it.
          <SheetHeader>
            <SheetTitle>{sheet.title}</SheetTitle>
          </SheetHeader>
        )}
        {/* The popover's own layout - a column, 12px apart - with any
            padding the caller set. Never its width: the sheet is full
            width. */}
        <SheetBody className={cn("flex flex-col gap-3", className, "w-auto")}>
          {parts.body}
        </SheetBody>
        {parts.footer ? (
          <SheetFooter>{parts.footer.props.children}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/**
 * The root. On desktop it is Base UI's root, untouched; on phone,
 * PhonePopover above (useLayout, 41.3 rule 4). Two different components,
 * so a layout switch mounts the other one fresh.
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  const { layout } = useLayout()
  if (layout === "phone") return <PhonePopover {...props} />
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  // Phone, while the sheet is open: aria-expanded (Base UI's root is
  // held closed there). Nothing on desktop. SearchableSelect and
  // MultiSelect, whose sheets this root's open state follows, get it too.
  const phoneTrigger = usePhoneTriggerProps()
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} {...phoneTrigger} />
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
  const phoneSheet = React.useContext(PhonePopoverContext)
  if (phoneSheet) {
    return (
      <PhonePopoverContent
        sheet={phoneSheet}
        className={typeof className === "string" ? className : undefined}
      >
        {props.children}
      </PhonePopoverContent>
    )
  }

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

/**
 * The popover's own buttons - a filter panel's "Clear all" and "Apply" -
 * under a 1px line, apart at either end: secondary on the left, primary
 * on the right (11.3 rule 7).
 *
 * On phone it becomes the bottom sheet's footer, the buttons sharing its
 * full width, primary on the right (41.8 rule 6). That is why it is a
 * part rather than a row each popover draws for itself: a plain row
 * cannot be told from the content, and stays in the scrolling body.
 *
 * It draws the line itself, as the Separator a popover put above its
 * button row, so swapping that pair for PopoverFooter changes nothing on
 * desktop. On phone the sheet's footer has its own line instead.
 */
function PopoverFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <>
      <Separator />
      <div
        data-slot="popover-footer"
        className={cn("flex items-center justify-between gap-2", className)}
        {...props}
      />
    </>
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
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
