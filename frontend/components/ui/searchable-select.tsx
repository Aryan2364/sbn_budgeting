"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useLayout } from "@/lib/layout"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  CHOOSE_TITLE,
  phoneSheetTitle,
  selectTriggerClassName,
} from "@/components/ui/select"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useSheetStep,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { PHONE_WORDS } from "@/lib/phone-words"

/**
 * One option found by a server search (`search` below).
 *
 * `detail` is the second thing the row shows, after the label: the
 * person's designation, for instance. The server searches it too, so a
 * match there must be visible on the row (kit 27.1).
 */
export interface SearchOption {
  value: string
  label: string
  detail?: string | null
}

/** Kit 27.1: search runs 300 ms after the user stops typing. */
const SEARCH_DELAY_MS = 300

const DEFAULT_SEARCH_PLACEHOLDER = "Search"

/** A Pick answers with at most 50 matches (access plan 6.1.4 item 7). */
const DEFAULT_LIMIT = 50

/**
 * Section 16.3.
 *
 * "More than 6 options: the menu gets a search box fixed at the top,
 * which does not scroll with the options. More than about 20 options:
 * it should not be a dropdown. Use a searchable picker or a dialog."
 *
 * This is that picker. The trigger is the plain Select's trigger -
 * imported, not copied, so the two cannot drift apart - and the search
 * box sits outside the scrolling list, so it stays put while the
 * options move underneath it.
 *
 * Selected and hovered stay distinct, as in section 16.2: selected is
 * primary-subtle with a tick, hovered is neutral grey.
 *
 * ---------------------------------------------------------------------
 * SERVER SEARCH (access plan section 4 Q3, RESOLUTIONS PQ3; a candidate
 * for the kit, noted for the owner)
 * ---------------------------------------------------------------------
 * Give `search` and the options come from the server instead of
 * `options`: the same trigger, menu, rows and keyboard, not a second
 * picker (kit 4.1). For lists that can outgrow one answer - people
 * (145+), sites - where a Pick returns at most 50 matches.
 *
 * - Nothing is asked for until the menu opens. Opening asks for the
 *   first matches with an empty search; typing asks again 300 ms after
 *   the user stops (kit 27.1). Never a preload of everyone.
 * - At most `limit` rows show. When the answer is full, a line under
 *   the rows says so, and typing narrows it.
 * - The answer before stays on screen until the next one lands, so the
 *   rows never blank out between keystrokes. A late answer to an older
 *   search is dropped.
 * - The current value's label stays on the trigger even when the value
 *   is not among the rows: `selectedLabel` (from the record, which
 *   carries the name; display is not picking) or the label of the row
 *   the user chose.
 * - `options`, in this mode, are fixed rows that lead the list while
 *   nothing is typed ("All sites", "None").
 * - Where the match is in `detail` rather than the label, the row shows
 *   it, with the matched text in body strong weight (kit 27.1).
 *
 * ON PHONE (41.7 rule 7, 41.8 rule 8) the same trigger opens a bottom
 * sheet at full height, titled by the field's label, with the search box
 * fixed at the top and the rows scrolling below it, so the keyboard never
 * covers the list. The search box is never focused by itself (41.8 rule
 * 19). Choosing a row closes the sheet and focus returns to the trigger.
 * Inside another bottom sheet the list opens as a full-height step of it
 * instead (41.8 rules 8 and 9). The caller never chooses (41.3 rule 4).
 * That phone form is useSearchPicker below, shared with MultiSelect.
 */
