"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CircleCheckIcon, LockIcon } from "lucide-react"

import { ApiError } from "@/lib/api"
import { formatDate, formatDateTime } from "@/lib/format"
import {
  complaintPlace,
  complaintsApi,
  type ActionName,
  type ComplaintDetail,
  type ComplaintStatus,
} from "@/lib/complaints-api"
import { usePermissions, type PermissionKey } from "@/lib/permissions"
import { PHONE_WORDS } from "@/lib/phone-words"
import { guError, guNotHeld, guTimeAgo } from "@/components/complaints/gu"
import { GU_RECORD } from "@/components/complaints/phone/words-record"
import { refreshMyWorkCount } from "@/components/complaints/phone/use-my-work-count"
import { Banner, BannerAction, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { PageHeader } from "@/components/templates/page"
import { ActionBar } from "@/components/ui/action-bar"
import { ActivityList, KeyFacts, RecordSummary, type ActivityItem } from "@/components/ui/record-summary"
import { ResolveDialog } from "@/components/complaints/action-dialogs"
import { PhotoGrid } from "@/components/complaints/photos"
import { ageLabel, ComplaintStatusBadge } from "@/components/complaints/status"
import { eventLine } from "@/components/complaints/timeline"

/**
 * Plan-phone 5.3: `/complaints/[id]` on phone. RecordSummary holds the
 * four key facts (site, category, complainant mobile, supervisor); the
 * action bar holds Start (secondary, open only, Q1) and Resolve (primary).
 * Reassign is desktop only (L4); comments live on their own screen,
 * linked from ActivityList's "Add comment" row.
 *
 * Mirrors `ComplaintDetailPage` (complaint-detail.tsx): same fetch, same
 * local-update-in-place, same permission answer and 409 handling, shaped
 * for the phone record instead of the two-column desktop page.
 */

const STEPS: Record<ComplaintStatus, ActionName[]> = {
  open: ["start", "resolve"],
  in_progress: ["resolve"],
  closed: [],
}

const PRIMARY: ActionName = "resolve"

const ACTION_KEY: Record<ActionName, PermissionKey> = {
  start: "complaints.complaints.work",
  resolve: "complaints.complaints.work",
  reassign: "complaints.complaints.reassign",
  comment: "complaints.complaints.comment",
}

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

/** "Suresh Patel changed this complaint", for a copy-to line. */
function copies(detail: ComplaintDetail): string {
  const manager = detail.manager
  if (!manager || manager.id === detail.supervisor.id || manager.id === detail.raisedBy.id) return ""
  return GU_RECORD.copiedTo(manager.name)
}

function activityItems(detail: ComplaintDetail): ActivityItem[] {
  return [...detail.events]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((event) => {
      const { text, note, rootCause } = eventLine(event)
      const detailNode = rootCause ? (
        <dl className="mt-1 flex flex-col gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-body">
          <div>
            <dt className="text-meta text-text-secondary">{PHONE_WORDS.record.rootCause}</dt>
            <dd className="break-words whitespace-pre-wrap text-text-primary">{rootCause}</dd>
          </div>
          {note ? (
            <div>
              <dt className="text-meta text-text-secondary">{PHONE_WORDS.record.whatWasDone}</dt>
              <dd className="break-words whitespace-pre-wrap text-text-primary">{note}</dd>
            </div>
          ) : null}
        </dl>
      ) : note ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-body break-words whitespace-pre-wrap text-text-primary">
          {note}
        </p>
      ) : undefined
      return { id: event.id, who: "", what: text, when: event.at, detail: detailNode }
    })
}

