/**
 * The complaints module's API client (CONTRACT section 3).
 *
 * JSON calls go through `api` from lib/api.ts, so timeouts, the bearer
 * token and the "never a raw technical error" translation stay in one
 * place. Two things that module cannot do live here:
 *
 *   - multipart requests (raise and resolve carry photos), and
 *   - reading a photo, which needs the bearer token, so an `<img src>`
 *     cannot fetch it. `useAuthPhoto` fetches it and hands back a blob
 *     URL that is revoked when the component unmounts.
 */

import * as React from "react"

import { api, API_BASE, getToken, query, type ListResponse, type Matchable } from "@/lib/api"

/**
 * Longer than the JSON timeout in lib/api.ts: a phone on a weak signal
 * uploading three compressed photos needs more than 20 seconds, and a
 * request that stalls must still become a visible, retryable failure
 * (section 14 rule 4).
 */
const UPLOAD_TIMEOUT_MS = 90_000
const PHOTO_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------
// Shapes, mirroring CONTRACT sections 3 and 10
// ---------------------------------------------------------------

export type ComplaintStatus = "open" | "in_progress" | "closed"

export type ComplaintTab = "assigned" | "raised" | "all"

export interface PersonRef {
  id: string
  name: string
}

export interface ComplaintRow {
  id: string
  number: number
  /** "C-000123" */
  reference: string
  status: ComplaintStatus
  category: { id: string; name: string }
  /** The budget site it was filed against. Null only on complaints raised before sites (§10). */
  site: { id: string; name: string } | null
  /** The complaint's own location (older complaints), else the site's location, else null. */
  location: { id: string; name: string } | null
  /** Full text; the UI truncates. */
  description: string
  complainantName: string
  raisedAt: string
  raisedBy: PersonRef
  supervisor: PersonRef
  /** Since raisedAt, or raisedAt to closedAt when closed. */
  ageDays: number
  photoCount: number
}

/**
 * Where a complaint was filed, for display: its site, or for a complaint
 * raised before sites, its location. Every screen names it this way.
 */
export function complaintPlace(row: Pick<ComplaintRow, "site" | "location">): string {
  return row.site?.name ?? row.location?.name ?? "No site"
}

export type ActionName = "start" | "resolve" | "reassign" | "comment"

export interface ActionState {
  allowed: boolean
  /** When not allowed: who CAN take it. The disabled button's tooltip. */
  reason: string | null
}

export type EventKind =
  | "raised"
  | "started"
  | "resolved"
  | "closed"
  | "reassigned"
  | "comment"

export interface ComplaintPhoto {
  id: string
  stage: "raise" | "resolve"
  contentType: string
  uploadedAt: string
  uploadedBy: PersonRef
}

export interface ComplaintEvent {
  id: string
  kind: EventKind | string
  actor: PersonRef | null
  note: string | null
  fromStatus: string | null
  toStatus: string | null
  payload: unknown
  at: string
}

export interface ComplaintDetail extends ComplaintRow {
  complainantPhone: string
  locationNote: string | null
  manager: PersonRef | null
  startedAt: string | null
  resolvedAt: string | null
  closedAt: string | null
  resolutionNote: string | null
  resolvedBy: PersonRef | null
  closedBy: PersonRef | null
  photos: ComplaintPhoto[]
  events: ComplaintEvent[]
  actions: Record<ActionName, ActionState>
}

export interface ComplaintCounts {
  assigned: number
  raised: number
  all: number
}

export interface ComplaintSummary {
  byStatus: Record<ComplaintStatus, number>
  /**
   * Older location-only complaints share one bucket with `site.id === null`
   * ("No site (older complaint)"), always last. Never link that one.
   */
  bySite: Array<{ site: { id: string | null; name: string }; open: number; closed: number }>
  byCategory: Array<{ category: { id: string; name: string }; open: number; closed: number }>
  openAgeing: { d0_2: number; d3_7: number; d8_14: number; d15plus: number }
  closedLast7Days: number
}

/** One entry of the raise form's site picker (`GET /complaints/sites`, §10). */
export interface ComplaintSiteOption {
  id: string
  name: string
  /** The site's location, if it has one. */
  location: { id: string; name: string } | null
  /** Who routing would pick right now; null when nobody who can sign in. */
  supervisor: PersonRef | null
  /** Who routing would copy right now. */
  manager: PersonRef | null
  /** False: no supervisor who can sign in, so a raise here is refused. */
  canReceive: boolean
  /** When it cannot receive: the same sentence as the raise's 422. */
  reason: string | null
}

export interface ComplaintCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  /** DELETE is refused while this is above 0. */
  complaintCount: number
}

export interface ComplaintCategoryBody {
  name: string
  isActive?: boolean
}

export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string | null
  complaintId: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationFeed {
  items: NotificationItem[]
  unreadCount: number
}

export interface ComplaintListParams {
  tab: ComplaintTab
  page?: number
  pageSize?: number
  search?: string
  sort?: string
  direction?: "asc" | "desc"
  status?: string
  siteId?: string
  categoryId?: string
}

export interface RaiseComplaintBody {
  siteId: string
  categoryId: string
  complainantName: string
  complainantPhone: string
  locationNote?: string
  description: string
}

// ---------------------------------------------------------------
// Multipart
// ---------------------------------------------------------------

/**
 * Sends a multipart form, with the same error handling lib/api.ts
 * gives JSON requests: a timeout becomes a retryable message, a
 * network failure says so, and a 500 never shows the server's text.
 *
 * The content-type header is left to the browser, which is the only
 * thing that knows the boundary it chose.
 */
