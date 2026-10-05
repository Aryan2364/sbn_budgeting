"use client"

import * as React from "react"
import Link from "next/link"
import { FileSpreadsheetIcon, FunnelIcon } from "lucide-react"

import {
  api,
  ApiError,
  pick,
  query,
  type DesignationPick,
  type ListResponse,
  type Matchable,
  type Person,
  type PersonPick,
  type PersonBody,
} from "@/lib/api"
import { reasonFor, useCan, usePermissions } from "@/lib/permissions"
import { ACCESS_PATHS, accessApi, byRoleOrder, type Named } from "@/lib/access-api"
import { useAnswer } from "@/components/access/url-list"
import { formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Count } from "@/components/ui/badge"
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
import { PasswordInput } from "@/components/ui/password-input"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import { SearchableSelect, type SearchOption } from "@/components/ui/searchable-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Truncate } from "@/components/ui/truncate"
import { isChanged, useUnsavedChanges } from "@/components/ui/unsaved-changes"
import { MultiSelect } from "@/components/ui/multi-select"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { TextLink } from "@/components/ui/text-link"
import type { ExportColumn } from "@/lib/pdf-export"
import { FormError } from "@/components/forms/form-error"
import { FilterChip } from "@/components/forms/expense-filter"
import { ListSearch } from "@/components/templates/list-page"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"

/**
 * The rows of one Pick, for a picker on this screen (access plan P7
 * inventory 11 and 12). `load` null means "not yet": nothing is asked
 * and the rows stay null. A Pick answers whole, at most 50 rows, so
 * there is no paging loop here.
 */
