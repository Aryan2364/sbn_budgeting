"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { complaintsApi, type ComplaintDetail } from "@/lib/complaints-api"
import { useSession } from "@/components/shell/session"
import { useDraft } from "@/lib/drafts"
import { fieldKeyboard } from "@/lib/field-keyboard"
import { PHONE_WORDS } from "@/lib/phone-words"
import { guError, GU_UNSAVED_FORM } from "@/components/complaints/gu"
import { eventLine } from "@/components/complaints/timeline"
import { refreshMyWorkCount } from "@/components/complaints/phone/use-my-work-count"
import { BLEED } from "@/components/shell/content-area"
import { PageHeader } from "@/components/templates/page"
import { Button } from "@/components/ui/button"
import { DraftBanner } from "@/components/ui/draft-banner"
import { enterSends } from "@/components/ui/keyboard-shortcuts"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/ui/empty-state"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { toast } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ActivityList, type ActivityItem } from "@/components/ui/record-summary"
import { useUnsavedChanges } from "@/components/ui/unsaved-changes"

/**
 * Plan-phone 5.4: `/complaints/[id]/comments`. Comment events only,
 * newest first, through ActivityList; the message box fixed above the
 * keyboard, following the kit's comments-screen pattern (dialog.tsx's
 * reference is the record's own ResolveDialog; this screen has no kit
 * counterpart in Tracking, so it is ported by hand from the kit demo,
 * `app/demo/shell/customers/[id]/comments/comments-screen.tsx`).
 *
 * Enter makes a new line; the send button sends (41.7 rule 6). Drafted
 * (lib/drafts.ts, form "complaint-comment", per complaint) and guarded
 * against leaving with text typed (11.3 rule 10).
 */
