"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { api, ApiError, getToken, setForbiddenHandler, type Me, type MyAccess } from "@/lib/api"
import {
  CATALOGUE,
  PERMISSION_LABELS,
  type PermissionKey,
} from "@/lib/permission-keys"
import { canAny, homeHref, type Needs } from "@/components/shell/nav"
import { ErrorPage } from "@/components/templates/error-page"
import { PageScroller } from "@/components/templates/page"
import { toast } from "@/components/ui/sonner"

/**
 * THE ONE FILE EVERY PERMISSION QUESTION GOES THROUGH (kit 26.3, access
 * plan 6.1.8). No screen reads the permission list itself, no screen
 * asks which role someone holds, and nothing anywhere carries an admin
 * flag (kit 26 rule 5). The API below is kit 26.3's, exactly, plus
 * `guardPage` (kit 26.6) and the two pieces this product's first-paint
 * exception needs (`usePageGuard`, and the session's hand-off), each
 * marked where it is declared.
 *
 * Keys, labels and the catalogue are GENERATED into lib/permission-keys.ts
 * by `npm run access:keys` in backend/. Never edit that file by hand.
 *
 * Where the answers come from (plan 3.3, the declared first-paint
 * exception): Sadbhavna keeps its token in localStorage, so the server
 * that renders the page cannot know who is asking. The session
 * (components/shell/session.tsx) reads `/auth/me` as soon as the token
 * is read, and hands its `access` here. Until it lands the shell renders
 * nothing permission-dependent. After that the answers are refreshed in
 * three cases only (kit 26.4 rule 2, plan 6.1.9): any 403, the tab
 * regaining focus (at most every 10 s), and a save on the access
 * screens (P10 calls `refresh()`).
 *
 * ---------------------------------------------------------------------
 * THE PICKER INVENTORY (access plan P7 step 2, R11.5), 3 Oct 2026
 * ---------------------------------------------------------------------
 * Every dropdown or picker that reads another section's data, what it
 * called before P7, the fields it uses, and the Pick it now calls
 * (`pick.*` in lib/api.ts). Fields beyond `{ id, name }` must be declared
 * in that section's `pick.fields` in the backend catalogue by the lane
 * that owns the Pick controller. Intended difference D3 takes GET on the
 * four masters away from non-managers, so every master dropdown HAD to
 * move.
 *
 *  1. components/forms/expense-form.tsx, Site
 *     was  GET /sites?pageSize=100            (budget.sites.view)
 *     uses id, name, plantationStartDate, plantationCompleteDate
 *          (the period anchor: the date suggests the budget period)
 *     now  GET /pick/budget/sites             extra: plantationStartDate,
 *                                             plantationCompleteDate
 *  2. components/forms/expense-form.tsx, Cost head
 *     was  GET /cost-heads?pageSize=100&sort=sortOrder   (D3: manage only)
 *     uses id, name, sortOrder (the spreadsheet's order)
 *     now  GET /pick/budget/cost_heads        extra: sortOrder, isActive
 *  3. components/forms/budget-grid.tsx, the grid's rows
 *     was  GET /cost-heads?isActive=true&sort=sortOrder  (D3)
 *     uses id, name, sortOrder, isActive
 *     now  GET /pick/budget/cost_heads        extra: sortOrder, isActive
 *          (active ones, in sortOrder, chosen in the browser)
 *  4. components/forms/site-form.tsx, Project
 *     was  GET /projects?pageSize=100         (budget.projects.view)
 *     uses id, name, donorName (prefills a new site's donor)
 *     now  GET /pick/budget/projects          extra: donorName
 *  5. components/forms/site-form.tsx, Location
 *     was  GET /site-locations?pageSize=100   (D3)
 *     uses id, name
 *     now  GET /pick/platform/locations
 *  6. components/forms/site-form.tsx, Site manager and Site supervisor
 *     was  GET /users/picker?pageSize=100
 *     uses id, name
 *     now  GET /pick/platform/people          (asked only by someone who
 *          holds budget.sites.change_people; everyone else sees the
 *          site's own names in the disabled field)
 *  7. components/forms/report-scope.tsx, Project and Site (both reports)
 *     was  GET /projects, GET /sites          (pageSize=100)
 *     uses id, name; sites also projectId (the site list follows the project)
 *     now  GET /pick/budget/projects, GET /pick/budget/sites (extra: projectId)
 *  8. components/complaints/action-dialogs.tsx, Reassign
 *     was  GET /users/picker?designationId=&canLogin=true
 *     uses id, name, designationName
 *     now  GET /pick/platform/people?canReceive=true&holds=complaints.complaints.work
 *  9. components/complaints/use-masters.ts (the raise form, and the
 *     complaint list's Category filter)
 *     was  GET /complaint-categories, every page (D3); raise: isActive=true
 *     uses id, name, isActive
 *     now  GET /pick/complaints/categories    extra: isActive
 * 10. app/(app)/settings/complaint-categories: picks nothing any more
 *     (5 Oct 2026, categories have only a name and an active flag)
 * 11. app/(app)/settings/people, the Designation filter and field
 *     was  GET /designations, every page
 *     uses id, name
 *     now  GET /pick/platform/designations
 * 12. app/(app)/settings/people, Reports to
 *     was  GET /users/picker, every page
 *     uses id, name
 *     now  GET /pick/platform/people
 *
 * Not Picks, and unchanged:
 *  - components/complaints/raise-form.tsx and complaint-list.tsx, Site:
 *    GET /complaints/sites, the raise route under
 *    complaints.complaints.raise (D9). It carries who a site routes to,
 *    which a Pick never would.
 *  - app/(app)/projects/[id], its sites: GET /sites?projectId= is the
 *    project's own list under budget.sites.view, not a choice.
 *  - The four Settings master screens read their own full lists
 *    (GET /cost-heads, /designations, /locations, /complaint-categories)
 *    under `manage`. Those are the lists, not pickers.
 *
 * P8 (done): a Pick returns at most 50 matches, so the pickers whose
 * lists can outgrow that search the server as the user types, through
 * searchable-select's `search`: the people pickers (6, 8, 12) and the
 * site pickers (1, 7; nothing caps the number of sites). The report
 * scope's sites are narrowed to the chosen project on the server
 * (`projectId`, `none` for no project), not filtered in the browser.
 * ---------------------------------------------------------------------
 */