function usePickRows<T>(load: (() => Promise<T[]>) | null): {
  rows: T[] | null
  error: string | null
} {
  const [state, setState] = React.useState<{ rows: T[] | null; error: string | null }>({
    rows: null,
    error: null,
  })
  React.useEffect(() => {
    if (!load) return
    let cancelled = false
    load()
      .then((rows) => {
        if (!cancelled) setState({ rows, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState({ rows: null, error: errorMessage(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [load])
  return state
}

// Retired designations too: the filter finds people who still hold one,
// and the form shows a person's current one (it offers active ones).
const loadDesignations = () => pick.designations({ includeInactive: true })

/**
 * The people master (CONTRACT §2), platform admin only.
 *
 * ONE list of people. Office staff sign in; a supervisor in the field
 * may sign in by phone; a manager named on a site may never sign in at
 * all. What each person is (designation) and who they report to live
 * here, and so do their roles, for someone who manages access (owner
 * request, 5 Oct 2026; a departure from kit 40.6 rule 9 recorded in
 * KIT-PENDING-person-roles.md). Selected sites stay on the Access
 * screens, which this dialog links to. The old per-module selects are
 * gone with the compatibility shim they fed.
 *
 * People have no locations (removed 1 Oct 2026, user decision):
 * complaints route by the budget site, which names its own supervisor
 * and manager.
 */

interface PeopleFilters {
  designationId?: string
  canLogin?: "true" | "false"
}

const SIGN_IN_LABEL = { true: "Signs in", false: "Does not sign in" } as const

export default function PeopleSettingsPage() {
  const { user } = useSession()
  const canCreate = useCan("platform.people.create")
  const canEdit = useCan("platform.people.edit")
  const canDelete = useCan("platform.people.delete")

  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<PeopleFilters>({})

  const designations = usePickRows(loadDesignations)

  const load = React.useCallback(
    (page: number) =>
      api.get<ListResponse<Person & Matchable>>(
        `/users${query({
          page,
          pageSize: MASTER_PAGE_SIZE,
          sort: "name",
          direction: "asc",
          search,
          ...filters,
        })}`,
      ),
    [search, filters],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } =
    useMasterRows(load)

  // Section 27.1: search runs 300ms after the user stops typing.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput.trim() !== search) {
        setSearch(searchInput.trim())
        setPage(1)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, search, setPage])

  function applyFilters(next: PeopleFilters) {
    setFilters(next)
    setPage(1)
  }

  const [editing, setEditing] = React.useState<Person | null>(null)
  const [creating, setCreating] = React.useState(false)

  const exportFetchPage = React.useCallback(
    async (exportPage: number, pageSize: number) =>
      api.get<ListResponse<Person & Matchable>>(
        `/users${query({ page: exportPage, pageSize, sort: "name", direction: "asc", search, ...filters })}`,
      ),
    [search, filters],
  )
  const exportColumns: ExportColumn<Person>[] = [
    { header: "Name", cell: (row) => row.name },
    { header: "Phone", cell: (row) => row.phone ?? "—", excelValue: (row) => row.phone ?? null },
    { header: "Email", cell: (row) => row.email ?? "—", excelValue: (row) => row.email ?? null },
    { header: "Designation", cell: (row) => row.designation?.name ?? "—" },
    { header: "Reports to", cell: (row) => row.reportsTo?.name ?? "—" },
    { header: "Signs in", cell: (row) => (row.canLogin ? "Yes" : "No") },
  ]

  const designationName = (id: string) =>
    designations.rows?.find((d) => d.id === id)?.name ?? "Designation"

  const activeFilterCount = Object.values(filters).filter(Boolean).length
  const filtered = activeFilterCount > 0 || search !== ""

  const toolbar = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch
          label="Search people"
          placeholder="Search people"
          title="Searches name, phone, email, designation and reports to"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onClear={() => setSearchInput("")}
        />
        <PeopleFilterButton
          filters={filters}
          onApply={applyFilters}
          designations={designations.rows}
        />
        {!loading && rows !== null && filtered ? (
          <span className="text-label text-text-secondary">
            {formatNumber(total)} {total === 1 ? "result" : "results"}
          </span>
        ) : null}
        <div className="ml-auto">
          <PermissionTooltip
            allowed={canCreate}
            reason={reasonFor("platform.people.create")}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={canCreate !== true}
              nativeButton={false}
              render={<Link href="/settings/people/import" />}
            >
              <FileSpreadsheetIcon />
              Import from Excel
            </Button>
          </PermissionTooltip>
        </div>
      </div>

      {/* Section 27.3: active filters as removable chips, and Clear all. */}
      {activeFilterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.designationId ? (
            <FilterChip
              label={`Designation: ${designationName(filters.designationId)}`}
              onRemove={() => applyFilters({ ...filters, designationId: undefined })}
            />
          ) : null}
          {filters.canLogin ? (
            <FilterChip
              label={SIGN_IN_LABEL[filters.canLogin]}
              onRemove={() => applyFilters({ ...filters, canLogin: undefined })}
            />
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => applyFilters({})}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  )

  return (
    <>
      <MasterSection
        title="People"
        description="Everyone in the organisation: what they are and who they report to. What they can do is set under Access."
        createLabel="Add person"
        canEdit={canEdit}
        cannotEditReason={reasonFor("platform.people.edit")}
        canCreate={canCreate}
        cannotCreateReason={reasonFor("platform.people.create")}
        canDelete={canDelete}
        cannotDeleteReason={reasonFor("platform.people.delete")}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        toolbar={toolbar}
        tableClassName="table-fixed"
        filtered={filtered}
        onClearFilters={() => {
          setSearchInput("")
          setSearch("")
          applyFilters({})
        }}
        nothingFoundHeading={search ? `No people match "${search}"` : "No people match these filters"}
        exportList={{
          title: "People",
          columns: exportColumns,
          fetchPage: exportFetchPage,
        }}
        columns={[
          {
            key: "name",
            label: "Name",
            // Proportional (9 rule 2): the name leads, so it gets the
            // largest share of a fixed-layout table.
            className: "w-1/4",
            render: (row) => (
              <div className="min-w-0">
                <Truncate>{row.name}</Truncate>
                <span className="block min-w-0 text-meta text-text-muted">
                  <Truncate>{row.phone ?? row.email ?? "No phone or email"}</Truncate>
                </span>
              </div>
            ),
          },
          {
            // Designation and who they report to, as one two-line cell
            // like Name: at 1024 to 1279 four separate text columns
            // truncate to a few letters each.
            key: "designation",
            label: "Designation",
            render: (row) => (
              <div className="min-w-0">
                <Truncate>{row.designation?.name ?? "—"}</Truncate>
                <span className="block min-w-0 text-meta text-text-muted">
                  <Truncate>
                    {row.reportsTo ? `Reports to ${row.reportsTo.name}` : "Reports to no one"}
                  </Truncate>
                </span>
              </div>
            ),
          },
          {
            key: "canLogin",
            label: "Signs in",
            className: "hidden w-col-count xl:table-cell",
            render: (row) => (row.canLogin ? "Yes" : "No"),
          },
        ]}
        onCreate={() => setCreating(true)}
        onEdit={(row) => setEditing(row)}
        onDelete={(row) => api.delete(`/users/${row.id}`)}
        deleteWhat="person"
        deleteName={(row) => row.name}
        /*
         * Checked BEFORE the dialog opens, off counts the row carries
         * (§26, §15.1). None of these has an alternative this screen can
         * offer, so the control is disabled and the reason is its
         * tooltip.
         */
        deleteBlocked={(row) => {
          if (row.id === user?.id) {
            return "This is your own account. Someone else who can delete people has to remove it."
          }
          if (row.openComplaintCount > 0) {
            return `${row.name} has ${formatNumber(row.openComplaintCount)} open ${
              row.openComplaintCount === 1 ? "complaint" : "complaints"
            }. Reassign ${row.openComplaintCount === 1 ? "it" : "them"} first.`
          }
          const parts: string[] = []
          if (row.siteCount > 0) {
            parts.push(
              `${formatNumber(row.siteCount)} ${row.siteCount === 1 ? "site names" : "sites name"} this person`,
            )
          }
          if (row.expenseCount > 0) {
            parts.push(
              `${formatNumber(row.expenseCount)} ${
                row.expenseCount === 1 ? "expense was" : "expenses were"
              } booked by them`,
            )
          }
          if (parts.length === 0) return null
          return `${parts.join(" and ")}. Change those records first.`
        }}
        deleteConsequences={() => (
          <>
            No site, expense or open complaint points at this person, so
            nothing else changes. Removing them cannot be undone.
          </>
        )}
        emptyHeading="No people yet"
        emptyBody="Add people one at a time, or import a spreadsheet of them."
        onChanged={refresh}
      />

      {creating || editing !== null ? (
        <PersonDialog
          key={editing?.id ?? "new"}
          person={editing}
          designations={designations.rows}
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

// ---------------------------------------------------------------------
// Filters (section 27.3): a panel behind one button, a count on it.
// ---------------------------------------------------------------------

const ANY = "__any__"

function PeopleFilterButton({
  filters,
  onApply,
  designations,
}: {
  filters: PeopleFilters
  onApply: (next: PeopleFilters) => void
  designations: DesignationPick[] | null
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<PeopleFilters>(filters)
  const count = Object.values(filters).filter(Boolean).length

  const designationOptions: Record<string, string> = { [ANY]: "Any designation" }
  for (const d of designations ?? []) designationOptions[d.id] = d.name

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setDraft(filters)
          setOpen(true)
        }}
      >
        <FunnelIcon />
        Filter
        {count > 0 ? <Count value={count} /> : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Filter people</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-designation">Designation</Label>
              <SearchableSelect
                id="filter-designation"
                options={designationOptions}
                value={draft.designationId ?? ANY}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, designationId: v === ANY ? undefined : v }))
                }
                searchPlaceholder="Search designations"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-can-login">Signing in</Label>
              <Select
                items={{ [ANY]: "Anyone", true: SIGN_IN_LABEL.true, false: SIGN_IN_LABEL.false }}
                value={draft.canLogin ?? ANY}
                onValueChange={(v: string | null) =>
                  setDraft((d) => ({
                    ...d,
                    canLogin: v === "true" || v === "false" ? v : undefined,
                  }))
                }
              >
                <SelectTrigger id="filter-can-login">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Anyone</SelectItem>
                  <SelectItem value="true">{SIGN_IN_LABEL.true}</SelectItem>
                  <SelectItem value="false">{SIGN_IN_LABEL.false}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDraft({})}>
              Clear
            </Button>
            <Button
              type="button"
              onClick={() => {
                onApply(draft)
                setOpen(false)
              }}
            >
              Apply filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------
// Add and Edit, ONE dialog (section 4 rule 1).
// ---------------------------------------------------------------------

const NONE = "__none__"

interface PersonValues {
  name: string
  email: string
  phone: string
  designationId: string
  reportsToId: string
  canLogin: boolean
  password: string
}

function valuesOf(person: Person | null): PersonValues {
  return {
    name: person?.name ?? "",
    email: person?.email ?? "",
    phone: person?.phone ?? "",
    designationId: person?.designation?.id ?? NONE,
    reportsToId: person?.reportsTo?.id ?? NONE,
    canLogin: person?.canLogin ?? false,
    password: "",
  }
}

type FieldKey = "name" | "email" | "phone" | "reportsTo" | "roles" | "password"

/** The same roles, in any order. */
const sameRoles = (a: string[], b: string[]) => isChanged([...a].sort(), [...b].sort()) === false

function PersonDialog({
  person,
  designations,
  onClose,
  onSaved,
}: {
  person: Person | null
  designations: DesignationPick[] | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = person !== null
  const personId = person?.id
  /**
   * Who they report to and their roles are access changes (O8, access
   * plan P6): the server needs access.rights.manage for them on top of
   * adding or editing people. Without it both fields are shown,
   * disabled, with the reason (kit 26 rule 2), and never sent, so the
   * rest of the person still saves. While the answer is unknown:
   * disabled, no reason (kit 26.1).
   */
  const canManageAccess = useCan("access.rights.manage")
  const manageAccessReason = reasonFor("access.rights.manage")
  const accessLocked = canManageAccess !== true
  const { refresh: refreshPermissions } = usePermissions()
  const saved = React.useMemo(() => valuesOf(person), [person])
  const [values, setValues] = React.useState<PersonValues>(saved)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<FieldKey, string | null>>>({})

  /**
   * Roles (owner request, 5 Oct 2026; KIT-PENDING-person-roles.md). The
   * access API answers only someone who manages access, so nothing is
   * asked for anyone else, or while that is not known (kit 26.1). The
   * choices: every role, job roles first, then "+" add-ons (kit 40.2
   * rule 4). On Edit the roles they hold start chosen; on Add, none.
   */
  const manages = canManageAccess === true
  const roleList = useAnswer(manages ? "roles" : null, () => accessApi.listRoles({ pageSize: 100 }))
  const heldAccess = useAnswer(manages && personId ? `person:${personId}` : null, () =>
    accessApi.getPerson(personId ?? ""),
  )
  const savedRoleIds = React.useMemo<string[] | null>(() => {
    if (!isEdit) return []
    return heldAccess.value ? [...heldAccess.value.roles].sort(byRoleOrder).map((r) => r.id) : null
  }, [isEdit, heldAccess.value])
  const [roleIds, setRoleIds] = React.useState<string[] | null>(isEdit ? null : [])
  // Their held roles start chosen once they arrive (set during render, so
  // the field never shows empty first).
  if (roleIds === null && savedRoleIds !== null) setRoleIds(savedRoleIds)
  const rolesState: "loading" | "ready" | "failed" = !manages
    ? "loading"
    : roleList.state === "failed" || (isEdit && heldAccess.state === "failed")
      ? "failed"
      : roleList.state === "ready" && roleIds !== null
        ? "ready"
        : "loading"
  const rolesChanged =
    rolesState === "ready" && roleIds !== null && savedRoleIds !== null && !sameRoles(roleIds, savedRoleIds)
  const roleOptions = React.useMemo(() => {
    const roles: Named[] = [...(roleList.value?.data ?? [])]
    // A held role past the first 100 still shows by name.
    for (const r of heldAccess.value?.roles ?? []) if (!roles.some((x) => x.id === r.id)) roles.push(r)
    const options: Record<string, string> = {}
    for (const r of roles.sort(byRoleOrder)) options[r.id] = r.name
    return options
  }, [roleList.value, heldAccess.value])
  function retryRoles() {
    roleList.refresh()
    heldAccess.refresh()
  }

  /**
   * Reports to searches the people Pick on the server as the user types
   * (access plan P8): 145+ people outgrow one answer of 50, so the list
   * is never loaded whole. Not the person themselves: nobody reports to
   * themselves.
   */
  const searchReportsTo = React.useCallback(
    (query: string): Promise<SearchOption[]> =>
      pick.people({ q: query }).then((rows: PersonPick[]) =>
        rows
          .filter((p) => p.id !== personId)
          .map((p) => ({ value: p.id, label: p.name, detail: p.designationName })),
      ),
    [personId],
  )
  const unsaved = useUnsavedChanges({
    changed: isChanged(values, saved) || rolesChanged,
    noun: "person",
    mode: isEdit ? "edit" : "create",
  })

  const set = <K extends keyof PersonValues>(key: K, value: PersonValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  /**
   * A password is required whenever this save would turn sign-in ON for
   * somebody who did not have it; otherwise blank keeps the current one.
   */
  const passwordRequired = values.canLogin && !(person?.canLogin ?? false)

  const check: Record<"name" | "email" | "phone" | "password", (v: PersonValues) => string | null> = {
    name: (v) => (v.name.trim() === "" ? "Enter the person's name" : null),
    email: (v) =>
      v.email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())
        ? v.canLogin && v.email.trim() === "" && v.phone.trim() === ""
          ? "Someone who signs in needs an email address or a phone number"
          : null
        : "Enter a complete email address, like name@company.com",
    phone: (v) => {
      if (v.phone.trim() === "") return null
      return v.phone.replace(/\D/g, "").length < 10
        ? "Enter a 10-digit phone number, like 98765 43210"
        : null
    },
    password: (v) => {
      if (!v.canLogin) return null
      if (passwordRequired && v.password.trim() === "") return "Set a password, or turn off sign-in"
      if (v.password.trim() !== "" && v.password.trim().length < 8) {
        return "A password needs at least 8 characters"
      }
      return null
    },
  }
  const blur = (key: keyof typeof check) =>
    setFieldErrors((c) => ({ ...c, [key]: check[key](values) }))

  /**
   * Server refusals that belong to one field are shown on that field
   * (section 7.1), not in the banner: a reports-to cycle on Reports to,
   * a bad or taken phone on Phone, a taken email on Email, and, when
   * roles were sent, a role that no longer exists (422) or the
   * last-holder rule (409, kit 40.11) on Roles.
   */
  function place(caught: unknown, sentRoles: boolean): boolean {
    if (!(caught instanceof ApiError)) return false
    const message = caught.message
    if (
      sentRoles &&
      ((caught.status === 422 && /role/i.test(message)) ||
        (caught.status === 409 && /manage access/i.test(message)))
    ) {
      setFieldErrors((c) => ({ ...c, roles: message }))
      return true
    }
    if (caught.status === 422 && /report/i.test(message)) {
      setFieldErrors((c) => ({ ...c, reportsTo: message }))
      return true
    }
    if (caught.status === 422 && /phone/i.test(message)) {
      setFieldErrors((c) => ({ ...c, phone: message }))
      return true
    }
    if (caught.status === 409 && /email/i.test(message)) {
      setFieldErrors((c) => ({ ...c, email: message }))
      return true
    }
    if (caught.status === 409 && /phone/i.test(message)) {
      setFieldErrors((c) => ({ ...c, phone: message }))
      return true
    }
    return false
  }

  async function save() {
    const found = {
      name: check.name(values),
      email: check.email(values),
      phone: check.phone(values),
      password: check.password(values),
    }
    setFieldErrors(found)
    if (Object.values(found).some(Boolean)) return

    // Roles only when they can be sent and say something: on Add, any
    // chosen; on Edit, a different set (the server ignores the same set).
    const sendRoles =
      rolesState === "ready" && roleIds !== null && (isEdit ? rolesChanged : roleIds.length > 0)
    setSaving(true)
    setError(null)
    try {
      const body: PersonBody = {
        name: values.name.trim(),
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        designationId: values.designationId === NONE ? null : values.designationId,
        // Reports to only from someone who may change it (O8); left out,
        // the server keeps what the person has.
        ...(canManageAccess === true
          ? { reportsToId: values.reportsToId === NONE ? null : values.reportsToId }
          : {}),
        ...(sendRoles ? { roleIds } : {}),
        canLogin: values.canLogin,
        ...(values.canLogin && values.password.trim() ? { password: values.password.trim() } : {}),
      }
      if (isEdit) await api.patch(`/users/${person.id}`, body)
      else await api.post("/users", body)
      // Kit 26.4 rule 2: an access change may change what the signed-in
      // person can do (they may have edited themselves).
      if (sendRoles) refreshPermissions()
      toast.success(isEdit ? "Person saved" : "Person added")
      onSaved()
    } catch (caught) {
      if (!place(caught, sendRoles)) setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  // ---- options -------------------------------------------------------

  const designationOptions: Record<string, string> = { [NONE]: "No designation" }
  if (person?.designation) designationOptions[person.designation.id] = person.designation.name
  for (const d of designations ?? []) {
    if (d.isActive || d.id === person?.designation?.id) designationOptions[d.id] = d.name
  }

  // "No one" leads the list; the people come from the search.
  const reportsToOptions: Record<string, string> = { [NONE]: "No one" }

  const close = unsaved.guard((open) => {
    if (!open) onClose()
  })

  return (
    <>
      <Dialog open onOpenChange={close}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit person" : "Add person"}</DialogTitle>
            <DialogDescription>
              A person can be named on a site or receive complaints without ever
              signing in.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-6">
            <FormError message={error} />

            <section className="flex flex-col gap-4">
              <h3 className="text-card-heading font-medium text-text-primary">Contact</h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2 md:col-span-2">
                  <Label htmlFor="person-name" required>
                    Name
                  </Label>
                  <Input
                    id="person-name"
                    value={values.name}
                    aria-invalid={Boolean(fieldErrors.name) || undefined}
                    onChange={(event) => set("name", event.target.value)}
                    onBlur={() => blur("name")}
                  />
                  <InlineFieldError>{fieldErrors.name}</InlineFieldError>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="person-phone">Phone number</Label>
                  <Input
                    id="person-phone"
                    type="tel"
                    inputMode="tel"
                    value={values.phone}
                    placeholder="98765 43210"
                    aria-invalid={Boolean(fieldErrors.phone) || undefined}
                    onChange={(event) => set("phone", event.target.value)}
                    onBlur={() => blur("phone")}
                  />
                  <InlineFieldError>{fieldErrors.phone}</InlineFieldError>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="person-email">Email address</Label>
                  <Input
                    id="person-email"
                    type="email"
                    value={values.email}
                    placeholder="name@company.com"
                    aria-invalid={Boolean(fieldErrors.email) || undefined}
                    onChange={(event) => set("email", event.target.value)}
                    onBlur={() => blur("email")}
                  />
                  <InlineFieldError>{fieldErrors.email}</InlineFieldError>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              {/* What they are in the organisation, not what they may do: that is Access, below. */}
              <h3 className="text-card-heading font-medium text-text-primary">Job</h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="person-designation">Designation</Label>
                  <SearchableSelect
                    id="person-designation"
                    options={designationOptions}
                    value={values.designationId}
                    onValueChange={(v) => set("designationId", v)}
                    disabled={designations === null}
                    placeholder={designations === null ? "Loading designations" : "Choose a designation"}
                    searchPlaceholder="Search designations"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="person-reports-to">Reports to</Label>
                  <PermissionTooltip allowed={canManageAccess} reason={manageAccessReason}>
                  <SearchableSelect
                    id="person-reports-to"
                    options={reportsToOptions}
                    search={searchReportsTo}
                    selectedLabel={
                      person?.reportsTo && values.reportsToId === person.reportsTo.id
                        ? person.reportsTo.name
                        : undefined
                    }
                    value={values.reportsToId}
                    onValueChange={(v) => {
                      set("reportsToId", v)
                      setFieldErrors((c) => ({ ...c, reportsTo: null }))
                    }}
                    placeholder="Choose a person"
                    searchPlaceholder="Search people"
                    emptyMessage={(q) => `No people match '${q}'.`}
                    disabled={accessLocked}
                    className={fieldErrors.reportsTo ? "border-danger" : undefined}
                  />
                  </PermissionTooltip>
                  <InlineFieldError>{fieldErrors.reportsTo}</InlineFieldError>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-card-heading font-medium text-text-primary">Access</h3>
              {/* Roles: for someone who manages access, a multi-select;
                  for anyone else the same field, disabled, with the
                  reason; while that is not known, disabled with no
                  reason (kit 26.1). The field never changes size. */}
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="person-roles">Roles</Label>
                <PermissionTooltip allowed={canManageAccess} reason={manageAccessReason}>
                  <MultiSelect
                    id="person-roles"
                    options={roleOptions}
                    value={manages ? (roleIds ?? []) : []}
                    onValueChange={(next) => {
                      setRoleIds(next)
                      setFieldErrors((c) => ({ ...c, roles: null }))
                    }}
                    placeholder={rolesState === "loading" && manages ? "Loading roles" : "Choose roles"}
                    searchPlaceholder="Search roles"
                    emptyMessage="No roles match that search."
                    disabled={rolesState !== "ready"}
                    invalid={Boolean(fieldErrors.roles)}
                    describedBy="person-roles-help"
                  />
                </PermissionTooltip>
                {rolesState === "failed" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-label text-text-primary">We could not load the roles.</p>
                    <Button type="button" variant="secondary" size="sm" onClick={retryRoles}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <p id="person-roles-help" className="text-label text-text-secondary">
                    {rolesState === "ready" && roleIds !== null && roleIds.length === 0
                      ? "No roles, so they can do nothing."
                      : "What they can do comes from their roles."}
                  </p>
                )}
                <InlineFieldError>{fieldErrors.roles}</InlineFieldError>
              </div>
              {/* Selected sites, and the rest of their access, stay on
                  their access page. Plain text with the reason for
                  someone who cannot open it (kit 6.6 rule 4, 26). */}
              {isEdit ? (
                <div>
                  <PermissionTooltip allowed={canManageAccess} reason={manageAccessReason}>
                    <TextLink
                      render={manages ? <Link href={ACCESS_PATHS.person(person.id)} /> : undefined}
                    >
                      More access settings <span aria-hidden>→</span>
                    </TextLink>
                  </PermissionTooltip>
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-card-heading font-medium text-text-primary">Signing in</h3>
              <div className="flex items-start gap-3">
                <Switch
                  id="person-can-login"
                  checked={values.canLogin}
                  onCheckedChange={(checked: boolean) => set("canLogin", checked)}
                />
                <div className="min-w-0">
                  <Label htmlFor="person-can-login">Can sign in</Label>
                  <p className="mt-1 text-label text-text-secondary">
                    With their email address or phone number. Leave off for
                    someone who is only named on sites or complaints.
                  </p>
                </div>
              </div>

              {values.canLogin ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="person-password" required={passwordRequired}>
                    Password
                  </Label>
                  <PasswordInput
                    id="person-password"
                    autoComplete="new-password"
                    value={values.password}
                    aria-invalid={Boolean(fieldErrors.password) || undefined}
                    onChange={(event) => set("password", event.target.value)}
                    onBlur={() => blur("password")}
                  />
                  {/* Section 32.4: helper text below, and only where true. */}
                  <p className="text-label text-text-secondary">
                    {passwordRequired
                      ? "At least 8 characters."
                      : "Leave blank to keep the current password."}
                  </p>
                  <InlineFieldError>{fieldErrors.password}</InlineFieldError>
                </div>
              ) : null}
            </section>
          </DialogBody>

          <DialogFooter>
            <Button variant="secondary" onClick={() => close(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save person" : "Add person"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {unsaved.warning}
    </>
  )
}
