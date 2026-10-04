/**
 * The one place this app talks to the API.
 *
 * Amounts arrive and leave as STRINGS of paise. Nothing here parses one
 * into a number — see lib/money.ts for why.
 */

import type { PermissionKey, Scope } from './permission-keys'

const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api'

/**
 * Exported for the one caller that cannot go through `api`: a photo
 * loader that needs the raw `Response` to make a blob URL.
 */
export const API_BASE = BASE

const TOKEN_KEY = 'sadbhavna.token'

/**
 * Longer than any request this app makes on a warm path, short enough
 * that a stalled one becomes a visible, retryable failure rather than
 * a screen that never finishes loading.
 */
const REQUEST_TIMEOUT_MS = 20_000

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_KEY)
    else window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage disabled. The session lasts until the tab closes.
  }
}

/**
 * An error carrying what the API said, so a screen can show the cause
 * and the next action (AGENTS.md 7.2 rule 2) rather than "Request
 * failed".
 *
 * `fieldErrors` is class-validator's message array, which is what makes
 * an inline field error possible instead of a toast (7.1).
 */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: string[]

  constructor(status: number, message: string, fieldErrors: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }

  /** True when signing in again is the fix. */
  get isAuth(): boolean {
    return this.status === 401
  }

  /** True when the user is signed in but not allowed (§26). */
  get isForbidden(): boolean {
    return this.status === 403
  }
}

/**
 * Kit 26.4 rule 2 and access plan 6.1.9: a 403 means what the browser
 * believes about this person's permissions may be stale, so it asks
 * again. lib/permissions.ts registers the handler (refresh `/me` and
 * show the reason in an error toast). It lives behind a hook rather than
 * an import so this file never depends on the permissions module, which
 * itself calls `api`.
 *
 * Never on 404 or 409: those are not access changes. Never for a 403
 * from `/auth/me` itself, or a refused `/me` would ask for `/me` again
 * for ever.
 */
let forbiddenHandler: ((error: ApiError) => void) | null = null

export function setForbiddenHandler(handler: ((error: ApiError) => void) | null): void {
  forbiddenHandler = handler
}

const ME_PATH = '/auth/me'

/** Per-call overrides, used by uploads that need longer and say more. */
export interface RequestOptions {
  /** Defaults to REQUEST_TIMEOUT_MS. */
  timeoutMs?: number
  /** What a timeout says, cause then next action (7.2). */
  timeoutMessage?: string
  /** Replaces the message for a status, e.g. 413 on an upload. */
  statusMessages?: Partial<Record<number, string>>
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const token = getToken()
  /**
   * Multipart (complaint photos): the browser sets the content type,
   * boundary included, so this must not.
   */
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined || isForm ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body:
        body === undefined
          ? undefined
          : isForm
            ? (body as FormData)
            : JSON.stringify(body),
      /**
       * fetch has no timeout of its own: a request that stalls never
       * settles, so every `.then`/`.catch` downstream simply never
       * runs and the screen waits forever. A promise that cannot
       * reject cannot be shown as an error, however good the error
       * state is. This makes the failure reachable.
       */
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    })
  } catch (caught) {
    // Section 7.2 rule 3: never a raw technical error. Both of these
    // are failures the user can actually act on by retrying.
    if (caught instanceof DOMException && caught.name === 'TimeoutError') {
      throw new ApiError(0, options.timeoutMessage ?? 'The server took too long to answer. Try again.')
    }
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const raw = (payload as { message?: string | string[] } | null)?.message
    const fieldErrors = Array.isArray(raw) ? raw : []
    const fromServer = Array.isArray(raw) ? raw[0] : raw

    const error = new ApiError(
      response.status,
      options.statusMessages?.[response.status] ?? humanMessage(response.status, fromServer),
      fieldErrors,
    )
    if (response.status === 403 && path.split('?')[0] !== ME_PATH) forbiddenHandler?.(error)
    throw error
  }

  return payload as T
}

