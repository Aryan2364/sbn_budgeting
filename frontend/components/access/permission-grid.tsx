"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { SCOPE_LABEL, type RoleTicks } from "@/lib/access-api"
import {
  CATALOGUE,
  PERMISSION_LABELS,
  type CatalogueModule,
  type CatalogueSection,
  type PermissionKey,
  type Scope,
} from "@/lib/permission-keys"
import { Checkbox } from "@/components/ui/checkbox"
import { useBandLevel } from "@/components/ui/header-band"
import { InlineChoice } from "@/components/ui/inline-choice"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table"

/**
 * Kit 40.3 to 40.5: the permission grid. It renders ONE module of a role:
 * the module tick and its see-amounts tick on the card's first line
 * (40.3 rule 8), then a table whose rows are the module's sections and
 * whose columns are its actions, in catalogue order (rule 10). The page
 * (app/(app)/access/roles/role-editor.tsx) owns the whole role, the one
 * Save and the panel card around each grid.
 *
 * Everything it knows about permissions comes from the GENERATED
 * catalogue in lib/permission-keys.ts: sections, actions, short names,
 * the scopes a section offers, and what each action needs. Nothing here
 * is typed by hand.
 *
 * Its value is `RoleTicks`: one scope per ticked permission, exactly the
 * `permissions` the role save sends. Picks are never in it (40.5 rule 1):
 * they follow the ticks and are shown, never ticked. See amounts is in it
 * only when ticked on purpose; when a ticked permission needs it, it is
 * shown ticked and locked instead (O9), the same way.
 *
 * Section 40.3 rule 15: Tab moves through the ticks and scope choices in
 * reading order, Space ticks, Enter or Space opens a scope. The grid does
 * not use the spreadsheet movement of 39.6: its cells are controls.
 */

// ---------------------------------------------------------------------
// The rules, as pure functions: the page uses them too
// ---------------------------------------------------------------------

/** The first letter up, for a label used as a sentence or a control name. */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "a", "a and b", "a, b and c". */
function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/**
 * Kit 40.4 rule 4: a new tick starts at the narrowest scope the section
 * offers: Own wherever it is offered, otherwise the only one. The
 * catalogue lists scopes narrowest first.
 */
export function startingScope(section: CatalogueSection): Scope {
  return section.scopes[0] ?? "all"
}

/** The section that owns a Pick key, to know whether everyone picks from it (40.5 rule 4). */
const PICK_SECTIONS: ReadonlyMap<PermissionKey, CatalogueSection> = new Map(
  CATALOGUE.flatMap((mod) => mod.sections.filter((s) => s.pick).map((s) => [s.pick!, s] as const)),
)

/** Every key a role grid can tick in this module: its actions, then see amounts. */
export function tickableKeys(module: CatalogueModule): PermissionKey[] {
  const keys = module.sections.flatMap((s) => s.actions.map((a) => a.key))
  if (module.seeAmounts) keys.push(module.seeAmounts.key)
  return keys
}

/** The ticked permissions in this module that need its see amounts (O9). */
export function amountsNeededBy(module: CatalogueModule, ticks: RoleTicks): PermissionKey[] {
  if (!module.seeAmounts) return []
  const amounts = module.seeAmounts.key
  return module.sections.flatMap((s) =>
    s.actions
      .filter((a) => ticks[a.key] !== undefined && a.needs.some((n) => "amounts" in n && n.amounts === amounts))
      .map((a) => a.key),
  )
}

/** Whether see amounts reads as ticked: ticked on purpose, or needed by a tick. */
export function amountsTicked(module: CatalogueModule, ticks: RoleTicks): boolean {
  if (!module.seeAmounts) return false
  return ticks[module.seeAmounts.key] !== undefined || amountsNeededBy(module, ticks).length > 0
}

/**
 * Kit 40.5 rules 2 to 4, and O9: what this row's ticks bring in, in the
 * words of the "Also includes" line. Picks everyone holds are never
 * mentioned. Recomputed from the ticks on every render, so the line
 * appears with the tick and goes with it.
 */
export function alsoIncludes(section: CatalogueSection, ticks: RoleTicks): string[] {
  const out: string[] = []
  for (const action of section.actions) {
    if (ticks[action.key] === undefined) continue
    for (const need of action.needs) {
      if ("amounts" in need) {
        out.push("see amounts")
      } else if (!PICK_SECTIONS.get(need.pick)?.pickForEveryone) {
        out.push(PERMISSION_LABELS[need.pick])
      }
    }
  }
  return [...new Set(out)]
}

