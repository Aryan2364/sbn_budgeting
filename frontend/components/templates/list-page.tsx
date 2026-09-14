"use client"

import * as React from "react"
import { LayoutGridIcon, ListIcon, SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Section 11.1. Four fixed zones, in this order, always:
 *
 *   1. Header      - title, record count as meta, one primary action.
 *   2. Toolbar     - search, filter and sort, view switcher.
 *   3. Data area   - THE ONLY SCROLLING ZONE. Column headers stay
 *                    visible while the rows scroll under them.
 *   4. Pagination  - record count left, page controls right.
 *
 * Zones 1, 2 and 4 do not scroll. That is the whole point of the
 * template: the primary action and the page controls never travel off
 * screen, so nobody has to scroll back up to reach them.
 *
 * The header is `PageHeader` from page.tsx - the same one the other
 * four templates use.
 */

/** Zone 2. Does not scroll. */
function ListToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-toolbar"
      className={cn("mt-6 flex shrink-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

/**
 * Section 11.1: search sits on the left at a fixed 260 to 320px, never
 * full width. Section 27.1: the placeholder names the record type, not
 * the field list.
 */
function ListSearch({
  label,
  placeholder,
  className,
  onClear,
  ...props
}: Omit<React.ComponentProps<"input">, "placeholder"> & {
  /** "Search projects". Names the record type. */
  placeholder: string
  /** The accessible name. The placeholder is never the label. */
  label: string
  /** Clears the field. Without it no clear button is drawn. */
  onClear?: () => void
}) {
  /**
   * Section 27.1: "A clear button appears inside the field once there
   * is text."
   *
   * It used to be `type="search"`, which hands the job to the browser's
   * own clear affordance — a control this product does not style, does
   * not size, cannot give a focus ring, and which Firefox does not draw
   * at all. Section 1 rule 5 forbids relying on a browser default for
   * exactly this reason, so the field is `type="text"` now and the
   * button is ours.
   *
   * Section 6.3.1: it sits inside a field, so no fill and no border.
   */
  const hasText = String(props.value ?? "").length > 0

  return (
    <InputGroup className={cn("w-search max-w-full", className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        aria-label={label}
        placeholder={placeholder}
        {...props}
      />
      {hasText && onClear ? (
        <InputGroupAddon align="inline-end">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="in-field"
                  size="icon-sm"
                  aria-label="Clear search"
                  onClick={onClear}
                />
              }
            >
              <XIcon />
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear search</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

/**
 * Section 11.1: a joined pair on the far right, the active side tinted
 * with primary-subtle. Section 11.6: switching view changes appearance
 * only, never content, and the choice is remembered.
 *
 * Not a pair of Buttons: a Button carries its own border and radius on
 * all four sides, and two of them cannot be joined without fighting
 * both. The states below are the same tokens a ghost button uses.
 */
type ListView = "list" | "card"

function ListViewSwitcher({
  value,
  onValueChange,
  className,
}: {
  value: ListView
  onValueChange: (value: ListView) => void
  className?: string
}) {
  const options: { value: ListView; label: string; icon: React.ReactNode }[] = [
    { value: "list", label: "List view", icon: <ListIcon /> },
    { value: "card", label: "Card view", icon: <LayoutGridIcon /> },
  ]

  return (
    <div
      data-slot="list-view-switcher"
      role="group"
      aria-label="View"
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-lg border border-border",
        className
      )}
    >
      {options.map((option, index) => (
        <Tooltip key={option.value}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={option.label}
                aria-pressed={value === option.value}
                data-active={value === option.value || undefined}
                onClick={() => onValueChange(option.value)}
                className={cn(
                  "flex size-control cursor-pointer items-center justify-center bg-surface text-text-primary transition-colors",
                  "hover:bg-surface-control active:bg-surface-control-pressed",
                  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ring",
                  "data-active:bg-primary-subtle data-active:text-primary-pressed",
                  index > 0 && "border-l border-border",
                  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon-nav"
                )}
              />
            }
          >
            {option.icon}
          </TooltipTrigger>
          <TooltipContent side="bottom">{option.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/**
 * Zones 3 and 4. The data area is the only scrolling container on a
 * list page; its height comes from the space the frame has left, so it
 * follows the window height without a calculation. The pagination bar
 * sits below it, outside the scroll.
 */
function ListDataArea({
  children,
  footer,
  className,
  ...props
}: React.ComponentProps<"div"> & { footer?: React.ReactNode }) {
  return (
    <div
      data-slot="list-data-area"
      className={cn(
        "mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-light bg-surface",
        className
      )}
      {...props}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </div>
  )
}

export {
  ListToolbar,
  ListSearch,
  ListViewSwitcher,
  ListDataArea,
  type ListView,
}
