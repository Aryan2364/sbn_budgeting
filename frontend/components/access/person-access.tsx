"use client"

import * as React from "react"
import { CircleCheckIcon, CircleMinusIcon, TriangleAlertIcon } from "lucide-react"

import {
  accessApi,
  isBlocked,
  SCOPE_LABEL,
  type Named,
  type UnitRow,
} from "@/lib/access-api"
import type { Scope } from "@/lib/permission-keys"
import { formatNumber } from "@/lib/format"
import { UNIT, usePermissions } from "@/lib/permissions"
import { errorMessage } from "@/components/shell/session"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/sonner"
import { Truncate } from "@/components/ui/truncate"

/**
 * Pieces the People tab, a person's access page and What they can do
 * share (kit 40.6, 40.7, 40.9), written once (kit 4 rule 2). The unit
 * word always comes from `UNIT` (kit 0.1 item 8).
 */

/** Kit 40 scope labels, in R1 order, joined: "Team, Selected sites". */
export function scopesText(scopes: readonly Scope[]): string {
  return scopes.map((scope) => SCOPE_LABEL[scope]).join(", ")
}

/** "North yard, East depot", or null when they lead none. */
export function namesText(named: readonly Named[]): string | null {
  return named.length ? named.map((n) => n.name).join(", ") : null
}

/** Kit 40.6 rule 4: Active (success) or Inactive (neutral). Icon as well as colour (kit 7.2 rule 1). */
export function PersonStatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="success">
      <CircleCheckIcon />
      Active
    </Badge>
  ) : (
    <Badge variant="neutral">
      <CircleMinusIcon />
      Inactive
    </Badge>
  )
}

/** Every site, once, for the summaries and the unit picker. null until it lands; `error` when it failed. */
export function useAllUnits(): { units: UnitRow[] | null; error: string | null; retry: () => void } {
  const [state, setState] = React.useState<{ units: UnitRow[] | null; error: string | null }>({
    units: null,
    error: null,
  })
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    let cancelled = false
    accessApi
      .listUnits()
      .then((units) => {
        if (!cancelled) setState({ units, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState({ units: null, error: errorMessage(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])
  const retry = React.useCallback(() => {
    setState({ units: null, error: null })
    setAttempt((n) => n + 1)
  }, [])
  return { ...state, retry }
}

/**
 * Kit 40.6 rule 3: the ticked sites by location, "North: all 6 · East: 2".
 * A location with every site ticked reads "all N". Sites with no
 * location are counted under "No location". Returns null while the
 * site list is not known.
 */
export function sitesByLocation(unitIds: readonly string[], units: readonly UnitRow[] | null): string | null {
  if (!units) return null
  const ticked = new Set(unitIds)
  const groups = new Map<string, { name: string; total: number; ticked: number }>()
  for (const unit of units) {
    const key = unit.locationId ?? ""
    let group = groups.get(key)
    if (!group) {
      group = { name: unit.locationName ?? "No location", total: 0, ticked: 0 }
      groups.set(key, group)
    }
    group.total += 1
    if (ticked.has(unit.id)) group.ticked += 1
  }
  const parts: string[] = []
  for (const group of groups.values()) {
    if (group.ticked === 0) continue
    parts.push(
      `${group.name}: ${group.ticked === group.total ? `all ${formatNumber(group.total)}` : formatNumber(group.ticked)}`,
    )
  }
  return parts.join(" · ")
}

/**
 * Kit 40.6 rule 3, the cell: the summary; "Not used by their roles" in
 * text-muted when no role they hold uses Selected sites; a warning badge
 * "None chosen" when one does and nothing is ticked.
 */
export function SelectedSitesSummary({
  unitIds,
  usesUnits,
  units,
}: {
  unitIds: readonly string[]
  usesUnits: boolean
  units: readonly UnitRow[] | null
}) {
  if (!usesUnits) {
    return <span className="block min-w-0 text-text-muted"><Truncate>Not used by their roles</Truncate></span>
  }
  if (unitIds.length === 0) {
    return (
      <Badge variant="warning">
        <TriangleAlertIcon />
        None chosen
      </Badge>
    )
  }
  const summary = sitesByLocation(unitIds, units)
  return (
    <span className="block min-w-0">
      <Truncate>
        {summary ?? `${formatNumber(unitIds.length)} ${unitIds.length === 1 ? UNIT.one : UNIT.many}`}
      </Truncate>
    </span>
  )
}

/**
 * Deactivate or Activate a person (kit 40.6 rules 6 and 7, 38.1): at
 * once, with an Undo toast, never a confirmation. Every access save
 * refreshes the signed-in person's permissions (kit 26.4 rule 2), since
 * they may have just changed their own. A refusal (409, the last-holder
 * rule raced, kit 40.11 rule 3) is an error toast with the server's
 * sentence; `onChanged` runs either way, so the person's state reloads.
 */
export function useSetActive(onChanged: () => void): (person: Named, active: boolean) => Promise<void> {
  const { refresh } = usePermissions()

  return React.useCallback(
    async function setActive(person: Named, active: boolean, undoing = false): Promise<void> {
      try {
        await accessApi.setPersonActive(person.id, active)
        refresh()
        onChanged()
        if (undoing) {
          toast.success(active ? `${person.name} is active again.` : `${person.name} is inactive again.`)
          return
        }
        toast.undo(
          active
            ? `${person.name} activated. Their access applies from their next request.`
            : `${person.name} deactivated. Their access ends on their next request.`,
          () => void setActive(person, !active, true),
        )
      } catch (caught) {
        toast.error(isBlocked(caught) ? caught.message : errorMessage(caught))
        onChanged()
      }
    },
    [onChanged, refresh],
  ) as (person: Named, active: boolean) => Promise<void>
}