/** The reason the see-amounts tick cannot be unticked (O9): "View reports needs this. Untick it first." */
export function amountsLockedReason(needers: readonly PermissionKey[]): string {
  const labels = needers.map((key) => PERMISSION_LABELS[key])
  return needers.length === 1
    ? `${sentence(labels[0])} needs this. Untick it first.`
    : `${sentence(joinAnd(labels))} need this. Untick them first.`
}

/** One options array per section, so a scope list is handed the same items on every render. */
const SCOPE_OPTIONS = new Map<CatalogueSection, Array<{ value: Scope; label: string }>>()

function scopeOptions(section: CatalogueSection): Array<{ value: Scope; label: string }> {
  let options = SCOPE_OPTIONS.get(section)
  if (!options) {
    options = section.scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))
    SCOPE_OPTIONS.set(section, options)
  }
  return options
}

type TickState = "ticked" | "partly" | "unticked"

function stateOf(ticked: number, of: number): TickState {
  if (ticked === 0) return "unticked"
  return ticked === of ? "ticked" : "partly"
}

/** The module's columns: its actions' short names, in catalogue order (40.3 rule 10). */
function columnsOf(module: CatalogueModule): string[] {
  const columns: string[] = []
  for (const section of module.sections) {
    for (const action of section.actions) {
      if (!columns.includes(action.short)) columns.push(action.short)
    }
  }
  return columns
}

// ---------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------

export interface PermissionGridProps {
  module: CatalogueModule
  /** The whole role's ticks; this grid reads and changes only its module's keys. */
  ticks: RoleTicks
  /** Omitted when read-only. */
  onTicksChange?: (next: RoleTicks) => void
  /**
   * The system role (40.3 rule 14): every tick ticked and disabled,
   * scopes as plain text. The page shows the one banner above the cards.
   */
  readOnly?: boolean
}

