"use client"

import * as React from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import type { UnitRow } from "@/lib/access-api"
import { formatNumber } from "@/lib/format"
import { UNIT } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Truncate } from "@/components/ui/truncate"
import { ListSearch } from "@/components/templates/list-page"

/**
 * The unit picker (kit 40.7 rules 9 to 14, access plan P10): which sites
 * a person's Selected sites permissions reach, ticked one by one.
 *
 * - **Every site, unpaginated** (kit 40.7 rule 9, the kit 1 rule 7
 *   exception, approved by the owner for this screen): paging would split
 *   a location and hide ticks. The page owns the scroll; this never
 *   scrolls on its own (kit 10).
 * - **Search above 50 sites** (rule 10). Ticks hidden by the search stay
 *   ticked: the value is never filtered, only what is drawn.
 * - **The location shortcut** (rule 11, decision 3): each location has a
 *   tick that is ticked, partly ticked or unticked across its sites, with
 *   "6 of 6" beside it. Ticking it ticks every site in the location, and
 *   any one can then be unticked. It is worked out here, in the browser:
 *   what is stored is the sites, never the location, so a site added to
 *   the location later is NOT ticked (decision 4). While a search is
 *   active the location tick acts only on the sites shown, and says so.
 *   Locations start expanded and collapse instantly, never with an
 *   animated height (kit 5.6 rule 1).
 * - Sites sit in a wrapping grid, 4 columns at 1280, 3 at 1024, 2 at 768
 *   (rule 12), names truncated (kit 8).
 * - Sites have no active flag (plan 2), so every site is listed (rule 14).
 *
 * The sites a person leads are not ticks here (rule 13): the page lists
 * them under the picker as text, because they are changed on the site.
 *
 * The unit word comes from `UNIT` (kit 0.1 item 8), never typed here.
 */

/** Kit 40.7 rule 10: at 50 or fewer, the list alone is quicker to scan. */
const SEARCH_ABOVE = 50

const NO_GROUP = "__none__"

interface Group {
  key: string
  name: string
  units: UnitRow[]
}

/** Locations in the server's order (location name, no location last), sites by name within. */
function groupUnits(units: readonly UnitRow[]): Group[] {
  const groups = new Map<string, Group>()
  for (const unit of units) {
    const key = unit.locationId ?? NO_GROUP
    let group = groups.get(key)
    if (!group) {
      group = { key, name: unit.locationName ?? "No location", units: [] }
      groups.set(key, group)
    }
    group.units.push(unit)
  }
  return [...groups.values()]
}

export function UnitPicker({
  units,
  value,
  onChange,
  disabled = false,
}: {
  /** Every site, from GET /access/units. */
  units: readonly UnitRow[]
  /** The ticked site ids. */
  value: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const id = React.useId()
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set())

  // Kit 27.1: search runs 300ms after the user stops typing.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const searchable = units.length > SEARCH_ABOVE
  const searching = searchable && search !== ""
  const ticked = React.useMemo(() => new Set(value), [value])
  const groups = React.useMemo(() => groupUnits(units), [units])

  const shown = React.useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          units: searching
            ? group.units.filter((unit) => unit.name.toLowerCase().includes(search))
            : group.units,
        }))
        .filter((entry) => entry.units.length > 0),
    [groups, search, searching],
  )
  const shownCount = shown.reduce((n, entry) => n + entry.units.length, 0)

  function setTicks(ids: readonly string[], on: boolean) {
    const next = new Set(ticked)
    for (const unitId of ids) {
      if (on) next.add(unitId)
      else next.delete(unitId)
    }
    // Kept in the order of the full list, so the value compares stably.
    onChange(units.filter((unit) => next.has(unit.id)).map((unit) => unit.id))
  }

  function toggleCollapsed(key: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (units.length === 0) {
    return (
      <EmptyState variant="nothing-yet" heading={`No ${UNIT.many} yet`} headingLevel={3}>
        {`${capitalise(UNIT.many)} appear here once they are added under ${capitalise(UNIT.many)}.`}
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {searchable ? (
        <div className="flex flex-wrap items-center gap-2">
          <ListSearch
            label={`Search ${UNIT.many}`}
            placeholder={`Search ${UNIT.many}`}
            title={`Searches ${UNIT.one} names`}
            value={searchInput}
            disabled={disabled}
            onChange={(event) => setSearchInput(event.target.value)}
            onClear={() => setSearchInput("")}
          />
          {searching ? (
            <span className="text-label text-text-secondary">
              {formatNumber(shownCount)} {shownCount === 1 ? "result" : "results"}
            </span>
          ) : null}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          variant="nothing-found"
          heading={`No ${UNIT.many} match '${searchInput.trim()}'`}
          headingLevel={3}
          actionLabel="Clear search"
          onAction={() => setSearchInput("")}
        >
          {`Ticked ${UNIT.many} stay ticked while they are hidden.`}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {shown.map(({ group, units: groupShown }) => {
            const tickedInGroup = group.units.filter((unit) => ticked.has(unit.id)).length
            const tickedShown = groupShown.filter((unit) => ticked.has(unit.id)).length
            const all = tickedShown === groupShown.length
            const some = tickedShown > 0 && !all
            const isCollapsed = collapsed.has(group.key) && !searching
            const groupId = `${id}-group-${group.key}`
            const listId = `${id}-list-${group.key}`
            const tickLabel = searching
              ? `${group.name}: tick the ${formatNumber(groupShown.length)} shown`
              : group.name
            const toggleLabel = `${isCollapsed ? "Expand" : "Collapse"} ${group.name}`

            return (
              <section key={group.key} className="flex flex-col gap-3" aria-labelledby={`${groupId}-label`}>
                <div className="flex min-w-0 items-center gap-2">
                  {searching ? null : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon-sm"
                            aria-label={toggleLabel}
                            aria-expanded={!isCollapsed}
                            aria-controls={listId}
                            onClick={() => toggleCollapsed(group.key)}
                          />
                        }
                      >
                        {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{toggleLabel}</TooltipContent>
                    </Tooltip>
                  )}
                  <Checkbox
                    id={groupId}
                    checked={all}
                    indeterminate={some}
                    disabled={disabled}
                    onCheckedChange={() => setTicks(groupShown.map((unit) => unit.id), !all)}
                  />
                  <label
                    id={`${groupId}-label`}
                    htmlFor={groupId}
                    className="min-w-0 cursor-pointer text-body font-medium text-text-primary"
                  >
                    <Truncate>{tickLabel}</Truncate>
                  </label>
                  <span className="shrink-0 text-label text-text-secondary tabular-nums">
                    {formatNumber(tickedInGroup)} of {formatNumber(group.units.length)}
                  </span>
                </div>

                {isCollapsed ? null : (
                  <ul
                    id={listId}
                    className="grid grid-cols-1 gap-x-6 gap-y-3 pl-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  >
                    {groupShown.map((unit) => {
                      const unitId = `${id}-unit-${unit.id}`
                      return (
                        <li key={unit.id} className="flex min-w-0 items-center gap-2">
                          <Checkbox
                            id={unitId}
                            checked={ticked.has(unit.id)}
                            disabled={disabled}
                            onCheckedChange={(checked) => setTicks([unit.id], checked === true)}
                          />
                          <label
                            htmlFor={unitId}
                            className="min-w-0 cursor-pointer text-body text-text-primary"
                          >
                            <Truncate>{unit.name}</Truncate>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
