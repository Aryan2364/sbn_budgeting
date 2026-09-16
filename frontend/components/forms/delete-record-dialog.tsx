"use client"

import * as React from "react"
import { TrashIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { errorMessage } from "@/components/shell/session"
import { InlineFieldError } from "@/components/ui/inline-field-error"

/**
 * The record refuses the deletion, and there is something else to do
 * instead. Not a permission and not a failure — a fact about the row.
 *
 * `reason` is the SAME sentence the disabled delete control would show
 * in its tooltip, so a master that can offer an alternative and one
 * that cannot are explaining themselves in one wording (§4 rule 2).
 */
export interface DeleteBlocked {
  /** Cause, then what to do about it (§7.2 rule 2). */
  reason: string
  /** "Deactivate cost head". The dialog's one primary action. */
  actionLabel: string
  run: () => Promise<void>
  /** The confirmation toast after it succeeds (§7.1). */
  done: string
}

/**
 * Section 15. One confirmation, used by everything that deletes.
 *
 * "A confirmation that does not state the consequences is not a
 * confirmation. It is a speed bump." — so `consequences` is required,
 * not optional, and the caller has to say what else will be affected.
 *
 * Cancel sits on the left as the safer option (rule 4) and the confirm
 * button states the actual verb (rule 3), never "OK" or "Yes".
 *
 * **`blocked` changes what this dialog IS, not what it says.** A record
 * the server will refuse is not a deletion awaiting confirmation, and
 * dressing one up as the other produced exactly what §26 forbids: a
 * dialog that explained why the delete was impossible and then offered
 * an enabled button to attempt it, with a red error underneath saying
 * the same thing a third time. When `blocked` is set there is no delete
 * button, no danger styling and no error — nothing has failed — and the
 * next action named in the prose is the button beside Cancel.
 */
export function DeleteRecordDialog({
  open,
  onOpenChange,
  recordName,
  what,
  consequences,
  onConfirm,
  onDeleted,
  blocked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The name of the thing, shown so nobody deletes the wrong record. */
  recordName: string
  /** "project", "site", "expense" — becomes the button verb. */
  what: string
  /** What else this affects. "This will also remove 4 invoices." */
  consequences: React.ReactNode
  onConfirm: () => Promise<void>
  onDeleted: () => void
  /**
   * Set when this record cannot be deleted and something else can be
   * done instead. Omit it and the §15 confirmation is what renders.
   */
  blocked?: DeleteBlocked
}) {
  if (blocked) {
    return (
      <CannotDeleteDialog
        open={open}
        onOpenChange={onOpenChange}
        recordName={recordName}
        blocked={blocked}
        onActed={onDeleted}
      />
    )
  }

  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      recordName={recordName}
      what={what}
      consequences={consequences}
      onConfirm={onConfirm}
      onDeleted={onDeleted}
    />
  )
}

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  recordName,
  what,
  consequences,
  onConfirm,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordName: string
  what: string
  consequences: React.ReactNode
  onConfirm: () => Promise<void>
  onDeleted: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
      onDeleted()
    } catch (caught) {
      // A refusal that reaches here is one the row could not predict —
      // a race, or a reference added since the list loaded. The refusal
      // is the useful part, so it is shown rather than lost on close.
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {/*
          The error lives INSIDE the header, which is this dialog's
          padded, scrolling zone. As a sibling of it, it was a direct
          child of the popup — no padding of its own and none inherited
          — so it painted flush against the left edge while the prose
          two lines above it sat correctly inset.
        */}
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {recordName}?</AlertDialogTitle>
          <AlertDialogDescription>{consequences}</AlertDialogDescription>
          {/* mt-0: the header's own gap already spaces this. */}
          {error ? (
            <InlineFieldError className="mt-0">{error}</InlineFieldError>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger" disabled={busy} onClick={confirm}>
            <TrashIcon />
            {busy ? "Deleting…" : `Delete ${what}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Nothing irreversible is on offer here, so this is a `Dialog` and not
 * an `AlertDialog`: §24 makes Escape and the backdrop close a dialog and
 * names confirmations as the one exception, and this is not one.
 */
function CannotDeleteDialog({
  open,
  onOpenChange,
  recordName,
  blocked,
  onActed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordName: string
  blocked: DeleteBlocked
  onActed: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function act() {
    setBusy(true)
    setError(null)
    try {
      await blocked.run()
      toast.success(blocked.done)
      onOpenChange(false)
      onActed()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        The SMALL width, §24, because this stands in for the §15
        confirmation and is reached by the same trash icon. Two dialogs
        one click apart that differ in width read as two different
        kinds of thing, and they are not — both are one short decision
        with Cancel beside it.
      */}
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{recordName} is in use</DialogTitle>
          {/*
            The verdict, and only the verdict. "Here is what can be
            done instead" was here too and the footer button already
            says it — §4 rule 2's no-saying-it-twice, and at 400px it
            wrapped the header to two lines for nothing.
          */}
          <DialogDescription>It cannot be deleted.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-body text-text-primary">{blocked.reason}</p>
          {error ? <InlineFieldError>{error}</InlineFieldError> : null}
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={busy} onClick={act}>
            {busy ? "Working…" : blocked.actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
