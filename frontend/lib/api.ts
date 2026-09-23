/**
 * The one place this app talks to the API.
 *
 * Amounts arrive and leave as STRINGS of paise. Nothing here parses one
 * into a number — see lib/money.ts for why.
 */

const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api'

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken()

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      /**
       * fetch has no timeout of its own: a request that stalls never
       * settles, so every `.then`/`.catch` downstream simply never
       * runs and the screen waits forever. A promise that cannot
       * reject cannot be shown as an error, however good the error
       * state is. This makes the failure reachable.
       */
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (caught) {
    // Section 7.2 rule 3: never a raw technical error. Both of these
    // are failures the user can actually act on by retrying.
    if (caught instanceof DOMException && caught.name === 'TimeoutError') {
      throw new ApiError(0, 'The server took too long to answer. Try again.')
    }
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const raw = (payload as { message?: string | string[] } | null)?.message
    const fieldErrors = Array.isArray(raw) ? raw : []
    const fromServer = Array.isArray(raw) ? raw[0] : raw

    throw new ApiError(response.status, humanMessage(response.status, fromServer), fieldErrors)
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

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'staff'
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

export interface SiteLocation {
  id: string
  name: string
  siteCount: number
}

export interface Person {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: 'admin' | 'staff'
  canLogin: boolean
  /**
   * What points at this person — sites they manage or supervise, and
   * expenses they booked. The API refuses to delete one while either is
   * above zero, so the screen reads these rather than finding out after
   * the click (§26).
   */
  siteCount: number
  expenseCount: number
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
}

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
