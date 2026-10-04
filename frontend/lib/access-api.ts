/**
 * The access API's typed client (access plan P6 and P10, backend kit
 * 7.4): every `/access/*` route the four access screens use, and
 * nothing else. Mirrors backend/src/access/access.controller.ts and
 * access.service.ts exactly.
 *
 * Every route is behind `access.rights.manage`. Refusals follow R7:
 *   - 404 for a role or person that does not exist;
 *   - 403 from the guard (lib/api.ts then refreshes permissions);
 *   - 409 `{ error: 'blocked', reason }` for the last-holder rule, the
 *     Admin role, and deleting a role somebody holds. The reason is also
 *     the error's `message`, so `ApiError.message` is the sentence to show.
 *
 * Role saves never refuse over Picks (R6): they answer 200 with
 * `notices`, which the role editor shows.
 *
 * JSON goes through `api` from lib/api.ts, so timeouts, the bearer token,
 * the 403 refresh and the "never a raw technical error" rule stay in one
 * place.
 */

import { api, ApiError, query, type ListResponse, type Matchable } from "@/lib/api"
import type { PermissionKey, Scope } from "@/lib/permission-keys"

// ---------------------------------------------------------------
// Shapes, mirroring backend/src/access/access.service.ts
// ---------------------------------------------------------------

export interface Named {
  id: string
  name: string
}

/** A record's own answers (kit 26.5): true, or the reason it is not allowed. */
export type AccessCan = Partial<Record<string, true | string>>

/** Kit 40.3 rule 4's whole-role save: one scope per ticked permission. Picks are derived, never sent. */
export type RoleTicks = Partial<Record<PermissionKey, Scope>>

/** A row of the Roles tab (kit 40.2). */
export interface RoleRow {
  id: string
  name: string
  description: string
  /** Active people holding it now (kit 40.2 rule 2): the People link. */
  people: number
  /** Everyone holding it, active or not: Delete is refused while above zero. */
  holders: number
  /** `edit` and `delete`: true, or the sentence why not (the fixed role, holders). */
  can: AccessCan
}

/** One role, for the editor. */
export interface RoleDetail extends RoleRow {
  /**
   * Every stored row, Picks and see amounts included, each key with the
   * scopes it is held at. The fixed (Admin) role's every key at All,
   * computed by the server.
   */
  permissions: Partial<Record<PermissionKey, Scope[]>>
}

/** `POST /access/roles` and `PUT /access/roles/:id`. The whole role at once. */
export interface RoleBody {
  name: string
  description: string
  permissions: RoleTicks
}

/** A role save's answer: the role as stored, and one sentence per Pick or see amounts added, kept or removed. */
export interface RoleSaved {
  role: RoleDetail
  notices: string[]
}

/** A row of the People tab (kit 40.6). */
export interface PersonRow {
  id: string
  name: string
  active: boolean
  canLogin: boolean
  designationName: string | null
  /** Kit 40.11: the only person who can manage access. */
  isLastAccessManager: boolean
  /** Job roles first, then "+" roles, each alphabetical. */
  roles: Named[]
  /** The sites ticked on their page. */
  unitIds: string[]
  /** The sites they lead (manager or supervisor). */
  ledUnits: Named[]
  reportsTo: Named | null
  /** Whether any role they hold uses Selected sites ("Not used by their roles" otherwise). */
  usesUnits: boolean
  /** `editAccess`, `activate`, `deactivate`: true or the reason. */
  can: AccessCan
}

/** One role on a person's page, with the scopes it uses and whether it may be removed. */
export interface PersonRole extends Named {
  scopes: Scope[]
  /** `remove`: true, or the last-holder reason. */
  can: AccessCan
}

/** A site as the unit picker sees it. */
export interface UnitRow {
  id: string
  name: string
  locationId: string | null
  locationName: string | null
}

/** A person's access page (kit 40.7). */
export interface PersonDetail extends Omit<PersonRow, "roles"> {
  roles: PersonRole[]
  /** The ticked sites, with their location. */
  units: UnitRow[]
  /** The roles they hold that use Selected sites (kit 40.7 rule 8). */
  usesUnitsBy: Named[]
}

