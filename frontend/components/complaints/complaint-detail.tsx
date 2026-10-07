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
import { usePermissions, type PermissionKey } from "@/lib/permissions"
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
import { GU_COMMON, guError, guNotHeld } from "@/components/complaints/gu"

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
 * Resolving closes the complaint, and records what was done and why the
 * problem happened (its root cause, owner 7 Oct 2026), shown together
 * in the Resolution card.
 *
 * Every word is Gujarati (owner, 7 Oct 2026); the server's reasons and
 * refusals arrive in Gujarati too.
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
  start: "કામ શરૂ કરો",
  resolve: "ફરિયાદ ઉકેલો",
  reassign: "બીજાને સોંપો",
  comment: "ટિપ્પણી ઉમેરો",
}

const GU = {
  starting: "કામ શરૂ થઈ રહ્યું છે…",
  started: (reference: string) => `ફરિયાદ ${reference} પર કામ શરૂ થયું`,
  notFound: "ફરિયાદ મળી નથી",
  notFoundBody: "તે કદાચ નથી, અથવા તમને મોકલવામાં આવી નથી. તમે જોઈ શકો તે ફરિયાદો યાદીમાં છે.",
  openList: "ફરિયાદોની યાદી ખોલો",
  loadFailed: "ફરિયાદ ખૂલી શકી નથી",
  meta: (reference: string, category: string, place: string, when: string, by: string) =>
    `${reference} · ${category} · ${place} · ${by} દ્વારા ${when} ના રોજ નોંધાવી`,
  actionFailed: "આ કામ થઈ શક્યું નથી",
  stale: "કોઈએ આ ફરિયાદ બદલી છે",
  closed: (by: string | null, when: string | null) =>
    `${
      by && when
        ? `${by} એ ${when} ના રોજ આ ફરિયાદ બંધ કરી.`
        : by
          ? `${by} એ આ ફરિયાદ બંધ કરી.`
          : when
            ? `આ ફરિયાદ ${when} ના રોજ બંધ થઈ.`
            : "આ ફરિયાદ બંધ છે."
    } હવે તેમાં ફેરફાર થઈ શકે નહીં, પણ જેમને તે મોકલાઈ છે તેઓ હજી ટિપ્પણી કરી શકે છે.`,
  raised: (reference: string) => `ફરિયાદ ${reference} નોંધાઈ ગઈ`,
  sentTo: (supervisor: string, place: string) => `તે ${place} ના સુપરવાઇઝર ${supervisor} ને મોકલાઈ છે`,
  copiedTo: (manager: string) => `, અને તેની નકલ મેનેજર ${manager} ને પણ ગઈ છે`,
  complaintCard: "ફરિયાદ",
  noDescription: "ફરિયાદની વિગત લખી નથી.",
  complainant: "ફરિયાદીનું નામ",
  noName: "નામ આપ્યું નથી",
  phone: "ફરિયાદીનો મોબાઇલ નંબર",
  noPhone: "મોબાઇલ નંબર આપ્યો નથી",
  place: "ચોક્કસ જગ્યા",
  noPlace: "કોઈ નોંધ લખી નથી",
  problemPhotos: "સમસ્યાના ફોટા",
  problemPhoto: "સમસ્યાનો ફોટો",
  noProblemPhotos: "ફરિયાદ નોંધાવતી વખતે કોઈ ફોટો ઉમેર્યો નથી.",
  resolution: "ઉકેલ",
  resolvedBy: (by: string, when: string) => `${by} એ ${when} ના રોજ ઉકેલી`,
  rootCause: "સમસ્યાનું મૂળ કારણ",
  noRootCause: "નોંધ્યું નથી. આ ફરિયાદ મૂળ કારણ લખવું જરૂરી બન્યું તે પહેલાં ઉકેલાઈ હતી.",
  whatWasDone: "શું કામ કર્યું",
  fixPhoto: "કામ પૂરું થયાનો ફોટો",
  activity: "ઇતિહાસ",
  sentToCard: "કોને મોકલી",
  nobody: "કોઈ નહીં",
  dates: "તારીખો",
  raisedOn: "નોંધાઈ",
  workStarted: "કામ શરૂ થયું",
  resolvedOn: "ઉકેલાઈ",
  closedOn: "બંધ થઈ",
  took: "લાગેલો સમય",
  age: "કેટલા દિવસથી",
  notYet: "હજી નહીં",
}

