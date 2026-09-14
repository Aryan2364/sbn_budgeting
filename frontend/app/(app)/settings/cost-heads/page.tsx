"use client"

import * as React from "react"

import { api, query, type CostHead, type ListResponse, type Matchable } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Truncate } from "@/components/ui/truncate"
import { FormError } from "@/components/forms/form-error"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"

/**
 * The cost heads master. Section 11.5, admin only (section 26).
 *
 * This is where "Miscellenous" gets corrected if it ever should be.
 * The seed matches on `seed_key` and never rewrites the name, so a
 * rename here survives every later deploy.
 */
export default function CostHeadsSettingsPage() {
  const { isAdmin } = useSession()

  const load = React.useCallback(
    (page: number) =>
      api.get<ListResponse<CostHead & Matchable>>(
        `/cost-heads${query({ page, pageSize: MASTER_PAGE_SIZE, sort: "sortOrder", direction: "asc" })}`,
      ),
    [],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } =
    useMasterRows(load)

  const [editing, setEditing] = React.useState<CostHead | null>(null)
  const [creating, setCreating] = React.useState(false)

  return (
    <>
      <MasterSection
        title="Cost heads"
        description="Every expense is booked against a cost head, and budgets are set per tree per head per period."
        createLabel="New cost head"
        canEdit={isAdmin}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        columns={[
          {
            key: "sortOrder",
            label: "#",
            numeric: true,
            className: "w-16",
            render: (row) => formatNumber(row.sortOrder),
          },
          {
            key: "name",
            label: "Name",
            render: (row) => <Truncate>{row.name}</Truncate>,
          },
          {
            key: "isActive",
            priority: "secondary",
            label: "Status",
            render: (row) =>
              row.isActive ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="neutral">Inactive</Badge>
              ),
          },
        ]}
        onCreate={() => setCreating(true)}
        onEdit={(row) => setEditing(row)}
        onDelete={(row) => api.delete(`/cost-heads/${row.id}`)}
        deleteWhat="cost head"
        deleteName={(row) => row.name}
        deleteConsequences={() => (
          <>
            A cost head used by any budget or expense cannot be deleted —
            deactivate it instead, which keeps the money it already carries
            while removing it from new entry.
          </>
        )}
        emptyHeading="No cost heads yet"
        emptyBody="Cost heads are the rows of every site budget."
        onChanged={refresh}
      />

      {/* Mounted only while open and keyed by record, so its fields
          start with the right values. Syncing props into state in an
          effect renders the previous record's values once first. */}
      {creating || editing !== null ? (
      <CostHeadDialog
        key={editing?.id ?? "new"}
        open
        head={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false)
            setEditing(null)
          }
        }}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          refresh()
        }}
      />
      ) : null}
    </>
  )
}

/** Add and Edit, ONE dialog (section 4 rule 1). */
function CostHeadDialog({
  open,
  head,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  head: CostHead | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = head !== null
  const [name, setName] = React.useState(head?.name ?? "")
  const [isActive, setIsActive] = React.useState(head?.isActive ?? true)
  /* No effect syncs these: the dialog is keyed by record and mounted
     only while open, so a fresh mount already has the right values. */
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<string | null>(null)


  async function save() {
    if (name.trim() === "") {
      setFieldError("Enter the cost head name")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await api.patch(`/cost-heads/${head.id}`, { name, isActive })
      } else {
        await api.post("/cost-heads", { name })
      }
      toast.success(isEdit ? "Cost head saved" : "Cost head added")
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit cost head" : "New cost head"}</DialogTitle>
          <DialogDescription>
            The name is what appears on every budget grid and expense.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 px-4">
          <FormError message={error} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="cost-head-name" required>
              Name
            </Label>
            <Input
              id="cost-head-name"
              value={name}
              aria-invalid={Boolean(fieldError) || undefined}
              onChange={(event) => setName(event.target.value)}
              onBlur={() =>
                setFieldError(name.trim() === "" ? "Enter the cost head name" : null)
              }
            />
            <InlineFieldError>{fieldError}</InlineFieldError>
          </div>

          {isEdit ? (
            <div className="flex items-start gap-3">
              <Switch
                id="cost-head-active"
                checked={isActive}
                onCheckedChange={(checked: boolean) => setIsActive(checked)}
              />
              <div className="min-w-0">
                <Label htmlFor="cost-head-active">Active</Label>
                <p className="mt-1 text-label text-text-secondary">
                  An inactive head stays on existing budgets and expenses but is
                  not offered for new ones.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save cost head" : "Add cost head"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