/** `PUT /access/people/:id/access`: roles and ticked sites together, in one transaction. */
export interface PersonAccessBody {
  roleIds: string[]
  unitIds: string[]
  /** Left out = unchanged; `null` = they report to nobody. Saved in the same transaction. */
  reportsToId?: string | null
}

/** `GET /access/people`: the page, plus the sites nobody covers (kit 40.8). */
export type PeopleList = ListResponse<PersonRow & Matchable> & { uncoveredUnits: Named[] }

/** One row of What they can do (kit 40.9). */
export interface EffectiveRow {
  key: PermissionKey
  section: string
  sectionLabel: string
  /** The action's short name, or "Pick". */
  action: string
  kind: "action" | "pick" | "access"
  /** Combined reach: All replaces the rest (kit 40.9 rule 7). */
  scopes: Scope[]
  /** Every role granting it, with that role's own scopes (kit 40.9 rule 8). */
  from: Array<Named & { scopes: Scope[] }>
  /** Picks only: what each is for (kit 40.9 rule 9). */
  neededBy?: Array<{ key: PermissionKey; label: string; scopes: Scope[] }>
}

export interface EffectiveModule {
  module: string
  label: string
  /** Null when the module has no see-amounts tick. */
  seeAmounts: { held: boolean; from: Named[] } | null
  rows: EffectiveRow[]
}

/** `GET /access/people/:id/effective`. */
export interface EffectiveAccess {
  person: {
    id: string
    name: string
    active: boolean
    roles: Named[]
    units: UnitRow[]
    ledUnits: Named[]
    teamSize: number
  }
  /** Only modules where they hold something, in catalogue order. */
  modules: EffectiveModule[]
  /** Module labels where they hold nothing (kit 40.9 rule 4). */
  noAccessTo: string[]
}

