"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CopyIcon, InfoIcon, MoreHorizontalIcon, TrashIcon } from "lucide-react"

import { ApiError } from "@/lib/api"
import {
  accessApi,
  ACCESS_PATHS,
  isBlocked,
  type RoleDetail,
  type RoleTicks,
} from "@/lib/access-api"
import { CATALOGUE, type PermissionKey, type Scope } from "@/lib/permission-keys"
import { reasonFor, usePermissions } from "@/lib/permissions"
import { errorMessage } from "@/components/shell/session"
import { Banner, BannerDescription } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isChanged, useUnsavedChanges } from "@/components/ui/unsaved-changes"
import { ErrorPage } from "@/components/templates/error-page"
import { FormField, FormFooter, FormFrame, FormScrollArea } from "@/components/templates/form-page"
import { PageColumn, PageHeader } from "@/components/templates/page"
import { DeleteRecordDialog } from "@/components/forms/delete-record-dialog"
import { FormError, FormLoadFailed } from "@/components/forms/form-error"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { amountsNeededBy, PermissionGrid, tickableKeys } from "@/components/access/permission-grid"

/**
 * Kit 40.3 to 40.5: the role editor. A form page (11.3) with a fixed
 * footer, never a dialog (40.1 rule 4). Add, Edit and Duplicate are this
 * one component (section 4 rule 1):
 *
 *   /access/roles/new              an empty role;
 *   /access/roles/new?from=<id>    Duplicate (40.2 rule 8): "Copy of …",
 *                                  every tick and scope copied, nothing
 *                                  saved until Save. There is no API for
 *                                  it (R12): it prefills this form;
 *   /access/roles/<id>             Edit; the system role opens read-only.
 *
 * The page owns the whole role: one Save for all of it (40.3 rule 4),
 * the cross-module Picks (shown under each row by the grid, 40.5) and
 * the unsaved-changes guard (rule 5). Ctrl+S saves (39.5): the page's
 * one form.
 *
 * The system role is known from the server's own answer for it, never
 * from its name (kit 26 rule 5): its `can.edit` is the sentence why it
 * cannot be edited.
 */

/** The meaning of each scope, once, so the scope menus need no explanations (40.3 rule 2). */
const SCOPE_MEANINGS =
  "Own: records they created or are named on. " +
  "Team: their own, plus those of everyone under them in the reporting line, plus the sites they or those people lead. " +
  "Selected sites: the sites ticked on their access page, plus the sites they lead. " +
  "All: every record."

/** Kit 40.3 rule 14. */
const SYSTEM_ROLE_BANNER = "This role always holds every permission, in every module, at All. It cannot be changed."

// ---------------------------------------------------------------------
// Pending banner rule 5: a save's other changes are a toast, not a banner
// ---------------------------------------------------------------------

/**
 * The save toast, when the save also added or removed other permissions
 * (the Picks and see amounts of 40.5): it says how many, stays until
 * closed, and its Details opens the list in SaveDetailsDialog.
 *
 * Module state, not component state, because a new role's toast is
 * raised on /new and its Details is pressed on the role's own page,
 * after the address has changed and the editor has been replaced.
 */
let detailsToast: string | number | null = null
let details: { open: boolean; notices: string[] } = { open: false, notices: [] }
const detailsListeners = new Set<() => void>()
let mountedEditors = 0

function setDetails(next: typeof details) {
  details = next
  for (const listener of detailsListeners) listener()
}

function subscribeDetails(listener: () => void) {
  detailsListeners.add(listener)
  return () => {
    detailsListeners.delete(listener)
  }
}

function otherChangesSentence(n: number): string {
  return n === 1 ? "1 other permission changed too." : `${n} other permissions changed too.`
}

/** Kit 40.3 rule 6 and pending banner rule 5: one toast per save. */
function toastSaved(role: RoleDetail, notices: string[]) {
  if (detailsToast !== null) toast.dismiss(detailsToast)
  detailsToast = null
  if (notices.length === 0) {
    toast.success(savedSentence(role))
    return
  }
  detailsToast = toast.success(savedSentence(role), {
    description: otherChangesSentence(notices.length),
    // The list is behind Details, so the toast waits to be closed.
    duration: Infinity,
    action: {
      label: "Details",
      onClick: (event) => {
        // Keep the toast: Details can be opened again until it is closed.
        event.preventDefault()
        setDetails({ open: true, notices })
      },
    },
    onDismiss: () => {
      detailsToast = null
    },
  })
}

