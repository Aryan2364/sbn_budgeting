"use client"

import * as React from "react"
import Link from "next/link"
import { CopyIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"

import { accessApi, ACCESS_PATHS, isBlocked, type RoleRow } from "@/lib/access-api"
import { formatNumber } from "@/lib/format"
import { reasonFor, usePermissions } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { TextLink } from "@/components/ui/text-link"
import { toast } from "@/components/ui/sonner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DeleteRecordDialog } from "@/components/forms/delete-record-dialog"
import { RecordList, type RecordColumn } from "@/components/templates/record-list"
import { AccessHeaderActions, AccessHeaderMeta } from "../access-header"

/**
 * Kit 40.2: the Roles tab. A list page (11.1) under the Access header and
 * section tabs, which the layout draws.
 *
 * Columns: Name (a link to the editor, truncating), People (active
 * holders, col-count, a link to the People tab filtered to the role;
 * "0" is not a link), row actions (Edit, Duplicate, Delete). No status
 * column and no Type column (R12, 40.2 rule 3): add-on roles start with
 * "+", and the server sorts job roles first, then add-on roles, each
 * alphabetical (rule 4).
 *
 * Every answer about a row comes from the server (kit 26.5): `can.edit`
 * and `can.delete` are true or the sentence why not. The system role's
 * Edit and Delete carry "This role always holds every permission and
 * cannot be changed.", and its row opens the editor read-only (rule 7).
 * Delete is disabled while anyone holds the role, with "3 people have
 * this role. Remove it from them before deleting it." (rule 6, 15.1).
 */
export default function RolesPage() {
  const { refresh, can } = usePermissions()
  // Kit 26.1: enabled only on a definite yes; disabled without a reason
  // while not known, and it never moves when the answer lands.
  const canManage = can("access.rights.manage")
  const [total, setTotal] = React.useState<number | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [deleting, setDeleting] = React.useState<RoleRow | null>(null)

  const load = React.useCallback(
    (params: { page: number; search: string; sort: string; direction: "asc" | "desc"; pageSize?: number }) =>
      accessApi.listRoles(params),
    [],
  )

  const columns: RecordColumn<RoleRow>[] = [
    { key: "name", label: "Name", sortKey: "name", render: (row) => row.name },
    {
      key: "people",
      label: "People",
      numeric: true,
      width: "count",
      sortKey: "people",
      render: (row) =>
        // 40.2 rule 2: zero is written "0" and is not a link.
        row.people === 0 ? (
          "0"
        ) : (
          <TextLink render={<Link href={ACCESS_PATHS.peopleWithRole(row.id)} />} className="tabular-nums">
            {formatNumber(row.people)}
          </TextLink>
        ),
    },
    {
      key: "actions",
      label: "",
      width: "actions",
      render: (row) => <RoleActions row={row} onDelete={() => setDeleting(row)} />,
    },
  ]

  return (
    <>
      <AccessHeaderMeta>
        {total === null ? "Loading records" : `${formatNumber(total)} ${total === 1 ? "role" : "roles"}`}
      </AccessHeaderMeta>
      <AccessHeaderActions>
        {/* 40.2 rule 9: Add role is the page's one primary button. */}
        <PermissionTooltip allowed={canManage} reason={reasonFor("access.rights.manage")}>
          {canManage === true ? (
            <Button render={<Link href={ACCESS_PATHS.newRole} />}>
              <PlusIcon />
              Add role
            </Button>
          ) : (
            <Button disabled>
              <PlusIcon />
              Add role
            </Button>
          )}
        </PermissionTooltip>
      </AccessHeaderActions>

      <RecordList<RoleRow>
        headerless
        title="Roles"
        countLabel={(n) => `${formatNumber(n)} ${n === 1 ? "role" : "roles"}`}
        searchLabel="Search roles"
        searchPlaceholder="Search roles"
        createHref={ACCESS_PATHS.newRole}
        createLabel="Add role"
        createAllowed={{ allowed: canManage, reason: reasonFor("access.rights.manage") }}
        defaultSort="name"
        defaultDirection="asc"
        columns={columns}
        rowHref={(row) => ACCESS_PATHS.role(row.id)}
        load={load}
        refreshKey={refreshKey}
        onResult={({ total: n }) => setTotal(n)}
        emptyHeading="No roles yet"
        emptyBody="A role is a named set of permissions. Add one, then give it to people on the People tab."
      />

      {deleting ? (
        <DeleteRecordDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          recordName={deleting.name}
          what="role"
          consequences="Nobody holds this role, so nobody loses access. The access history keeps its name."
          onConfirm={async () => {
            try {
              await accessApi.deleteRole(deleting.id)
            } catch (caught) {
              // 40.11 rule 3's pattern: someone was given it since the list
              // loaded. Say why, and reload the list behind the dialog.
              if (isBlocked(caught)) setRefreshKey((k) => k + 1)
              throw caught
            }
          }}
          onDeleted={() => {
            toast.success(`${deleting.name} deleted`)
            setDeleting(null)
            setRefreshKey((k) => k + 1)
            // Kit 26.4 rule 2: a save on the access screens refreshes permissions.
            refresh()
          }}
        />
      ) : null}
    </>
  )
}

/** The row's three-dot menu (40.2 rule 5): Edit, Duplicate, Delete. */
function RoleActions({ row, onDelete }: { row: RoleRow; onDelete: () => void }) {
  const edit = row.can.edit
  const remove = row.can.delete
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" aria-label={`More actions for ${row.name}`} />}
              />
            }
          >
            <MoreHorizontalIcon />
          </TooltipTrigger>
          <TooltipContent side="bottom">More actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <PermissionTooltip allowed={edit === true} reason={typeof edit === "string" ? edit : ""}>
              {edit === true ? (
                <DropdownMenuItem render={<Link href={ACCESS_PATHS.role(row.id)} />}>
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
              )}
            </PermissionTooltip>
            <DropdownMenuItem render={<Link href={ACCESS_PATHS.duplicateRole(row.id)} />}>
              <CopyIcon />
              Duplicate
            </DropdownMenuItem>
            <PermissionTooltip allowed={remove === true} reason={typeof remove === "string" ? remove : ""}>
              <DropdownMenuItem variant="danger" disabled={remove !== true} onClick={onDelete}>
                <TrashIcon />
                Delete
              </DropdownMenuItem>
            </PermissionTooltip>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