export async function postMultipart<T>(
  path: string,
  fields: Record<string, string | undefined | null>,
  files: { name: string; files: File[] },
): Promise<T> {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue
    form.append(key, value)
  }
  for (const file of files.files) form.append(files.name, file, file.name)

  // One request path (lib/api.ts): same auth, deadline and error mapping.
  return api.postForm<T>(path, form, {
    timeoutMs: UPLOAD_TIMEOUT_MS,
    timeoutMessage: "The upload took too long. Check your signal and try again. Nothing was saved.",
    statusMessages: { 413: "Those photos are too large to send. Remove one and try again." },
  })
}

// ---------------------------------------------------------------
// Calls
// ---------------------------------------------------------------

export const complaintsApi = {
  list: (params: ComplaintListParams) =>
    api.get<ListResponse<ComplaintRow & Matchable>>(
      `/complaints${query({
        tab: params.tab,
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        sort: params.sort,
        direction: params.direction,
        status: params.status,
        siteId: params.siteId,
        categoryId: params.categoryId,
      })}`,
    ),

  counts: () => api.get<ComplaintCounts>("/complaints/counts"),

  summary: () => api.get<ComplaintSummary>("/complaints/summary"),

  /** Every site, by name (capped at 1000 by the API, unpaginated). */
  sites: () => api.get<{ data: ComplaintSiteOption[] }>("/complaints/sites"),

  get: (id: string) => api.get<ComplaintDetail>(`/complaints/${id}`),

  raise: (body: RaiseComplaintBody, photos: File[]) =>
    postMultipart<ComplaintDetail>(
      "/complaints",
      { ...body },
      { name: "photos", files: photos },
    ),

  start: (id: string) => api.post<ComplaintDetail>(`/complaints/${id}/start`, {}),

  resolve: (id: string, resolutionNote: string, photos: File[]) =>
    postMultipart<ComplaintDetail>(
      `/complaints/${id}/resolve`,
      { resolutionNote },
      { name: "photos", files: photos },
    ),

  reassign: (id: string, supervisorId: string, note: string) =>
    api.post<ComplaintDetail>(`/complaints/${id}/reassign`, { supervisorId, note }),

  comment: (id: string, note: string) =>
    api.post<ComplaintDetail>(`/complaints/${id}/comments`, { note }),

  photoPath: (complaintId: string, photoId: string) =>
    `/complaints/${complaintId}/photos/${photoId}`,
}

export const categoriesApi = {
  list: (params: { page?: number; pageSize?: number; isActive?: boolean; sort?: string; direction?: "asc" | "desc" }) =>
    api.get<ListResponse<ComplaintCategory & Matchable>>(
      `/complaint-categories${query({
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
        direction: params.direction,
        isActive: params.isActive === undefined ? undefined : String(params.isActive),
      })}`,
    ),
  create: (body: ComplaintCategoryBody) =>
    api.post<ComplaintCategory>("/complaint-categories", body),
  update: (id: string, body: ComplaintCategoryBody) =>
    api.patch<ComplaintCategory>(`/complaint-categories/${id}`, body),
  remove: (id: string) => api.delete<void>(`/complaint-categories/${id}`),
}

export const notificationsApi = {
  list: (limit = 25) => api.get<NotificationFeed>(`/notifications${query({ limit })}`),
  read: (id: string) => api.post<void>(`/notifications/${id}/read`, {}),
  readAll: () => api.post<void>("/notifications/read-all", {}),
}

/**
 * Every page of a list, for a picker. Pickers are the one place a
 * whole master list is needed at once; the loop stops at the API's own
 * total, so it cannot silently drop the 101st row the way a single
 * `pageSize: 100` request would.
 */
export async function fetchAllPages<T>(
  load: (page: number) => Promise<ListResponse<T>>,
  maxPages = 20,
): Promise<T[]> {
  const first = await load(1)
  const rows = [...first.data]
  for (let page = 2; page <= Math.min(first.totalPages, maxPages); page += 1) {
    const next = await load(page)
    rows.push(...next.data)
  }
  return rows
}

// ---------------------------------------------------------------
// Authenticated photo loading
// ---------------------------------------------------------------

type PhotoState =
  | { status: "loading"; url: null }
  | { status: "ready"; url: string }
  | { status: "failed"; url: null; message: string }

/**
 * Loads one protected photo into a blob URL.
 *
 * The URL is revoked when the component unmounts or the photo changes,
 * so a timeline with a dozen photos does not leak a dozen decoded
 * images for the life of the tab.
 *
 * `attempt` lets a caller offer Retry on the failed state (section 13).
 */
export function useAuthPhoto(path: string | null, attempt = 0): PhotoState {
  const [state, setState] = React.useState<PhotoState & { key: string }>({
    status: "loading",
    url: null,
    key: "",
  })
  const key = `${path}#${attempt}`

  React.useEffect(() => {
    if (!path) return
    let cancelled = false
    let objectUrl: string | null = null
    const token = getToken()

    fetch(`${API_BASE}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "This photo is no longer available."
              : "The photo could not be loaded.",
          )
        }
        const blob = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setState({ status: "ready", url: objectUrl, key })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setState({
          status: "failed",
          url: null,
          key,
          message:
            caught instanceof Error && caught.message.startsWith("This photo")
              ? caught.message
              : "The photo could not be loaded. Check your connection and try again.",
        })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, key])

  if (!path || state.key !== key) return { status: "loading", url: null }
  if (state.status === "ready") return { status: "ready", url: state.url }
  if (state.status === "failed") return { status: "failed", url: null, message: state.message }
  return { status: "loading", url: null }
}