function SearchableSelect({
  options = {},
  value,
  onValueChange,
  id,
  placeholder = "Select an option",
  searchPlaceholder = DEFAULT_SEARCH_PLACEHOLDER,
  emptyMessage,
  disabled,
  className,
  search,
  selectedLabel,
  limit = DEFAULT_LIMIT,
}: {
  /** value to label. With `search`, the fixed rows that lead the list. */
  options?: Record<string, string>
  value?: string
  /** `option` is the server row chosen; absent for a fixed option. */
  onValueChange?: (value: string, option?: SearchOption) => void
  id?: string
  placeholder?: string
  searchPlaceholder?: string
  /** Kit 27.1: say what was searched. A function receives the search text. */
  emptyMessage?: string | ((query: string) => string)
  disabled?: boolean
  className?: string
  /** Server search: called with the typed text ("" on opening). */
  search?: (query: string) => Promise<SearchOption[]>
  /** The current value's label, for when it is not among the rows. */
  selectedLabel?: string | null
  /** The most rows shown. A full answer says there may be more. */
  limit?: number
}) {
  const remote = search !== undefined
  /** Labels of the rows the user chose, so the trigger can name them. */
  const [chosenLabels, setChosenLabels] = React.useState<Record<string, string>>({})

  const triggerLabel = value
    ? options[value] ?? chosenLabels[value] ?? selectedLabel ?? undefined
    : undefined

  /*
   * The search box and the rows, for the popover and the phone sheet
   * alike (kit 3bb95d1's useSearchPicker, hand-merged with Tracking's
   * server search). The server-search state lives in OptionsBody, so it
   * starts fresh each time the list opens (the empty search asked again,
   * so a person added since is there), and a phone sheet step, drawn as
   * it was given when it opened, still updates as the person types.
   */
  const body = (close: () => void, onPhone: boolean) => (
    <OptionsBody
      options={options}
      value={value}
      remote={remote}
      search={search}
      limit={limit}
      // On phone the search box placeholder is the phone's own word
      // where the caller kept the default (plan-phone D7).
      searchPlaceholder={
        onPhone && searchPlaceholder === DEFAULT_SEARCH_PLACEHOLDER
          ? PHONE_WORDS.a11y.search
          : searchPlaceholder
      }
      emptyMessage={emptyMessage}
      onPick={(next, option) => {
        if (option) setChosenLabels((current) => ({ ...current, [option.value]: option.label }))
        onValueChange?.(next, option)
        close()
      }}
    />
  )

  const { phone, open, setOpen, onOpenChange, trigger, sheet } = useSearchPicker((close) =>
    body(close, true)
  )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button
            ref={trigger}
            id={id}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            data-slot="searchable-select-trigger"
            data-placeholder={triggerLabel ? undefined : ""}
            className={cn("group", selectTriggerClassName, className)}
          />
        }
      >
        <span className="flex-1 truncate text-left">{triggerLabel ?? placeholder}</span>
        {/* The trigger, not the icon, carries data-popup-open, so the
            chevron reads it through the group (16.1: up while open). */}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-text-secondary transition-transform group-data-popup-open:rotate-180" />
      </PopoverTrigger>
      {phone ? (
        sheet
      ) : (
        <PopoverContent align="start" className="w-(--anchor-width) gap-0 p-0">
          {body(() => setOpen(false), false)}
        </PopoverContent>
      )}
    </Popover>
  )
}

/**
 * The phone sheet's body for a searchable list: it does not scroll
 * itself. The search box stays fixed at its top and the list below is
 * the one thing that scrolls (41.8 rule 8, 1 rule 8).
 */
const PHONE_SEARCH_BODY = "flex flex-col overflow-hidden p-0"

/**
 * The open state and phone form of a searchable picker, written once for
 * SearchableSelect and MultiSelect (4 rule 4). Each keeps its own Popover
 * and trigger, which take `open`, `onOpenChange` and `trigger`. On
 * desktop this is only that open state; the popover is the caller's.
 *
 * On phone (41.7 rule 7) an open becomes:
 *   - `sheet`: a bottom sheet at full height (41.8 rule 8), titled by the
 *     field's label (11.3), the search box fixed at the top, focus back
 *     to the trigger on close (16.4); or,
 *   - inside another bottom sheet, a full-height step of it with a back
 *     arrow (41.8 rules 8 and 9), and `sheet` is nothing.
 *
 * `options(close, asStep)` draws the search box and the rows. `close`
 * shuts the sheet, or returns from the step. A step is drawn as it was
 * given when it opened (sheet.tsx), so `asStep` tells the caller to give
 * rows that change while it is open state of their own.
 */
