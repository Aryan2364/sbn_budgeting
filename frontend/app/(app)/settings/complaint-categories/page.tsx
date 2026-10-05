"use client"

import * as React from "react"

import type { Matchable } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import {
  categoriesApi,
  type ComplaintCategory,
  type ComplaintCategoryBody,
} from "@/lib/complaints-api"
import type { ExportColumn } from "@/lib/pdf-export"
import { reasonFor, useCan } from "@/lib/permissions"
import { errorMessage } from "@/components/shell/session"
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
import { isChanged, useUnsavedChanges } from "@/components/ui/unsaved-changes"
import { FormError } from "@/components/forms/form-error"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"

/**
 * Settings → Complaint categories (CONTRACT §3, plan 3.5). The
 * cost-heads pattern: a paged master list, one Add/Edit dialog
 * (section 4 rule 1), and a delete checked before it is offered.
 *
 * A category that complaints already use is deactivated, never
 * deleted (15.2): its delete is disabled with the reason, or,
 * while it is still active, opens the explanation with Deactivate as
 * its action.
 *
 * Section 27.2: the list's sort is by name, A to Z. Categories have no
 * position of their own, and nobody sets one.
 */
export default function ComplaintCategoriesSettingsPage() {
  const canEdit = useCan("complaints.categories.manage")

  const load = React.useCallback(
    (page: number) =>
      categoriesApi.list({ page, pageSize: MASTER_PAGE_SIZE, sort: "name", direction: "asc" }),
    [],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } = useMasterRows(load)

  const [editing, setEditing] = React.useState<ComplaintCategory | null>(null)
  const [creating, setCreating] = React.useState(false)

  const exportFetchPage = React.useCallback(
    (exportPage: number, pageSize: number) =>
      categoriesApi.list({ page: exportPage, pageSize, sort: "name", direction: "asc" }),
    [],
  )
  const exportColumns: ExportColumn<ComplaintCategory>[] = [
    { header: "Name", cell: (row) => row.name },
    {
      header: "Complaints",
      cell: (row) => formatNumber(row.complaintCount),
      numeric: true,
      excelValue: (row) => row.complaintCount,
    },
    { header: "Status", cell: (row) => (row.isActive ? "Active" : "Inactive") },
  ]

  return (
    <>
      <MasterSection<ComplaintCategory & Matchable>
        title="Complaint categories"
        description="Every complaint is raised in a category."
        createLabel="Add category"
        canEdit={canEdit}
        cannotEditReason={reasonFor("complaints.categories.manage")}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        exportList={{ title: "Complaint categories", columns: exportColumns, fetchPage: exportFetchPage }}
        columns={[
          { key: "name", label: "Name", render: (row) => <Truncate>{row.name}</Truncate> },
          {
            key: "complaintCount",
            label: "Complaints",
            numeric: true,
            priority: "secondary",
            className: "w-col-count",
            render: (row) => formatNumber(row.complaintCount),
          },
          {
            key: "isActive",
            label: "Status",
            priority: "secondary",
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
        onDelete={(row) => categoriesApi.remove(row.id)}
        deleteWhat="category"
        deleteName={(row) => row.name}
        deleteBlocked={(row) => {
          if (row.complaintCount === 0) return null
          const uses = `${formatNumber(row.complaintCount)} ${row.complaintCount === 1 ? "complaint is" : "complaints are"} filed under ${row.name}, so it cannot be deleted.`
          return row.isActive
            ? `${uses} Deactivate it instead: those complaints keep it, and it stops being offered for new ones.`
            : `${uses} It is already inactive, so nothing further is needed.`
        }}
        deleteAlternative={(row) =>
          row.isActive
            ? {
                label: "Deactivate category",
                run: async () => {
                  await categoriesApi.update(row.id, { name: row.name, isActive: false })
                },
                done: `${row.name} deactivated`,
              }
            : null
        }
        deleteConsequences={() => (
          <>No complaint uses this category, so nothing else changes. Deleting it cannot be undone.</>
        )}
        emptyHeading="No complaint categories yet"
        emptyBody="Add the kinds of complaint people can raise, such as Electrical or Cleaning."
        onChanged={refresh}
      />

      {creating || editing !== null ? (
        <CategoryDialog
          key={editing?.id ?? "new"}
          category={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
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

/** Add and Edit, one dialog (section 4 rule 1). */
function CategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: ComplaintCategory | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = category !== null
  const saved = React.useMemo(
    () => ({
      name: category?.name ?? "",
      isActive: category?.isActive ?? true,
    }),
    [category],
  )
  const [values, setValues] = React.useState(saved)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [nameError, setNameError] = React.useState<string | null>(null)

  const unsaved = useUnsavedChanges({
    changed: isChanged(values, saved) && !saving,
    noun: "category",
    mode: isEdit ? "edit" : "create",
  })

  const checkName = (name = values.name) => (name.trim() ? null : "Enter the category name")

  async function save() {
    const n = checkName()
    setNameError(n)
    if (n) return document.getElementById("category-name")?.focus()

    const body: ComplaintCategoryBody = {
      name: values.name.trim(),
      ...(isEdit ? { isActive: values.isActive } : {}),
    }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) await categoriesApi.update(category.id, body)
      else await categoriesApi.create(body)
      toast.success(isEdit ? "Category saved" : "Category added")
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }

  const setOpen = (open: boolean) => {
    if (!open) onClose()
  }

  return (
    <>
      {unsaved.warning}
      <Dialog open onOpenChange={unsaved.guard(setOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit category" : "Add category"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-6">
            <DialogDescription>
              The name is what people choose when they raise a complaint.
            </DialogDescription>
            <FormError message={error} />
            <form
              id="category-form"
              noValidate
              className="flex flex-col gap-6"
              onSubmit={(event) => {
                event.preventDefault()
                if (!saving) void save()
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="category-name" required>
                  Name
                </Label>
                <Input
                  id="category-name"
                  value={values.name}
                  autoFocus
                  aria-invalid={Boolean(nameError) || undefined}
                  onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                  onBlur={() => setNameError(checkName())}
                />
                <InlineFieldError>{nameError}</InlineFieldError>
              </div>

              {isEdit ? (
                <div className="flex items-start gap-3">
                  <Switch
                    id="category-active"
                    checked={values.isActive}
                    onCheckedChange={(checked: boolean) => setValues((v) => ({ ...v, isActive: checked }))}
                  />
                  <div className="min-w-0">
                    <Label htmlFor="category-active">Active</Label>
                    <p className="mt-1 text-label text-text-secondary">
                      An inactive category stays on existing complaints but is not offered for new ones.
                    </p>
                  </div>
                </div>
              ) : null}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => unsaved.guard(setOpen)(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="category-form" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save category" : "Add category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
