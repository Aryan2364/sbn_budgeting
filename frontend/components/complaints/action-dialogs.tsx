"use client"

import * as React from "react"
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react"

import { api, ApiError, query, type Designation, type ListResponse, type Person } from "@/lib/api"
import {
  complaintsApi,
  fetchAllPages,
  type ComplaintDetail,
} from "@/lib/complaints-api"
import { errorMessage } from "@/components/shell/session"
import { Banner, BannerAction, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileUpload, filesToSend, isBusy, type FileUploadItem } from "@/components/ui/file-upload"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ctrlEnterSaves } from "@/components/ui/keyboard-shortcuts"
import { useUnsavedChanges } from "@/components/ui/unsaved-changes"
import { Choice } from "@/components/complaints/choice"

/**
 * The state-changing actions that need input: Resolve, Approve, Send
 * back and Reassign. Start and comments need none and are called from
 * the detail page directly.
 *
 * Each is a dialog (a full-screen sheet on a phone, the agreed field
 * exception), guarded against losing typed text (11.3.10), and each
 * handles the contract's 409 — "someone moved this first" — inside the
 * dialog, as a banner with Refresh, rather than opening a dialog from a
 * dialog (24 rule 4).
 *
 * The server's answer is always a fresh ComplaintDetail, handed back
 * through `onDone`, so the page updates in place without a refetch.
 */

const PHONE_SHEET =
  "max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none"
const PHONE_TEXT = "max-sm:text-base"

type Failure = { message: string; stale: boolean }

function failureFrom(caught: unknown): Failure {
  return {
    message: errorMessage(caught),
    stale: caught instanceof ApiError && caught.status === 409,
  }
}

function FailureBanner({
  failure,
  onRefresh,
}: {
  failure: Failure | null
  onRefresh: () => void
}) {
  if (!failure) return null
  return (
    <Banner variant={failure.stale ? "warning" : "danger"}>
      <CircleAlertIcon />
      <BannerTitle>
        {failure.stale ? "Someone else changed this complaint" : "That did not go through"}
      </BannerTitle>
      <BannerDescription>{failure.message}</BannerDescription>
      {failure.stale ? (
        <BannerAction>
          <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCwIcon />
            Refresh complaint
          </Button>
        </BannerAction>
      ) : null}
    </Banner>
  )
}

interface ActionDialogProps {
  complaint: ComplaintDetail
  onClose: () => void
  onDone: (next: ComplaintDetail, message: string) => void
  /** Close and reload the complaint: the way forward from a 409. */
  onRefresh: () => void
}

/**
 * Shared frame: title, description, the fields as a form (so Ctrl+S
 * and Enter reach it, 39), the failure banner, and the footer with
 * Cancel on the left of the one primary.
 */
