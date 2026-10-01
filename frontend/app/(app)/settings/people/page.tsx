"use client"

import * as React from "react"
import Link from "next/link"
import { FileSpreadsheetIcon, FunnelIcon } from "lucide-react"

import {
  api,
  ApiError,
  query,
  type Designation,
  type ListResponse,
  type Matchable,
  type ModuleAccess,
  type Person,
  type PersonBody,
} from "@/lib/api"
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
import { SearchableSelect } from "@/components/ui/searchable-select"
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
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import type { ExportColumn } from "@/lib/pdf-export"
import { FormError } from "@/components/forms/form-error"
import { FilterChip } from "@/components/forms/expense-filter"
import { ListSearch } from "@/components/templates/list-page"
import {
  MASTER_PAGE_SIZE,
  MasterSection,
  useMasterRows,
} from "@/components/forms/master-section"
import { useOptions } from "../_shared/use-options"

/**
 * The people master (CONTRACT §2), platform admin only.
 *
 * ONE list of people. Office staff sign in; a supervisor in the field
 * may sign in by phone; a manager named on a site may never sign in at
 * all. What each person is (designation), who they report to and
 * which modules they can open all live here.
 *
 * People have no locations (removed 1 Oct 2026, user decision):
 * complaints route by the budget site, which names its own supervisor
 * and manager.
 */

type ModuleKey = "platform" | "budget" | "complaints"

const MODULE_LABEL: Record<ModuleKey, string> = {
  platform: "Platform",
  budget: "Budget",
  complaints: "Complaints",
}

/** "Budget admin, Complaints member". Said once, used by the row and the export. */
function describeModules(modules: ModuleAccess | null | undefined): string {
  const parts: string[] = []
  if (modules?.platform === "admin") parts.push("Platform admin")
  if (modules?.budget) parts.push(`Budget ${modules.budget}`)
  if (modules?.complaints) parts.push(`Complaints ${modules.complaints}`)
  return parts.length ? parts.join(", ") : "No access"
}

interface PeopleFilters {
  designationId?: string
  module?: ModuleKey
  canLogin?: "true" | "false"
}

const SIGN_IN_LABEL = { true: "Signs in", false: "Does not sign in" } as const

