"use client"

import * as React from "react"

import { api, query, type ListResponse, type Matchable, type SiteLocation } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
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
import { Truncate } from "@/components/ui/truncate"
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

  return (
    <>
      <MasterSection
        title="Site locations"
        description="The list a site's location is chosen from."
        createLabel="New location"
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
        deleteConsequences={(row) =>
          row.siteCount > 0 ? (
            <>
              {formatNumber(row.siteCount)}{" "}
              {row.siteCount === 1 ? "site uses" : "sites use"} this location.
              Change {row.siteCount === 1 ? "it" : "them"} first — the location
              cannot be removed while it is in use.
            </>
          ) : (
            <>No sites use this location. Removing it cannot be undone.</>
          )
        }
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

        <div className="flex flex-col gap-6 px-4">
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
        </div>

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
