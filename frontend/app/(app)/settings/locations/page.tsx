"use client"

import * as React from "react"

import {
  api,
  query,
  type Designation,
  type ListResponse,
  type Location,
  type Matchable,
  type Person,
} from "@/lib/api"
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
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Switch } from "@/components/ui/switch"
import { Truncate } from "@/components/ui/truncate"
import type { ExportColumn } from "@/lib/pdf-export"
import { FormError } from "@/components/forms/form-error"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"
import { useOptions } from "../_shared/use-options"

/**
 * The locations master (CONTRACT §2), platform admin only. It replaces
 * the old site locations screen: a location is where sites are AND
 * where complaints are raised, and its supervisor and manager are who a
 * complaint raised there goes to.
 *
 * A location with no supervisor is flagged in its row, because a
 * complaint raised there would reach nobody and the raise is refused.
 */
const NONE = "__none__"

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
    { header: "Supervisor", cell: (row) => row.supervisor?.name ?? "No supervisor" },
    { header: "Manager", cell: (row) => row.manager?.name ?? "—" },
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
        description="Where sites are, and where complaints are raised. Each location's supervisor receives its complaints; its manager is copied."
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
            key: "supervisor",
            label: "Supervisor",
            render: (row) =>
              row.supervisor ? (
                <Truncate>{row.supervisor.name}</Truncate>
              ) : (
                /* Section 2.4: "Needs review" is warning. Complaints
                   raised here are refused until someone is assigned. */
                <Badge variant="warning">No supervisor</Badge>
              ),
          },
          {
            key: "manager",
            label: "Manager",
            priority: "tertiary",
            render: (row) => <Truncate>{row.manager?.name ?? "—"}</Truncate>,
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
            key: "userCount",
            label: "People",
            numeric: true,
            priority: "secondary",
            className: "w-col-count",
            render: (row) => formatNumber(row.userCount),
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
         * (§15.2): sites, people assigned to it, complaints raised
         * there. Said before the click, with deactivation as the way
         * forward (§15.1).
         */
        deleteBlocked={(row) => {
          const parts: string[] = []
          if (row.siteCount > 0) {
            parts.push(`${formatNumber(row.siteCount)} ${row.siteCount === 1 ? "site" : "sites"}`)
          }
          if (row.userCount > 0) {
            parts.push(
              `${formatNumber(row.userCount)} ${row.userCount === 1 ? "person" : "people"}`,
            )
          }
          if (row.complaintCount > 0) {
            parts.push(
              `${formatNumber(row.complaintCount)} ${row.complaintCount === 1 ? "complaint" : "complaints"}`,
            )
          }
          if (parts.length === 0) return null
          const uses = `${row.name} has ${parts.join(", ")}, so it cannot be deleted.`
          return row.isActive
            ? `${uses} Deactivating it keeps them as they are and stops it being offered for new sites and complaints.`
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
            No site, person or complaint uses this location, so nothing else
            changes. Removing it cannot be undone.
          </>
        )}
        emptyHeading="No locations yet"
        emptyBody="Locations are where sites are and where complaints are raised."
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

/**
 * People holding one seeded designation, as picker options. The
 * designation is found by its seed key, never its name, because an
 * administrator may rename "Supervisor".
 */
function usePeopleWithDesignation(
  designations: Designation[] | null,
  seedKey: "supervisor" | "manager",
) {
  const designation = designations?.find((d) => d.seedKey === seedKey) ?? null
  const people = useOptions<Person>(
    designation ? "/users" : null,
    designation ? { designationId: designation.id, sort: "name", direction: "asc" } : {},
  )
  return { designation, people: designation ? people.rows : designations ? [] : null }
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
  const [supervisorId, setSupervisorId] = React.useState(location?.supervisor?.id ?? NONE)
  const [managerId, setManagerId] = React.useState(location?.manager?.id ?? NONE)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  /**
   * Adding is two calls (create, then assign). If the assignment is
   * refused, the location already exists, so a second Save must not
   * create it again.
   */
  const [createdId, setCreatedId] = React.useState<string | null>(null)

  const designations = useOptions<Designation>("/designations")
  const supervisors = usePeopleWithDesignation(designations.rows, "supervisor")
  const managers = usePeopleWithDesignation(designations.rows, "manager")

  function options(
    people: Person[] | null,
    current: { id: string; name: string } | null | undefined,
    noneLabel: string,
  ): Record<string, string> {
    const out: Record<string, string> = { [NONE]: noneLabel }
    // The current holder stays choosable even before the list lands.
    if (current) out[current.id] = current.name
    for (const person of people ?? []) out[person.id] = person.name
    return out
  }

  async function save() {
    if (name.trim() === "") {
      setFieldError("Enter the location name")
      return
    }
    setSaving(true)
    setError(null)
    try {
      let id = location?.id ?? createdId
      if (id) {
        await api.patch(`/locations/${id}`, { name: name.trim(), ...(isEdit ? { isActive } : {}) })
      } else {
        const created = await api.post<Location>("/locations", { name: name.trim() })
        id = created.id
        setCreatedId(created.id)
      }
      const nextSupervisor = supervisorId === NONE ? null : supervisorId
      const nextManager = managerId === NONE ? null : managerId
      if (
        nextSupervisor !== (location?.supervisor?.id ?? null) ||
        nextManager !== (location?.manager?.id ?? null)
      ) {
        await api.put(`/locations/${id}/assignments`, {
          supervisorId: nextSupervisor,
          managerId: nextManager,
        })
      }
      toast.success(isEdit ? "Location saved" : "Location added")
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const loadingPeople = designations.rows === null && designations.error === null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-dialog-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit location" : "Add location"}</DialogTitle>
          <DialogDescription>
            Complaints raised here go to its supervisor, with its manager copied.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-6">
          <FormError message={error ?? designations.error} />

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

          <div className="flex flex-col gap-2">
            <Label htmlFor="location-supervisor">Supervisor</Label>
            <SearchableSelect
              id="location-supervisor"
              className="max-w-field-max"
              options={options(supervisors.people, location?.supervisor, "No supervisor")}
              value={supervisorId}
              onValueChange={setSupervisorId}
              disabled={loadingPeople}
              placeholder={loadingPeople ? "Loading people" : "Choose a supervisor"}
              searchPlaceholder="Search supervisors"
              emptyMessage="No one with the Supervisor designation matches."
            />
            <p className="text-label text-text-secondary">
              {supervisorId === NONE
                ? "Without a supervisor, complaints cannot be raised here."
                : "Only people whose designation is Supervisor are listed. A location has one."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="location-manager">Manager</Label>
            <SearchableSelect
              id="location-manager"
              className="max-w-field-max"
              options={options(managers.people, location?.manager, "No manager")}
              value={managerId}
              onValueChange={setManagerId}
              disabled={loadingPeople}
              placeholder={loadingPeople ? "Loading people" : "Choose a manager"}
              searchPlaceholder="Search managers"
              emptyMessage="No one with the Manager designation matches."
            />
            <p className="text-label text-text-secondary">
              Only people whose designation is Manager are listed. Without one,
              the supervisor&apos;s own manager is copied.
            </p>
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
                  offered for new ones.
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
