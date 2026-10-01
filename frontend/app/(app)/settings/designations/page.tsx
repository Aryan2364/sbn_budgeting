"use client"

import * as React from "react"

import { api, query, type Designation, type ListResponse, type Matchable } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
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
import { Input } from "@/components/ui/input"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Truncate } from "@/components/ui/truncate"
import type { ExportColumn } from "@/lib/pdf-export"
import { FormError } from "@/components/forms/form-error"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"

/**
 * The designations master (CONTRACT §2), platform admin only. The
 * cost-heads pattern: a paged master list, one Add/Edit dialog, and a
 * delete that is checked before it is offered.
 *
 * The four seeded designations (supervisor, manager, HOD, CEO) route
 * complaints by their seed key, so they can be renamed or deactivated
 * but never deleted.
 *
 * Section 27.2: the list's sort is by name, A to Z. Designations have
 * no position of their own, and nobody sets one.
 */
export default function DesignationsSettingsPage() {
  const { can } = useSession()
  const canEdit = can.platformAdmin

  const load = React.useCallback(
    (page: number) =>
      api.get<ListResponse<Designation & Matchable>>(
        `/designations${query({ page, pageSize: MASTER_PAGE_SIZE, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } =
    useMasterRows(load)

  const [editing, setEditing] = React.useState<Designation | null>(null)
  const [creating, setCreating] = React.useState(false)

  const exportFetchPage = React.useCallback(
    async (exportPage: number, pageSize: number) =>
      api.get<ListResponse<Designation & Matchable>>(
        `/designations${query({ page: exportPage, pageSize, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const exportColumns: ExportColumn<Designation>[] = [
    { header: "Name", cell: (row) => row.name },
    {
      header: "People",
      cell: (row) => formatNumber(row.userCount),
      numeric: true,
      excelValue: (row) => row.userCount,
    },
    { header: "Status", cell: (row) => (row.isActive ? "Active" : "Inactive") },
  ]

  return (
    <>
      <MasterSection
        title="Designations"
        description="What each person is: Supervisor, Manager, HOD, CEO and any others. Complaints are routed by the first four."
        createLabel="Add designation"
        canEdit={canEdit}
        cannotEditReason="Only a platform administrator can change designations"
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        exportList={{
          title: "Designations",
          columns: exportColumns,
          fetchPage: exportFetchPage,
        }}
        columns={[
          {
            key: "name",
            label: "Name",
            render: (row) => <Truncate>{row.name}</Truncate>,
          },
          {
            key: "userCount",
            label: "People",
            numeric: true,
            className: "w-col-count",
            render: (row) => formatNumber(row.userCount),
          },
          {
            key: "isActive",
            priority: "secondary",
            label: "Status",
            className: "w-col-status",
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
        onDelete={(row) => api.delete(`/designations/${row.id}`)}
        deleteWhat="designation"
        deleteName={(row) => row.name}
        /*
         * The same two refusals the server makes, said before the click
         * (§26, §15.1): a seeded designation is never deletable, and one
         * that people hold is deactivated instead (§15.2).
         */
        deleteBlocked={(row) => {
          if (row.seedKey) {
            return `${row.name} is used to route complaints, so it can be renamed but not deleted.`
          }
          if (row.userCount === 0) return null
          const who = `${formatNumber(row.userCount)} ${row.userCount === 1 ? "person has" : "people have"} this designation`
          return row.isActive
            ? `${who}, so it cannot be deleted. Deactivating it keeps them as they are and stops it being offered for anyone new.`
            : `${who}, so it cannot be deleted. It is already inactive, so nothing further is needed.`
        }}
        /*
         * Not offered for a seeded designation: deactivating Supervisor
         * from a delete dialog would quietly stop it being offered for
         * new people while complaints still route by it. That stays a
         * deliberate edit, not a one-click alternative.
         */
        deleteAlternative={(row) =>
          row.isActive && !row.seedKey
            ? {
                label: "Deactivate designation",
                run: async () => {
                  await api.patch(`/designations/${row.id}`, {
                    name: row.name,
                    isActive: false,
                  })
                },
                done: `${row.name} deactivated`,
              }
            : null
        }
        deleteConsequences={() => (
          <>
            Nobody has this designation, so nothing else changes. Removing it
            cannot be undone.
          </>
        )}
        emptyHeading="No designations yet"
        emptyBody="Designations say what each person is, and route complaints to the right people."
        onChanged={refresh}
      />

      {creating || editing !== null ? (
        <DesignationDialog
          key={editing?.id ?? "new"}
          open
          designation={editing}
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
function DesignationDialog({
  open,
  designation,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  designation: Designation | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = designation !== null
  const [name, setName] = React.useState(designation?.name ?? "")
  const [isActive, setIsActive] = React.useState(designation?.isActive ?? true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<{
    name?: string | null
  }>({})

  const nameError = (v: string) => (v.trim() === "" ? "Enter the designation name" : null)

  async function save() {
    const found = { name: nameError(name) }
    setFieldErrors(found)
    if (found.name) return
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: name.trim(),
        ...(isEdit ? { isActive } : {}),
      }
      if (isEdit) await api.patch(`/designations/${designation.id}`, body)
      else await api.post("/designations", body)
      toast.success(isEdit ? "Designation saved" : "Designation added")
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
          <DialogTitle>{isEdit ? "Edit designation" : "Add designation"}</DialogTitle>
          <DialogDescription>
            {designation?.seedKey
              ? "This designation routes complaints. Renaming it keeps the routing."
              : "The name shows on each person and in the people list."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-6">
          <FormError message={error} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="designation-name" required>
              Name
            </Label>
            <Input
              id="designation-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name) || undefined}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setFieldErrors((c) => ({ ...c, name: nameError(name) }))}
            />
            <InlineFieldError>{fieldErrors.name}</InlineFieldError>
          </div>

          {isEdit ? (
            <div className="flex items-start gap-3">
              <Switch
                id="designation-active"
                checked={isActive}
                onCheckedChange={(checked: boolean) => setIsActive(checked)}
              />
              <div className="min-w-0">
                <Label htmlFor="designation-active">Active</Label>
                <p className="mt-1 text-label text-text-secondary">
                  An inactive designation stays on the people who have it but is
                  not offered for anyone new.
                </p>
              </div>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save designation" : "Add designation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
