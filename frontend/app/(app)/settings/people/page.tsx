"use client"

import * as React from "react"

import { api, query, type ListResponse, type Matchable, type Person } from "@/lib/api"
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
import { PasswordInput } from "@/components/ui/password-input"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
 * The people master. Section 11.5, admin only (section 26).
 *
 * ONE list of people (question 3). Office staff sign in; a manager or
 * supervisor named on a site may never sign in at all. There is no
 * manager/supervisor axis here — any person can be named on any site.
 */
export default function PeopleSettingsPage() {
  const { isAdmin, user } = useSession()

  const load = React.useCallback(
    (page: number) =>
      api.get<ListResponse<Person & Matchable>>(
        `/users${query({ page, pageSize: MASTER_PAGE_SIZE, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const { rows, loading, error, refresh, page, setPage, total, totalPages } =
    useMasterRows(load)

  const [editing, setEditing] = React.useState<Person | null>(null)
  const [creating, setCreating] = React.useState(false)

  /**
   * Mirrors the on-screen columns exactly. Fetches EVERY row, not the
   * page on screen: `ExportButton`'s own paging loop pages this at
   * pageSize=100 until every matching row has been collected.
   */
  const exportFetchPage = React.useCallback(
    async (exportPage: number, pageSize: number) =>
      api.get<ListResponse<Person & Matchable>>(
        `/users${query({ page: exportPage, pageSize, sort: "name", direction: "asc" })}`,
      ),
    [],
  )
  const exportColumns: ExportColumn<Person>[] = [
    { header: "Name", cell: (row) => row.name },
    {
      header: "Email",
      cell: (row) => row.email ?? "—",
      excelValue: (row) => row.email ?? null,
    },
    {
      header: "Role",
      cell: (row) => (row.role === "admin" ? "Admin" : "Staff"),
    },
    {
      header: "Signs in",
      cell: (row) => (row.canLogin ? "Yes" : "No"),
    },
  ]

  return (
    <>
      <MasterSection
        title="People"
        description="One list. Someone who manages a site and someone who signs in are the same kind of record."
        createLabel="New person"
        canEdit={isAdmin}
        cannotEditReason="Only an administrator can change people"
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        exportList={{
          title: "People",
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
            key: "email",
            priority: "secondary",
            label: "Email",
            className: "hidden md:table-cell",
            render: (row) => <Truncate>{row.email ?? "—"}</Truncate>,
          },
          {
            key: "role",
            label: "Role",
            render: (row) =>
              row.role === "admin" ? (
                <Badge variant="primary">Admin</Badge>
              ) : (
                <Badge variant="neutral">Staff</Badge>
              ),
          },
          {
            key: "canLogin",
            priority: "secondary",
            label: "Signs in",
            render: (row) => (row.canLogin ? "Yes" : "No"),
          },
        ]}
        onCreate={() => setCreating(true)}
        onEdit={(row) => setEditing(row)}
        onDelete={(row) => api.delete(`/users/${row.id}`)}
        deleteWhat="person"
        deleteName={(row) => row.name}
        /*
         * Checked BEFORE the dialog opens. Two separate refusals live
         * on the server — your own account, and a person something
         * points at — and both used to reach the user as a red error
         * after they had confirmed a deletion (§26). Neither has an
         * alternative this screen can offer, so the control is disabled
         * and the reason is its tooltip.
         */
        deleteBlocked={(row) => {
          if (row.id === user?.id) {
            return "This is your own account. Another administrator has to remove it."
          }
          const parts: string[] = []
          if (row.siteCount > 0) {
            parts.push(
              `${formatNumber(row.siteCount)} ${
                row.siteCount === 1 ? "site names" : "sites name"
              } this person`,
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
        /* §15 rule 2, and only ever read on a person nothing points at. */
        deleteConsequences={() => (
          <>
            No site names this person and they have booked no expenses, so
            nothing else changes. Removing them cannot be undone.
          </>
        )}
        emptyHeading="No people yet"
        emptyBody="People are named on sites as managers and supervisors, and are who signs in."
        onChanged={refresh}
      />

      {/* Mounted only while open and keyed by record, so its fields
          start with the right values. Syncing props into state in an
          effect renders the previous record's values once first. */}
      {creating || editing !== null ? (
      <PersonDialog
        key={editing?.id ?? "new"}
        open
        person={editing}
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
function PersonDialog({
  open,
  person,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  person: Person | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const isEdit = person !== null
  /**
   * A password is required whenever this save would turn sign-in ON for
   * somebody who did not have it.
   *
   * `!isEdit` alone was not enough: editing a person who could not sign
   * in and switching them on left the field optional, the client let it
   * through, and the SERVER refused it — "Someone who signs in needs a
   * password" — which is a control that fails after being clicked.
   * The server stays the authority; this stops the user meeting it.
   */
  const [name, setName] = React.useState(person?.name ?? "")
  const [email, setEmail] = React.useState(person?.email ?? "")
  const [phone, setPhone] = React.useState(person?.phone ?? "")
  const [role, setRole] = React.useState<"admin" | "staff">(person?.role ?? "staff")
  const [canLogin, setCanLogin] = React.useState(person?.canLogin ?? false)
  const [password, setPassword] = React.useState("")
  const passwordRequired = canLogin && !(person?.canLogin ?? false)
  /* No effect syncs these: the dialog is keyed by record and mounted
     only while open, so a fresh mount already has the right values. */
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})


  async function save() {
    const found: Record<string, string> = {}
    if (name.trim() === "") found.name = "Enter a name"
    // The same rule the API and the table constraint enforce, said in
    // words before the request goes out (section 7.2 rule 2).
    if (canLogin && email.trim() === "") {
      found.email = "Someone who signs in needs an email address"
    }
    if (passwordRequired && password.trim() === "") {
      found.password = "Set a password, or turn off sign-in"
    }
    if (password.trim() !== "" && password.trim().length < 8) {
      found.password = "A password needs at least 8 characters"
    }
    if (Object.keys(found).length > 0) {
      setFieldErrors(found)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body = {
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        role,
        canLogin,
        ...(password.trim() ? { password: password.trim() } : {}),
      }
      if (isEdit) await api.patch(`/users/${person.id}`, body)
      else await api.post("/users", body)
      toast.success(isEdit ? "Person saved" : "Person added")
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
          <DialogTitle>{isEdit ? "Edit person" : "New person"}</DialogTitle>
          <DialogDescription>
            A person can be named on a site without ever signing in.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-6">
          <FormError message={error} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="person-name" required>
              Name
            </Label>
            <Input
              id="person-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name) || undefined}
              onChange={(event) => setName(event.target.value)}
            />
            <InlineFieldError>{fieldErrors.name}</InlineFieldError>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="person-email" required={canLogin}>
              Email address
            </Label>
            <Input
              id="person-email"
              type="email"
              value={email}
              placeholder="name@company.com"
              aria-invalid={Boolean(fieldErrors.email) || undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            <InlineFieldError>{fieldErrors.email}</InlineFieldError>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="person-phone">Phone number</Label>
            <Input
              id="person-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="person-role" required>
              Role
            </Label>
            <Select
              value={role}
              onValueChange={(value: string | null) => {
                if (value === "admin" || value === "staff") setRole(value)
              }}
            >
              <SelectTrigger id="person-role">
                {/* Same reason as the period select: the value is
                    "staff", the label is "Staff". */}
                <SelectValue>
                  {(value: string | null) =>
                    value === "admin" ? "Admin" : "Staff"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-label text-text-secondary">
              An admin sees Settings and can delete records. Staff cannot.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="person-can-login"
              checked={canLogin}
              onCheckedChange={(checked: boolean) => setCanLogin(checked)}
            />
            <div className="min-w-0">
              <Label htmlFor="person-can-login">Can sign in</Label>
              <p className="mt-1 text-label text-text-secondary">
                Leave off for someone who is only named on a site.
              </p>
            </div>
          </div>

          {canLogin ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="person-password" required={passwordRequired}>
                Password
              </Label>
              {/* Section 32 applies here as well as on sign-in: an
                  admin setting somebody else's password has more reason
                  to see it, not less. */}
              <PasswordInput
                id="person-password"
                autoComplete="new-password"
                value={password}
                aria-invalid={Boolean(fieldErrors.password) || undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
              {/*
                Section 11.3 rule 9: a placeholder shows an example
                format and is never instructions. "Leave blank to keep
                the current one" was living in the placeholder, where it
                disappeared the moment somebody typed — so the one
                sentence explaining that blank is safe vanished exactly
                when it stopped being true.

                A password has no example format worth showing, and a
                specimen password is worse than none, so this field
                carries no placeholder at all. What it needs said is
                said here, where it stays put.
              */}
              <p className="text-label text-text-secondary">
                {passwordRequired
                  ? "At least 8 characters."
                  : "Leave blank to keep the current password."}
              </p>
              <InlineFieldError>{fieldErrors.password}</InlineFieldError>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save person" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
