"use client"

import * as React from "react"

import { api, query, type Designation, type ListResponse, type Matchable } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import {
  categoriesApi,
  fetchAllPages,
  type ComplaintCategory,
  type ComplaintCategoryBody,
} from "@/lib/complaints-api"
import type { ExportColumn } from "@/lib/pdf-export"
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
import { isChanged, useUnsavedChanges } from "@/components/ui/unsaved-changes"
import { FormError } from "@/components/forms/form-error"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"
import { Choice } from "@/components/complaints/choice"

/**
 * Settings → Complaint categories (CONTRACT §3, plan 3.5). The
 * cost-heads pattern: a paged master list, one Add/Edit dialog
 * (section 4 rule 1), and a delete checked before it is offered.
 *
 * Each category says whether closing a complaint in it needs approval,
 * and from which designation (HOD when none is chosen — the server's
 * default). A category that complaints already use is deactivated,
 * never deleted (15.2): its delete is disabled with the reason, or,
 * while it is still active, opens the explanation with Deactivate as
 * its action.
 */
export default function ComplaintCategoriesSettingsPage() {
  const { can } = useSession()
  const canEdit = can.complaints === "admin"

  const load = React.useCallback(
    (page: number) =>
      categoriesApi.list({ page, pageSize: MASTER_PAGE_SIZE, sort: "sortOrder", direction: "asc" }),
    [],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } = useMasterRows(load)

  const [editing, setEditing] = React.useState<ComplaintCategory | null>(null)
  const [creating, setCreating] = React.useState(false)

  const exportFetchPage = React.useCallback(
    (exportPage: number, pageSize: number) =>
      categoriesApi.list({ page: exportPage, pageSize, sort: "sortOrder", direction: "asc" }),
    [],
  )
  const exportColumns: ExportColumn<ComplaintCategory>[] = [
    {
      header: "#",
      cell: (row) => formatNumber(row.sortOrder),
      numeric: true,
      excelValue: (row) => row.sortOrder,
    },
    { header: "Name", cell: (row) => row.name },
    { header: "Approval", cell: (row) => approvalText(row) },
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
        description="Every complaint is raised in a category. The category decides whether closing it needs someone's approval."
        createLabel="Add category"
        canEdit={canEdit}
        cannotEditReason="Only a complaints administrator can change complaint categories"
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
          {
            key: "sortOrder",
            label: "#",
            numeric: true,
            className: "w-col-count",
            render: (row) => formatNumber(row.sortOrder),
          },
          { key: "name", label: "Name", render: (row) => <Truncate>{row.name}</Truncate> },
          {
            key: "approval",
            label: "Approval",
            render: (row) => <Truncate>{approvalText(row)}</Truncate>,
          },
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
                  await categoriesApi.update(row.id, {
                    name: row.name,
                    isActive: false,
                    requiresApproval: row.requiresApproval,
                    approverDesignationId: row.approverDesignation?.id ?? null,
                  })
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

function approvalText(row: ComplaintCategory): string {
  return row.requiresApproval
    ? `Needs approval by ${row.approverDesignation?.name ?? "HOD"}`
    : "No approval needed"
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
      sortOrder: category ? String(category.sortOrder) : "",
      isActive: category?.isActive ?? true,
      requiresApproval: category?.requiresApproval ?? true,
      approverDesignationId: category?.approverDesignation?.id ?? "",
    }),
    [category],
  )
  const [values, setValues] = React.useState(saved)
  const [designations, setDesignations] = React.useState<Designation[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [orderError, setOrderError] = React.useState<string | null>(null)

  const unsaved = useUnsavedChanges({ changed: isChanged(values, saved) && !saving, noun: "category" })

  React.useEffect(() => {
    let cancelled = false
    fetchAllPages((page) =>
      api.get<ListResponse<Designation>>(
        `/designations${query({ page, pageSize: 100, sort: "sortOrder", direction: "asc" })}`,
      ),
    )
      .then((rows) => {
        if (!cancelled) setDesignations(rows)
      })
      .catch(() => {
        if (!cancelled) setDesignations([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The default approver, shown rather than left blank, so "HOD unless
  // changed" is visible on the form.
  const hod = designations?.find((d) => d.seedKey === "hod")
  const approverId = values.approverDesignationId || hod?.id || ""
  const approverOptions = (designations ?? [])
    .filter((d) => d.isActive || d.id === approverId)
    .map((d) => ({ value: d.id, label: d.name }))

  const checkName = (name = values.name) => (name.trim() ? null : "Enter the category name")
  const checkOrder = (text = values.sortOrder) =>
    text.trim() === "" || /^\d+$/.test(text.trim())
      ? null
      : "Enter a whole number, like 10, or leave it blank"

  async function save() {
    const n = checkName()
    const o = checkOrder()
    setNameError(n)
    setOrderError(o)
    if (n) return document.getElementById("category-name")?.focus()
    if (o) return document.getElementById("category-order")?.focus()

    const body: ComplaintCategoryBody = {
      name: values.name.trim(),
      requiresApproval: values.requiresApproval,
      approverDesignationId: values.requiresApproval ? approverId || null : null,
      ...(values.sortOrder.trim() ? { sortOrder: Number(values.sortOrder.trim()) } : {}),
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="category-order">Order in lists</Label>
                <Input
                  id="category-order"
                  inputMode="numeric"
                  value={values.sortOrder}
                  aria-invalid={Boolean(orderError) || undefined}
                  onChange={(e) => setValues((v) => ({ ...v, sortOrder: e.target.value }))}
                  onBlur={() => setOrderError(checkOrder())}
                  className="w-field-min text-right"
                />
                {orderError ? null : (
                  <p className="text-label text-text-secondary">Lower numbers are listed first.</p>
                )}
                <InlineFieldError>{orderError}</InlineFieldError>
              </div>

              <div className="flex items-start gap-3">
                <Switch
                  id="category-approval"
                  checked={values.requiresApproval}
                  onCheckedChange={(checked: boolean) =>
                    setValues((v) => ({ ...v, requiresApproval: checked }))
                  }
                />
                <div className="min-w-0">
                  <Label htmlFor="category-approval">Closing needs approval</Label>
                  <p className="mt-1 text-label text-text-secondary">
                    {values.requiresApproval
                      ? "When the supervisor resolves a complaint, it waits for the approver below before it closes."
                      : "The supervisor's resolve closes the complaint straight away."}
                  </p>
                </div>
              </div>

              {values.requiresApproval ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="category-approver" required>
                    Approved by
                  </Label>
                  <Choice
                    id="category-approver"
                    options={approverOptions}
                    value={approverId}
                    onValueChange={(v) => setValues((s) => ({ ...s, approverDesignationId: v }))}
                    placeholder={designations === null ? "Loading designations" : "Choose a designation"}
                    searchPlaceholder="Search designations"
                    disabled={designations === null}
                  />
                  <p className="text-label text-text-secondary">
                    The first person with this designation above the supervisor approves it.
                  </p>
                </div>
              ) : null}

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
