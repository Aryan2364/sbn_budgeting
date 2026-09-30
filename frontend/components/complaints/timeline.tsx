"use client"

import * as React from "react"
import {
  ArrowRightLeftIcon,
  CircleCheckIcon,
  CircleDotIcon,
  MessageSquareIcon,
  PlayIcon,
  Undo2Icon,
  WrenchIcon,
} from "lucide-react"

import { formatDateTime } from "@/lib/format"
import type { ComplaintEvent } from "@/lib/complaints-api"
import { Button } from "@/components/ui/button"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { enterSends } from "@/components/ui/keyboard-shortcuts"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { timeAgo } from "@/components/shell/notification-panel"

/**
 * The complaint's history (plan 3.6, FRONTEND_RULES 38.2): every event
 * the server recorded, newest first, never editable. Relative times
 * ("2 hours ago") are allowed here, in an activity feed (18), with the
 * full date and time beside them.
 *
 * The comment box sits above the list, so the newest line appears right
 * under what was just typed. Enter sends; Shift+Enter makes a new line
 * (39.2).
 */

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
  const who = (event.actor as Person)?.name ?? "The system"
  switch (event.kind) {
    case "raised":
      return { icon: <CircleDotIcon />, text: `${who} raised the complaint` }
    case "started":
      return { icon: <PlayIcon />, text: `${who} started work on it` }
    case "resolved":
      return {
        icon: <WrenchIcon />,
        text:
          event.toStatus === "closed"
            ? `${who} resolved it, which closed it`
            : `${who} resolved it and sent it for approval`,
      }
    case "approved":
      return { icon: <CircleCheckIcon />, text: `${who} approved the fix and closed it` }
    case "closed":
      return { icon: <CircleCheckIcon />, text: `${who} closed it` }
    case "sent_back":
      return { icon: <Undo2Icon />, text: `${who} sent it back to the supervisor` }
    case "reassigned": {
      const from = payloadName(event.payload, "fromSupervisor", "from", "previousSupervisor")
      const to = payloadName(event.payload, "toSupervisor", "to", "supervisor")
      return {
        icon: <ArrowRightLeftIcon />,
        text:
          from && to
            ? `${who} reassigned it from ${from} to ${to}`
            : to
              ? `${who} reassigned it to ${to}`
              : `${who} reassigned it`,
      }
    }
    case "comment":
      return { icon: <MessageSquareIcon />, text: `${who} commented` }
    default:
      return { icon: <CircleDotIcon />, text: `${who} updated it` }
  }
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
      setError("Type a comment first")
      return
    }
    setSending(true)
    setError(null)
    try {
      await onComment(note.trim())
      setNote("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The comment was not saved. Try again.")
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
        <Label htmlFor="complaint-comment">Add a comment</Label>
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
          <p className="text-meta text-text-muted max-sm:hidden">Enter sends. Shift+Enter adds a line.</p>
          <PermissionTooltip allowed={comment.allowed} reason={comment.reason ?? ""}>
            <Button
              type="submit"
              variant="secondary"
              disabled={!comment.allowed || sending}
              className="max-sm:w-full"
            >
              {sending ? "Sending…" : "Add comment"}
            </Button>
          </PermissionTooltip>
        </div>
      </form>

      <ol className="flex flex-col">
        {ordered.map((event, index) => {
          const { icon, text } = describe(event)
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
                    {timeAgo(new Date(event.at), now)} · {formatDateTime(event.at)}
                  </time>
                </p>
                {event.note ? (
                  <p className="mt-1 rounded-lg bg-surface-sunken px-3 py-2 text-body break-words whitespace-pre-wrap text-text-primary">
                    {event.note}
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