export function PermissionGrid({ module, ticks, onTicksChange, readOnly = false }: PermissionGridProps) {
  const columns = React.useMemo(() => columnsOf(module), [module])
  // The table's header band sits one level inside the panel card's band
  // (36.4); the frozen corner cell needs the same ground as the band.
  const headerLevel = useBandLevel() + 1

  const change = (next: RoleTicks) => {
    if (!readOnly) onTicksChange?.(next)
  }

  const amountsKey = module.seeAmounts?.key
  const amountsNeeders = amountsNeededBy(module, ticks)
  const amountsOn = amountsTicked(module, ticks)

  const actionKeys = module.sections.flatMap((s) => s.actions.map((a) => a.key))
  const moduleState = stateOf(
    actionKeys.filter((k) => ticks[k] !== undefined).length + (amountsOn ? 1 : 0),
    actionKeys.length + (amountsKey ? 1 : 0),
  )

  /** Rule 9: ticking adds every unticked permission at its starting scope; unticking clears the module, see amounts included. */
  function toggleModule() {
    const next: RoleTicks = { ...ticks }
    if (moduleState === "ticked") {
      for (const key of tickableKeys(module)) delete next[key]
    } else {
      for (const section of module.sections) {
        for (const action of section.actions) next[action.key] ??= startingScope(section)
      }
      if (amountsKey) next[amountsKey] ??= "all"
    }
    change(next)
  }

  function toggleRow(section: CatalogueSection, state: TickState) {
    const next: RoleTicks = { ...ticks }
    for (const action of section.actions) {
      if (state === "ticked") delete next[action.key]
      else next[action.key] ??= startingScope(section)
    }
    change(next)
  }

  function toggleCell(section: CatalogueSection, key: PermissionKey, on: boolean) {
    const next: RoleTicks = { ...ticks }
    // Rule 40.4.4: ticking again after unticking starts at the narrowest scope again.
    if (on) next[key] = startingScope(section)
    else delete next[key]
    change(next)
  }

  function toggleAmounts(on: boolean) {
    if (!amountsKey) return
    const next: RoleTicks = { ...ticks }
    if (on) next[amountsKey] = "all"
    else delete next[amountsKey]
    change(next)
  }

  const amountsLocked = amountsNeeders.length > 0
  const amountsLabel = module.seeAmounts ? sentence(module.seeAmounts.label) : ""

  return (
    <div data-slot="permission-grid" className="flex flex-col gap-4">
      {/* Rule 8: the module tick and the see-amounts tick, on the card body's first line. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-body text-text-primary has-data-disabled:cursor-default">
          <Checkbox
            checked={moduleState === "ticked"}
            indeterminate={moduleState === "partly"}
            disabled={readOnly}
            onCheckedChange={toggleModule}
            aria-label={`Everything in ${module.label}`}
          />
          Everything in {module.label}
        </label>
        {module.seeAmounts ? (
          <PermissionTooltip
            allowed={!readOnly && amountsLocked ? false : true}
            reason={amountsLockedReason(amountsNeeders)}
          >
            <label className="flex cursor-pointer items-center gap-2 text-body text-text-primary has-data-disabled:cursor-default">
              <Checkbox
                checked={amountsOn}
                disabled={readOnly || amountsLocked}
                onCheckedChange={(on) => toggleAmounts(on)}
                aria-label={amountsLabel}
              />
              {amountsLabel}
            </label>
          </PermissionTooltip>
        ) : null}
      </div>

      {/* Rule 3: the table scrolls sideways inside its own container, the
          Section column frozen with its 1px right border (31.4, 34.3).
          Rule 40.4.5: every action column is col-scope wide, so no column
          changes width as scopes change. */}
      <div className="overflow-hidden rounded-lg border border-border-light">
        <Table containerClassName="overflow-x-auto" className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead
                className={cn(
                  "sticky left-0 z-(--z-sticky) w-grid-head",
                  "after:absolute after:top-0 after:right-0 after:h-full after:border-r after:border-border",
                  headerLevel <= 1 ? "bg-primary" : "bg-surface",
                )}
              >
                Section
              </TableHead>
              {columns.map((column) => (
                <TableHead key={column} className="w-col-scope">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {module.sections.map((section) => {
              const ticked = section.actions.filter((a) => ticks[a.key] !== undefined).length
              const rowState = stateOf(ticked, section.actions.length)
              const also = alsoIncludes(section, ticks)
              return (
                <TableRow key={section.key}>
                  {/* Rule 11: the row spine, with the row tick. A ticked row
                      is a value, not a selection, so it takes no selected tint. */}
                  <TableRowHeader frozen className="align-top">
                    <label className="flex cursor-pointer items-start gap-2 has-data-disabled:cursor-default">
                      <Checkbox
                        className="mt-1"
                        checked={rowState === "ticked"}
                        indeterminate={rowState === "partly"}
                        disabled={readOnly}
                        onCheckedChange={() => toggleRow(section, rowState)}
                        aria-label={`Everything in ${section.label}`}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="min-w-0 break-words">{section.label}</span>
                        {/* 40.5 rule 3: label style, not meta (contrast on the spine). */}
                        {also.length > 0 ? (
                          <span className="text-label font-normal text-text-secondary">
                            Also includes: {also.join(", ")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </TableRowHeader>
                  {columns.map((column) => {
                    const action = section.actions.find((a) => a.short === column)
                    // Rule 10: no such action, an empty cell. No tick, no dash.
                    if (!action) return <TableCell key={column} className="w-col-scope" />
                    const scope = ticks[action.key]
                    const name = sentence(action.label)
                    return (
                      <TableCell key={column} className="w-col-scope align-top">
                        <span className="flex min-h-6 items-center gap-2">
                          <Checkbox
                            checked={scope !== undefined}
                            disabled={readOnly}
                            onCheckedChange={(on) => toggleCell(section, action.key, on)}
                            aria-label={name}
                          />
                          {scope !== undefined ? (
                            readOnly || section.scopes.length === 1 ? (
                              <span className="text-body text-text-primary">{SCOPE_LABEL[scope]}</span>
                            ) : (
                              <InlineChoice<Scope>
                                label={`Scope for ${action.label}`}
                                value={scope}
                                onValueChange={(next) => {
                                  // The list may report the value it already holds (on
                                  // opening, as it registers its items). A new ticks
                                  // object for an unchanged scope would re-render the
                                  // page, hand the list new items, and report again:
                                  // a loop that froze the tab. Only a real change counts.
                                  if (next !== scope) change({ ...ticks, [action.key]: next })
                                }}
                                options={scopeOptions(section)}
                              />
                            )
                          ) : null}
                        </span>
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