/**
 * Section 7.2 rule 3: never show a raw technical error to a user.
 *
 * The API's own exceptions carry sentences written for a person —
 * "This project still has sites. Delete or move them first." Those are
 * exactly what should be shown. But two kinds of message reach here
 * that were never written for anybody:
 *
 *   - a framework 404 for an unmatched route, which reads
 *     `Cannot GET /api/reports/variance/summary`;
 *   - a 500, whose message is whatever leaked out of the server.
 *
 * Both get replaced. This was found by testing the failure path: the
 * dashboard's own error state dutifully displayed `Cannot GET /api/...`
 * to the user.
 */
const FRAMEWORK_404 = /^Cannot (GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS) \//i

function humanMessage(status: number, fromServer: string | undefined): string {
  if (status >= 500) {
    return 'The server could not complete that. Try again in a moment.'
  }
  if (!fromServer || FRAMEWORK_404.test(fromServer)) {
    return status === 404
      ? 'That is not something this server knows how to answer.'
      : 'That did not work.'
  }
  return fromServer
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T,>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T,>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T,>(path: string) => request<T>('DELETE', path),
  /**
   * Multipart POST (complaint photos): same auth, timeout and error
   * mapping as every other call; the browser sets the content type.
   */
  postForm: <T,>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>('POST', path, form, options),
}

/** Builds a query string, dropping anything empty. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// ---------------------------------------------------------------
// Shapes, mirroring the API. Amounts are strings, always.
// ---------------------------------------------------------------

export interface ListResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  sort: string
  direction: 'asc' | 'desc'
  search: string | null
  appliedFilters: Record<string, string>
  /**
   * Optional server-computed totals over EVERY row matching the current
   * search/filters, not just the page. Optional so a list screen whose
   * endpoint predates this (e.g. the variance report, which builds its
   * own `ListResponse` by hand) is unaffected.
   */
  aggregates?: Record<string, string>
}

export interface Matchable {
  matchedField: string | null
  matchedValue: string | null
}

/** CONTRACT §1. What was `role` is now `modules.budget`. */
export type ModuleAccess = {
  platform?: 'admin'
  budget?: 'admin' | 'staff'
  complaints?: 'admin' | 'member'
}

export interface AuthUser {
  id: string
  name: string
  email: string | null
  phone: string | null
  designation: { id: string; name: string; seedKey: string | null } | null
  /**
   * Today's per-module levels. Kept on the payload until access plan
   * P11 so an already-open old tab keeps working through deploys, and
   * read by NOTHING in this app: every permission question goes
   * through lib/permissions.ts (kit 26.3), which reads `access` below.
   */
  modules: ModuleAccess
}

/**
 * The access part of `GET /auth/me`: the backend kit's `MyAccess` (8.1),
 * exactly (access plan 6.1.7, R3). No role names, no refusals, no
 * labels; the labels come from the generated lib/permission-keys.ts.
 * Read only by lib/permissions.ts.
 */
export interface MyAccess {
  version: number
  /** Only the keys held, Picks and module-wide keys included. */
  permissions: Partial<Record<PermissionKey, Scope[]>>
  /** Site ids Selected sites reaches: ticked on the person, plus those they lead. */
  units: string[]
}

/** `GET /auth/me`: the person, with what they may do beside it. */
export type Me = AuthUser & { access?: MyAccess }

/** `POST /auth/login`. `login` is an email or a phone number. */
export interface LoginBody {
  login: string
  password: string
}

export function login(body: LoginBody): Promise<{ token: string; user: AuthUser }> {
  return api.post<{ token: string; user: AuthUser }>('/auth/login', body)
}

export interface Project {
  id: string
  donorName: string
  name: string
  plannedTrees: number
  siteCount: number
  allocatedTrees: number
  createdAt: string
}

