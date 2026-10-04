import { SCOPE_LABEL, type AuditAction, type HistoryRow } from "@/lib/access-api"
import { PERMISSION_LABELS, SCOPES, type PermissionKey, type Scope } from "@/lib/permission-keys"
import { formatNumber } from "@/lib/format"
import { UNIT } from "@/lib/permissions"

/**
 * The words of the access History (kit 40.10 rules 2 and 3, kit 37),
 * written once for the list and the sheet. Names are the snapshots the
 * server stored at the time of the change (rule 4), never looked up now.
 *
 * Two wordings the kit does not give (plan 4 Q7, PQ7), following kit 37:
 * a site's lead change is Affected "Site: North yard"; a role's rename
 * reads "Role renamed", or "Role description changed" when only the
 * description changed.
 */

/** Kit 40.10 rule 5's "Kind of change" filter, in the server's order. */
export const KIND_LABEL: Readonly<Record<AuditAction, string>> = {
  "role.created": "Role created",
  "role.deleted": "Role deleted",
  "role.renamed": "Role renamed",
  "role.permissions_changed": "Permissions changed",
  "user.role_added": "Role added to a person",
  "user.role_removed": "Role removed from a person",
  "user.units_changed": `${capitalise(UNIT.many)} changed`,
  "user.reports_to_changed": "Reports to changed",
  "user.activated": "Activated",
  "user.deactivated": "Deactivated",
  "unit.lead_changed": "Lead changed",
}

type Named = { id: string; name: string }
type Permissions = Record<string, Scope[]>

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function namedList(value: unknown): Named[] {
  return Array.isArray(value)
    ? value.filter((v): v is Named => Boolean(v) && typeof (v as Named).name === "string")
    : []
}

function permissionsOf(side: unknown): Permissions {
  const raw = obj(obj(side).permissions)
  const out: Permissions = {}
  for (const [key, scopes] of Object.entries(raw)) {
    out[key] = Array.isArray(scopes) ? scopes.filter((s): s is Scope => SCOPES.includes(s as Scope)) : []
  }
  return out
}

/** "add expenses", or the key itself for one a release has since removed. */
function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key as PermissionKey] ?? key
}

/** Rule 2: Affected, a person's name, or "Role: " and the role's name. */
export function affectedText(row: HistoryRow): string {
  if (row.targetType === "role") return `Role: ${row.target.name}`
  if (row.targetType === "unit") return `${capitalise(UNIT.one)}: ${row.target.name}`
  return row.target.name
}

/** How many permissions a role change touched: keys whose scopes differ. Picks count only when nothing else changed. */
function changedPermissionKeys(before: Permissions, after: Permissions): { all: string[]; own: string[] } {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const all: string[] = []
  for (const key of keys) {
    const a = (before[key] ?? []).join(",")
    const b = (after[key] ?? []).join(",")
    if (a !== b) all.push(key)
  }
  return { all, own: all.filter((key) => !key.endsWith(".pick")) }
}

/** Rule 3: one summary form per kind of change. */
export function changeSummary(row: HistoryRow): string {
  switch (row.action) {
    case "role.created":
      return "Role created"
    case "role.deleted":
      return "Role deleted"
    case "role.renamed": {
      const before = obj(row.before)
      const after = obj(row.after)
      return before.name === after.name ? "Role description changed" : "Role renamed"
    }
    case "role.permissions_changed": {
      const { all, own } = changedPermissionKeys(permissionsOf(row.before), permissionsOf(row.after))
      const n = own.length || all.length
      return `${formatNumber(n)} ${n === 1 ? "permission" : "permissions"} changed`
    }
    case "user.role_added":
      return `Role added: ${row.role?.name ?? "a role"}`
    case "user.role_removed":
      return `Role removed: ${row.role?.name ?? "a role"}`
    case "user.units_changed": {
      const { added, removed } = diffNamed(namedList(obj(row.before).units), namedList(obj(row.after).units))
      return `${capitalise(UNIT.many)}: ${formatNumber(added.length)} added, ${formatNumber(removed.length)} removed`
    }
    case "user.reports_to_changed":
      return "Reports to changed"
    case "user.activated":
      return "Activated"
    case "user.deactivated":
      return "Deactivated"
    case "unit.lead_changed":
      return "Lead changed"
    default:
      return KIND_LABEL[row.action as AuditAction] ?? "Changed"
  }
}