export type { PermissionKey }

/** The product's unit (plan 2, kit 0.1 item 8). Never typed into a screen. */
export const UNIT: { one: string; many: string; grouped: boolean } = {
  one: "site",
  many: "sites",
  grouped: true,
}

// ---------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------
//
// Module-level rather than React state, because three things outside a
// component have to reach it: the 403 hook in lib/api.ts, the session's
// hand-off, and guardPage, which is a plain async function. Components
// read it through useSyncExternalStore, so every reader sees one answer.

type Status = "loading" | "ready" | "failed"

interface Snapshot {
  status: Status
  access: MyAccess | null
}

const LOADING: Snapshot = { status: "loading", access: null }
let snapshot: Snapshot = LOADING
const listeners = new Set<() => void>()

/** Bumped on sign-out, so an answer for the previous person never lands. */
let generation = 0
let inflight: Promise<void> | null = null
let lastFetchAt = 0

/** R11.8: the tab regaining focus refreshes at most once every 10 s. */
const FOCUS_REFRESH_MS = 10_000

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function publish(next: Snapshot) {
  if (next === snapshot) return
  snapshot = next
  for (const listener of listeners) listener()
}

function isMyAccess(value: unknown): value is MyAccess {
  if (!value || typeof value !== "object") return false
  const access = value as Partial<MyAccess>
  return (
    typeof access.version === "number" &&
    typeof access.permissions === "object" &&
    access.permissions !== null &&
    Array.isArray(access.units)
  )
}

function sameAccess(a: MyAccess, b: MyAccess): boolean {
  return (
    a.version === b.version &&
    JSON.stringify(a.permissions) === JSON.stringify(b.permissions) &&
    JSON.stringify(a.units) === JSON.stringify(b.units)
  )
}

/**
 * Takes an answer from the server. When nothing changed the old object
 * is kept, identity and all, so nothing re-renders or flickers (plan
 * 6.1.9). A new answer replaces the old in place; it never passes
 * through "not known yet" on the way (kit 26.1 rule 6).
 */
function accept(access: unknown) {
  lastFetchAt = Date.now()
  if (!isMyAccess(access)) {
    // A refresh that came back without access keeps what is held; a
    // first load that did is the failed state (kit 26.1 rule 5).
    if (snapshot.status !== "ready") publish({ status: "failed", access: null })
    return
  }
  if (snapshot.status === "ready" && snapshot.access && sameAccess(snapshot.access, access)) return
  publish({ status: "ready", access })
}