function PhoneCommentsScreen({ id }: { id: string }) {
  const { user } = useSession()
  const recordHref = `/complaints/${id}`

  const [attempt, setAttempt] = React.useState(0)
  const [state, setState] = React.useState<{
    attempt: number
    detail: ComplaintDetail | null
    error: string | null
  }>({ attempt: -1, detail: null, error: null })

  React.useEffect(() => {
    let cancelled = false
    complaintsApi
      .get(id)
      .then((detail) => {
        if (!cancelled) setState({ attempt, detail, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState({ attempt, detail: null, error: guError(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const [local, setLocal] = React.useState<ComplaintDetail | null>(null)
  const detail = local ?? state.detail

  const [text, setText] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const changed = text.trim() !== ""

  const latestEvent = detail?.events[0]
    ? [...detail.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0]
    : null

  const values = React.useMemo(() => ({ note: text }), [text])
  const draft = useDraft({
    person: user?.id,
    form: "complaint-comment",
    record: id,
    values,
    changed,
    recordUpdatedAt: latestEvent?.at,
    recordUpdatedBy: latestEvent?.actor?.name ?? null,
  })
  const unsaved = useUnsavedChanges({
    changed,
    noun: "comment",
    mode: "create",
    onLeave: draft.clear,
    text: GU_UNSAVED_FORM,
  })

  const comments: ActivityItem[] = React.useMemo(() => {
    if (!detail) return []
    return [...detail.events]
      .filter((event) => event.kind === "comment")
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map((event) => {
        const { text: who } = eventLine(event)
        return { id: event.id, who: "", what: who, when: event.at, detail: event.note }
      })
  }, [detail])

  async function send() {
    const note = text.trim()
    if (!note || sending || !detail) return
    setSending(true)
    try {
      const next = await complaintsApi.comment(detail.id, note)
      setLocal(next)
      draft.clear()
      setText("")
      void refreshMyWorkCount()
    } catch (caught) {
      toast.error(PHONE_WORDS.titles.comments, { description: guError(caught) })
    } finally {
      setSending(false)
    }
  }

  if (state.error && state.attempt === attempt && !state.detail) {
    return (
      <>
        <PageHeader title={PHONE_WORDS.comments.title} parent={recordHref} />
        <EmptyState
          variant="failed"
          heading={PHONE_WORDS.comments.title}
          actionLabel={PHONE_WORDS.list.tryAgain}
          onAction={() => setAttempt((a) => a + 1)}
          className="mt-6"
        >
          {state.error}
        </EmptyState>
      </>
    )
  }

  if (!detail) {
    return (
      <>
        <PageHeader title={PHONE_WORDS.comments.title} parent={recordHref} />
        <div className="flex flex-col gap-4 px-4 py-4" aria-hidden="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </>
    )
  }

  const commentAllowed = detail.actions.comment.allowed
  const reason = detail.actions.comment.reason ?? ""

  return (
    <>
      <PageHeader title={PHONE_WORDS.comments.title} parent={recordHref} />
      {unsaved.warning}
      {draft.offer ? (
        <div className="px-4 pt-4">
          <DraftBanner
            draft={draft}
            onUse={(kept) => {
              if (typeof kept.note === "string") setText(kept.note)
            }}
            text={PHONE_WORDS.draft}
          />
        </div>
      ) : null}
      <div className="px-4 py-4">
        {comments.length > 0 ? (
          <ActivityList
            items={comments}
            total={comments.length}
            title={PHONE_WORDS.comments.title}
            text={{ notSet: PHONE_WORDS.record.notSet }}
          />
        ) : (
          <EmptyState variant="nothing-waiting" heading={PHONE_WORDS.comments.empty}>
            {PHONE_WORDS.comments.emptyLine}
          </EmptyState>
        )}
      </div>
      {/* The ghost box holds the content's bottom padding to the real
          box's full (grown) height; see CommentBox below. */}
      <CommentBox ghost text={text} />
      <CommentBox
        text={text}
        allowed={commentAllowed}
        reason={reason}
        sending={sending}
        onText={setText}
        onSend={() => void send()}
      />
    </>
  )
}

/**
 * The message box, fixed at the bottom, sitting on the keyboard (41.6
 * rule 5, 41.13 rule 6), ported from the kit's comments demo. `ghost` is
 * the same box, invisible and out of the tab order, in the page's own
 * flow at the end of the content: it is pulled up by one action bar's
 * height (what the bottom-bar contract already reserves) so it adds
 * exactly the rest of the real box's height as the text grows, and the
 * last comment is never left under it.
 */
function CommentBox({
  ghost = false,
  text,
  allowed,
  reason,
  sending,
  onText,
  onSend,
}: {
  ghost?: boolean
  text: string
  allowed?: boolean
  reason?: string
  sending?: boolean
  onText?: (text: string) => void
  onSend?: () => void
}) {
  const id = React.useId()
  const disabled = ghost ? false : allowed !== true || sending === true
  return (
    <div
      aria-hidden={ghost || undefined}
      inert={ghost || undefined}
      data-fixed-bottom={ghost ? undefined : "action-bar"}
      className={cn(
        "border-t border-border-light bg-surface pr-safe-right pl-safe-left",
        ghost
          ? cn("invisible mt-[calc(var(--h-action-bar)_*_-1)]", BLEED)
          : "fixed inset-x-0 bottom-keyboard-inset z-(--z-shell) pb-safe-bottom"
      )}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSend?.()
        }}
        className="mx-auto flex w-full max-w-phone-column flex-col gap-2 p-3"
      >
        <Label htmlFor={id}>{PHONE_WORDS.comments.label}</Label>
        <div className="flex items-end gap-2">
          <Textarea
            id={id}
            {...fieldKeyboard("longText")}
            placeholder={PHONE_WORDS.comments.placeholder}
            disabled={disabled && allowed === false}
            className={cn(
              "min-w-0 flex-1",
              "phone:max-h-[calc(5lh_+_var(--spacing)_*_4_+_2px)]! phone:overflow-y-auto! phone:overscroll-y-contain"
            )}
            value={text}
            readOnly={ghost}
            tabIndex={ghost ? -1 : undefined}
            onChange={(event) => onText?.(event.target.value)}
            onKeyDown={onSend ? enterSends(onSend) : undefined}
          />
          {ghost ? (
            <Button type="submit" tabIndex={-1} disabled>
              {PHONE_WORDS.comments.send}
            </Button>
          ) : (
            <PermissionTooltip allowed={allowed} reason={reason ?? ""}>
              <Button type="submit" disabled={disabled || !text.trim()}>
                {sending ? PHONE_WORDS.comments.sending : PHONE_WORDS.comments.send}
              </Button>
            </PermissionTooltip>
          )}
        </div>
      </form>
    </div>
  )
}

export { PhoneCommentsScreen }