function diffNamed(before: Named[], after: Named[]): { added: Named[]; removed: Named[] } {
  const was = new Set(before.map((n) => n.id))
  const now = new Set(after.map((n) => n.id))
  return {
    added: after.filter((n) => !was.has(n.id)),
    removed: before.filter((n) => !now.has(n.id)),
  }
}

/** One changed item in the sheet (rule 6): its name, what went (Before) and what came (After). */
export interface ChangeItem {
  label: string
  removed: string[]
  added: string[]
}

function scopesWords(scopes: readonly Scope[]): string {
  return scopes.map((s) => SCOPE_LABEL[s]).join(", ")
}

function permissionItems(before: Permissions, after: Permissions): ChangeItem[] {
  const removed: string[] = []
  const added: string[] = []
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  for (const key of keys) {
    const was = before[key] ?? []
    const now = after[key] ?? []
    const gone = was.filter((s) => !now.includes(s))
    const came = now.filter((s) => !was.includes(s))
    if (gone.length) removed.push(`${capitalise(permissionLabel(key))} (${scopesWords(gone)})`)
    if (came.length) added.push(`${capitalise(permissionLabel(key))} (${scopesWords(came)})`)
  }
  return removed.length || added.length ? [{ label: "Permissions", removed, added }] : []
}

function textItem(label: string, before: unknown, after: unknown): ChangeItem[] {
  const was = typeof before === "string" ? before : ""
  const now = typeof after === "string" ? after : ""
  if (was === now) return []
  return [{ label, removed: was ? [was] : [], added: now ? [now] : [] }]
}

function personName(value: unknown): string | null {
  const named = obj(value)
  return typeof named.name === "string" ? named.name : null
}

/** Rule 6: Before and After for each changed item. */
export function changeItems(row: HistoryRow): ChangeItem[] {
  const before = obj(row.before)
  const after = obj(row.after)
  switch (row.action) {
    case "role.created":
      return [
        ...textItem("Name", undefined, after.name),
        ...textItem("Description", undefined, after.description),
        ...permissionItems({}, permissionsOf(row.after)),
      ]
    case "role.deleted":
      return [
        ...textItem("Name", before.name, undefined),
        ...textItem("Description", before.description, undefined),
        ...permissionItems(permissionsOf(row.before), {}),
      ]
    case "role.renamed":
      return [...textItem("Name", before.name, after.name), ...textItem("Description", before.description, after.description)]
    case "role.permissions_changed":
      return permissionItems(permissionsOf(row.before), permissionsOf(row.after))
    case "user.role_added":
    case "user.role_removed": {
      const { added, removed } = diffNamed(namedList(before.roles), namedList(after.roles))
      return [{ label: "Roles", removed: removed.map((r) => r.name), added: added.map((r) => r.name) }]
    }
    case "user.units_changed": {
      const { added, removed } = diffNamed(namedList(before.units), namedList(after.units))
      return [{ label: `Selected ${UNIT.many}`, removed: removed.map((u) => u.name), added: added.map((u) => u.name) }]
    }
    case "user.reports_to_changed": {
      const was = personName(before.reportsTo)
      const now = personName(after.reportsTo)
      return [{ label: "Reports to", removed: [was ?? "No one"], added: [now ?? "No one"] }]
    }
    case "user.activated":
    case "user.deactivated":
      return [
        {
          label: "Status",
          removed: [before.active === true ? "Active" : "Inactive"],
          added: [after.active === true ? "Active" : "Inactive"],
        },
      ]
    case "unit.lead_changed": {
      const items: ChangeItem[] = []
      for (const [key, label] of [
        ["manager", "Manager"],
        ["supervisor", "Supervisor"],
      ] as const) {
        const was = personName(before[key])
        const now = personName(after[key])
        if (was === now) continue
        items.push({ label, removed: [was ?? "No one"], added: [now ?? "No one"] })
      }
      return items
    }
    default:
      return []
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