/**
 * Product hand-off, not kit API: the session read `/auth/me` itself (one
 * request serves both the person and their access) and passes `access`
 * here; `undefined` from a server that sent none is the failed state.
 */
export function receiveMe(me: Pick<Me, "access">): void {
  accept(me.access)
}

/** Product hand-off, not kit API: signing out forgets every answer. */
export function forgetPermissions(): void {
  generation += 1
  inflight = null
  publish(LOADING)
}

/**
 * One deduped refresh: a second call while one is in flight joins it.
 * A refresh that fails keeps the old answers (kit 26.1 rule 6); only a
 * load that never succeeded becomes "failed".
 */
function refreshPermissions(): Promise<void> {
  if (inflight) return inflight
  if (!getToken()) return Promise.resolve()
  const started = generation
  lastFetchAt = Date.now()
  const request = api
    .get<Me>("/auth/me")
    .then((me) => {
      if (started === generation) accept(me.access)
    })
    .catch(() => {
      if (started === generation && snapshot.status !== "ready") {
        publish({ status: "failed", access: null })
      }
    })
    .finally(() => {
      if (inflight === request) inflight = null
    })
  inflight = request
  return request
}

/**
 * Kit 26.4 rule 4: a request refused with 403 shows an error toast with
 * the reason, and the permissions are asked for again, so the control
 * that sent it disables with its reason once they land. The toast id is
 * the reason, so one refusal repeated stacks as one toast.
 */
function onForbidden(error: ApiError) {
  toast.error(error.message, { id: `forbidden:${error.message}` })
  void refreshPermissions()
}

function onFocus() {
  if (document.visibilityState === "hidden") return
  if (Date.now() - lastFetchAt < FOCUS_REFRESH_MS) return
  void refreshPermissions()
}

/** Resolves once the first answer (or the failure) is in. */
function whenSettled(): Promise<Snapshot> {
  if (snapshot.status !== "loading") return Promise.resolve(snapshot)
  return new Promise((resolve) => {
    const unsubscribe = subscribe(() => {
      if (snapshot.status === "loading") return
      unsubscribe()
      resolve(snapshot)
    })
  })
}

function answer(snap: Snapshot, key: PermissionKey): boolean | undefined {
  if (snap.status !== "ready" || !snap.access) return undefined
  const scopes = snap.access.permissions[key]
  return scopes !== undefined && scopes.length > 0
}

function useSnapshot(): Snapshot {
  return React.useSyncExternalStore(subscribe, () => snapshot, () => LOADING)
}

// ---------------------------------------------------------------------
// Kit 26.3, exactly
// ---------------------------------------------------------------------

/** May this person do this at all? undefined = not known yet (kit 26.1). */
export function useCan(key: PermissionKey): boolean | undefined {
  return answer(useSnapshot(), key)
}

/** "Any of", for an area opened by several permissions. */
export function useCanAny(keys: PermissionKey[]): boolean | undefined {
  const snap = useSnapshot()
  return canAny((key) => answer(snap, key), keys)
}

/**
 * The module's see-amounts permission (kit 26.7). A module that declares
 * none has nothing to hide, so it answers yes once the answers are in.
 */
export function useCanSeeAmounts(module: string): boolean | undefined {
  const snap = useSnapshot()
  const key = CATALOGUE.find((mod) => mod.key === module)?.seeAmounts?.key
  if (key) return answer(snap, key)
  return snap.status === "ready" ? true : undefined
}

/** For the shell and lists that ask many questions at once. */
export function usePermissions(): {
  status: "loading" | "ready" | "failed"
  can: (key: PermissionKey) => boolean | undefined
  refresh: () => void
} {
  const snap = useSnapshot()
  return React.useMemo(
    () => ({
      status: snap.status,
      can: (key: PermissionKey) => answer(snap, key),
      refresh: () => void refreshPermissions(),
    }),
    [snap],
  )
}

/**
 * Kit 26.2's sentence for a key, built from its generated label: it
 * names who may do it by what they are allowed to do, never by a role,
 * and is never "You do not have permission".
 */
export function reasonFor(key: PermissionKey): string {
  return `Only people allowed to ${PERMISSION_LABELS[key]} can do this.`
}

/**
 * Mounted once, by the session, which wraps the whole app (plan 3.3:
 * `initial` is null here, because the server rendering the page cannot
 * know who is asking). Owns the refresh triggers: the 403 hook and the
 * focus listener.
 */