export interface Site {
  id: string
  /** Null where the site belongs to no project. Ordinary, not missing. */
  projectId: string | null
  projectName: string | null
  name: string
  siteLocationId: string | null
  locationName: string | null
  /** Null where no donor has been recorded for this site. */
  donorName: string | null
  plannedTrees: number
  plantationStartDate: string
  /**
   * The period anchor when set; null until plantation finishes, and
   * `plantationStartDate` is the fallback until then. See
   * `periodAnchor` in lib/periods.ts — nothing decides this locally.
   */
  plantationCompleteDate: string | null
  managerId: string | null
  managerName: string | null
  supervisorId: string | null
  supervisorName: string | null
  createdAt: string
}

export interface AllocationWarning {
  projectName: string
  plannedTrees: number
  allocatedTrees: number
  overBy: number
  siteCount: number
}

export interface CostHead {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  /**
   * What points at this head. The API refuses to delete one while
   * either is above zero, so the SCREEN reads these and never offers a
   * delete that will fail (§26).
   */
  budgetCount: number
  expenseCount: number
}

/**
 * A location (CONTRACT §2). `/site-locations` is an alias of
 * `/locations`, so budget screens that only need id, name and siteCount
 * keep reading the same shape.
 */
export interface Location {
  id: string
  name: string
  isActive: boolean
  siteCount: number
  complaintCount: number
}

/** Kept for the budget screens: a location is a site location. */
export type SiteLocation = Location

export interface Designation {
  id: string
  name: string
  /** Set on the seeded ones (supervisor, manager, hod, ceo). Never deletable. */
  seedKey: string | null
  sortOrder: number
  isActive: boolean
  userCount: number
}

export interface Person {
  id: string
  name: string
  email: string | null
  phone: string | null
  canLogin: boolean
  designation: { id: string; name: string } | null
  reportsTo: { id: string; name: string } | null
  modules: ModuleAccess
  /**
   * What points at this person — sites they manage or supervise,
   * expenses they booked, complaints still open with them. The API
   * refuses to delete one while any is above zero, so the screen reads
   * these rather than finding out after the click (§26).
   */
  siteCount: number
  expenseCount: number
  openComplaintCount: number
}

/**
 * One option from `GET /users/picker`, for any screen that only has to
 * choose a person. `Person` (with phone, email and roles) is the
 * platform-admin-only `GET /users`; never use it for a picker.
 */
export interface PersonOption {
  id: string
  name: string
  designationName: string | null
}

// ---------------------------------------------------------------
// Picks: `GET /pick/<module>/<section>?q=` (access plan 5.3, R11.7)
// ---------------------------------------------------------------
//
// A Pick is how a screen CHOOSES a value from another section without
// holding View on it. Each returns `{ id, name }` plus the fields its
// catalogue entry declares in `pick.fields` (the P7 picker inventory in
// lib/permissions.ts lists which, and why), at most 50 matches, ordered
// by name, searched by `q`, through the scope filter.
//
// Display is not picking (backend kit 3.5 rule 6): a form shows its
// saved values from the names embedded in the record it loaded, never
// through a Pick.
//
// One small function per Pick, so a screen never builds the path by
// hand and a section's extra fields are typed in one place.

/** Every Pick's base row. */
export interface PickOption {
  id: string
  name: string
}

/** `budget.sites.pick`: the period anchors feed the expense form, `projectId` the report scope. */
export interface SitePick extends PickOption {
  projectId: string | null
  plantationStartDate: string
  plantationCompleteDate: string | null
}

/** `budget.projects.pick`: `donorName` prefills a new site's donor. */
export interface ProjectPick extends PickOption {
  donorName: string
}

/** `budget.cost_heads.pick`: the grid and the expense form keep the spreadsheet's order. */
export interface CostHeadPick extends PickOption {
  sortOrder: number
  isActive: boolean
}

/**
 * `complaints.categories.pick`. Active ones only unless
 * `includeInactive`: the raise form offers active ones and says when a
 * category needs approval, and by whom; the complaint list's filter
 * wants retired ones too, because old complaints still carry them.
 */
export interface CategoryPick extends PickOption {
  isActive: boolean
  requiresApproval: boolean
  approverDesignation: { id: string; name: string } | null
}

/**
 * `platform.designations.pick`. `seedKey` finds the Supervisor (reassign)
 * and the default HOD approver (categories); `isActive` keeps a retired
 * one off a form that is choosing afresh.
 */
