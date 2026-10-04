"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { EllipsisIcon, HistoryIcon, ListChecksIcon, PlusIcon, PowerIcon, XIcon } from "lucide-react"

import {
  ACCESS_PATHS,
  accessApi,
  byRoleOrder,
  isBlocked,
  type Named,
  type PersonDetail,
  type RoleDetail,
} from "@/lib/access-api"
import { ApiError, pick, type PersonPick } from "@/lib/api"
import type { PermissionKey, Scope } from "@/lib/permission-keys"
import { SCOPES } from "@/lib/permission-keys"
import { formatNumber } from "@/lib/format"
import { reasonFor, recordAnswer, UNIT, useCan, usePermissions } from "@/lib/permissions"
import { errorMessage, useSession } from "@/components/shell/session"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Label } from "@/components/ui/label"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { SearchableSelect, type SearchOption } from "@/components/ui/searchable-select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isChanged, useUnsavedChanges } from "@/components/ui/unsaved-changes"
import { FormError, FormLoadFailed } from "@/components/forms/form-error"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { ErrorPage } from "@/components/templates/error-page"
import { FormFooter, FormFrame, FormScrollArea } from "@/components/templates/form-page"
import { PageColumn, PageHeader } from "@/components/templates/page"
import { UnitPicker } from "@/components/access/unit-picker"
import {
  namesText,
  PersonStatusBadge,
  scopesText,
  useAllUnits,
  useSetActive,
} from "@/components/access/person-access"
import { useAnswer } from "@/components/access/url-list"

/**
 * A person's access page (kit 40.7, access plan P10): the roles they
 * hold, the sites their Selected sites permissions reach, and who they
 * report to. A form page with a fixed footer and ONE Save, "Save access"
 * (kit 40.3 rule 4): roles, ticked sites and, when it changed, who they
 * report to go in one request and one transaction
 * (PUT /access/people/:id/access), so a refusal leaves all three as they
 * were.
 *
 * Roles only add up (kit 40.7 rule 6): nothing here grants or removes a
 * single permission. Adding or removing a role changes the form, not the
 * record, until Save (rule 5).
 *
 * Someone must always be able to manage access (kit 40.11): the server
 * sends, with each role this person holds, whether it may be removed,
 * and with the person whether they may be deactivated, so the last
 * holder's remove button and Deactivate are disabled with the reason
 * before anyone tries. If the server refuses anyway (two people acting
 * at once), the refusal is an error toast and the person reloads.
 *
 * Every save refreshes the signed-in person's own permissions (kit 26.4
 * rule 2): they may have just changed their own.
 */

const NONE = "__none__"
const MANAGE: PermissionKey = "access.rights.manage"

interface Values {
  roleIds: string[]
  unitIds: string[]
  reportsToId: string
}

function valuesOf(person: PersonDetail): Values {
  return {
    roleIds: person.roles.map((r) => r.id),
    unitIds: [...person.unitIds].sort(),
    reportsToId: person.reportsTo?.id ?? NONE,
  }
}

/** The form compared as a set of roles, so removing and re-adding one is no change. */
function sameValues(a: Values, b: Values): boolean {
  return !isChanged({ ...a, roleIds: [...a.roleIds].sort() }, { ...b, roleIds: [...b.roleIds].sort() })
}

/** The scopes a role's own permissions use (Picks left out), in R1 order, from its detail. */
function roleScopes(detail: RoleDetail): Scope[] {
  const used = new Set<Scope>()
  for (const [key, scopes] of Object.entries(detail.permissions)) {
    if (key.endsWith(".pick")) continue
    for (const scope of scopes ?? []) used.add(scope)
  }
  return SCOPES.filter((s) => used.has(s))
}