export function PhoneComplaintRecord({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRaised = searchParams.get("raised") === "1"
  const { can } = usePermissions()

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

  const [local, setLocal] = React.useState<ComplaintDetail | null>(null)
  const detail = local ?? state.detail
  const [showResolve, setShowResolve] = React.useState(false)
  const [pending, setPending] = React.useState<ActionName | null>(null)

  const refresh = React.useCallback(() => {
    setLocal(null)
    setShowResolve(false)
    setAttempt((a) => a + 1)
  }, [])

  const apply = (next: ComplaintDetail, message: string) => {
    setLocal(next)
    setShowResolve(false)
    toast.success(message)
    void refreshMyWorkCount()
  }

  async function start() {
    if (!detail) return
    setPending("start")
    try {
      const next = await complaintsApi.start(detail.id)
      setLocal(next)
      toast.success(GU_RECORD.started(next.reference))
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        toast.error(GU_RECORD.stale, { description: guError(caught) })
        refresh()
      } else {
        toast.error(GU_RECORD.actionFailed, { description: guError(caught) })
      }
    } finally {
      setPending(null)
    }
  }

  const dismissRaised = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("raised")
    const text = params.toString()
    router.replace(`/complaints/${id}${text ? `?${text}` : ""}`, { scroll: false })
  }

  // ---- states --------------------------------------------------------
  if (state.error && state.attempt === attempt && !state.detail) {
    return (
      <>
        <PageHeader title={PHONE_WORDS.titles.complaints} parent="/complaints" />
        {state.error.missing ? (
          <EmptyState
            variant="not-found"
            heading={GU_RECORD.notFound}
            actionLabel={GU_RECORD.openList}
            onAction={() => router.push("/complaints")}
            className="mt-6"
          >
            {GU_RECORD.notFoundBody}
          </EmptyState>
        ) : (
          <EmptyState
            variant="failed"
            heading={GU_RECORD.loadFailed}
            actionLabel={PHONE_WORDS.list.tryAgain}
            onAction={() => setAttempt((a) => a + 1)}
            className="mt-6"
          >
            {state.error.message}
          </EmptyState>
        )}
      </>
    )
  }

  if (!detail) {
    return (
      <>
        <PageHeader title={PHONE_WORDS.titles.complaints} parent="/complaints" />
        <div className="flex flex-col gap-4 px-4 py-4" aria-hidden="true">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    )
  }

  const steps = STEPS[detail.status]
  const raisePhotos = detail.photos.filter((p) => p.stage === "raise")
  const resolvePhotos = detail.photos.filter((p) => p.stage === "resolve")
  const commentAnswer = answerFor(
    can(ACTION_KEY.comment),
    ACTION_KEY.comment,
    detail.actions.comment.allowed ? true : (detail.actions.comment.reason ?? undefined),
  )

  return (
    <>
      <PageHeader
        title={<span className="break-words">{detail.title}</span>}
        parent="/complaints"
        meta={PHONE_WORDS.record.meta(
          detail.reference,
          detail.raisedBy.name,
          formatDateTime(detail.raisedAt),
          ageLabel(detail.ageDays),
        )}
      />

      <div className="flex flex-col gap-6 px-4 py-4">
        <RecordSummary
          name={detail.title}
          badges={<ComplaintStatusBadge status={detail.status} />}
          facts={[
            { label: PHONE_WORDS.record.keyFacts.site, value: complaintPlace(detail) },
            { label: PHONE_WORDS.record.keyFacts.category, value: detail.category.name },
            {
              label: PHONE_WORDS.record.keyFacts.phone,
              value: detail.complainantPhone ? (
                <a
                  href={`tel:${detail.complainantPhone.replace(/[^\d+]/g, "")}`}
                  className="tap-area text-primary-text underline underline-offset-2"
                >
                  {detail.complainantPhone}
                </a>
              ) : null,
            },
            { label: PHONE_WORDS.record.keyFacts.supervisor, value: detail.supervisor.name },
          ]}
          text={{ notSet: PHONE_WORDS.record.notSet }}
        />

        <div className="flex flex-col gap-2 empty:hidden">
          {detail.status === "closed" ? (
            <Banner layout="line">
              <LockIcon />
              <BannerDescription>
                {GU_RECORD.closed(
                  detail.closedBy?.name ?? null,
                  detail.closedAt ? formatDateTime(detail.closedAt) : null,
                )}
              </BannerDescription>
            </Banner>
          ) : justRaised ? (
            <Banner variant="success">
              <CircleCheckIcon />
              <BannerTitle>{GU_RECORD.raised(detail.reference)}</BannerTitle>
              <BannerDescription>
                {GU_RECORD.sentTo(detail.supervisor.name, complaintPlace(detail))}
                {copies(detail)}.
              </BannerDescription>
              <BannerAction>
                <Button type="button" variant="secondary" size="sm" onClick={dismissRaised}>
                  {PHONE_WORDS.a11y.close}
                </Button>
              </BannerAction>
            </Banner>
          ) : null}
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-label text-text-secondary">{GU_RECORD.complaintCard}</h2>
          {detail.description ? (
            <p className="text-body break-words whitespace-pre-wrap text-text-primary">{detail.description}</p>
          ) : (
            <p className="text-body text-text-secondary">{GU_RECORD.noDescription}</p>
          )}
          <KeyFacts
            facts={[
              {
                label: PHONE_WORDS.record.details.complainant,
                value: detail.complainantName ?? null,
              },
              { label: PHONE_WORDS.record.details.exactPlace, value: detail.locationNote ?? null },
            ]}
            text={{ notSet: PHONE_WORDS.record.notSet }}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-label text-text-secondary">{PHONE_WORDS.record.problemPhotos}</h2>
          {raisePhotos.length > 0 ? (
            <PhotoGrid complaintId={detail.id} photos={raisePhotos} label={GU_RECORD.problemPhoto} />
          ) : (
            <p className="text-body text-text-secondary">{GU_RECORD.noProblemPhotos}</p>
          )}
        </section>

        {detail.resolvedAt ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-label text-text-secondary">{PHONE_WORDS.record.resolution}</h2>
            <p className="text-meta text-text-muted">
              {PHONE_WORDS.record.resolvedBy(
                detail.resolvedBy?.name ?? PHONE_WORDS.record.keyFacts.supervisor,
                formatDateTime(detail.resolvedAt),
              )}
            </p>
            <KeyFacts
              facts={[
                { label: PHONE_WORDS.record.rootCause, value: detail.rootCause ?? null },
                { label: PHONE_WORDS.record.whatWasDone, value: detail.resolutionNote ?? null },
              ]}
              text={{ notSet: PHONE_WORDS.record.notSet }}
              className="grid-cols-1"
            />
            {resolvePhotos.length > 0 ? (
              <PhotoGrid complaintId={detail.id} photos={resolvePhotos} label={GU_RECORD.fixPhoto} />
            ) : null}
          </section>
        ) : null}

        <ActivityList
          items={activityItems(detail)}
          total={detail.events.length}
          addCommentHref={`/complaints/${id}/comments`}
          addCommentPermission={commentAnswer}
          title={PHONE_WORDS.record.history}
          text={{
            notSet: PHONE_WORDS.record.notSet,
            addComment: PHONE_WORDS.record.addComment,
            showMore: PHONE_WORDS.record.showMore,
            capped: PHONE_WORDS.record.historyCapped,
            timeAgo: (when, now) => guTimeAgo(when, now, formatDate),
          }}
        />
      </div>

      {steps.length > 0 ? (
        <ActionBar label={PHONE_WORDS.a11y.actions}>
          {steps.map((name) => {
            const answer = answerFor(
              can(ACTION_KEY[name]),
              ACTION_KEY[name],
              detail.actions[name].allowed ? true : (detail.actions[name].reason ?? undefined),
            )
            const primary = name === PRIMARY
            return (
              <PermissionTooltip key={name} allowed={answer.allowed} reason={answer.reason}>
                <Button
                  type="button"
                  variant={primary ? "primary" : "secondary"}
                  disabled={answer.allowed !== true || pending !== null}
                  onClick={() => (name === "start" ? void start() : setShowResolve(true))}
                >
                  {pending === name ? GU_RECORD.starting : PHONE_WORDS.record[name === "start" ? "startWork" : "resolve"]}
                </Button>
              </PermissionTooltip>
            )
          })}
        </ActionBar>
      ) : null}

      {showResolve ? (
        <ResolveDialog
          complaint={detail}
          onClose={() => setShowResolve(false)}
          onDone={apply}
          onRefresh={refresh}
        />
      ) : null}
    </>
  )
}