function useSearchPicker(
  options: (close: () => void, asStep: boolean) => React.ReactNode
) {
  const phone = useLayout().layout === "phone"
  const step = useSheetStep()
  const trigger = React.useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState(CHOOSE_TITLE)

  const onOpenChange = (next: boolean) => {
    if (!phone || !next) {
      setOpen(next)
      return
    }
    // The field's label names the sheet: the Label above it (11.3).
    const name = phoneSheetTitle(trigger.current, { content: false }) ?? CHOOSE_TITLE
    if (step.inSheet) {
      // 39.3: the step returns focus to what had it when it opened.
      trigger.current?.focus({ preventScroll: true })
      step.open({
        title: name,
        // 41.8 rule 8: a searchable list takes the sheet's full height
        // as a step too, so the keyboard never covers the list.
        fullHeight: true,
        content: (
          <SheetBody className={PHONE_SEARCH_BODY}>{options(step.back, true)}</SheetBody>
        ),
      })
      return
    }
    setTitle(name)
    setOpen(true)
  }

  const sheet =
    phone && !step.inSheet ? (
      <Sheet open={open} onOpenChange={(next) => setOpen(next)}>
        <SheetContent
          side="bottom"
          // 41.8 rule 8: a searchable list opens at full height.
          fullHeight
          // 16.4: focus returns to the trigger on close.
          finalFocus={trigger}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <SheetBody className={PHONE_SEARCH_BODY}>
            {options(() => setOpen(false), false)}
          </SheetBody>
        </SheetContent>
      </Sheet>
    ) : null

  return { phone, open, setOpen, onOpenChange, trigger, sheet }
}

/**
 * The search box and the rows: the popover's content, and the phone
 * sheet's. Local mode filters `options` in the browser; with `search`
 * the rows come from the server (see SearchableSelect). Its state is its
 * own, so it starts fresh each time the list opens.
 */
