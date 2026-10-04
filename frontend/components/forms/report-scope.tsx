"use client"

import * as React from "react"

import { pick } from "@/lib/api"
import { Label } from "@/components/ui/label"
import { SearchableSelect, type SearchOption } from "@/components/ui/searchable-select"

/**
 * The scope both year-wise reports are read at: every site by
 * default, narrowed by project, by site, or by both.
 *
 * **ALL SITES IS THE DEFAULT VIEW** (client instruction, 23 Sep 2026).
 * It was the first project until a site stopped needing one (migration
 * 0007), and that default then hid real money: opening on a project
 * silently excluded every site outside it, with nothing on screen
 * saying so. A rollup is still what "total year wise" asks for — the
 * change is which set is rolled up, not that one is.
 *
 * The client was shown what this costs before it was agreed: the
 * opening figure grows by whatever sits outside the first project,
 * which on their data was most of it. Choosing a project returns the
 * old number exactly.
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
 *
 * Sites search the server as the user types (access plan P8): a Pick
 * answers at most 50, and nothing caps the number of sites. The server
 * narrows them to the chosen project, so the list follows the project
 * without the browser filtering a capped answer.
 */

/**
 * The project scope meaning "the sites that belong to no project"
 * (migration 0007). Matches `NO_PROJECT` in the API's variance service,
 * which turns it into `project_id is null` — it is NOT a uuid and must
 * never be treated as one.
 *
 * It sits in the same select as the project names rather than beside
 * it, because it answers the same question the select asks: which
 * sites is this report about. A separate tick box would let a user ask
 * for a project AND no project at once, which is not a scope.
 */
export const NO_PROJECT = "none"

export interface ReportScope {
  projectId: string
  /** Empty string is "All sites". */
  siteId: string
}

export function useReportScope(): {
  scope: ReportScope
  setProjectId: (id: string) => void
  setSiteId: (id: string, option?: SearchOption) => void
  projects: Record<string, string>
  /** The names of the sites chosen so far, for labelling the scope. */
  sites: Record<string, string>
  /** The site search, narrowed to the chosen project. */
  searchSites: (query: string) => Promise<SearchOption[]>
  loading: boolean
  failure: string | null
  retry: () => void
} {
  const [projects, setProjects] = React.useState<Record<string, string>>({})
  const [siteNames, setSiteNames] = React.useState<Record<string, string>>({})
  const [projectId, setProjectIdState] = React.useState("")
  const [siteId, setSiteIdState] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    // Choosing a scope is picking (access plan P7 inventory 7): the
    // project and site Picks, which a report's permission brings with it.
    pick
      .projects()
      .then((projectList) => {
        if (cancelled) return
        // "No project" leads, before the names. It is a scope in its
        // own right, not a fallback for a missing one, and a reader
        // scanning a long project list should not have to reach the
        // bottom to find it.
        setProjects({
          // "All" is a real option, not an absence. The select must
          // never sit on a blank trigger reading "Choose a project"
          // while the table below already shows every site — the
          // control and the figures have to agree at first paint.
          "": "All",
          [NO_PROJECT]: "No project",
          ...Object.fromEntries(projectList.map((p) => [p.id, p.name])),
        })
        // No default to set: the initial "" IS the scope, and it means
        // every site. Seeding the first project here is what the change
        // above removed.
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailure("The project list could not be loaded.")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const searchSites = React.useCallback(
    (query: string): Promise<SearchOption[]> =>
      pick
        .sites({ q: query, projectId: projectId || undefined })
        .then((rows) => rows.map((site) => ({ value: site.id, label: site.name }))),
    [projectId],
  )

  return {
    scope: { projectId, siteId },
    // Changing the project drops a site that no longer belongs to it.
    // Leaving it would show a scope the controls no longer describe.
    setProjectId: (id: string) => {
      setProjectIdState(id)
      setSiteIdState("")
    },
    setSiteId: (id: string, option?: SearchOption) => {
      if (option) setSiteNames((names) => ({ ...names, [option.value]: option.label }))
      setSiteIdState(id)
    },
    projects,
    sites: siteNames,
    searchSites,
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
  searchSites,
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
          placeholder="All"
          searchPlaceholder="Search projects"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="scope-site">Site</Label>
        <SearchableSelect
          // A new project is a new list: remounting drops the old answer.
          key={scope.projectId}
          id="scope-site"
          options={{ "": "All sites" }}
          search={searchSites}
          selectedLabel={sites[scope.siteId]}
          value={scope.siteId}
          onValueChange={setSiteId}
          disabled={loading}
          placeholder="All sites"
          searchPlaceholder="Search sites"
          emptyMessage={(q) => (q ? `No sites match '${q}'.` : "There are no sites here.")}
        />
      </div>
    </>
  )
}