export function PersonAccessPage({ personId }: { personId: string }) {
  const router = useRouter()
  const { user } = useSession()
  const { refresh: refreshPermissions } = usePermissions()
  const canManage = useCan(MANAGE)

  const person = useAnswer(`person:${personId}`, () => accessApi.getPerson(personId))
  const units = useAllUnits()
  const roles = useAnswer("roles", () => accessApi.listRoles({ pageSize: 100 }))

  // ---- the form ----------------------------------------------------------

  const [values, setValues] = React.useState<Values | null>(null)
  const [savedValues, setSavedValues] = React.useState<Values | null>(null)
  const [seen, setSeen] = React.useState<PersonDetail | null>(null)
  const loaded = person.value
  if (loaded && loaded !== seen) {
    // A fresh read of the person (first load, after a save, after
    // Activate) moves the saved values; the form follows unless the
    // user has unsaved changes, which are never thrown away.
    const next = valuesOf(loaded)
    const dirty = values !== null && savedValues !== null && !sameValues(values, savedValues)
    setSeen(loaded)
    setSavedValues(next)
    if (!dirty) setValues(next)
  }

  const changed = values !== null && savedValues !== null && !sameValues(values, savedValues)
  const unsaved = useUnsavedChanges({ changed, noun: "person's access" })

  // ---- role details: the scopes each role uses, and whether it manages access

  const [details, setDetails] = React.useState<ReadonlyMap<string, RoleDetail>>(() => new Map())
  const wanted = React.useMemo(() => {
    const ids = new Set<string>([...(values?.roleIds ?? []), ...(savedValues?.roleIds ?? [])])
    return [...ids].sort()
  }, [values?.roleIds, savedValues?.roleIds])
  const missing = wanted.filter((id) => !details.has(id)).join(",")
  React.useEffect(() => {
    if (!missing) return
    let cancelled = false
    Promise.all(missing.split(",").map((id) => accessApi.getRole(id).catch(() => null))).then((found) => {
      if (cancelled) return
      setDetails((current) => {
        const next = new Map(current)
        for (const detail of found) if (detail) next.set(detail.id, detail)
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [missing])

  const roleList = React.useMemo(() => roles.value?.data ?? [], [roles.value])
  const nameOfRole = (id: string): string =>
    details.get(id)?.name ??
    loaded?.roles.find((r) => r.id === id)?.name ??
    roleList.find((r) => r.id === id)?.name ??
    "Role"
  const scopesOfRole = (id: string): Scope[] | null => {
    const held = loaded?.roles.find((r) => r.id === id)
    if (held) return held.scopes
    const detail = details.get(id)
    return detail ? roleScopes(detail) : null
  }
  const managesAccess = (id: string): boolean | undefined => {
    const detail = details.get(id)
    return detail ? Boolean(detail.permissions[MANAGE]?.length) : undefined
  }

  // ---- saving ------------------------------------------------------------

  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reportsToError, setReportsToError] = React.useState<string | null>(null)
  const [confirmSelf, setConfirmSelf] = React.useState(false)

  const isSelf = user?.id === personId

  /** Kit 40.7 rule 3: this save takes away the signed-in person's own access to these screens. */
  function removesOwnAccess(): boolean {
    if (!isSelf || !values || !savedValues) return false
    const before = savedValues.roleIds.some((id) => managesAccess(id) === true)
    const after = values.roleIds.some((id) => managesAccess(id) !== false)
    return before && !after
  }

  function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (!values || !savedValues || saving || canManage !== true) return
    if (!changed) {
      toast.message("Nothing has changed, so there is nothing to save.")
      return
    }
    if (removesOwnAccess()) {
      setConfirmSelf(true)
      return
    }
    void save()
  }

  async function save() {
    if (!values || !savedValues || !loaded) return
    setSaving(true)
    setError(null)
    setReportsToError(null)
    try {
      const latest = await accessApi.savePersonAccess(personId, {
        roleIds: values.roleIds,
        unitIds: values.unitIds,
        // Sent only when it changed, so an untouched field never overwrites a newer value.
        ...(values.reportsToId !== savedValues.reportsToId
          ? { reportsToId: values.reportsToId === NONE ? null : values.reportsToId }
          : {}),
      })
      refreshPermissions()
      toast.success(`${loaded.name}'s access saved. It applies from their next request.`)
      setValues(valuesOf(latest))
      setSavedValues(valuesOf(latest))
      person.refresh()
    } catch (caught) {
      if (isBlocked(caught)) {
        // Kit 40.11 rule 3: the server refused (the last holder, raced):
        // the same sentence as a toast, and the person's state reloads.
        // Nothing was saved, so the form is reset to what is stored.
        toast.error(caught.message)
        const fresh = await accessApi.getPerson(personId).catch(() => null)
        if (fresh) {
          setValues(valuesOf(fresh))
          setSavedValues(valuesOf(fresh))
        }
        person.refresh()
      } else if (
        caught instanceof ApiError &&
        (caught.status === 422 || caught.status === 400) &&
        /report/i.test(caught.message)
      ) {
        // Kit 7.1: a refusal about one field (a reporting loop) shows on that field.
        setReportsToError(caught.message)
      } else {
        setError(errorMessage(caught))
      }
    } finally {
      setSaving(false)
    }
  }

  const setActive = useSetActive(person.refresh)

  // ---- reports to: the server-search people picker (access plan P8) -----

  const searchPeople = React.useCallback(
    (q: string): Promise<SearchOption[]> =>
      pick.people({ q }).then((rows: PersonPick[]) =>
        rows
          .filter((p) => p.id !== personId)
          .map((p) => ({ value: p.id, label: p.name, detail: p.designationName })),
      ),
    [personId],
  )
  const [reportsToName, setReportsToName] = React.useState<string | null>(null)

  // ---- states ------------------------------------------------------------

  if (person.state === "failed" && person.error && !loaded) {
    const notFound = /no longer exists/i.test(person.error)
    if (notFound) return <ErrorPage variant="not-found" inShell dashboardHref={ACCESS_PATHS.people} />
  }

  const name = loaded?.name ?? ""
  // Kit 14 rule 1: while loading, the skeletons sit INSIDE the title's and
  // the meta's own lines (inline, so each line keeps its type-ramp height),
  // and nothing below moves when the person lands.
  // Kit 14 rule 3: a failed load is not "loading", so no skeleton then.
  const failed = person.state === "failed" && !loaded
  const title = loaded ? (
    name
  ) : failed ? (
    "Person"
  ) : (
    <Skeleton className="inline-block h-8 w-64 max-w-full align-middle" />
  )

  const meta = loaded
    ? [
        loaded.reportsTo ? `Reports to ${loaded.reportsTo.name}` : "Reports to no one",
        namesText(loaded.ledUnits)
          ? `Leads ${namesText(loaded.ledUnits)}`
          : `Leads no ${UNIT.many}`,
      ].join(" · ")
    : null

  const toggle = loaded
    ? loaded.active
      ? recordAnswer(canManage, MANAGE, loaded.can.deactivate)
      : recordAnswer(canManage, MANAGE, loaded.can.activate)
    : { allowed: undefined, reason: "" }

  const heldIds = values?.roleIds ?? []
  const orderedHeld = heldIds
    .map((id) => ({ id, name: nameOfRole(id) }))
    .sort(byRoleOrder)
  const usesUnitsBy = orderedHeld.filter((r) => scopesOfRole(r.id)?.includes("units"))
  const scopesKnown = heldIds.every((id) => scopesOfRole(id) !== null)

  return (
    <>
      <FormFrame>
        <FormScrollArea>
          <PageColumn>
            <RecordBreadcrumb
              trail={[
                { label: "Access", href: "/access" },
                { label: "People", href: ACCESS_PATHS.people },
              ]}
              current={loaded ? name : "Person"}
            />

            <PageHeader
              className="mt-4"
              title={title}
              badges={loaded ? <PersonStatusBadge active={loaded.active} /> : null}
              meta={meta ?? (failed ? undefined : <Skeleton className="inline-block h-3 w-64 max-w-full align-middle" />)}
              actions={
                <>
                  <Button
                    variant="secondary"
                    nativeButton={false}
                    render={<Link href={ACCESS_PATHS.whatTheyCanDoFor(personId)} />}
                  >
                    <ListChecksIcon />
                    What they can do
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          aria-label={loaded ? `More actions for ${name}` : "More actions"}
                          disabled={!loaded}
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/* Kit 40.11 rule 1: the last holder cannot be deactivated, and says why. */}
                      <PermissionTooltip allowed={toggle.allowed} reason={toggle.reason}>
                        <DropdownMenuItem
                          disabled={toggle.allowed !== true}
                          onClick={() => loaded && void setActive(loaded, !loaded.active)}
                        >
                          <PowerIcon />
                          {loaded?.active === false ? "Activate" : "Deactivate"}
                        </DropdownMenuItem>
                      </PermissionTooltip>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => router.push(ACCESS_PATHS.historyForPerson(personId))}>
                        <HistoryIcon />
                        View access history
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
            />

            {person.state === "failed" && !loaded ? (
              <div className="mt-8">
                <FormLoadFailed message={person.error ?? ""} onRetry={person.refresh} />
              </div>
            ) : null}

            <div className="mt-6">
              <FormError message={error} />
            </div>

            <form id="person-access-form" onSubmit={submit} className="mt-6 flex flex-col gap-6">
              {/* Kit 40.7 rules 4 to 6: the roles they hold, and a picker of the rest. */}
              <Card>
                <CardHeader>
                  <CardTitle>Roles</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {!values ? (
                    <Skeleton className="h-9 w-full" />
                  ) : orderedHeld.length === 0 ? (
                    <p className="text-body text-text-secondary">
                      No roles yet, so they can do nothing. Add a role below.
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border-light rounded-lg border border-border-light">
                      {orderedHeld.map((role) => {
                        const held = loaded?.roles.find((r) => r.id === role.id)
                        // A role they hold now carries the server's answer
                        // (kit 40.11 rule 2); one added on this form can always go.
                        const removal = held
                          ? recordAnswer(canManage, MANAGE, held.can.remove)
                          : recordAnswer(canManage, MANAGE, true)
                        const scopes = scopesOfRole(role.id)
                        return (
                          <li key={role.id} className="flex min-w-0 items-center gap-4 px-4 py-2">
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="min-w-0 text-body font-medium text-text-primary">
                                <TextLinkName id={role.id} name={role.name} />
                              </span>
                              <span className="text-label text-text-secondary">
                                {scopes === null ? (
                                  <Skeleton className="h-4 w-24" />
                                ) : scopes.length ? (
                                  scopesText(scopes)
                                ) : (
                                  "No permissions"
                                )}
                              </span>
                            </div>
                            <PermissionTooltip allowed={removal.allowed} reason={removal.reason}>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="icon-sm"
                                      aria-label={`Remove role ${role.name}`}
                                      disabled={removal.allowed !== true || saving}
                                      onClick={() =>
                                        setValues((v) =>
                                          v ? { ...v, roleIds: v.roleIds.filter((id) => id !== role.id) } : v,
                                        )
                                      }
                                    />
                                  }
                                >
                                  <XIcon />
                                </TooltipTrigger>
                                <TooltipContent side="bottom">Remove role</TooltipContent>
                              </Tooltip>
                            </PermissionTooltip>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  <AddRole
                    roles={roleList.filter((r) => !heldIds.includes(r.id))}
                    loading={roles.state === "loading" || !values}
                    failed={roles.state === "failed"}
                    disabled={saving || canManage !== true}
                    onAdd={(id) => setValues((v) => (v ? { ...v, roleIds: [...v.roleIds, id] } : v))}
                  />
                </CardContent>
              </Card>

              {/* Kit 40.7 rules 7 to 14: shown only while a role they hold uses Selected sites. */}
              {!values || !scopesKnown ? (
                <Skeleton className="h-24 w-full" />
              ) : usesUnitsBy.length === 0 ? (
                <p className="text-body text-text-secondary">
                  {`None of their roles uses selected ${UNIT.many}.`}
                  {values.unitIds.length > 0
                    ? ` The ${formatNumber(values.unitIds.length)} ticked ${values.unitIds.length === 1 ? UNIT.one : UNIT.many} are kept in case such a role is added back.`
                    : ""}
                </p>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>{`Selected ${UNIT.many}`}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-body text-text-secondary">
                      {`Used by ${usesUnitsBy.map((r) => r.name).join(", ")}. `}
                      {units.units
                        ? `${formatNumber(values.unitIds.length)} of ${formatNumber(units.units.length)} ${UNIT.many} selected.`
                        : null}
                    </p>
                    {units.error ? (
                      <FormLoadFailed message={units.error} onRetry={units.retry} />
                    ) : units.units === null ? (
                      <Skeleton className="h-32 w-full" />
                    ) : (
                      <UnitPicker
                        units={units.units}
                        value={values.unitIds}
                        disabled={saving || canManage !== true}
                        onChange={(unitIds) => setValues((v) => (v ? { ...v, unitIds: [...unitIds].sort() } : v))}
                      />
                    )}
                    {/* Kit 40.7 rule 13: the sites they lead, as text, changed on each site. */}
                    {loaded && loaded.ledUnits.length > 0 ? (
                      <p className="border-t border-border-light pt-4 text-body text-text-secondary">
                        {`${capitalise(UNIT.many)} they lead, which they see without a tick: ${namesText(loaded.ledUnits)} (set on each ${UNIT.one}).`}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              )}

              {/* Who they report to: Team scope follows this line (plan P6, O8). */}
              <Card>
                <CardHeader>
                  <CardTitle>Reporting line</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Label htmlFor="person-reports-to">Reports to</Label>
                  <PermissionTooltip allowed={canManage} reason={reasonFor(MANAGE)}>
                    <SearchableSelect
                      id="person-reports-to"
                      options={{ [NONE]: "No one" }}
                      search={searchPeople}
                      selectedLabel={
                        values && loaded?.reportsTo && values.reportsToId === loaded.reportsTo.id
                          ? loaded.reportsTo.name
                          : reportsToName
                      }
                      value={values?.reportsToId ?? NONE}
                      onValueChange={(v, option) => {
                        setReportsToName(option?.label ?? null)
                        setReportsToError(null)
                        setValues((current) => (current ? { ...current, reportsToId: v } : current))
                      }}
                      disabled={!values || saving || canManage !== true}
                      placeholder="Choose a person"
                      searchPlaceholder="Search people"
                      emptyMessage={(q) => `No people match '${q}'.`}
                      className={reportsToError ? "border-danger" : undefined}
                    />
                  </PermissionTooltip>
                  <p className="text-label text-text-secondary">
                    Their team, and so what Team scope reaches, follows who reports to whom.
                  </p>
                  <InlineFieldError>{reportsToError}</InlineFieldError>
                </CardContent>
              </Card>
            </form>
          </PageColumn>
        </FormScrollArea>

        {/* Kit 11.3 rule 7, 40.7 rule 2: Cancel on the left, the one primary on the right. */}
        <FormFooter>
          <Button variant="secondary" nativeButton={false} render={<Link href={ACCESS_PATHS.people} />}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="person-access-form"
            disabled={!values || saving || canManage !== true}
          >
            {saving ? "Saving…" : "Save access"}
          </Button>
        </FormFooter>
      </FormFrame>

      {unsaved.warning}

      {/* Kit 40.7 rule 3: removing your own access asks first. */}
      <AlertDialog open={confirmSelf} onOpenChange={setConfirmSelf}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your own access to these screens?</AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer be able to manage roles or people. Someone else who can will have to give it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my access</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSelf(false)
                void save()
              }}
            >
              Remove my access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** The role's name, linking to its editor (kit 40.1 rule 3). */
function TextLinkName({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={ACCESS_PATHS.role(id)}
      className="rounded-lg text-text-primary underline-offset-2 hover:underline outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring"
    >
      {name}
    </Link>
  )
}

/** Kit 40.7 rule 5: a picker of the roles not yet held, and a secondary Add role beside it. */
function AddRole({
  roles,
  loading,
  failed,
  disabled,
  onAdd,
}: {
  roles: Named[]
  loading: boolean
  failed: boolean
  disabled: boolean
  onAdd: (id: string) => void
}) {
  const [chosen, setChosen] = React.useState<string>(NONE)
  const options: Record<string, string> = {}
  for (const role of [...roles].sort(byRoleOrder)) options[role.id] = role.name
  const valid = chosen !== NONE && chosen in options

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="person-add-role">Add a role</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-field-max min-w-0 flex-1">
          <SearchableSelect
            id="person-add-role"
            options={options}
            value={valid ? chosen : undefined}
            onValueChange={(v) => setChosen(v)}
            disabled={disabled || loading || failed || roles.length === 0}
            placeholder={
              loading
                ? "Loading roles"
                : failed
                  ? "The roles could not be loaded"
                  : roles.length === 0
                    ? "They hold every role"
                    : "Choose a role"
            }
            searchPlaceholder="Search roles"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || !valid}
          onClick={() => {
            if (!valid) return
            onAdd(chosen)
            setChosen(NONE)
          }}
        >
          <PlusIcon />
          Add role
        </Button>
      </div>
    </div>
  )
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
