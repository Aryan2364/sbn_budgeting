"use client"

import * as React from "react"
import {
  ArrowRightLeftIcon,
  CircleCheckIcon,
  CircleDotIcon,
  MessageSquareIcon,
  PlayIcon,
  WrenchIcon,
} from "lucide-react"

import { formatDate, formatDateTime } from "@/lib/format"
import type { ComplaintEvent } from "@/lib/complaints-api"
import { Button } from "@/components/ui/button"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { enterSends } from "@/components/ui/keyboard-shortcuts"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { guTimeAgo } from "@/components/complaints/gu"

/**
 * The complaint's history (plan 3.6, FRONTEND_RULES 38.2): every event
 * the server recorded, newest first, never editable. Relative times
 * ("2 hours ago") are allowed here, in an activity feed (18), with the
 * full date and time beside them.
 *
 * The comment box sits above the list, so the newest line appears right
 * under what was just typed. Enter sends; Shift+Enter makes a new line
 * (39.2).
 *
 * In Gujarati (owner, 7 Oct 2026). A resolve's line shows what was done
 * (its note) and why it happened (the root cause, in its payload).
 */

const GU = {
  system: "સિસ્ટમ",
  raised: (who: string) => `${who} એ ફરિયાદ નોંધાવી`,
  started: (who: string) => `${who} એ કામ શરૂ કર્યું`,
  resolved: (who: string) => `${who} એ ફરિયાદ ઉકેલીને બંધ કરી`,
  closed: (who: string) => `${who} એ ફરિયાદ બંધ કરી`,
  closedBySystem: "સિસ્ટમના ફેરફારથી આપોઆપ બંધ થઈ",
  /** Migration 0013's line for complaints that waited for approval. */
  closedApprovalRemoved: "મંજૂરીનું પગલું દૂર થતાં સિસ્ટમે આપોઆપ બંધ કરી",
  reassignedFromTo: (who: string, from: string, to: string) => `${who} એ ફરિયાદ ${from} પાસેથી ${to} ને સોંપી`,
  reassignedTo: (who: string, to: string) => `${who} એ ફરિયાદ ${to} ને સોંપી`,
  reassigned: (who: string) => `${who} એ ફરિયાદ બીજાને સોંપી`,
  commented: (who: string) => `${who} એ ટિપ્પણી કરી`,
  updated: (who: string) => `${who} એ ફેરફાર કર્યો`,
  whatWasDone: "શું કામ કર્યું",
  rootCause: "સમસ્યાનું મૂળ કારણ",
  needComment: "પહેલાં ટિપ્પણી લખો",
  commentFailed: "ટિપ્પણી સાચવાઈ નથી. ફરી પ્રયાસ કરો.",
  commentLabel: "ટિપ્પણી ઉમેરો",
  enterHint: "Enter થી મોકલાશે. નવી લાઇન માટે Shift+Enter.",
  sending: "મોકલાઈ રહી છે…",
  send: "ટિપ્પણી ઉમેરો",
}

/** The note migration 0013 wrote on the complaints it closed (English data). */
const APPROVAL_REMOVED_NOTE = "closed: approval removed"

type Person = { name: string } | null

function payloadName(payload: unknown, ...keys: string[]): string | null {
  if (!payload || typeof payload !== "object") return null
  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key]
    if (typeof value === "string" && value) return value
    if (value && typeof value === "object" && "name" in value) {
      const name = (value as { name?: unknown }).name
      if (typeof name === "string" && name) return name
    }
  }
  return null
}

function describe(event: ComplaintEvent): { icon: React.ReactNode; text: string } {
  const who = (event.actor as Person)?.name ?? GU.system
  switch (event.kind) {
    case "raised":
      return { icon: <CircleDotIcon />, text: GU.raised(who) }
    case "started":
      return { icon: <PlayIcon />, text: GU.started(who) }
    case "resolved":
      return { icon: <WrenchIcon />, text: GU.resolved(who) }
    case "closed":
      // Written only by a data update, with no person behind it.
      return {
        icon: <CircleCheckIcon />,
        text: event.actor
          ? GU.closed(who)
          : event.note === APPROVAL_REMOVED_NOTE
            ? GU.closedApprovalRemoved
            : GU.closedBySystem,
      }
    case "reassigned": {
      const from = payloadName(event.payload, "fromSupervisor", "from", "previousSupervisor")
      const to = payloadName(event.payload, "toSupervisor", "to", "supervisor")
      return {
        icon: <ArrowRightLeftIcon />,
        text:
          from && to
            ? GU.reassignedFromTo(who, from, to)
            : to
              ? GU.reassignedTo(who, to)
              : GU.reassigned(who),
      }
    }
    case "comment":
      return { icon: <MessageSquareIcon />, text: GU.commented(who) }
    default:
      return { icon: <CircleDotIcon />, text: GU.updated(who) }
  }
}