/**
 * Kit 26.5 rule 2 (lib/permissions `recordAnswer`), with the key's own
 * reason in Gujarati: enabled only when the person holds the key AND the
 * complaint's answer is yes; the complaint's string is its reason, shown
 * as given (the server writes it in Gujarati). While either is unknown:
 * disabled, no reason (26.1).
 */
function answerFor(
  held: boolean | undefined,
  key: PermissionKey,
  record: true | string | undefined,
): { allowed: boolean | undefined; reason: string } {
  if (held === false) return { allowed: false, reason: guNotHeld(key) }
  if (typeof record === "string") return { allowed: false, reason: record }
  if (held === true && record === true) return { allowed: true, reason: "" }
  return { allowed: undefined, reason: "" }
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
            message: guError(caught),
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
      apply(await complaintsApi.start(detail.id), GU.started(detail.reference))
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) setStale(guError(caught))
      else setActionError(guError(caught))
    } finally {
      setPending(null)
    }
  }

  async function comment(note: string) {
    if (!detail) return
    try {
      setDetail(await complaintsApi.comment(detail.id, note))
    } catch (caught) {
      throw new Error(guError(caught))
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
        <RecordBreadcrumb
          trail={[{ label: GU_COMMON.complaints, href: "/complaints" }]}
          current={GU_COMMON.complaint}
          label={GU_COMMON.breadcrumbLabel}
        />
        {state.error.missing ? (
          <EmptyState
            variant="not-found"
            heading={GU.notFound}
            actionLabel={GU.openList}
            onAction={() => router.push("/complaints")}
            className="mt-6"
          >
            {GU.notFoundBody}
          </EmptyState>
        ) : (
          <EmptyState
            variant="failed"
            heading={GU.loadFailed}
            actionLabel={GU_COMMON.tryAgain}
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
      const answer = answerFor(
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
            {pending === name ? GU.starting : LABEL[name]}
          </Button>
        </PermissionTooltip>
      )
    })

  return (
    <PageScroller className="max-sm:[&>div]:px-4">
      <RecordBreadcrumb
        trail={[{ label: GU_COMMON.complaints, href: "/complaints" }]}
        current={detail.reference}
        label={GU_COMMON.breadcrumbLabel}
      />

      {/* 11.2: the record's name is the page title. A complaint's name is
          its title (owner, 6 Oct 2026); the reference leads the meta line. */}
      <PageHeader
        className="mt-4"
        title={<span className="break-words">{detail.title}</span>}
        badges={<ComplaintStatusBadge status={detail.status} />}
        meta={GU.meta(
          detail.reference,
          detail.category.name,
          complaintPlace(detail),
          formatDateTime(detail.raisedAt),
          detail.raisedBy.name,
        )}
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
            <BannerTitle>{GU.actionFailed}</BannerTitle>
            <BannerDescription>{actionError}</BannerDescription>
          </Banner>
        ) : stale ? (
          <Banner variant="warning">
            <CircleAlertIcon />
            <BannerTitle>{GU.stale}</BannerTitle>
            <BannerDescription>{stale}</BannerDescription>
            <BannerAction>
              <Button type="button" variant="secondary" size="sm" onClick={refresh}>
                <RefreshCwIcon />
                {GU_COMMON.refreshComplaint}
              </Button>
            </BannerAction>
          </Banner>
        ) : detail.status === "closed" ? (
          // Pending banner rule 3: it explains why the record is locked,
          // so it has no close. Rule 1: one line.
          <Banner layout="line">
            <LockIcon />
            <BannerDescription>
              {GU.closed(
                detail.closedBy?.name ?? null,
                detail.closedAt ? formatDateTime(detail.closedAt) : null,
              )}
            </BannerDescription>
          </Banner>
        ) : justRaised ? (
          <Banner variant="success">
            <CircleCheckIcon />
            <BannerTitle>{GU.raised(detail.reference)}</BannerTitle>
            <BannerDescription>
              {GU.sentTo(detail.supervisor.name, complaintPlace(detail))}
              {copies(detail)}.
            </BannerDescription>
            <BannerAction>
              <Button type="button" variant="secondary" size="sm" onClick={dismissRaised}>
                {GU_COMMON.close}
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
                <CardTitle>{GU.complaintCard}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {/* Description, complainant and phone are optional (owner,
                    6 Oct 2026). One that was not given says so plainly,
                    the way the exact place always has. */}
                {detail.description ? (
                  <p className="text-body break-words whitespace-pre-wrap text-text-primary">
                    {detail.description}
                  </p>
                ) : (
                  <p className="text-body text-text-secondary">{GU.noDescription}</p>
                )}
                <DetailFieldList>
                  <DetailField label={GU.complainant}>
                    {detail.complainantName ?? (
                      <span className="font-normal text-text-secondary">{GU.noName}</span>
                    )}
                  </DetailField>
                  <DetailField label={GU.phone}>
                    {detail.complainantPhone ? (
                      <a
                        href={`tel:${detail.complainantPhone.replace(/[^\d+]/g, "")}`}
                        className="tap-area inline-flex items-center gap-1 rounded-sm text-primary-text underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
                      >
                        <PhoneIcon className="size-4" aria-hidden="true" />
                        {detail.complainantPhone}
                      </a>
                    ) : (
                      <span className="font-normal text-text-secondary">{GU.noPhone}</span>
                    )}
                  </DetailField>
                  <DetailField label={GU.place} className="sm:col-span-2">
                    {detail.locationNote ? (
                      <span className="whitespace-pre-wrap">{detail.locationNote}</span>
                    ) : (
                      <span className="font-normal text-text-secondary">{GU.noPlace}</span>
                    )}
                  </DetailField>
                </DetailFieldList>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{GU.problemPhotos}</CardTitle>
              </CardHeader>
              <CardContent>
                {raisePhotos.length > 0 ? (
                  <PhotoGrid complaintId={detail.id} photos={raisePhotos} label={GU.problemPhoto} />
                ) : (
                  <p className="text-body text-text-secondary">{GU.noProblemPhotos}</p>
                )}
              </CardContent>
            </Card>

            {detail.resolvedAt ? (
              <Card>
                <CardHeader>
                  <CardTitle>{GU.resolution}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-meta text-text-muted">
                    {GU.resolvedBy(detail.resolvedBy?.name ?? GU_COMMON.supervisor, formatDateTime(detail.resolvedAt))}
                  </p>
                  {/* Why it happened, then what was done: the Resolve
                      dialog's order. A complaint resolved before the root
                      cause was asked says so plainly. */}
                  <DetailFieldList>
                    <DetailField label={GU.rootCause} className="sm:col-span-2">
                      {detail.rootCause ? (
                        <span className="break-words whitespace-pre-wrap">{detail.rootCause}</span>
                      ) : (
                        <span className="font-normal text-text-secondary">{GU.noRootCause}</span>
                      )}
                    </DetailField>
                    {detail.resolutionNote ? (
                      <DetailField label={GU.whatWasDone} className="sm:col-span-2">
                        <span className="break-words whitespace-pre-wrap">{detail.resolutionNote}</span>
                      </DetailField>
                    ) : null}
                  </DetailFieldList>
                  {resolvePhotos.length > 0 ? (
                    <PhotoGrid complaintId={detail.id} photos={resolvePhotos} label={GU.fixPhoto} />
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{GU.activity}</CardTitle>
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
                <CardTitle>{GU.sentToCard}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-4">
                  <Routed label={GU_COMMON.supervisor} person={detail.supervisor} />
                  <Routed label={GU_COMMON.manager} person={detail.manager} />
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{GU.dates}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-4">
                  <DetailField label={GU.raisedOn}>{formatDateTime(detail.raisedAt)}</DetailField>
                  <DetailField label={GU.workStarted}>{when(detail.startedAt)}</DetailField>
                  <DetailField label={GU.resolvedOn}>{when(detail.resolvedAt)}</DetailField>
                  <DetailField label={GU.closedOn}>{when(detail.closedAt)}</DetailField>
                  <DetailField label={detail.status === "closed" ? GU.took : GU.age}>
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
      {person ? person.name : <span className="font-normal text-text-secondary">{GU.nobody}</span>}
    </DetailField>
  )
}

function when(value: string | null): React.ReactNode {
  return value ? formatDateTime(value) : <span className="font-normal text-text-secondary">{GU.notYet}</span>
}

/** ", and a copy to Meena, the manager" (in Gujarati). */
function copies(detail: ComplaintDetail): string {
  const manager = detail.manager
  if (!manager || manager.id === detail.supervisor.id || manager.id === detail.raisedBy.id) return ""
  return GU.copiedTo(manager.name)
}