export interface DesignationPick extends PickOption {
  seedKey: string | null
  isActive: boolean
}

/** `platform.locations.pick`. */
export type LocationPick = PickOption

/** `platform.people.pick` (plan 5.3.3, O10 Q7). Same shape as `PersonOption`. */
export type PersonPick = PersonOption

/**
 * A Pick answers with its rows. Accepts `{ data: [...] }` as well, so a
 * controller that wraps them does not break every dropdown at once.
 */
async function pickRows<T>(path: string): Promise<T[]> {
  const result = await api.get<T[] | { data: T[] }>(path)
  return Array.isArray(result) ? result : result.data
}

export const pick = {
  sites: (q?: string) => pickRows<SitePick>(`/pick/budget/sites${query({ q })}`),
  projects: (q?: string) => pickRows<ProjectPick>(`/pick/budget/projects${query({ q })}`),
  costHeads: (q?: string) => pickRows<CostHeadPick>(`/pick/budget/cost_heads${query({ q })}`),
  categories: (params: { q?: string; includeInactive?: boolean } = {}) =>
    pickRows<CategoryPick>(
      `/pick/complaints/categories${query({
        q: params.q,
        includeInactive: params.includeInactive ? 'true' : undefined,
      })}`,
    ),
  /** Active ones unless `includeInactive` (a form that must show a retired current value). */
  designations: (params: { q?: string; includeInactive?: boolean } = {}) =>
    pickRows<DesignationPick>(
      `/pick/platform/designations${query({
        q: params.q,
        includeInactive: params.includeInactive ? 'true' : undefined,
      })}`,
    ),
  /** Active ones unless `includeInactive`. */
  locations: (params: { q?: string; includeInactive?: boolean } = {}) =>
    pickRows<LocationPick>(
      `/pick/platform/locations${query({
        q: params.q,
        includeInactive: params.includeInactive ? 'true' : undefined,
      })}`,
    ),
  /**
   * `q` searches name and designation on the server (P8's search-as-
   * you-type picker sends it 300 ms after typing stops). `designationId`
   * and `canReceive` (active and can sign in) narrow, never widen (plan
   * 5.3.3): the reassign dialog asks for Supervisors who can take a
   * complaint.
   */
  people: (params: { q?: string; designationId?: string; canReceive?: boolean } = {}) =>
    pickRows<PersonPick>(
      `/pick/platform/people${query({
        q: params.q,
        designationId: params.designationId,
        canReceive: params.canReceive === undefined ? undefined : String(params.canReceive),
      })}`,
    ),
}

/** `POST/PATCH /users`. `null` in `modules` removes that module. */
export interface PersonBody {
  name: string
  email?: string | null
  phone?: string | null
  designationId?: string | null
  reportsToId?: string | null
  modules?: {
    platform?: 'admin' | null
    budget?: 'admin' | 'staff' | null
    complaints?: 'admin' | 'member' | null
  }
  canLogin: boolean
  password?: string
}

/** One spreadsheet row, as the import endpoints take it (CONTRACT §2). */
export interface ImportRow {
  name: string
  phone: string
  email?: string
  designation?: string
  reportsToPhone?: string
  canLogin?: boolean
  password?: string
}

export type ImportRowStatus = 'new' | 'update' | 'unchanged' | 'error'

export interface ImportPreview {
  rows: Array<{
    index: number
    status: ImportRowStatus
    matchedUserId?: string
    changes: Array<{ field: string; from: string | null; to: string | null }>
    messages: string[]
  }>
  summary: Record<ImportRowStatus, number>
}

export interface ImportResult {
  created: number
  updated: number
  unchanged: number
}

export interface BudgetCell {
  costHeadId: string
  period: number
  perTreePaise: string
}

export interface BudgetGrid {
  siteId: string
  plannedTrees: number
  cells: BudgetCell[]
}

