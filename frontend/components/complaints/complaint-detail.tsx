"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  LockIcon,
  PhoneIcon,
  RefreshCwIcon,
} from "lucide-react"

import { ApiError } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import {
  complaintPlace,
  complaintsApi,
  type ActionName,
  type ComplaintDetail,
  type ComplaintStatus,
  type PersonRef,
} from "@/lib/complaints-api"
import { recordAnswer, usePermissions, type PermissionKey } from "@/lib/permissions"
import { errorMessage } from "@/components/shell/session"
import { Banner, BannerAction, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { PageHeader, PageScroller } from "@/components/templates/page"
import { DetailColumns, DetailField, DetailFieldList } from "@/components/templates/detail-page"
import { ReassignDialog, ResolveDialog } from "@/components/complaints/action-dialogs"
import { PhotoGrid } from "@/components/complaints/photos"
import { ageLabel, ComplaintStatusBadge } from "@/components/complaints/status"
import { Timeline } from "@/components/complaints/timeline"

/**
 * `/complaints/[id]` — section 11.2's detail page.
 *
 *   breadcrumb   Complaints › C-000123
 *   header       reference as the title, status beside it, category and
 *                site (or, raised before sites, the location) in the
 *                meta line, and the state actions on
 *                the right (below the title on a phone, full width)
 *   main         the complaint, its photos, the resolution, activity
 *   aside        who it was routed to, and the dates
 *
 * The page owns the scroll (10). Every action is gated by the server's
 * own `actions[x]` — computed by the same function that guards the
 * route — and a disabled one carries the server's reason, which names
 * who CAN do it, in permission-tooltip (26). The UI never decides.
 *
 * Which actions are shown depends only on the status (the next steps
 * of the work); whether each is usable depends only on `actions`.
 * Resolving closes the complaint.
 */

type DialogName = "resolve" | "reassign"

const STEPS: Record<ComplaintStatus, ActionName[]> = {
  open: ["start", "resolve", "reassign"],
  in_progress: ["resolve", "reassign"],
  closed: [],
}

/** The one filled button for each status (6.1 rule 1). */
const PRIMARY: Record<ComplaintStatus, ActionName | null> = {
  open: "resolve",
  in_progress: "resolve",
  closed: null,
}

/**
 * The permission each action belongs to (plan 5.3.2, RESOLUTIONS C1).
 * Kit 26.5 rule 2: a record action is enabled only when the person holds
 * its key AND the complaint's own answer is yes. The complaint's answer
 * is still its `actions` map until P5 merges it into `can`; whether this
 * person is the supervisor here is the workflow's call, never the
 * browser's.
 */
const ACTION_KEY: Record<ActionName, PermissionKey> = {
  start: "complaints.complaints.work",
  resolve: "complaints.complaints.work",
  reassign: "complaints.complaints.reassign",
  comment: "complaints.complaints.comment",
}

const LABEL: Record<ActionName, string> = {
  start: "Start work",
  resolve: "Resolve",
  reassign: "Reassign",
  comment: "Add comment",
}

export function ComplaintDetailPage({ id }: { id: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const justRaised = searchParams.get("raised") === "1"

  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState<{
    attempt: number
    detail: ComplaintDetail | null
    error: { message: string; missing: boolean } | null
  }>({ attempt: -1, detail: null, error: null })

  React.useEffect(() => {
    let cancelled = false
    complaintsApi
      .get(id)
      .then((detail) => {
        if (!cancelled) setState({ attempt, detail, error: null })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setState({
          attempt,
          detail: null,
          error: {
            message: errorMessage(caught),
            missing: caught instanceof ApiError && (caught.status === 404 || caught.status === 400),
          },
        })
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  /**
   * An action's answer replaces the record in place (5.6: update in
   * place, never delete and recreate). A refresh drops it, and the
   * record already on screen stays until the fresh one lands.
   */
  const [local, setLocal] = React.useState<ComplaintDetail | null>(null)
  const detail = local ?? state.detail
  const setDetail = setLocal

  const [dialog, setDialog] = React.useState<DialogName | null>(null)
  const [pending, setPending] = React.useState<ActionName | null>(null)
  const { can } = usePermissions()
  const [stale, setStale] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const refresh = React.useCallback(() => {
    setLocal(null)
    setDialog(null)
    setStale(null)
    setActionError(null)
    setAttempt((a) => a + 1)
  }, [])

  const apply = (next: ComplaintDetail, message: string) => {
    setDetail(next)
    setDialog(null)
    setStale(null)
    setActionError(null)
    toast.success(message)
  }

  async function start() {
    if (!detail) return
    setPending("start")
    setStale(null)
    setActionError(null)
    try {
      apply(await complaintsApi.start(detail.id), `Work started on ${detail.reference}`)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setStale(caught.message)
      else setActionError(errorMessage(caught))
    } finally {
      setPending(null)
    }
  }

  async function comment(note: string) {
    if (!detail) return
    try {
      setDetail(await complaintsApi.comment(detail.id, note))
    } catch (caught) {
      throw new Error(errorMessage(caught))
    }
  }

  const dismissRaised = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("raised")
    const text = params.toString()
    router.replace(`${pathname}${text ? `?${text}` : ""}`, { scroll: false })
  }

  // ---- states --------------------------------------------------------
  if (state.error && state.attempt === attempt && !state.detail) {
    return (
      <PageScroller>
        <RecordBreadcrumb trail={[{ label: "Complaints", href: "/complaints" }]} current="Complaint" />
        {state.error.missing ? (
          <EmptyState
            variant="not-found"
            heading="Complaint not found"
            dashboardHref="/complaints"
            className="mt-6"
          >
            It may not exist, or it was not sent to you. Complaints you can see are in the list.
          </EmptyState>
        ) : (
          <EmptyState
            variant="failed"
            heading="The complaint could not be loaded"
            onAction={() => setAttempt((a) => a + 1)}
            className="mt-6"
          >
            {state.error.message}
          </EmptyState>
        )}
      </PageScroller>
    )
  }

  if (!detail) {
    return (
      <PageScroller className="max-sm:[&>div]:px-4">
        <div className="flex flex-col gap-4" aria-hidden="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Skeleton className="h-64 w-full lg:col-span-2" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </PageScroller>
    )
  }

  const steps = STEPS[detail.status]
  const raisePhotos = detail.photos.filter((p) => p.stage === "raise")
  const resolvePhotos = detail.photos.filter((p) => p.stage === "resolve")

  const open = (name: ActionName) => {
    if (name === "start") void start()
    else if (name !== "comment") setDialog(name)
  }

  const actionButtons = (fullWidth: boolean) =>
    steps.map((name) => {
      const action = detail.actions[name]
      const answer = recordAnswer(
        can(ACTION_KEY[name]),
        ACTION_KEY[name],
        action.allowed ? true : (action.reason ?? undefined),
      )
      const primary = PRIMARY[detail.status] === name
      return (
        <PermissionTooltip key={name} allowed={answer.allowed} reason={answer.reason}>
          <Button
            type="button"
            variant={primary ? "primary" : "secondary"}
            size={fullWidth ? "lg" : "default"}
            disabled={answer.allowed !== true || pending !== null}
            onClick={() => open(name)}
            className={fullWidth ? "w-full" : undefined}
          >
            {pending === name ? "Starting…" : LABEL[name]}
          </Button>
        </PermissionTooltip>
      )
    })

  return (
    <PageScroller className="max-sm:[&>div]:px-4">
      <RecordBreadcrumb trail={[{ label: "Complaints", href: "/complaints" }]} current={detail.reference} />

      {/* 11.2: the record's name is the page title. A complaint's name is
          its title (owner, 6 Oct 2026); the reference leads the meta line. */}
      <PageHeader
        className="mt-4"
        title={<span className="break-words">{detail.title}</span>}
        badges={<ComplaintStatusBadge status={detail.status} />}
        meta={`${detail.reference} · ${detail.category.name} · ${complaintPlace(detail)} · Raised ${formatDateTime(detail.raisedAt)} by ${detail.raisedBy.name}`}
        actions={
          steps.length > 0 ? (
            <div className="hidden flex-wrap items-center gap-2 sm:flex">{actionButtons(false)}</div>
          ) : undefined
        }
      />
      {/* The same actions on a phone: full width, 40px tall with a 44px
          tap area, directly under the title (agreed field exception). */}
      {steps.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden [&>*]:w-full [&>span]:flex">
          {actionButtons(true)}
        </div>
      ) : null}

      {/* Pending banner rule 4: at most one banner. A failed action is
          the most pressing, then a change someone else made; the closed
          banner explains why nothing can be changed, and the "raised"
          note is the least of them. */}
      <div className="mt-6 flex flex-col gap-4 empty:hidden">
        {actionError ? (
          <Banner variant="danger">
            <CircleAlertIcon />
            <BannerTitle>That did not go through</BannerTitle>
            <BannerDescription>{actionError}</BannerDescription>
          </Banner>
        ) : stale ? (
          <Banner variant="warning">
            <CircleAlertIcon />
            <BannerTitle>Someone else changed this complaint</BannerTitle>
            <BannerDescription>{stale}</BannerDescription>
            <BannerAction>
              <Button type="button" variant="secondary" size="sm" onClick={refresh}>
                <RefreshCwIcon />
                Refresh complaint
              </Button>
            </BannerAction>
          </Banner>
        ) : detail.status === "closed" ? (
          // Pending banner rule 3: it explains why the record is locked,
          // so it has no close. Rule 1: one line.
          <Banner layout="line">
            <LockIcon />
            <BannerDescription>
              {`${detail.closedBy ? `Closed by ${detail.closedBy.name}` : "Closed"}${
                detail.closedAt ? ` on ${formatDateTime(detail.closedAt)}` : ""
              }. It can no longer be changed, but anyone it was sent to can still comment.`}
            </BannerDescription>
          </Banner>
        ) : justRaised ? (
          <Banner variant="success">
            <CircleCheckIcon />
            <BannerTitle>{detail.reference} raised</BannerTitle>
            <BannerDescription>
              It went to {detail.supervisor.name}, the supervisor at {complaintPlace(detail)}
              {copies(detail)}.
            </BannerDescription>
            <BannerAction>
              <Button type="button" variant="secondary" size="sm" onClick={dismissRaised}>
                Close
              </Button>
            </BannerAction>
          </Banner>
        ) : null}
      </div>

      <DetailColumns
        className="mt-6"
        main={
          <>
            <Card>
              <CardHeader>
                <CardTitle>Complaint</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {/* Description, complainant and phone are optional (owner,
                    6 Oct 2026). One that was not given says so plainly,
                    the way "Where exactly" always has. */}
                {detail.description ? (
                  <p className="text-body break-words whitespace-pre-wrap text-text-primary">
                    {detail.description}
                  </p>
                ) : (
                  <p className="text-body text-text-secondary">No description was added.</p>
                )}
                <DetailFieldList>
                  <DetailField label="Complainant">
                    {detail.complainantName ?? (
                      <span className="font-normal text-text-secondary">No name was given</span>
                    )}
                  </DetailField>
                  <DetailField label="Phone number">
                    {detail.complainantPhone ? (
                      <a
                        href={`tel:${detail.complainantPhone.replace(/[^\d+]/g, "")}`}
                        className="tap-area inline-flex items-center gap-1 rounded-sm text-primary-text underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
                      >
                        <PhoneIcon className="size-4" aria-hidden="true" />
                        {detail.complainantPhone}
                      </a>
                    ) : (
                      <span className="font-normal text-text-secondary">No phone number was given</span>
                    )}
                  </DetailField>
                  <DetailField label="Where exactly" className="sm:col-span-2">
                    {detail.locationNote ? (
                      <span className="whitespace-pre-wrap">{detail.locationNote}</span>
                    ) : (
                      <span className="font-normal text-text-secondary">No note was added</span>
                    )}
                  </DetailField>
                </DetailFieldList>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Photos of the problem</CardTitle>
              </CardHeader>
              <CardContent>
                {raisePhotos.length > 0 ? (
                  <PhotoGrid complaintId={detail.id} photos={raisePhotos} label="Photo of the problem" />
                ) : (
                  <p className="text-body text-text-secondary">No photos were added when this was raised.</p>
                )}
              </CardContent>
            </Card>

            {detail.resolvedAt ? (
              <Card>
                <CardHeader>
                  <CardTitle>Resolution</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-meta text-text-muted">
                    {detail.resolvedBy?.name ?? "The supervisor"} resolved it on{" "}
                    {formatDateTime(detail.resolvedAt)}
                  </p>
                  {detail.resolutionNote ? (
                    <p className="text-body break-words whitespace-pre-wrap text-text-primary">
                      {detail.resolutionNote}
                    </p>
                  ) : null}
                  {resolvePhotos.length > 0 ? (
                    <PhotoGrid complaintId={detail.id} photos={resolvePhotos} label="Photo of the fix" />
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <Timeline events={detail.events} comment={detail.actions.comment} onComment={comment} />
              </CardContent>
            </Card>
          </>
        }
        aside={
          <>
            <Card>
              <CardHeader>
                <CardTitle>Sent to</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-4">
                  <Routed label="Supervisor" person={detail.supervisor} />
                  <Routed label="Manager" person={detail.manager} />
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Dates</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-4">
                  <DetailField label="Raised">{formatDateTime(detail.raisedAt)}</DetailField>
                  <DetailField label="Work started">{when(detail.startedAt)}</DetailField>
                  <DetailField label="Resolved">{when(detail.resolvedAt)}</DetailField>
                  <DetailField label="Closed">{when(detail.closedAt)}</DetailField>
                  <DetailField label={detail.status === "closed" ? "Took" : "Age"}>
                    {ageLabel(detail.ageDays)}
                  </DetailField>
                </dl>
              </CardContent>
            </Card>
          </>
        }
      />

      {dialog === "resolve" ? (
        <ResolveDialog complaint={detail} onClose={() => setDialog(null)} onDone={apply} onRefresh={refresh} />
      ) : dialog === "reassign" ? (
        <ReassignDialog complaint={detail} onClose={() => setDialog(null)} onDone={apply} onRefresh={refresh} />
      ) : null}
    </PageScroller>
  )
}

function Routed({ label, person }: { label: string; person: PersonRef | null }) {
  return (
    <DetailField label={label}>
      {person ? person.name : <span className="font-normal text-text-secondary">Nobody</span>}
    </DetailField>
  )
}

function when(value: string | null): React.ReactNode {
  return value ? formatDateTime(value) : <span className="font-normal text-text-secondary">Not yet</span>
}

/** ", with a copy to Suresh (manager)". */
function copies(detail: ComplaintDetail): string {
  const manager = detail.manager
  if (!manager || manager.id === detail.supervisor.id || manager.id === detail.raisedBy.id) return ""
  return `, with a copy to ${manager.name} (manager)`
}