/** The root cause a resolve carries in its payload (from 7 Oct 2026). */
function rootCauseOf(event: ComplaintEvent): string | null {
  if (event.kind !== "resolved" || !event.payload || typeof event.payload !== "object") return null
  const value = (event.payload as { rootCause?: unknown }).rootCause
  return typeof value === "string" && value.trim() ? value : null
}

/** The note to show under a line: never 0013's English bookkeeping note, which the line already says. */
function noteOf(event: ComplaintEvent): string | null {
  if (event.kind === "closed" && !event.actor && event.note === APPROVAL_REMOVED_NOTE) return null
  return event.note
}

export function Timeline({
  events,
  comment,
  onComment,
}: {
  events: ComplaintEvent[]
  comment: { allowed: boolean; reason: string | null }
  /** Resolves when the comment is saved; rejects with a message. */
  onComment: (note: string) => Promise<void>
}) {
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [sending, setSending] = React.useState(false)
  const [now, setNow] = React.useState(() => new Date())

  // Keep "5 minutes ago" honest while the page stays open.
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const ordered = React.useMemo(
    () => [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [events],
  )

  async function send() {
    if (sending) return
    if (!note.trim()) {
      setError(GU.needComment)
      return
    }
    setSending(true)
    setError(null)
    try {
      await onComment(note.trim())
      setNote("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GU.commentFailed)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <Label htmlFor="complaint-comment">{GU.commentLabel}</Label>
        <Textarea
          id="complaint-comment"
          rows={2}
          value={note}
          disabled={!comment.allowed || sending}
          aria-invalid={Boolean(error) || undefined}
          onChange={(event) => {
            setNote(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={enterSends(() => void send())}
          className="max-sm:text-base"
        />
        <InlineFieldError>{error}</InlineFieldError>
        <div className="flex items-center justify-between gap-2">
          <p className="text-meta text-text-muted max-sm:hidden">{GU.enterHint}</p>
          <PermissionTooltip allowed={comment.allowed} reason={comment.reason ?? ""}>
            <Button
              type="submit"
              variant="secondary"
              disabled={!comment.allowed || sending}
              className="max-sm:w-full"
            >
              {sending ? GU.sending : GU.send}
            </Button>
          </PermissionTooltip>
        </div>
      </form>

      <ol className="flex flex-col">
        {ordered.map((event, index) => {
          const { icon, text } = describe(event)
          const note = noteOf(event)
          const rootCause = rootCauseOf(event)
          const last = index === ordered.length - 1
          return (
            <li key={event.id} className="relative flex gap-3 pb-6 last:pb-0">
              {/* The rail between events. Decoration only. */}
              {!last ? (
                <span aria-hidden="true" className="absolute top-8 bottom-0 left-4 w-px bg-border-light" />
              ) : null}
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-light bg-surface-sunken text-text-secondary [&_svg]:size-4"
              >
                {icon}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                <p className="text-body text-text-primary">{text}</p>
                <p className="text-meta text-text-muted">
                  <time dateTime={event.at}>
                    {guTimeAgo(new Date(event.at), now, formatDate)} ·{" "}
                    {formatDateTime(event.at)}
                  </time>
                </p>
                {rootCause ? (
                  // A resolve: why it happened, then what was done.
                  <dl className="mt-1 flex flex-col gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-body">
                    <div>
                      <dt className="text-meta text-text-secondary">{GU.rootCause}</dt>
                      <dd className="break-words whitespace-pre-wrap text-text-primary">{rootCause}</dd>
                    </div>
                    {note ? (
                      <div>
                        <dt className="text-meta text-text-secondary">{GU.whatWasDone}</dt>
                        <dd className="break-words whitespace-pre-wrap text-text-primary">{note}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : note ? (
                  <p className="mt-1 rounded-lg bg-surface-sunken px-3 py-2 text-body break-words whitespace-pre-wrap text-text-primary">
                    {note}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
