"use client"

import * as React from "react"
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react"

import { ApiError, pick } from "@/lib/api"
import { complaintsApi, type ComplaintDetail } from "@/lib/complaints-api"
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
import { GU_COMMON, GU_UNSAVED_FORM, GU_UPLOAD, guError } from "@/components/complaints/gu"

/**
 * The state-changing actions that need input: Resolve and Reassign.
 * Start and comments need none and are called from the detail page
 * directly.
 *
 * Each is a dialog (a full-screen sheet on a phone, the agreed field
 * exception), guarded against losing typed text (11.3.10), and each
 * handles the contract's 409 — "someone moved this first" — inside the
 * dialog, as a banner with Refresh, rather than opening a dialog from a
 * dialog (24 rule 4).
 *
 * The server's answer is always a fresh ComplaintDetail, handed back
 * through `onDone`, so the page updates in place without a refetch.
 *
 * Every word is Gujarati (owner, 7 Oct 2026); the server's sentences
 * arrive in Gujarati too.
 */

const PHONE_SHEET =
  "max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none"
const PHONE_TEXT = "max-sm:text-base"

/** The API's limit on a root cause (ResolveDto; migration 0015). */
const MAX_ROOT_CAUSE = 2000

const GU = {
  stale: "કોઈએ આ ફરિયાદ બદલી છે",
  failed: "આ કામ થઈ શક્યું નથી",

  resolveTitle: "ફરિયાદ ઉકેલો",
  resolveDescription:
    "ફરિયાદ ઉકેલવાથી તે બંધ થઈ જશે. પછી તેમાં ફેરફાર થઈ શકશે નહીં, પણ જેમને તે મોકલાઈ છે તેઓ ટિપ્પણી કરી શકશે.",
  resolveSubmit: "ફરિયાદ ઉકેલો",
  resolving: "ઉકેલાઈ રહી છે…",
  rootCauseLabel: "સમસ્યાનું મૂળ કારણ",
  rootCauseHint: "સમસ્યા કેમ થઈ તે લખો, જેથી ફરી ન થાય.",
  needRootCause: "સમસ્યાનું મૂળ કારણ લખો",
  longRootCause: `મૂળ કારણ ${MAX_ROOT_CAUSE} અક્ષર સુધીમાં લખો`,
  noteLabel: "શું કામ કર્યું",
  noteHint: "સમસ્યા દૂર કરવા માટે શું કર્યું તે લખો.",
  needNote: "શું કામ કર્યું તે લખો",
  photosLabel: "કામ પૂરું થયાના ફોટા",
  photosHint: "ઓછામાં ઓછો 1 અને વધુમાં વધુ 3 ફોટા. JPG, PNG કે WebP, દરેક 5 MB સુધી.",
  needPhoto: "કામ પૂરું થયાનો ઓછામાં ઓછો એક ફોટો ઉમેરો",
  resolved: (reference: string) => `ફરિયાદ ${reference} ઉકેલાઈ અને બંધ થઈ`,

  reassignTitle: "ફરિયાદ બીજાને સોંપો",
  reassignDescription: (from: string) =>
    `આ ફરિયાદ ${from} પાસેથી તમે પસંદ કરો તે વ્યક્તિને જશે, અને તે તેના સુપરવાઇઝર બનશે. બંનેને જાણ થશે.`,
  reassignSubmit: "ફરિયાદ સોંપો",
  reassigning: "સોંપાઈ રહી છે…",
  whoLabel: "ફરિયાદ કોને સોંપવી",
  peopleFailed: "લોકોની યાદી ખૂલી શકી નથી",
  nobodyElse:
    "લૉગિન કરી શકે અને ફરિયાદ પર કામ કરી શકે એવી બીજી કોઈ વ્યક્તિ નથી. એડમિનિસ્ટ્રેટર Access માં કોઈને આ પરવાનગી આપે, પછી તમે ફરિયાદ સોંપી શકશો.",
  noMatch: (q: string) => `'${q}' નામની કોઈ વ્યક્તિ મળી નથી.`,
  choosePerson: "વ્યક્તિ પસંદ કરો",
  searchPeople: "વ્યક્તિ શોધો",
  needPerson: "ફરિયાદ કોને સોંપવી તે પસંદ કરો",
  reasonLabel: "કારણ",
  needReason: "ફરિયાદ કેમ સોંપો છો તે લખો, જેથી બંનેને ખબર પડે",
  reassigned: (reference: string, to: string) => `ફરિયાદ ${reference} હવે ${to} ને સોંપાઈ`,
}

