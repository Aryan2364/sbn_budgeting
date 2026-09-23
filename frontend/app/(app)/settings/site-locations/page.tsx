"use client"

import * as React from "react"

import { api, query, type ListResponse, type Matchable, type SiteLocation } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
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
import { Truncate } from "@/components/ui/truncate"
import type { ExportColumn } from "@/lib/pdf-export"
import { FormError } from "@/components/forms/form-error"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"

/** Section 11.5. The site locations master, admin only (section 26). */
export default function SiteLocationsSettingsPage() {
  const { isAdmin } = useSession()

  const load = React.useCallback(
    (page: number) =>
      api.get<ListResponse<SiteLocation & Matchable>>(
        `/site-locations${query({ page, pageSize: MASTER_PAGE_SIZE, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } =
    useMasterRows(load)

  const [editing, setEditing] = React.useState<SiteLocation | null>(null)
  const [creating, setCreating] = React.useState(false)

  /**
   * Mirrors the on-screen columns exactly. Fetches EVERY row, not the
   * page on screen: `ExportButton`'s own paging loop pages this at
   * pageSize=100 until every matching row has been collected.
   */
  const exportFetchPage = React.useCallback(
    async (exportPage: number, pageSize: number) =>
      api.get<ListResponse<SiteLocation & Matchable>>(
        `/site-locations${query({ page: exportPage, pageSize, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const exportColumns: ExportColumn<SiteLocation>[] = [
    { header: "Location", cell: (row) => row.name },
    {
      header: "Sites",
      cell: (row) => formatNumber(row.siteCount),
      numeric: true,
      excelValue: (row) => row.siteCount,
    },
  ]

  return (
    <>
      <MasterSection
        title="Site locations"
        description="The list a site's location is chosen from."
        createLabel="New location"
        canEdit={isAdmin}
        cannotEditReason="Only an administrator can change site locations"
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        exportList={{
          title: "Site locations",
          columns: exportColumns,
          fetchPage: exportFetchPage,
        }}
        columns={[
          {
            key: "name",
            label: "Location",
            render: (row) => <Truncate>{row.name}</Truncate>,
          },
          {
            key: "siteCount",
            priority: "secondary",
            label: "Sites",
            numeric: true,
            render: (row) => formatNumber(row.siteCount),
          },
        ]}
        onCreate={() => setCreating(true)}
        onEdit={(row) => setEditing(row)}
        onDelete={(row) => api.delete(`/site-locations/${row.id}`)}
        deleteWhat="location"
        deleteName={(row) => row.name}
        /*
         * Checked BEFORE the dialog opens, off the count the list
         * already carries. The server refuses while a site points here,
         * and there is no alternative to offer — a location is not
         * deactivatable, and the fix is on the sites — so the control
         * is disabled and this sentence is its tooltip (§26), rather
         * than a dialog whose only outcome is "no".
         */
        deleteBlocked={(row) =>
          row.siteCount > 0
            ? `${formatNumber(row.siteCount)} ${
                row.siteCount === 1 ? "site uses" : "sites use"
              } this location. Change ${
                row.siteCount === 1 ? "that site's" : "those sites'"
              } location first.`
            : null
        }
        /* §15 rule 2, and only ever read on a location no site uses. */
        deleteConsequences={() => (
          <>No sites use this location. Removing it cannot be undone.</>
        )}
        emptyHeading="No locations yet"
        emptyBody="A location is where a site physically is. Sites can be created without one."
        onChanged={refresh}
      />

      {/* Mounted only while open and keyed by record, so its fields
          start with the right values. Syncing props into state in an
          effect renders the previous record's values once first. */}
      {creating || editing !== null ? (
      <LocationDialog
        key={editing?.id ?? "new"}
        open
        location={editing}
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
function LocationDialog({
  open,
  location,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  location: SiteLocation | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = location !== null
  const [name, setName] = React.useState(location?.name ?? "")
  /* No effect syncs these: the dialog is keyed by record and mounted
     only while open, so a fresh mount already has the right values. */
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<string | null>(null)


  async function save() {
    if (name.trim() === "") {
      setFieldError("Enter the location name")
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) await api.patch(`/site-locations/${location.id}`, { name })
      else await api.post("/site-locations", { name })
      toast.success(isEdit ? "Location saved" : "Location added")
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
          <DialogTitle>{isEdit ? "Edit location" : "New location"}</DialogTitle>
          <DialogDescription>
            Locations are shared across every project.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-6">
          <FormError message={error} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="location-name" required>
              Name
            </Label>
            <Input
              id="location-name"
              value={name}
              aria-invalid={Boolean(fieldError) || undefined}
              onChange={(event) => setName(event.target.value)}
              onBlur={() =>
                setFieldError(name.trim() === "" ? "Enter the location name" : null)
              }
            />
            <InlineFieldError>{fieldError}</InlineFieldError>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save location" : "Add location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