function OptionsBody({
  options,
  value,
  remote,
  search,
  limit,
  searchPlaceholder,
  emptyMessage,
  onPick,
}: {
  options: Record<string, string>
  value?: string
  remote: boolean
  search?: (query: string) => Promise<SearchOption[]>
  limit: number
  searchPlaceholder: string
  emptyMessage?: string | ((query: string) => string)
  onPick: (value: string, option?: SearchOption) => void
}) {
  const [query, setQuery] = React.useState("")
  /** null until the first answer since opening has landed. */
  const [rows, setRows] = React.useState<SearchOption[] | null>(null)
  /** The text the rows on screen answer, for the empty message and the highlight. */
  const [answered, setAnswered] = React.useState("")
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  const searchRef = React.useRef(search)
  React.useEffect(() => {
    searchRef.current = search
  })

  React.useEffect(() => {
    if (!remote) return
    let cancelled = false
    // Opening (and an emptied box) asks at once; typing waits for the pause.
    const delay = query.trim() === "" ? 0 : SEARCH_DELAY_MS
    const timer = window.setTimeout(() => {
      const ask = searchRef.current
      if (!ask) return
      ask(query.trim())
        .then((found) => {
          if (cancelled) return
          setRows(found.slice(0, limit))
          setAnswered(query.trim())
          setFailed(false)
        })
        .catch(() => {
          if (!cancelled) setFailed(true)
        })
    }, delay)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [remote, query, limit, attempt])

  const empty =
    typeof emptyMessage === "function"
      ? emptyMessage(remote ? answered : "")
      : emptyMessage ??
        (remote && answered ? `Nothing matches '${answered}'.` : "Nothing matches that search.")

  if (remote) {
    return (
      <Command shouldFilter={false}>
        <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
        <CommandList className="max-h-menu-max overflow-y-auto">
          {failed ? (
            // Section 13: a failed load says so and offers the way on.
            <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-body text-text-secondary">
              <span>The list could not be loaded.</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFailed(false)
                  setAttempt((a) => a + 1)
                }}
              >
                Try again
              </Button>
            </div>
          ) : rows === null ? (
            // Section 14: the shape of the rows that are coming.
            <div aria-busy="true" className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <>
              {rows.length === 0 && (answered !== "" || Object.keys(options).length === 0) ? (
                <CommandEmpty>{empty}</CommandEmpty>
              ) : null}
              <CommandGroup>
                {answered === ""
                  ? Object.entries(options).map(([v, label]) => (
                      <OptionRow
                        key={`fixed:${v}`}
                        itemValue={`fixed:${v}`}
                        label={label}
                        chosen={v === value}
                        onSelect={() => onPick(v)}
                      />
                    ))
                  : null}
                {rows.map((option) => (
                  <OptionRow
                    key={option.value}
                    itemValue={`row:${option.value}`}
                    label={option.label}
                    detail={option.detail}
                    match={answered}
                    chosen={option.value === value}
                    onSelect={() => onPick(option.value, option)}
                  />
                ))}
              </CommandGroup>
              {rows.length >= limit ? (
                <p className="px-3 pt-1 pb-2 text-meta text-text-muted">
                  Showing the first {limit}. Type to narrow the list.
                </p>
              ) : null}
            </>
          )}
        </CommandList>
      </Command>
    )
  }

  // The chosen row's cmdk value, which is its label.
  const chosenLabel = value !== undefined ? options[value] : undefined
  return (
    // Phone: the chosen row is the one cmdk marks while no key has moved
    // its highlight, so it alone is aria-selected and no other row turns
    // grey (command.tsx). Ignored on desktop.
    <Command chosenValue={chosenLabel}>
      {/* Fixed at the top: it is a sibling of the list, not inside
          its scroll container. */}
      <CommandInput placeholder={searchPlaceholder} />
      <CommandList className="max-h-menu-max overflow-y-auto">
        <CommandEmpty>{empty}</CommandEmpty>
        <CommandGroup>
          {Object.entries(options).map(([v, label]) => (
            <OptionRow
              key={v}
              itemValue={label}
              label={label}
              chosen={v === value}
              onSelect={() => onPick(v)}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/** One row, the same in both modes (section 16.2). */
function OptionRow({
  itemValue,
  label,
  detail,
  match,
  chosen,
  onSelect,
}: {
  /** cmdk's identity for the row; in the local mode it is also what it filters on. */
  itemValue: string
  label: string
  detail?: string | null
  /** The searched text, shown in body strong weight where it matches. */
  match?: string
  chosen: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={itemValue}
      // Not aria-selected: cmdk owns that attribute for its own
      // highlight, and section 16.2 needs the chosen row and the
      // highlighted row to stay visually distinct. `data-chosen`
      // carries ours.
      data-chosen={chosen || undefined}
      // CommandItem already renders the tick, keyed to data-checked.
      // Rule 4: do not build it twice.
      data-checked={chosen}
      onSelect={onSelect}
      className={cn(
        "h-control rounded-lg px-3",
        // data-selected is cmdk's highlight. Without restating the
        // chosen fill under it, the chosen row turned hover grey when
        // highlighted - the 16.2 defect again.
        chosen &&
          "bg-primary-subtle text-primary-text data-selected:bg-primary-subtle data-selected:text-primary-text"
      )}
    >
      {/* Phone: the label wraps rather than truncating (41.9 rule 7). */}
      <span className="flex min-w-0 flex-1 items-baseline gap-2 phone:flex-wrap">
        <span className="min-w-0 truncate phone:break-words phone:whitespace-normal">
          <Highlight text={label} match={match} />
        </span>
        {detail ? (
          <span className="min-w-0 truncate text-meta text-text-secondary">
            <Highlight text={detail} match={match} />
          </span>
        ) : null}
      </span>
    </CommandItem>
  )
}

/** Kit 27.1: matched text in body strong weight, never a background tint. */
function Highlight({ text, match }: { text: string; match?: string }) {
  const needle = match?.trim().toLowerCase()
  if (!needle) return <>{text}</>
  const at = text.toLowerCase().indexOf(needle)
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className="font-medium">{text.slice(at, at + needle.length)}</span>
      {text.slice(at + needle.length)}
    </>
  )
}

export { SearchableSelect, useSearchPicker }
