"use client"

import * as React from "react"

import {
  api,
  query,
  type ListResponse,
  type Matchable,
  type Project,
  type Site,
} from "@/lib/api"
import { Label } from "@/components/ui/label"
import { SearchableSelect } from "@/components/ui/searchable-select"

/**
 * The scope both year-wise reports are read at: a project, optionally
 * narrowed to one of its sites.
 *
 * **A PROJECT IS THE DEFAULT VIEW**, per the client's "total year
 * wise", which reads as a rollup rather than as a per-site list. The
 * site select narrows it and starts at "All sites".
 *
 * These are scope controls and they live in the toolbar rather than
 * behind the section 27.3 filter panel. The reason that panel exists
 * is so a user can always see why a list is short and remove any one
 * condition in a click — which a labelled select showing its own value
 * already does, and does better, because there is no state where the
 * scope is applied and invisible. A panel would hide the one thing
 * these two reports are entirely defined by.
 *
 * Both are `searchable-select`: the project and site masters grow, and
 * section 16.3 puts the search box at six options. Choosing the plain
 * `select` because there is one project today is how a screen breaks
 * quietly at the seventh.
 */

export interface ReportScope {
  projectId: string
  /** Empty string is "All sites". */
  siteId: string
}

export function useReportScope(): {
  scope: ReportScope
  setProjectId: (id: string) => void
  setSiteId: (id: string) => void
  projects: Record<string, string>
  sites: Record<string, string>
  loading: boolean
  failure: string | null
  retry: () => void
} {
  const [projects, setProjects] = React.useState<Record<string, string>>({})
  const [allSites, setAllSites] = React.useState<Site[]>([])
  const [projectId, setProjectIdState] = React.useState("")
  const [siteId, setSiteIdState] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<ListResponse<Project & Matchable>>(
        `/projects${query({ pageSize: 100, sort: "name", direction: "asc" })}`,
      ),
      api.get<ListResponse<Site & Matchable>>(
        `/sites${query({ pageSize: 100, sort: "name", direction: "asc" })}`,
      ),
    ])
      .then(([projectList, siteList]) => {
        if (cancelled) return
        setProjects(
          Object.fromEntries(projectList.data.map((p) => [p.id, p.name])),
        )
        setAllSites(siteList.data)
        // The first project is the default view. A report with no scope
        // chosen would have nothing to show and no way to say why.
        setProjectIdState((current) => current || (projectList.data[0]?.id ?? ""))
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailure("The project and site lists could not be loaded.")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Derived in render, not synced in an effect: the sites a project has
  // are a function of the project, never a separate piece of state.
  const sites = React.useMemo(
    () =>
      Object.fromEntries(
        allSites
          .filter((s) => !projectId || s.projectId === projectId)
          .map((s) => [s.id, s.name]),
      ),
    [allSites, projectId],
  )

  return {
    scope: { projectId, siteId },
    // Changing the project drops a site that no longer belongs to it.
    // Leaving it would show a scope the controls no longer describe.
    setProjectId: (id: string) => {
      setProjectIdState(id)
      setSiteIdState("")
    },
    setSiteId: setSiteIdState,
    projects,
    sites,
    loading,
    failure,
    retry: () => {
      setFailure(null)
      setLoading(true)
      setAttempt((a) => a + 1)
    },
  }
}

export function ReportScopeControls({
  scope,
  setProjectId,
  setSiteId,
  projects,
  sites,
  loading,
}: ReturnType<typeof useReportScope>) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="scope-project">Project</Label>
        <SearchableSelect
          id="scope-project"
          options={projects}
          value={scope.projectId}
          onValueChange={setProjectId}
          disabled={loading}
          placeholder="Choose a project"
          searchPlaceholder="Search projects"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="scope-site">Site</Label>
        <SearchableSelect
          id="scope-site"
          options={{ "": "All sites", ...sites }}
          value={scope.siteId}
          onValueChange={setSiteId}
          disabled={loading}
          placeholder="All sites"
          searchPlaceholder="Search sites"
        />
      </div>
    </>
  )
}
