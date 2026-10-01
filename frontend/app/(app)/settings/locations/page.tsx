"use client"

import * as React from "react"

import { api, query, type ListResponse, type Location, type Matchable } from "@/lib/api"
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
 * The locations master (CONTRACT §2), platform admin only. It replaces
 * the old site locations screen: a location is a place where sites
 * are. Complaints are filed against a site and go to the site's
 * supervisor (CONTRACT §10), so nothing here routes complaints, and
 * people no longer belong to a location. The row's `userCount`,
 * `supervisor` and `manager` are not read, so the screen works whether
 * or not the API still sends them.
 */

export default function LocationsSettingsPage() {
  const { can } = useSession()
  const canEdit = can.platformAdmin

  const load = React.useCallback(
    (page: number) =>
      api.get<ListResponse<Location & Matchable>>(
        `/locations${query({ page, pageSize: MASTER_PAGE_SIZE, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } =
    useMasterRows(load)

  const [editing, setEditing] = React.useState<Location | null>(null)
  const [creating, setCreating] = React.useState(false)

  const exportFetchPage = React.useCallback(
    async (exportPage: number, pageSize: number) =>
      api.get<ListResponse<Location & Matchable>>(
        `/locations${query({ page: exportPage, pageSize, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const exportColumns: ExportColumn<Location>[] = [
    { header: "Name", cell: (row) => row.name },
    {
      header: "Sites",
      cell: (row) => formatNumber(row.siteCount),
      numeric: true,
      excelValue: (row) => row.siteCount,
    },
    { header: "Status", cell: (row) => (row.isActive ? "Active" : "Inactive") },
  ]

  return (
    <>
      <MasterSection
        title="Locations"
        description="The places where sites are."
        createLabel="Add location"
        canEdit={canEdit}
        cannotEditReason="Only a platform administrator can change locations"
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        tableClassName="table-fixed"
        exportList={{
          title: "Locations",
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
            key: "siteCount",
            label: "Sites",
            numeric: true,
            priority: "secondary",
            className: "w-col-count",
            render: (row) => formatNumber(row.siteCount),
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
        onDelete={(row) => api.delete(`/locations/${row.id}`)}
        deleteWhat="location"
        deleteName={(row) => row.name}
        /*
         * The server refuses while anything points at the location
         * (§15.2): its sites, and complaints raised there before
         * complaints were filed by site. Said before the click, with
         * deactivation as the way forward (§15.1).
         */
        deleteBlocked={(row) => {
          const parts: string[] = []
          if (row.siteCount > 0) {
            parts.push(`${formatNumber(row.siteCount)} ${row.siteCount === 1 ? "site" : "sites"}`)
          }
          if (row.complaintCount > 0) {
            parts.push(
              `${formatNumber(row.complaintCount)} ${row.complaintCount === 1 ? "complaint" : "complaints"}`,
            )
          }
          if (parts.length === 0) return null
          const uses = `${row.name} has ${parts.join(", ")}, so it cannot be deleted.`
          return row.isActive
            ? `${uses} Deactivating it keeps them as they are and stops it being offered for new sites.`
            : `${uses} It is already inactive, so nothing further is needed.`
        }}
        deleteAlternative={(row) =>
          row.isActive
            ? {
                label: "Deactivate location",
                run: async () => {
                  await api.patch(`/locations/${row.id}`, {
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
            No site or complaint uses this location, so nothing else changes.
            Removing it cannot be undone.
          </>
        )}
        emptyHeading="No locations yet"
        emptyBody="Locations are the places where sites are. Add one to start."
        onChanged={refresh}
      />

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
  location: Location | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = location !== null
  const [name, setName] = React.useState(location?.name ?? "")
  const [isActive, setIsActive] = React.useState(location?.isActive ?? true)
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
      if (location) {
        await api.patch(`/locations/${location.id}`, { name: name.trim(), isActive })
      } else {
        await api.post<Location>("/locations", { name: name.trim() })
      }
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
      <DialogContent className="max-w-dialog-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit location" : "Add location"}</DialogTitle>
          <DialogDescription>
            A location is a place where sites are.
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

          {isEdit ? (
            <div className="flex items-start gap-3">
              <Switch
                id="location-active"
                checked={isActive}
                onCheckedChange={(checked: boolean) => setIsActive(checked)}
              />
              <div className="min-w-0">
                <Label htmlFor="location-active">Active</Label>
                <p className="mt-1 text-label text-text-secondary">
                  An inactive location keeps its sites and complaints but is not
                  offered for new sites.
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
            {saving ? "Saving…" : isEdit ? "Save location" : "Add location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