function ActionFrame({
  title,
  description,
  formId,
  submitLabel,
  savingLabel,
  saving,
  submitDisabled,
  changed,
  onClose,
  onSubmit,
  failure,
  onRefresh,
  children,
}: {
  title: string
  description: React.ReactNode
  formId: string
  submitLabel: string
  savingLabel: string
  saving: boolean
  submitDisabled?: boolean
  changed: boolean
  onClose: () => void
  onSubmit: () => void
  failure: Failure | null
  onRefresh: () => void
  children: React.ReactNode
}) {
  const unsaved = useUnsavedChanges({ changed: changed && !saving, noun: "complaint" })
  const setOpen = (open: boolean) => {
    if (!open) onClose()
  }

  return (
    <>
      {unsaved.warning}
      <Dialog open onOpenChange={unsaved.guard(setOpen)}>
        <DialogContent size="md" className={PHONE_SHEET}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-6">
            <DialogDescription>{description}</DialogDescription>
            <FailureBanner failure={failure} onRefresh={onRefresh} />
            <form
              id={formId}
              noValidate
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault()
                if (!saving) onSubmit()
              }}
            >
              {children}
            </form>
          </DialogBody>
          <DialogFooter className="max-sm:grid max-sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={saving}
              onClick={() => unsaved.guard(setOpen)(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form={formId} size="lg" disabled={saving || submitDisabled}>
              {saving ? savingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function NoteField({
  id,
  label,
  required,
  value,
  onChange,
  error,
  onBlur,
  hint,
  autoFocus,
}: {
  id: string
  label: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  error?: string | null
  onBlur?: () => void
  hint?: string
  autoFocus?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Textarea
        id={id}
        rows={4}
        value={value}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error) || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={ctrlEnterSaves}
        className={PHONE_TEXT}
      />
      {hint && !error ? <p className="text-label text-text-secondary">{hint}</p> : null}
      <InlineFieldError>{error}</InlineFieldError>
    </div>
  )
}

// ---------------------------------------------------------------
// Resolve: a note and 1–3 photos, both required (plan Q9 default)
// ---------------------------------------------------------------

export function ResolveDialog({ complaint, onClose, onDone, onRefresh }: ActionDialogProps) {
  const [note, setNote] = React.useState("")
  const [photos, setPhotos] = React.useState<FileUploadItem[]>([])
  const [noteError, setNoteError] = React.useState<string | null>(null)
  const [photoError, setPhotoError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  const checkNote = (text = note) =>
    text.trim() ? null : "Say what was done to fix it, so the approver can check it"
  const checkPhotos = (items = photos) =>
    filesToSend(items).length === 0 ? "Add at least one photo of the fix" : null

  async function submit() {
    const n = checkNote()
    const p = checkPhotos()
    setNoteError(n)
    setPhotoError(p)
    if (n) return document.getElementById("resolve-note")?.focus()
    if (p) return document.getElementById("resolve-photos")?.focus()

    setSaving(true)
    setFailure(null)
    try {
      const next = await complaintsApi.resolve(complaint.id, note.trim(), filesToSend(photos))
      onDone(
        next,
        next.status === "closed"
          ? `${next.reference} resolved and closed`
          : `${next.reference} resolved. ${next.approver?.name ?? "The approver"} has been asked to approve it.`,
      )
    } catch (caught) {
      setFailure(failureFrom(caught))
      setSaving(false)
    }
  }

  return (
    <ActionFrame
      title="Resolve complaint"
      description={
        complaint.requiresApproval
          ? `Once resolved it goes to ${complaint.approver?.name ?? "the approver"} to approve.`
          : "This category needs no approval, so resolving closes the complaint."
      }
      formId="resolve-form"
      submitLabel="Resolve complaint"
      savingLabel="Resolving…"
      saving={saving}
      submitDisabled={isBusy(photos)}
      changed={note.trim() !== "" || photos.length > 0}
      onClose={onClose}
      onSubmit={submit}
      failure={failure}
      onRefresh={onRefresh}
    >
      <NoteField
        id="resolve-note"
        label="What was done"
        required
        autoFocus
        value={note}
        onChange={(v) => {
          setNote(v)
          if (noteError) setNoteError(checkNote(v))
        }}
        onBlur={() => setNoteError(checkNote())}
        error={noteError}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="resolve-photos" required>
          Photos of the fix
        </Label>
        <FileUpload
          id="resolve-photos"
          value={photos}
          onChange={(next) => {
            setPhotos(next)
            if (photoError) setPhotoError(checkPhotos(next))
          }}
          accept="image/jpeg,image/png,image/webp"
          maxFiles={3}
          maxBytes={5 * 1024 * 1024}
          capture="environment"
          noun={{ one: "photo", many: "photos" }}
          disabled={saving}
          invalid={Boolean(photoError)}
          description="At least 1 and up to 3. JPG, PNG or WebP, up to 5 MB each."
        />
        <InlineFieldError>{photoError}</InlineFieldError>
      </div>
    </ActionFrame>
  )
}

// ---------------------------------------------------------------
// Approve: an optional note
// ---------------------------------------------------------------

export function ApproveDialog({ complaint, onClose, onDone, onRefresh }: ActionDialogProps) {
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  async function submit() {
    setSaving(true)
    setFailure(null)
    try {
      const next = await complaintsApi.approve(complaint.id, note.trim() || undefined)
      onDone(next, `${next.reference} approved and closed`)
    } catch (caught) {
      setFailure(failureFrom(caught))
      setSaving(false)
    }
  }

  return (
    <ActionFrame
      title="Approve and close"
      description={`${complaint.resolvedBy?.name ?? "The supervisor"}'s fix is accepted and the complaint closes. ${complaint.supervisor.name} and ${complaint.raisedBy.name} are told.`}
      formId="approve-form"
      submitLabel="Approve and close"
      savingLabel="Approving…"
      saving={saving}
      changed={note.trim() !== ""}
      onClose={onClose}
      onSubmit={submit}
      failure={failure}
      onRefresh={onRefresh}
    >
      <NoteField
        id="approve-note"
        label="Note"
        value={note}
        onChange={setNote}
        hint="Optional. It is added to the complaint's activity."
      />
    </ActionFrame>
  )
}

// ---------------------------------------------------------------
// Send back: a note is required (plan Q4 default)
// ---------------------------------------------------------------

export function SendBackDialog({ complaint, onClose, onDone, onRefresh }: ActionDialogProps) {
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const check = (text = note) =>
    text.trim() ? null : "Say what still needs fixing, so the supervisor knows what to do"

  async function submit() {
    const e = check()
    setError(e)
    if (e) return document.getElementById("send-back-note")?.focus()
    setSaving(true)
    setFailure(null)
    try {
      const next = await complaintsApi.sendBack(complaint.id, note.trim())
      onDone(next, `${next.reference} sent back to ${next.supervisor.name}`)
    } catch (caught) {
      setFailure(failureFrom(caught))
      setSaving(false)
    }
  }

  return (
    <ActionFrame
      title="Send back to the supervisor"
      description={`It returns to In progress and ${complaint.supervisor.name} is told what still needs doing.`}
      formId="send-back-form"
      submitLabel="Send back"
      savingLabel="Sending back…"
      saving={saving}
      changed={note.trim() !== ""}
      onClose={onClose}
      onSubmit={submit}
      failure={failure}
      onRefresh={onRefresh}
    >
      <NoteField
        id="send-back-note"
        label="What still needs doing"
        required
        autoFocus
        value={note}
        onChange={(v) => {
          setNote(v)
          if (error) setError(check(v))
        }}
        onBlur={() => setError(check())}
        error={error}
      />
    </ActionFrame>
  )
}

// ---------------------------------------------------------------
// Reassign: another Supervisor-designation person, and why
// ---------------------------------------------------------------

export function ReassignDialog({ complaint, onClose, onDone, onRefresh }: ActionDialogProps) {
  const [people, setPeople] = React.useState<Person[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [supervisorId, setSupervisorId] = React.useState("")
  const [note, setNote] = React.useState("")
  const [errors, setErrors] = React.useState<{ supervisor?: string | null; note?: string | null }>({})
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  React.useEffect(() => {
    let cancelled = false
    api
      .get<ListResponse<Designation>>(`/designations${query({ pageSize: 100 })}`)
      .then(async (designations) => {
        const supervisor = designations.data.find((d) => d.seedKey === "supervisor")
        if (!supervisor) {
          throw new ApiError(
            404,
            "There is no Supervisor designation to choose from. Ask an administrator to check Settings, Designations.",
          )
        }
        return fetchAllPages((page) =>
          api.get<ListResponse<Person>>(
            `/users${query({ page, pageSize: 100, designationId: supervisor.id, sort: "name", direction: "asc" })}`,
          ),
        )
      })
      .then((rows) => {
        if (!cancelled) {
          setPeople(rows)
          setLoadError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const options = (people ?? [])
    .filter((p) => p.id !== complaint.supervisor.id && p.canLogin)
    .map((p) => ({
      value: p.id,
      label:
        p.locations.length > 0
          ? `${p.name} (${p.locations.map((l) => l.name).join(", ")})`
          : p.name,
    }))

  const checkSupervisor = (id = supervisorId) => (id ? null : "Choose who takes this complaint over")
  const checkNote = (text = note) =>
    text.trim() ? null : "Say why it is moving, so both supervisors know"

  async function submit() {
    const s = checkSupervisor()
    const n = checkNote()
    setErrors({ supervisor: s, note: n })
    if (s) return document.getElementById("reassign-supervisor")?.focus()
    if (n) return document.getElementById("reassign-note")?.focus()
    setSaving(true)
    setFailure(null)
    try {
      const next = await complaintsApi.reassign(complaint.id, supervisorId, note.trim())
      onDone(next, `${next.reference} reassigned to ${next.supervisor.name}`)
    } catch (caught) {
      setFailure(failureFrom(caught))
      setSaving(false)
    }
  }

  return (
    <ActionFrame
      title="Reassign complaint"
      description={`It moves from ${complaint.supervisor.name} to the supervisor you choose. Both are told.`}
      formId="reassign-form"
      submitLabel="Reassign complaint"
      savingLabel="Reassigning…"
      saving={saving}
      submitDisabled={people === null}
      changed={supervisorId !== "" || note.trim() !== ""}
      onClose={onClose}
      onSubmit={submit}
      failure={failure}
      onRefresh={onRefresh}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="reassign-supervisor" required>
          New supervisor
        </Label>
        {loadError ? (
          <Banner variant="danger">
            <CircleAlertIcon />
            <BannerTitle>The supervisors could not be loaded</BannerTitle>
            <BannerDescription>{loadError}</BannerDescription>
            <BannerAction>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </Button>
            </BannerAction>
          </Banner>
        ) : people === null ? (
          <Skeleton className="h-control w-full max-w-field-max" />
        ) : options.length === 0 ? (
          <p className="text-body text-text-secondary">
            There is no other supervisor who can sign in. Add one in Settings, People, then
            reassign.
          </p>
        ) : (
          <Choice
            id="reassign-supervisor"
            options={options}
            value={supervisorId}
            onValueChange={(v) => {
              setSupervisorId(v)
              setErrors((e) => ({ ...e, supervisor: null }))
            }}
            onBlur={() => setErrors((e) => ({ ...e, supervisor: checkSupervisor() }))}
            invalid={Boolean(errors.supervisor)}
            placeholder="Choose a supervisor"
            searchPlaceholder="Search supervisors"
          />
        )}
        <InlineFieldError>{errors.supervisor}</InlineFieldError>
      </div>
      <NoteField
        id="reassign-note"
        label="Reason"
        required
        value={note}
        onChange={(v) => {
          setNote(v)
          if (errors.note) setErrors((e) => ({ ...e, note: checkNote(v) }))
        }}
        onBlur={() => setErrors((e) => ({ ...e, note: checkNote() }))}
        error={errors.note}
      />
    </ActionFrame>
  )
}