export default function PeopleSettingsPage() {
  const { can, user } = useSession()
  const canEdit = can.platformAdmin

  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [filters, setFilters] = React.useState<PeopleFilters>({})

  const designations = useOptions<Designation>("/designations", { sort: "name", direction: "asc" })

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
    { header: "Access", cell: (row) => describeModules(row.modules) },
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
            allowed={canEdit}
            reason="Only a platform administrator can import people"
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={!canEdit}
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
          {filters.module ? (
            <FilterChip
              label={`Access: ${MODULE_LABEL[filters.module]}`}
              onRemove={() => applyFilters({ ...filters, module: undefined })}
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
        description="Everyone in the organisation: what they are, who they report to and what they can open."
        createLabel="Add person"
        canEdit={canEdit}
        cannotEditReason="Only a platform administrator can change people"
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
            key: "modules",
            label: "Access",
            priority: "secondary",
            render: (row) => <Truncate>{describeModules(row.modules)}</Truncate>,
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
            return "This is your own account. Another platform administrator has to remove it."
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
          selfId={user?.id ?? null}
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
  designations: Designation[] | null
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
              <Label htmlFor="filter-module">Access to</Label>
              <Select
                items={{ [ANY]: "Any module", ...MODULE_LABEL }}
                value={draft.module ?? ANY}
                onValueChange={(v: string | null) =>
                  setDraft((d) => ({
                    ...d,
                    module: v === "platform" || v === "budget" || v === "complaints" ? v : undefined,
                  }))
                }
              >
                <SelectTrigger id="filter-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any module</SelectItem>
                  <SelectItem value="platform">Platform</SelectItem>
                  <SelectItem value="budget">Budget</SelectItem>
                  <SelectItem value="complaints">Complaints</SelectItem>
                </SelectContent>
              </Select>
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

type Access = { platform: "admin" | null; budget: "admin" | "staff" | null; complaints: "admin" | "member" | null }

interface PersonValues {
  name: string
  email: string
  phone: string
  designationId: string
  reportsToId: string
  access: Access
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
    access: {
      platform: person?.modules.platform ?? null,
      budget: person?.modules.budget ?? null,
      // A new person gets complaints membership, like an import does.
      complaints: person ? (person.modules.complaints ?? null) : "member",
    },
    canLogin: person?.canLogin ?? false,
    password: "",
  }
}

type FieldKey = "name" | "email" | "phone" | "reportsTo" | "password"

function PersonDialog({
  person,
  selfId,
  designations,
  onClose,
  onSaved,
}: {
  person: Person | null
  selfId: string | null
  designations: Designation[] | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = person !== null
  const isSelf = isEdit && person.id === selfId
  const saved = React.useMemo(() => valuesOf(person), [person])
  const [values, setValues] = React.useState<PersonValues>(saved)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<FieldKey, string | null>>>({})

  const people = useOptions<Person>("/users", { sort: "name", direction: "asc" })
  const unsaved = useUnsavedChanges({ changed: isChanged(values, saved), noun: "person" })

  const set = <K extends keyof PersonValues>(key: K, value: PersonValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))
  const setAccess = <K extends keyof Access>(key: K, value: Access[K]) =>
    setValues((v) => ({ ...v, access: { ...v.access, [key]: value } }))

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
   * a bad or taken phone on Phone, a taken email on Email.
   */
  function place(caught: unknown): boolean {
    if (!(caught instanceof ApiError)) return false
    const message = caught.message
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

    setSaving(true)
    setError(null)
    try {
      const body: PersonBody = {
        name: values.name.trim(),
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        designationId: values.designationId === NONE ? null : values.designationId,
        reportsToId: values.reportsToId === NONE ? null : values.reportsToId,
        modules: {
          platform: values.access.platform,
          budget: values.access.budget,
          complaints: values.access.complaints,
        },
        canLogin: values.canLogin,
        ...(values.canLogin && values.password.trim() ? { password: values.password.trim() } : {}),
      }
      if (isEdit) await api.patch(`/users/${person.id}`, body)
      else await api.post("/users", body)
      toast.success(isEdit ? "Person saved" : "Person added")
      onSaved()
    } catch (caught) {
      if (!place(caught)) setError(errorMessage(caught))
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

  const reportsToOptions: Record<string, string> = { [NONE]: "No one" }
  if (person?.reportsTo) reportsToOptions[person.reportsTo.id] = person.reportsTo.name
  for (const p of people.rows ?? []) {
    if (p.id !== person?.id) {
      reportsToOptions[p.id] = p.designation ? `${p.name} (${p.designation.name})` : p.name
    }
  }

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
              <h3 className="text-card-heading font-medium text-text-primary">Role</h3>
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
                  <SearchableSelect
                    id="person-reports-to"
                    options={reportsToOptions}
                    value={values.reportsToId}
                    onValueChange={(v) => {
                      set("reportsToId", v)
                      setFieldErrors((c) => ({ ...c, reportsTo: null }))
                    }}
                    disabled={people.rows === null && people.error === null}
                    placeholder={people.rows === null ? "Loading people" : "Choose a person"}
                    searchPlaceholder="Search people"
                    className={fieldErrors.reportsTo ? "border-danger" : undefined}
                  />
                  <InlineFieldError>{fieldErrors.reportsTo ?? people.error}</InlineFieldError>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-card-heading font-medium text-text-primary">Access</h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="person-budget">Budget</Label>
                  <Select
                    items={{ [NONE]: "No access", staff: "Staff", admin: "Admin" }}
                    value={values.access.budget ?? NONE}
                    onValueChange={(v: string | null) =>
                      setAccess("budget", v === "admin" || v === "staff" ? v : null)
                    }
                  >
                    <SelectTrigger id="person-budget">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No access</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="person-complaints">Complaints</Label>
                  <Select
                    items={{ [NONE]: "No access", member: "Member", admin: "Admin" }}
                    value={values.access.complaints ?? NONE}
                    onValueChange={(v: string | null) =>
                      setAccess("complaints", v === "admin" || v === "member" ? v : null)
                    }
                  >
                    <SelectTrigger id="person-complaints">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No access</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="person-platform">Platform</Label>
                  {/* The server refuses removing your own platform admin,
                      so the control says so before the click (§26). */}
                  <PermissionTooltip
                    allowed={!(isSelf && saved.access.platform === "admin")}
                    reason="You can't remove your own platform admin. Another platform administrator has to."
                  >
                    <Select
                      items={{ [NONE]: "No access", admin: "Admin" }}
                      value={values.access.platform ?? NONE}
                      disabled={isSelf && saved.access.platform === "admin"}
                      onValueChange={(v: string | null) =>
                        setAccess("platform", v === "admin" ? "admin" : null)
                      }
                    >
                      <SelectTrigger id="person-platform">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No access</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </PermissionTooltip>
                </div>
              </div>
              <p className="text-label text-text-secondary">
                Budget staff book expenses; budget admins also change budgets and
                settings. Complaint members raise and handle complaints; admins
                see every complaint. Platform admins manage people and locations.
              </p>
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