type Failure = { message: string; stale: boolean }

function failureFrom(caught: unknown): Failure {
  return {
    message: guError(caught),
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
      <BannerTitle>{failure.stale ? GU.stale : GU.failed}</BannerTitle>
      <BannerDescription>{failure.message}</BannerDescription>
      {failure.stale ? (
        <BannerAction>
          <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCwIcon />
            {GU_COMMON.refreshComplaint}
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
  // Nothing is kept until the action is submitted, so the create
  // wording: "Leave this form?" (KIT-PENDING-leave-warning.md).
  const unsaved = useUnsavedChanges({
    changed: changed && !saving,
    noun: "form",
    mode: "create",
    text: GU_UNSAVED_FORM,
  })
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
              {GU_COMMON.cancel}
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
  maxLength,
  rows = 4,
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
  maxLength?: number
  rows?: number
}) {
  const hintId = `${id}-hint`
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        autoFocus={autoFocus}
        maxLength={maxLength}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint && !error ? hintId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={ctrlEnterSaves}
        className={PHONE_TEXT}
      />
      {hint && !error ? (
        <p id={hintId} className="text-label text-text-secondary">
          {hint}
        </p>
      ) : null}
      <InlineFieldError>{error}</InlineFieldError>
    </div>
  )
}

// ---------------------------------------------------------------
// Resolve: why it happened, what was done and 1–3 photos of the fix,
// all required (plan Q9 default; root cause: owner, 7 Oct 2026)
// ---------------------------------------------------------------

export function ResolveDialog({ complaint, onClose, onDone, onRefresh }: ActionDialogProps) {
  const [rootCause, setRootCause] = React.useState("")
  const [note, setNote] = React.useState("")
  const [photos, setPhotos] = React.useState<FileUploadItem[]>([])
  const [rootCauseError, setRootCauseError] = React.useState<string | null>(null)
  const [noteError, setNoteError] = React.useState<string | null>(null)
  const [photoError, setPhotoError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  const checkRootCause = (text = rootCause) => {
    const value = text.trim()
    if (!value) return GU.needRootCause
    return value.length > MAX_ROOT_CAUSE ? GU.longRootCause : null
  }
  const checkNote = (text = note) => (text.trim() ? null : GU.needNote)
  const checkPhotos = (items = photos) => (filesToSend(items).length === 0 ? GU.needPhoto : null)

  async function submit() {
    const r = checkRootCause()
    const n = checkNote()
    const p = checkPhotos()
    setRootCauseError(r)
    setNoteError(n)
    setPhotoError(p)
    // 39.3: after a failed save, focus goes to the first field in error.
    if (r) return document.getElementById("resolve-root-cause")?.focus()
    if (n) return document.getElementById("resolve-note")?.focus()
    if (p) return document.getElementById("resolve-photos")?.focus()

    setSaving(true)
    setFailure(null)
    try {
      const next = await complaintsApi.resolve(
        complaint.id,
        { resolutionNote: note.trim(), rootCause: rootCause.trim() },
        filesToSend(photos),
      )
      onDone(next, GU.resolved(next.reference))
    } catch (caught) {
      setFailure(failureFrom(caught))
      setSaving(false)
    }
  }

  return (
    <ActionFrame
      title={GU.resolveTitle}
      description={GU.resolveDescription}
      formId="resolve-form"
      submitLabel={GU.resolveSubmit}
      savingLabel={GU.resolving}
      saving={saving}
      submitDisabled={isBusy(photos)}
      changed={rootCause.trim() !== "" || note.trim() !== "" || photos.length > 0}
      onClose={onClose}
      onSubmit={submit}
      failure={failure}
      onRefresh={onRefresh}
    >
      {/* 11.3: why it happened, then what was done about it, then the
          proof. Labels above, required ones starred, hints below. */}
      <NoteField
        id="resolve-root-cause"
        label={GU.rootCauseLabel}
        required
        autoFocus
        rows={3}
        maxLength={MAX_ROOT_CAUSE}
        hint={GU.rootCauseHint}
        value={rootCause}
        onChange={(v) => {
          setRootCause(v)
          if (rootCauseError) setRootCauseError(checkRootCause(v))
        }}
        onBlur={() => setRootCauseError(checkRootCause())}
        error={rootCauseError}
      />
      <NoteField
        id="resolve-note"
        label={GU.noteLabel}
        required
        hint={GU.noteHint}
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
          {GU.photosLabel}
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
          text={GU_UPLOAD}
          disabled={saving}
          invalid={Boolean(photoError)}
          description={GU.photosHint}
        />
        <InlineFieldError>{photoError}</InlineFieldError>
      </div>
    </ActionFrame>
  )
}

// ---------------------------------------------------------------
// Reassign: another person who can work on complaints, and why
// ---------------------------------------------------------------

/** Who may take a complaint over: anyone who holds this (access plan P8). */
const WORK_KEY = "complaints.complaints.work"

export function ReassignDialog({ complaint, onClose, onDone, onRefresh }: ActionDialogProps) {
  /** Whether anyone else can take it over, from the first answer. null until known. */
  const [anyoneElse, setAnyoneElse] = React.useState<boolean | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [supervisorId, setSupervisorId] = React.useState("")
  const [note, setNote] = React.useState("")
  const [errors, setErrors] = React.useState<{ supervisor?: string | null; note?: string | null }>({})
  const [saving, setSaving] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  /**
   * The people Pick, searched on the server as the user types (access
   * plan P8): only people who can sign in and may work on complaints,
   * narrowed by the server. The one it is with now is left out; it
   * cannot move to them.
   */
  const searchPeople = React.useCallback(
    (query: string) =>
      pick
        .people({ q: query, canReceive: true, holds: WORK_KEY })
        .then((rows) =>
          rows
            .filter((p) => p.id !== complaint.supervisor.id)
            .map((p) => ({ value: p.id, label: p.name, detail: p.designationName })),
        ),
    [complaint.supervisor.id],
  )

  React.useEffect(() => {
    let cancelled = false
    // One first answer (at most 50, never everyone) says whether there
    // is anyone to choose at all; the picker searches the rest.
    pick
      .people({ canReceive: true, holds: WORK_KEY })
      .then((first) => {
        if (!cancelled) {
          setAnyoneElse(first.some((p) => p.id !== complaint.supervisor.id))
          setLoadError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(guError(caught))
      })
    return () => {
      cancelled = true
    }
  }, [attempt, complaint.supervisor.id])

  const checkSupervisor = (id = supervisorId) => (id ? null : GU.needPerson)
  const checkNote = (text = note) => (text.trim() ? null : GU.needReason)

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
      onDone(next, GU.reassigned(next.reference, next.supervisor.name))
    } catch (caught) {
      setFailure(failureFrom(caught))
      setSaving(false)
    }
  }

  return (
    <ActionFrame
      title={GU.reassignTitle}
      description={GU.reassignDescription(complaint.supervisor.name)}
      formId="reassign-form"
      submitLabel={GU.reassignSubmit}
      savingLabel={GU.reassigning}
      saving={saving}
      submitDisabled={anyoneElse !== true}
      changed={supervisorId !== "" || note.trim() !== ""}
      onClose={onClose}
      onSubmit={submit}
      failure={failure}
      onRefresh={onRefresh}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="reassign-supervisor" required>
          {GU.whoLabel}
        </Label>
        {loadError ? (
          <Banner variant="danger">
            <CircleAlertIcon />
            <BannerTitle>{GU.peopleFailed}</BannerTitle>
            <BannerDescription>{loadError}</BannerDescription>
            <BannerAction>
              <Button type="button" variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>
                {GU_COMMON.tryAgain}
              </Button>
            </BannerAction>
          </Banner>
        ) : anyoneElse === null ? (
          <Skeleton className="h-control w-full max-w-field-max" />
        ) : !anyoneElse ? (
          <p className="text-body text-text-secondary">{GU.nobodyElse}</p>
        ) : (
          <Choice
            id="reassign-supervisor"
            options={[]}
            search={searchPeople}
            emptyMessage={GU.noMatch}
            value={supervisorId}
            onValueChange={(v) => {
              setSupervisorId(v)
              setErrors((e) => ({ ...e, supervisor: null }))
            }}
            onBlur={() => setErrors((e) => ({ ...e, supervisor: checkSupervisor() }))}
            invalid={Boolean(errors.supervisor)}
            placeholder={GU.choosePerson}
            searchPlaceholder={GU.searchPeople}
          />
        )}
        <InlineFieldError>{errors.supervisor}</InlineFieldError>
      </div>
      <NoteField
        id="reassign-note"
        label={GU.reasonLabel}
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