export interface Expense {
  id: string
  siteId: string
  siteName: string
  costHeadId: string
  costHeadName: string
  spentOn: string
  period: number
  amountPaise: string
  description: string | null
  billNumber: string | null
  approvedBy: string | null
  createdAt: string
  /**
   * Who entered it; null on old rows. Used only until the server sends
   * `can` below (lib/permissions.ts `useLegacyOwnAnswer`).
   */
  createdById: string | null
  /**
   * The server's own answer for this record (kit 26.5, access plan
   * 6.1.4 step 6), arriving with P3b-budget: `true`, or the reason it is
   * not allowed. Absent for an action whose key the person does not
   * hold at all.
   */
  can?: RecordCan
}

/** Kit 26.5: a record's answers, `true` or the reason it is not allowed. */
export type RecordCan = Partial<Record<string, true | string>>

export interface DashboardSummary {
  projectCount: number
  siteCount: number
  plannedTrees: number
  /** null when nothing anywhere is budgeted — reads "Budget not set". */
  budgetPaise: string | null
  actualPaise: string
  variancePaise: string | null
  sitesOverBudget: number
  spendThisMonthPaise: string
  spendLastMonthPaise: string
  attention: {
    siteId: string
    siteName: string
    projectName: string | null
    budgetPaise: string | null
    actualPaise: string
    variancePaise: string | null
  }[]
  recent: {
    id: string
    siteName: string
    costHeadName: string
    spentOn: string
    amountPaise: string
  }[]
}

/**
 * One row of the variance report, at whichever grain was asked for.
 *
 * The SAME shape at every grain, because it is the same `variance`
 * view: the Reports landing list reads it with `costHeadId` null, the
 * site detail Variance tab reads it one row per cost head, and the
 * tab's total row reads it with `costHeadId` null again. One
 * definition, one shape.
 *
 * `budgetPaise` is NULL where no `site_budgets` row exists — that is
 * "Budget not set", and it is a different fact from a budget of "0".
 * `variancePaise` and `variancePct` are null in the same case.
 * `actualPaise` never is: a budgeted head with no expenses has spent
 * nothing, which is 0.00, not an em-dash.
 *
 * Every amount is a STRING of paise and stays one. See lib/money.ts.
 */
export interface VarianceRow {
  siteId: string
  siteName: string
  projectId: string | null
  projectName: string | null
  plannedTrees: number
  costHeadId: string | null
  costHeadName: string | null
  period: number | null
  budgetPaise: string | null
  actualPaise: string
  variancePaise: string | null
  variancePct: string | null
}

/** `GET /reports/variance/sites/:siteId`, optionally for one period. */
export interface SiteVariance {
  /**
   * The site's own total, read from the view rather than added up from
   * the rows — and read at the SAME period the rows are. Null only
   * where the site has no budget and no expenses in that period.
   */
  total: VarianceRow | null
  /** One per cost head. Driven from `cost_heads`, not from the view. */
  rows: VarianceRow[]
  period: number | null
}

/** Phase 7b, Report 1. One period, at whatever scope was asked for. */
export interface VariancePeriodRow {
  /** null on a total row, where the period axis is collapsed. */
  period: number | null
  /** null means no budget rows exist — "Budget not set". */
  budgetPaise: string | null
  actualPaise: string
  variancePaise: string | null
  variancePct: string | null
}

/** `GET /reports/variance/periods-summary`. Five rows and a total. */
export interface PeriodSummary {
  rows: VariancePeriodRow[]
  total: VariancePeriodRow
}

/** Phase 7b, Report 2. One cost head across the five periods. */
export interface HeadPeriodRow {
  costHeadId: string
  costHeadName: string
  /** Always five, in period order, whatever the data carries. */
  cells: VariancePeriodRow[]
  /** The head's row total, summed in SQL beside the cells. */
  total: VariancePeriodRow
}

/** `GET /reports/variance/head-periods`. Heads down, periods across. */
export interface HeadPeriodReport {
  rows: HeadPeriodRow[]
  /** The column totals, one per period. */
  periodTotals: VariancePeriodRow[]
  /** Where the row totals and the column totals meet. */
  total: VariancePeriodRow
}