/** The kinds of change History records (backend access/audit.ts), in that order. */
export const AUDIT_ACTIONS = [
  "role.created",
  "role.deleted",
  "role.renamed",
  "role.permissions_changed",
  "user.role_added",
  "user.role_removed",
  "user.units_changed",
  "user.reports_to_changed",
  "user.activated",
  "user.deactivated",
  "unit.lead_changed",
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** One History row (kit 40.10). Names are as they were at the time. */
export interface HistoryRow {
  id: string
  /** ISO timestamp. */
  at: string
  action: AuditAction
  targetType: "role" | "user" | "unit"
  /** `id: null` is the system (a migration or the mapping re-sync). */
  changedBy: { id: string | null; name: string }
  /** The role, person or site changed. */
  target: Named
  /** The role concerned, on role.* and user.role_* rows. */
  role: Named | null
  /** Null on create. Shape depends on `action`. */
  before: unknown
  /** Null on delete. Shape depends on `action`. */
  after: unknown
  note: string | null
}

// ---------------------------------------------------------------
// List parameters (the shared list convention, plus each list's filters)
// ---------------------------------------------------------------

export interface AccessListParams {
  page?: number
  pageSize?: number
  search?: string
  sort?: string
  direction?: "asc" | "desc"
}

export interface PeopleListParams extends AccessListParams {
  roleId?: string
  status?: "active" | "inactive"
  locationId?: string
  /** "Selected sites: none chosen" (kit 40.6 rule 5). */
  unitsNoneChosen?: boolean
}

export interface HistoryListParams extends AccessListParams {
  actorId?: string
  personId?: string
  roleId?: string
  /** One or more kinds of change. */
  action?: AuditAction | AuditAction[]
  /** YYYY-MM-DD, inclusive. */
  from?: string
  /** YYYY-MM-DD, inclusive. */
  to?: string
}

function listQuery(params: AccessListParams): Record<string, string | number | undefined> {
  return {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    sort: params.sort,
    direction: params.direction,
  }
}

const id = (value: string) => encodeURIComponent(value)

// ---------------------------------------------------------------
// Calls
// ---------------------------------------------------------------

export const accessApi = {
  // ---- roles ----
  listRoles: (params: AccessListParams = {}) =>
    api.get<ListResponse<RoleRow & Matchable>>(`/access/roles${query(listQuery(params))}`),

  getRole: (roleId: string) => api.get<RoleDetail>(`/access/roles/${id(roleId)}`),

  createRole: (body: RoleBody) => api.post<RoleSaved>("/access/roles", body),

  /** The whole role at once (kit 40.3 rule 4). 409 for the fixed role. */
  updateRole: (roleId: string, body: RoleBody) => api.put<RoleSaved>(`/access/roles/${id(roleId)}`, body),

  /** 409 while anyone holds it, or for the fixed role. */
  deleteRole: (roleId: string) => api.delete<void>(`/access/roles/${id(roleId)}`),

  // ---- people ----
  listPeople: (params: PeopleListParams = {}) =>
    api.get<PeopleList>(
      `/access/people${query({
        ...listQuery(params),
        roleId: params.roleId,
        status: params.status,
        locationId: params.locationId,
        unitsNoneChosen: params.unitsNoneChosen ? "true" : undefined,
      })}`,
    ),

  getPerson: (personId: string) => api.get<PersonDetail>(`/access/people/${id(personId)}`),

  /** What they can do (kit 40.9). */
  getEffective: (personId: string) => api.get<EffectiveAccess>(`/access/people/${id(personId)}/effective`),

  /**
   * Roles, ticked sites and (when sent) who they report to: one request,
   * one transaction, so a refusal changes none of them. 409 for the
   * last-holder rule; 422 for a reporting loop or a role or site that no
   * longer exists.
   */
  savePersonAccess: (personId: string, body: PersonAccessBody) =>
    api.put<PersonDetail>(`/access/people/${id(personId)}/access`, body),

  /** Activate or deactivate. 409 for the last-holder rule. */
  setPersonActive: (personId: string, active: boolean) =>
    api.put<PersonDetail>(`/access/people/${id(personId)}/active`, { active }),

  /** Every site, unpaginated, with its location: the unit picker (kit 40.7 rule 9). */
  listUnits: () => api.get<UnitRow[]>("/access/units"),

  // ---- history ----
  listHistory: (params: HistoryListParams = {}) =>
    api.get<ListResponse<HistoryRow & Matchable>>(
      `/access/history${query({
        ...listQuery(params),
        actorId: params.actorId,
        personId: params.personId,
        roleId: params.roleId,
        action: Array.isArray(params.action) ? params.action.join(",") : params.action,
        from: params.from,
        to: params.to,
      })}`,
    ),
}

/** True for R7's 409 `blocked`: a rule refused it, and `error.message` is the sentence to show. */
export function isBlocked(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}

// ---------------------------------------------------------------
// Words shared by the access screens
// ---------------------------------------------------------------

/** Kit 40 scope labels, exactly, with the product's unit word (Sadbhavna: sites). */
export const SCOPE_LABEL: Readonly<Record<Scope, string>> = {
  own: "Own",
  team: "Team",
  units: "Selected sites",
  all: "All",
}

/** Kit 40.2 rule 3: add-on roles start with "+". */
export function isAddOnRole(role: { name: string }): boolean {
  return role.name.startsWith("+")
}

/** Kit 40.2 rule 4: job roles first, then add-on roles, each alphabetical. */
export function byRoleOrder(a: Named, b: Named): number {
  const plus = Number(isAddOnRole(a)) - Number(isAddOnRole(b))
  return plus || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id)
}

/** Paths of the four tabs and their pages (kit 40.1), so no screen builds one by hand. */
export const ACCESS_PATHS = {
  roles: "/access/roles",
  newRole: "/access/roles/new",
  role: (roleId: string) => `/access/roles/${id(roleId)}`,
  duplicateRole: (roleId: string) => `/access/roles/new?from=${id(roleId)}`,
  people: "/access/people",
  peopleWithRole: (roleId: string) => `/access/people?roleId=${id(roleId)}`,
  person: (personId: string) => `/access/people/${id(personId)}`,
  whatTheyCanDo: "/access/what-they-can-do",
  whatTheyCanDoFor: (personId: string) => `/access/what-they-can-do?person=${id(personId)}`,
  history: "/access/history",
  historyForPerson: (personId: string) => `/access/history?personId=${id(personId)}`,
} as const
