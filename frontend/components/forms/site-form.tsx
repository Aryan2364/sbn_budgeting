"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import {
  api,
  query,
  type AllocationWarning,
  type ListResponse,
  type Matchable,
  type Person,
  type Project,
  type Site,
  type SiteLocation,
} from "@/lib/api"
import { errorMessage } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Skeleton } from "@/components/ui/skeleton"
import { PageColumn, PageHeader } from "@/components/templates/page"
import {
  FormField,
  FormFooter,
  FormFrame,
  FormScrollArea,
  FormSection,
} from "@/components/templates/form-page"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { FormError, FormLoadFailed } from "@/components/forms/form-error"

/** `Date` to the `YYYY-MM-DD` the API stores. Never through toISOString, which shifts by timezone. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function fromIsoDate(text: string | undefined): Date | undefined {
  if (!text) return undefined
  const [year, month, day] = text.split("-").map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

/**
 * Add and Edit, in ONE component (section 4 rule 1).
 *
 * The manager and supervisor pickers read the whole people list.
 * There is no manager/supervisor axis on a user any more (question 3),
 * so they are not filtered subsets — they are the list.
 */
export function SiteForm({ siteId }: { siteId?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const isEdit = siteId !== undefined

  const [projectId, setProjectId] = React.useState(params.get("projectId") ?? "")
  const [name, setName] = React.useState("")
  const [siteLocationId, setSiteLocationId] = React.useState("")
  const [plannedTrees, setPlannedTrees] = React.useState("")
  const [startDate, setStartDate] = React.useState<Date | undefined>(undefined)
  const [completeDate, setCompleteDate] = React.useState<Date | undefined>(undefined)
  const [managerId, setManagerId] = React.useState("")
  const [supervisorId, setSupervisorId] = React.useState("")

  const [projects, setProjects] = React.useState<Record<string, string>>({})
  const [locations, setLocations] = React.useState<Record<string, string>>({})
  const [people, setPeople] = React.useState<Record<string, string>>({})

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  /**
   * Section 13: a failed LOAD is its own state, not a failed save.
   * Kept apart from `error`, which carries save failures only.
   */
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    let cancelled = false
    const lists = Promise.all([
      api.get<ListResponse<Project & Matchable>>(
        `/projects${query({ pageSize: 100, sort: "name", direction: "asc" })}`,
      ),
      api.get<ListResponse<SiteLocation & Matchable>>(
        `/site-locations${query({ pageSize: 100, sort: "name", direction: "asc" })}`,
      ),
      // Every user, whether or not they can sign in. A person named on
      // a site need never log in (question 3).
      api.get<ListResponse<Person & Matchable>>(
        `/users${query({ pageSize: 100, sort: "name", direction: "asc" })}`,
      ),
    ])

    Promise.all([lists, siteId ? api.get<Site>(`/sites/${siteId}`) : null])
      .then(([[projectList, locationList, peopleList], site]) => {
        if (cancelled) return
        setProjects(Object.fromEntries(projectList.data.map((p) => [p.id, p.name])))
        setLocations(Object.fromEntries(locationList.data.map((l) => [l.id, l.name])))
        setPeople(Object.fromEntries(peopleList.data.map((p) => [p.id, p.name])))
        if (site) {
          setProjectId(site.projectId ?? "")
          setName(site.name)
          setSiteLocationId(site.siteLocationId ?? "")
          setPlannedTrees(String(site.plannedTrees))
          setStartDate(fromIsoDate(site.plantationStartDate))
          setCompleteDate(
            site.plantationCompleteDate
              ? fromIsoDate(site.plantationCompleteDate)
              : undefined,
          )
          setManagerId(site.managerId ?? "")
          setSupervisorId(site.supervisorId ?? "")
        }
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setLoadError(errorMessage(caught))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [siteId, reloadTick])

  function validate(): Record<string, string> {
    const found: Record<string, string> = {}
    // No check on the project. It is optional (client instruction,
    // 23 Sep 2026) and leaving it as None is an answer.
    if (name.trim() === "") found.name = "Enter the site name"
    if (plannedTrees.trim() === "") found.plannedTrees = "Enter the number of trees"
    else if (!/^\d+$/.test(plannedTrees.trim())) {
      found.plannedTrees = "Enter the number of trees as a whole number, like 5000"
    } else if (Number(plannedTrees) < 1) {
      found.plannedTrees = "A site needs at least one tree"
    }
    // Required (question 6): the fallback period anchor, and the only
    // one a site has while it is still being planted.
    if (!startDate) {
      found.startDate = "Enter the plantation start date, like 21/03/26"
    }
    // A site cannot finish being planted before it started. The
    // database carries the same check; this is so the person sees it
    // beside the field rather than as a failed save (section 7.1).
    if (startDate && completeDate && completeDate < startDate) {
      found.completeDate =
        "The plantation complete date cannot be before the start date"
    }
    return found
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const found = validate()
    if (Object.keys(found).length > 0) {
      setFieldErrors(found)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const body = {
        projectId: projectId || null,
        name,
        siteLocationId: siteLocationId || null,
        plannedTrees: Number(plannedTrees),
        plantationStartDate: toIsoDate(startDate!),
        plantationCompleteDate: completeDate ? toIsoDate(completeDate) : null,
        managerId: managerId || null,
        supervisorId: supervisorId || null,
      }
      const saved = isEdit
        ? await api.patch<{ site: Site; warning: AllocationWarning | null }>(
            `/sites/${siteId}`,
            body,
          )
        : await api.post<{ site: Site; warning: AllocationWarning | null }>(
            "/sites",
            body,
          )

      /**
       * Question 5: over-allocation is a WARNING, never a block. The
       * save has already happened by the time this runs.
       *
       * The toast confirms the save; the over-allocation itself is a
       * condition that stays true until somebody changes a number, so
       * it is a banner on the site and project pages rather than
       * something that vanishes in four seconds (section 7.1).
       */
      toast.success(isEdit ? "Site saved" : "Site created")
      router.push(`/sites/${saved.site.id}`)
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }

  const title = isEdit ? name || "Edit site" : "New site"

  return (
    <FormFrame>
      <FormScrollArea>
        <PageColumn>
          <RecordBreadcrumb
            trail={[{ label: "Sites", href: "/sites" }]}
            current={isEdit ? "Edit" : "New site"}
          />

          <PageHeader
            className="mt-4"
            title={loading && isEdit ? <Skeleton className="h-8 w-64" /> : title}
          />

          {loadError !== null ? (
            <FormLoadFailed
              message={loadError}
              onRetry={() => {
                setLoadError(null)
                setLoading(true)
                setReloadTick((t) => t + 1)
              }}
            />
          ) : null}

          <FormError message={error} />

          <form id="site-form" onSubmit={submit} className="mt-8">
            <FormSection
              label="Site"
              description="Its budget is set per tree against the count below."
            >
              {/*
                * Optional, and not marked optional either. Most clients
                * are not expected to create a single project, so a
                * hint reading "optional" on a field they will never
                * fill is one more thing to read and dismiss on every
                * site they enter.
                *
                * "None" is a real first choice rather than a cleared
                * state: it shows on the trigger when nothing is
                * picked, AND it is selectable, which is how a site
                * that was linked gets unlinked again. A placeholder
                * alone would let the link be made and never undone.
                */}
              <FormField span={6} label="Project" htmlFor="projectId">
                <SearchableSelect
                  id="projectId"
                  options={{ "": "None", ...projects }}
                  value={projectId}
                  onValueChange={setProjectId}
                  disabled={loading}
                  placeholder="None"
                  searchPlaceholder="Search projects"
                />
              </FormField>

              <FormField
                span={6}
                label="Site name"
                required
                htmlFor="name"
                error={fieldErrors.name}
              >
                <Input
                  id="name"
                  value={name}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.name) || undefined}
                  onChange={(event) => setName(event.target.value)}
                />
              </FormField>

              <FormField span={6} label="Location" htmlFor="siteLocationId">
                <SearchableSelect
                  id="siteLocationId"
                  options={locations}
                  value={siteLocationId}
                  onValueChange={setSiteLocationId}
                  disabled={loading}
                  placeholder="Choose a location"
                  searchPlaceholder="Search locations"
                />
              </FormField>

              <FormField
                span={3}
                label="Number of trees"
                required
                htmlFor="plannedTrees"
                error={fieldErrors.plannedTrees}
              >
                <Input
                  id="plannedTrees"
                  inputMode="numeric"
                  value={plannedTrees}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.plannedTrees) || undefined}
                  className="text-right tabular-nums"
                  placeholder="5000"
                  onChange={(event) => setPlannedTrees(event.target.value)}
                />
              </FormField>

              <FormField
                span={4}
                label="Plantation start date"
                required
                htmlFor="startDate"
                hint="Used to work out budget periods until the complete date is set."
                error={fieldErrors.startDate}
              >
                <DatePicker
                  id="startDate"
                  value={startDate}
                  onValueChange={setStartDate}
                  disabled={loading}
                  invalid={Boolean(fieldErrors.startDate) || undefined}
                />
              </FormField>

              {/*
                Section 17: a date is 4 columns, so it sits on the same
                row as the start date it belongs beside.

                OPTIONAL, and section 11.3 rule 3 means it carries no
                asterisk. A site still being planted has not got one,
                and the start date above covers that case — which is
                the client's own stated fallback, not an invention.
              */}
              <FormField
                span={4}
                label="Plantation complete date"
                htmlFor="completeDate"
                hint="Once set, budget periods are worked out from this date instead."
                error={fieldErrors.completeDate}
              >
                <DatePicker
                  id="completeDate"
                  value={completeDate}
                  onValueChange={setCompleteDate}
                  disabled={loading}
                  invalid={Boolean(fieldErrors.completeDate) || undefined}
                />
              </FormField>
            </FormSection>

            <FormSection
              label="People"
              description="Anyone on the people list can be named here, whether or not they sign in."
            >
              <FormField span={6} label="Site manager" htmlFor="managerId">
                <SearchableSelect
                  id="managerId"
                  options={people}
                  value={managerId}
                  onValueChange={setManagerId}
                  disabled={loading}
                  placeholder="Choose a person"
                  searchPlaceholder="Search people"
                />
              </FormField>

              <FormField span={6} label="Site supervisor" htmlFor="supervisorId">
                <SearchableSelect
                  id="supervisorId"
                  options={people}
                  value={supervisorId}
                  onValueChange={setSupervisorId}
                  disabled={loading}
                  placeholder="Choose a person"
                  searchPlaceholder="Search people"
                />
              </FormField>
            </FormSection>
          </form>
        </PageColumn>
      </FormScrollArea>

      <FormFooter>
        <Button
          variant="secondary"
          render={<Link href={isEdit ? `/sites/${siteId}` : "/sites"} />}
        >
          Cancel
        </Button>
        <Button type="submit" form="site-form" disabled={saving || loading}>
          {saving ? "Saving…" : isEdit ? "Save site" : "Create site"}
        </Button>
      </FormFooter>
    </FormFrame>
  )
}
