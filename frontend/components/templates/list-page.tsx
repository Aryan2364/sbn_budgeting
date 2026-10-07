"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Pagination,
  PaginationBar,
  PaginationContent,
  PaginationCount,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
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
  clearLabel = "Clear search",
  ...props
}: Omit<React.ComponentProps<"input">, "placeholder"> & {
  /** "Search projects". Names the record type. */
  placeholder: string
  /** The accessible name. The placeholder is never the label. */
  label: string
  /** Clears the field. Without it no clear button is drawn. */
  onClear?: () => void
  /** The clear button's name, for a screen in another language. Defaults to "Clear search". */
  clearLabel?: string
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
                  aria-label={clearLabel}
                  onClick={onClear}
                />
              }
            >
              <XIcon />
            </TooltipTrigger>
            <TooltipContent side="bottom">{clearLabel}</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
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

/**
 * The pages to offer: all of them up to seven, otherwise the first, the
 * last, and the current page with its neighbours, with a gap marker
 * where pages are skipped. Always the same number of slots, so the
 * controls do not shift sideways as the page changes.
 */
function pageSlots(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, "gap", totalPages]
  if (page >= totalPages - 3) {
    return [1, "gap", ...Array.from({ length: 5 }, (_, i) => totalPages - 4 + i)]
  }
  return [1, "gap", page - 1, page, page + 1, "gap", totalPages]
}

/**
 * Zone 4, assembled once (section 11.1.1) from the kit's pagination
 * parts, so every list says it the same way: "1–25 of 148" on the left
 * (en dash, tabular, never wrapping), then Previous, the page numbers
 * and Next on the right, plain, with the current page in primary-text.
 * A control with nowhere to go is aria-disabled. The controls are real
 * buttons: paging here is a callback, not a link.
 *
 * On a phone only the current page number stays between Previous and
 * Next, so the bar fits a 360px screen.
 */
/** ListPagination's words; any left out stay English. */
interface ListPaginationText {
  /** "1–25 of 148", from the formatted numbers. */
  range?: (from: string, to: string, total: string) => string
  previous?: string
  next?: string
  previousLabel?: string
  nextLabel?: string
  /** "Page 3", from the formatted number. */
  page?: (n: string) => string
}

const englishRange = (from: string, to: string, total: string) => `${from}–${to} of ${total}`
const englishPage = (n: string) => `Page ${n}`

function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  emptyLabel,
  loadingLabel = "Loading",
  text,
  className,
}: {
  /** 1-based. */
  page: number
  pageSize: number
  /** The API's total across every page. null while it is not known yet. */
  total: number | null
  onPageChange: (page: number) => void
  /** Said instead of a range when there are no records: "0 sites". */
  emptyLabel: React.ReactNode
  /** Said while `total` is null. */
  loadingLabel?: React.ReactNode
  /**
   * The bar's own words, for a screen in another language (the Gujarati
   * complaints list). Each defaults to today's English.
   */
  text?: ListPaginationText
  className?: string
}) {
  const totalPages = total ? Math.max(1, Math.ceil(total / Math.max(1, pageSize))) : 1
  const current = Math.min(Math.max(1, page), totalPages)
  const canPrevious = total !== null && current > 1
  const canNext = total !== null && current < totalPages
  const go = (target: number) => {
    if (target !== current && target >= 1 && target <= totalPages) onPageChange(target)
  }

  return (
    <PaginationBar className={className}>
      <PaginationCount aria-live="polite">
        {total === null
          ? loadingLabel
          : total === 0
            ? emptyLabel
            : (text?.range ?? englishRange)(
                formatNumber((current - 1) * pageSize + 1),
                formatNumber(Math.min(current * pageSize, total)),
                formatNumber(total),
              )}
      </PaginationCount>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              {...(text?.previous ? { text: text.previous } : {})}
              {...(text?.previousLabel ? { "aria-label": text.previousLabel } : {})}
              aria-disabled={!canPrevious || undefined}
              onClick={() => canPrevious && go(current - 1)}
            />
          </PaginationItem>
          {total
            ? pageSlots(current, totalPages).map((slot, index) =>
                slot === "gap" ? (
                  <PaginationItem key={`gap-${index}`} className="max-sm:hidden">
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem
                    key={slot}
                    className={cn(slot !== current && "max-sm:hidden")}
                  >
                    <PaginationLink
                      isActive={slot === current}
                      aria-label={(text?.page ?? englishPage)(formatNumber(slot))}
                      className="tabular-nums"
                      onClick={() => go(slot)}
                    >
                      {formatNumber(slot)}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )
            : null}
          <PaginationItem>
            <PaginationNext
              {...(text?.next ? { text: text.next } : {})}
              {...(text?.nextLabel ? { "aria-label": text.nextLabel } : {})}
              aria-disabled={!canNext || undefined}
              onClick={() => canNext && go(current + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </PaginationBar>
  )
}

export {
  ListToolbar,
  ListSearch,
  ListDataArea,
  ListPagination,
}
export type { ListPaginationText }
