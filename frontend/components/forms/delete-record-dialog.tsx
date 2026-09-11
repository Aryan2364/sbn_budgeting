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
import { errorMessage } from "@/components/shell/session"
import { InlineFieldError } from "@/components/ui/inline-field-error"

/**
 * Section 15. One confirmation, used by everything that deletes.
 *
 * "A confirmation that does not state the consequences is not a
 * confirmation. It is a speed bump." — so `consequences` is required,
 * not optional, and the caller has to say what else will be affected.
 *
 * Cancel sits on the left as the safer option (rule 4) and the confirm
 * button states the actual verb (rule 3), never "OK" or "Yes".
 */
export function DeleteRecordDialog({
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
  /** The name of the thing, shown so nobody deletes the wrong record. */
  recordName: string
  /** "project", "site", "expense" — becomes the button verb. */
  what: string
  /** What else this affects. "This will also remove 4 invoices." */
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
      // The server refuses a delete that would orphan money. That
      // refusal is the useful part, so it is shown here rather than
      // closing the dialog and losing it.
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {recordName}?</AlertDialogTitle>
          <AlertDialogDescription>{consequences}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <InlineFieldError>{error}</InlineFieldError> : null}
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