export function PermissionsProvider({
  initial,
  children,
}: {
  initial: MyAccess | null
  children: React.ReactNode
}): React.ReactNode {
  // A server-rendered answer, where a product has one, is the first
  // answer: taken before anything subscribes, so nothing renders twice.
  React.useState(() => {
    if (initial && snapshot.status === "loading") snapshot = { status: "ready", access: initial }
    return null
  })

  React.useEffect(() => startRefreshTriggers(), [])

  return children
}

/**
 * Product internal, not kit API: the 403 hook and the focus listener
 * (kit 26.4 rule 2). PermissionsProvider starts them; the returned
 * function stops them.
 */
export function startRefreshTriggers(): () => void {
  setForbiddenHandler(onForbidden)
  window.addEventListener("focus", onFocus)
  document.addEventListener("visibilitychange", onFocus)
  return () => {
    setForbiddenHandler(null)
    window.removeEventListener("focus", onFocus)
    document.removeEventListener("visibilitychange", onFocus)
  }
}

// ---------------------------------------------------------------------
// Kit 26.6: opening a page you cannot use
// ---------------------------------------------------------------------

function noAccessPage(can: (key: PermissionKey) => boolean | undefined): React.ReactNode {
  return React.createElement(
    PageScroller,
    null,
    React.createElement(ErrorPage, {
      variant: "no-access",
      inShell: true,
      dashboardHref: homeHref(can),
    }),
  )
}

/**
 * Kit 26.6, with the kit's signature. Run in the browser (plan 3.3 item
 * 3, backend kit 8.6): it waits for the first answer, then returns
 * section 11.8's "No access" page to render inside the shell, or null to
 * carry on. It never redirects, so the address stays in the bar. If the
 * answers failed to load it carries on: failed is not "not allowed", the
 * page's controls stay disabled and the shell shows the banner.
 */
export async function guardPage(
  key: PermissionKey | PermissionKey[],
): Promise<React.ReactNode | null> {
  const snap = await whenSettled()
  if (snap.status !== "ready") return null
  const can = (k: PermissionKey) => answer(snap, k)
  return canAny(can, key) === false ? noAccessPage(can) : null
}

/**
 * Product addition, not kit API: guardPage for a client layout, which
 * cannot await. Same answer, same page, synchronously.
 *
 * Kit 26.4 rule 5: a page the user loses access to while it is open is
 * NOT torn down mid-task. The verdict is taken when the address changes
 * and held until the next navigation; only gaining access, or the first
 * answer landing, changes it in place. Its controls disable through
 * their own useCan meanwhile.
 */
export function usePageGuard(needs: Needs | null): React.ReactNode | null {
  const pathname = usePathname()
  const { can } = usePermissions()
  const verdict = needs === null ? true : canAny(can, needs)
  const [held, setHeld] = React.useState({ pathname, verdict })

  let current = held.verdict
  if (
    held.pathname !== pathname ||
    (held.verdict !== verdict && (held.verdict === undefined || verdict === true))
  ) {
    current = verdict
    setHeld({ pathname, verdict })
  }

  return current === false ? noAccessPage(can) : null
}

/**
 * Product addition, not kit API: an action that needs every one of
 * several keys, such as adding an expense, which needs `create` and see
 * amounts (the server refuses either missing with 403). Enabled only
 * when all are held; the reason names the first one missing (kit 26.2).
 * While any answer is unknown: disabled, no reason (kit 26.1).
 */
export function useCanAll(keys: PermissionKey[]): { allowed: boolean | undefined; reason: string } {
  const snap = useSnapshot()
  let unknown = false
  for (const key of keys) {
    const held = answer(snap, key)
    if (held === false) return { allowed: false, reason: reasonFor(key) }
    if (held === undefined) unknown = true
  }
  return unknown ? { allowed: undefined, reason: "" } : { allowed: true, reason: "" }
}

/**
 * Kit 26.5 rule 2 in one place: a record action is enabled only when the
 * person holds the key AND the record's own answer is yes. The record's
 * string is its reason, shown as given; the key's reason comes from
 * reasonFor. While either is unknown: disabled, no reason (kit 26.1).
 */
export function recordAnswer(
  held: boolean | undefined,
  key: PermissionKey,
  record: true | string | undefined,
): { allowed: boolean | undefined; reason: string } {
  if (held === false) return { allowed: false, reason: reasonFor(key) }
  if (typeof record === "string") return { allowed: false, reason: record }
  if (held === true && record === true) return { allowed: true, reason: "" }
  return { allowed: undefined, reason: "" }
}