/**
 * The list behind the save toast's Details. Rendered by every editor;
 * when the last one goes (the user left the role editor), the toast goes
 * too, so its Details is never a button that does nothing. The check
 * waits a tick: /new handing over to the role's own page, and React's
 * development double mount, both unmount one editor and mount the next.
 */
function SaveDetailsDialog() {
  const shown = React.useSyncExternalStore(subscribeDetails, () => details, () => details)

  React.useEffect(() => {
    mountedEditors += 1
    return () => {
      mountedEditors -= 1
      window.setTimeout(() => {
        if (mountedEditors > 0) return
        if (detailsToast !== null) toast.dismiss(detailsToast)
        detailsToast = null
        setDetails({ open: false, notices: [] })
      }, 0)
    }
  }, [])

  return (
    <Dialog
      open={shown.open}
      onOpenChange={(open) => {
        if (!open) setDetails({ ...details, open: false })
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Other permissions this save changed</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <ul className="flex flex-col gap-2 text-body text-text-primary">
            {shown.notices.map((notice) => (
              <li key={notice} className="min-w-0 break-words">
                {notice}
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setDetails({ ...details, open: false })}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface FormValues {
  name: string
  description: string
  ticks: RoleTicks
}

const EMPTY: FormValues = { name: "", description: "", ticks: {} }

/** The modules this editor shows: every one, except the one holding access management on an ordinary role (40.3 rule 13). */
function modulesFor(readOnly: boolean) {
  return CATALOGUE.filter((mod) => readOnly || !mod.adminOnly)
}

/**
 * A stored role as ticks. Picks are dropped (they follow the ticks). See
 * amounts counts as ticked on purpose only when nothing ticked needs it;
 * otherwise it came in with the tick that needs it and goes with it.
 */
function ticksOf(role: RoleDetail, readOnly: boolean): RoleTicks {
  const ticks: RoleTicks = {}
  for (const mod of modulesFor(readOnly)) {
    for (const section of mod.sections) {
      for (const action of section.actions) {
        const held = (role.permissions[action.key] ?? []).filter((s) => section.scopes.includes(s))
        // One scope per tick; were a row stored at two, the wider is the one that reaches.
        if (held.length > 0) ticks[action.key] = held[held.length - 1]
      }
    }
    if (mod.seeAmounts && (role.permissions[mod.seeAmounts.key]?.length ?? 0) > 0) {
      if (amountsNeededBy(mod, ticks).length === 0) ticks[mod.seeAmounts.key] = "all"
    }
  }
  return ticks
}

/** The save's `permissions`: only what an ordinary role may hold (40.3 rule 13). */
function ticksForSave(ticks: RoleTicks): RoleTicks {
  const allowed = new Set<PermissionKey>(modulesFor(false).flatMap((mod) => tickableKeys(mod)))
  const out: RoleTicks = {}
  for (const [key, scope] of Object.entries(ticks) as Array<[PermissionKey, Scope]>) {
    if (allowed.has(key)) out[key] = scope
  }
  return out
}

function holdersSentence(people: number): string {
  if (people === 0) return "Nobody has this role"
  return people === 1 ? "1 person has this role" : `${people} people have this role`
}

/** Kit 40.3 rule 6: the save toast states the effect. */
function savedSentence(role: RoleDetail): string {
  if (role.people === 0) return `${role.name} saved`
  const who = role.people === 1 ? "1 person has" : `${role.people} people have`
  return `${role.name} saved. ${who} the new permissions from their next request.`
}

function validateName(name: string): string | null {
  const n = name.trim()
  if (!n) return "Enter the role’s name"
  if (n.length > 80) return "A role name can be at most 80 characters"
  return null
}

type Load =
  | { state: "loading" }
  | { state: "ready"; role: RoleDetail | null }
  | { state: "not-found" }
  | { state: "failed"; message: string }

export function RoleEditor({ roleId, fromId }: { roleId?: string; fromId?: string }) {
  const router = useRouter()
  const { refresh, can } = usePermissions()
  const isEdit = roleId !== undefined
  const sourceId = roleId ?? fromId

  const [load, setLoad] = React.useState<Load>(sourceId ? { state: "loading" } : { state: "ready", role: null })
  const [attempt, setAttempt] = React.useState(0)
  const [values, setValues] = React.useState<FormValues>(EMPTY)
  const [saved, setSaved] = React.useState<FormValues>(EMPTY)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const role = load.state === "ready" ? load.role : null
  // Kit 26.1 and 26.4 rule 5: Save is enabled only on a definite yes. If a
  // refresh takes access away while the page is open, Save disables with
  // its reason instead of being left to fail.
  const canManage = can("access.rights.manage")
  // The server's own answer (kit 26.5): only the system role refuses Edit.
  const readOnly = isEdit && role !== null && typeof role.can.edit === "string"

  React.useEffect(() => {
    if (!sourceId) return
    let cancelled = false
    accessApi
      .getRole(sourceId)
      .then((found) => {
        if (cancelled) return
        const fixed = typeof found.can.edit === "string"
        if (isEdit) {
          const form = { name: found.name, description: found.description, ticks: ticksOf(found, fixed) }
          setValues(form)
          setSaved(form)
        } else {
          // Duplicate: a new role, so nothing counts as saved yet (40.2 rule 8).
          setValues({ name: `Copy of ${found.name}`, description: found.description, ticks: ticksOf(found, false) })
          setSaved(EMPTY)
        }
        setLoad({ state: "ready", role: found })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        // Kit 26.6 rule 5: a record that is not there is "not found".
        if (caught instanceof ApiError && caught.status === 404) setLoad({ state: "not-found" })
        else setLoad({ state: "failed", message: errorMessage(caught) })
      })
    return () => {
      cancelled = true
    }
  }, [sourceId, isEdit, attempt])

  const changed = !readOnly && isChanged(values, saved)
  // New and Duplicate are create: nothing exists until Save.
  const unsaved = useUnsavedChanges({
    changed: changed && !saving,
    noun: "role",
    mode: isEdit ? "edit" : "create",
  })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (readOnly || saving || load.state !== "ready") return
    const problem = validateName(values.name)
    if (problem) {
      setNameError(problem)
      document.getElementById("role-name")?.focus()
      return
    }

    setSaving(true)
    setSaveError(null)
    const body = {
      name: values.name.trim(),
      description: values.description.trim(),
      permissions: ticksForSave(values.ticks),
    }
    try {
      const result = isEdit ? await accessApi.updateRole(roleId, body) : await accessApi.createRole(body)
      // Kit 26.4 rule 2: a save on the access screens asks for permissions again.
      refresh()
      toastSaved(result.role, result.notices)
      if (isEdit) {
        const form = { name: result.role.name, description: result.role.description, ticks: ticksOf(result.role, false) }
        setValues(form)
        setSaved(form)
        setLoad({ state: "ready", role: result.role })
        setSaving(false)
      } else {
        // Nothing unsaved now. The toast, and its Details, outlive the
        // change of address to the role's own page.
        setSaved(values)
        router.replace(ACCESS_PATHS.role(result.role.id))
      }
    } catch (caught) {
      setSaving(false)
      const message = errorMessage(caught)
      // A name another role already has is about one field (7.1).
      if (caught instanceof ApiError && caught.status === 409 && /already a role/i.test(message)) {
        setNameError(message)
        document.getElementById("role-name")?.focus()
      } else {
        setSaveError(message)
      }
    }
  }

  if (load.state === "not-found") {
    return <ErrorPage variant="not-found" inShell dashboardHref={ACCESS_PATHS.roles} />
  }

  const loading = load.state === "loading"
  const savedName = isEdit ? (role?.name ?? "") : ""
  const title = isEdit ? savedName : "New role"
  const deleteAnswer = role?.can.delete

  return (
    <FormFrame>
      <FormScrollArea>
        <PageColumn>
          {/* Kit 40.1 rule 3: "Access › Roles › Office accountant". */}
          <RecordBreadcrumb
            trail={[
              { label: "Access", href: "/access" },
              { label: "Roles", href: ACCESS_PATHS.roles },
            ]}
            current={isEdit ? (savedName || "Role") : "New role"}
          />

          <PageHeader
            className="mt-4"
            // Kit 14 rule 1: while loading, the skeletons sit INSIDE the
            // title's and the meta's own lines (inline, so each line keeps
            // its type-ramp height), and nothing below moves when they land.
            title={loading ? <Skeleton className="inline-block h-8 w-64 max-w-full align-middle" /> : title}
            meta={
              isEdit && role ? (
                holdersSentence(role.people)
              ) : isEdit && loading ? (
                <Skeleton className="inline-block h-3 w-32 align-middle" />
              ) : undefined
            }
            actions={
              isEdit && role ? (
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="More actions" />} />
                      }
                    >
                      <MoreHorizontalIcon />
                    </TooltipTrigger>
                    <TooltipContent side="bottom">More actions</TooltipContent>
                  </Tooltip>
                  {/* 40.3 rule 1: the three-dot menu holds Duplicate and Delete. */}
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem render={<Link href={ACCESS_PATHS.duplicateRole(role.id)} />}>
                        <CopyIcon />
                        Duplicate
                      </DropdownMenuItem>
                      <PermissionTooltip
                        allowed={deleteAnswer === true}
                        reason={typeof deleteAnswer === "string" ? deleteAnswer : ""}
                      >
                        <DropdownMenuItem
                          variant="danger"
                          disabled={deleteAnswer !== true}
                          onClick={() => setDeleting(true)}
                        >
                          <TrashIcon />
                          Delete role
                        </DropdownMenuItem>
                      </PermissionTooltip>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : undefined
            }
          />

          {load.state === "failed" ? (
            <div className="mt-8">
              <FormLoadFailed
                message={load.message}
                onRetry={() => {
                  setLoad({ state: "loading" })
                  setAttempt((a) => a + 1)
                }}
              />
            </div>
          ) : (
            <>
              <FormError message={saveError} />

              <form id="role-form" onSubmit={submit} noValidate className="mt-8 flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-12 gap-6">
                      <FormField
                        span={6}
                        label="Name"
                        required
                        htmlFor="role-name"
                        error={nameError}
                        hint={readOnly ? undefined : "An add-on role, held on top of a job role, starts with “+”: “+ Invoice approver”."}
                      >
                        <Input
                          id="role-name"
                          value={values.name}
                          maxLength={80}
                          disabled={loading || readOnly}
                          aria-invalid={Boolean(nameError) || undefined}
                          placeholder="Office accountant"
                          onChange={(event) => {
                            const name = event.target.value
                            setValues((v) => ({ ...v, name }))
                            if (nameError) setNameError(null)
                          }}
                          onBlur={(event) => setNameError(validateName(event.target.value))}
                        />
                      </FormField>
                      <FormField span={6} label="Description" htmlFor="role-description">
                        <Textarea
                          id="role-description"
                          rows={2}
                          value={values.description}
                          disabled={loading || readOnly}
                          onChange={(event) => {
                            const description = event.target.value
                            setValues((v) => ({ ...v, description }))
                          }}
                        />
                      </FormField>
                    </div>
                  </CardContent>
                </Card>

                <p className="text-label text-text-secondary">{SCOPE_MEANINGS}</p>

                {readOnly ? (
                  // Pending banner rule 3: it explains why nothing here can
                  // be changed, so it has no close. Rule 1: one line.
                  <Banner variant="neutral" layout="line">
                    <InfoIcon />
                    <BannerDescription>{SYSTEM_ROLE_BANNER}</BannerDescription>
                  </Banner>
                ) : null}

                {modulesFor(readOnly).map((mod) => (
                  <Card key={mod.key}>
                    <CardHeader>
                      <CardTitle>{mod.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <Skeleton className="h-40 w-full" />
                      ) : (
                        <PermissionGrid
                          module={mod}
                          ticks={values.ticks}
                          readOnly={readOnly}
                          onTicksChange={(ticks) => setValues((v) => ({ ...v, ticks }))}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </form>
            </>
          )}
        </PageColumn>
      </FormScrollArea>

      {/* 40.3 rule 4: one Save for the whole role, Cancel on its left. The
          system role has no Save (rule 14), and so no footer. */}
      {readOnly ? null : (
        <FormFooter>
          <Button variant="secondary" render={<Link href={ACCESS_PATHS.roles} />}>
            Cancel
          </Button>
          <PermissionTooltip allowed={canManage} reason={reasonFor("access.rights.manage")}>
            <Button
              type="submit"
              form="role-form"
              disabled={canManage !== true || saving || loading || load.state === "failed"}
            >
              {saving ? "Saving…" : "Save role"}
            </Button>
          </PermissionTooltip>
        </FormFooter>
      )}

      {unsaved.warning}

      <SaveDetailsDialog />

      {deleting && role ? (
        <DeleteRecordDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(false)
          }}
          recordName={role.name}
          what="role"
          consequences="Nobody holds this role, so nobody loses access. The access history keeps its name."
          onConfirm={async () => {
            try {
              await accessApi.deleteRole(role.id)
            } catch (caught) {
              // Someone was given it since this page loaded: say why, and reload.
              if (isBlocked(caught)) setAttempt((a) => a + 1)
              throw caught
            }
          }}
          onDeleted={() => {
            toast.success(`${role.name} deleted`)
            refresh()
            setSaved(values)
            router.replace(ACCESS_PATHS.roles)
          }}
        />
      ) : null}

    </FormFrame>
  )
}
