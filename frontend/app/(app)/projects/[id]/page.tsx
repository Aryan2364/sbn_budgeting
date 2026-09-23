"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"

import { api, query, type ListResponse, type Matchable, type Project, type Site } from "@/lib/api"
import { formatDate, formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButton } from "@/components/ui/export-button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Truncate } from "@/components/ui/truncate"
import { PageHeader, PageScroller } from "@/components/templates/page"
import {
  DetailColumns,
  DetailField,
  DetailFieldList,
} from "@/components/templates/detail-page"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { DeleteRecordDialog } from "@/components/forms/delete-record-dialog"
import { PermissionTooltip } from "@/components/forms/permission-tooltip"
import type { ExportColumn } from "@/lib/pdf-export"

/**
 * Mirrors the on-screen Sites table below, same order, same headers,
 * same formatted strings (AGENTS.md section 17.1) — a PDF or
 * spreadsheet formatted differently from the screen is a bug. The
 * trailing Actions column (Unlink) is a control, not data, and is
 * never exported.
 */
const PROJECT_SITE_PDF_COLUMNS: ExportColumn<Site>[] = [
  { header: "Site", cell: (row) => row.name },
  {
    header: "Location",
    cell: (row) => row.locationName ?? "—",
    excelValue: (row) => row.locationName ?? null,
  },
  {
    header: "Trees",
    cell: (row) => formatNumber(row.plannedTrees),
    numeric: true,
    excelValue: (row) => row.plannedTrees,
  },
  {
    header: "Planted",
    cell: (row) => formatDate(row.plantationStartDate),
    // A real Excel date cell, not the dd/mm/yy display STRING —
    // lib/excel-export.ts applies the dd/mm/yy number format.
    excelValue: (row) => new Date(row.plantationStartDate),
  },
]

/** Section 11.2. The detail template, with data. */
export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)
  const router = useRouter()
  const { isAdmin } = useSession()

  const [project, setProject] = React.useState<Project | null>(null)
  const [sites, setSites] = React.useState<Site[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  /** The site currently being unlinked, so only its own button waits. */
  const [unlinking, setUnlinking] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<Project>(`/projects/${id}`),
      api.get<ListResponse<Site & Matchable>>(
        `/sites${query({ projectId: id, pageSize: 100, sort: "name", direction: "asc" })}`,
      ),
    ])
      .then(([found, siteList]) => {
        if (cancelled) return
        setProject(found)
        setSites(siteList.data)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  /**
   * What an unlink does to this screen, applied IN PLACE.
   *
   * Refetching the project and its sites was correct and looked
   * broken: the header, the allocation line and the whole table blank
   * to skeletons and come back, which reads as the page reloading
   * rather than as one row leaving. §5 of the shared rules — update in
   * place, never flicker — and here the new state needs no server to
   * tell us what it is, because we know exactly which sites left and
   * how many trees went with them.
   */
  /** Every site left at once: the server unlinked them all. */
  function forgetAll() {
    setSites([])
    setProject((current) =>
      current ? { ...current, siteCount: 0, allocatedTrees: 0 } : current,
    )
  }

  function forget(gone: Site[]) {
    const ids = new Set(gone.map((site) => site.id))
    const trees = gone.reduce((sum, site) => sum + site.plannedTrees, 0)
    setSites((current) => (current ?? []).filter((site) => !ids.has(site.id)))
    setProject((current) =>
      current
        ? {
            ...current,
            siteCount: current.siteCount - gone.length,
            allocatedTrees: current.allocatedTrees - trees,
          }
        : current,
    )
  }

  /**
   * Take one site off this project. The site itself is untouched — it
   * keeps its trees, budget, expenses and people, and simply stops
   * belonging to a project (migration 0007).
   *
   * NOT a confirmation (§15), because nothing is destroyed and the
   * action reverses in one step: the site's own form re-links it. The
   * toast is the record that it happened.
   *
   * It re-reads the project as well as the list, because `siteCount`
   * is what gates the delete below — refreshing only the table would
   * leave the last unlink with an empty list and a still-disabled
   * Delete project.
   */
  /** The per-row button. One site, its own toast. */
  async function unlink(site: Site) {
    setUnlinking(site.id)
    try {
      // The association, not the record: a general PATCH would have to
      // resend every field of this site from a list that may be minutes
      // old, overwriting anything somebody else changed in between.
      await api.delete(`/sites/${site.id}/project`)
      toast.success(`${site.name} is no longer in this project`)
      forget([site])
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setUnlinking(null)
    }
  }

  /**
   * The same endpoint the effect above loads this tab from, re-paged
   * for the export button — search/sort/filter this tab has none of,
   * so only `page`/`pageSize` vary. Capped at 100 on screen already;
   * a project with more sites than that still exports every one of
   * them rather than silently stopping at the same 100.
   */
  const sitesFetchPage = React.useCallback(
    async (page: number, pageSize: number) => {
      const result = await api.get<ListResponse<Site & Matchable>>(
        `/sites${query({ projectId: id, page, pageSize, sort: "name", direction: "asc" })}`,
      )
      return { data: result.data, total: result.total }
    },
    [id],
  )

  if (error) {
    return (
      <PageScroller>
        <EmptyState
          variant="failed"
          heading="This project could not be loaded"
          onAction={() => router.refresh()}
        >
          {error}
        </EmptyState>
      </PageScroller>
    )
  }

  /**
   * Question 5: the allocation, stated plainly. The sites of a project
   * may sum past its planned total — that is a warning, never a block —
   * so this has to be readable at a glance rather than hidden until
   * somebody adds the column up.
   */
  const over =
    project !== null && project.allocatedTrees > project.plannedTrees

  return (
    <PageScroller>
      <RecordBreadcrumb
        trail={[{ label: "Projects", href: "/projects" }]}
        current={project ? project.name : <Skeleton className="h-4 w-32" />}
      />

      <PageHeader
        className="mt-4"
        title={project ? project.name : <Skeleton className="h-8 w-64 max-w-full" />}
        badges={
          over ? (
            // Section 7.2 rule 1: the badge carries a word, not only a
            // colour. Section 2.4: warning, not danger — being over an
            // allocation is a thing to look at, not a failure.
            <Badge variant="warning">Over allocation</Badge>
          ) : null
        }
        meta={
          project ? (
            `${formatNumber(project.allocatedTrees)} of ${formatNumber(
              project.plannedTrees,
            )} trees allocated across ${formatNumber(project.siteCount)} ${
              project.siteCount === 1 ? "site" : "sites"
            }`
          ) : (
            <Skeleton className="h-3 w-48 max-w-full" />
          )
        }
        actions={
          <>
            <Button render={<Link href={`/projects/${id}/edit`} />}>
              <PencilIcon />
              Edit
            </Button>
            <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" aria-label="More actions" />
                        }
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">More actions</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    {/*
                      Section 26: DISABLED with the reason, not hidden.
                      A staff member who cannot find this does not know
                      whether it exists; greyed and explained, they do.

                      PERMISSION IS THE ONLY REASON THIS IS DISABLED.
                      Having sites is not: it was, briefly, and a
                      greyed item explaining itself in a tooltip is a
                      reason nobody reads — it needs a hover to find,
                      and on a touch screen it cannot be found at all.
                      A project with sites therefore still opens the
                      dialog, which says why and offers the way out
                      (client instruction, 23 Sep 2026).
                    */}
                    <PermissionTooltip
                      allowed={isAdmin}
                      reason="Only an administrator can delete a project"
                    >
                      <DropdownMenuItem
                        variant="danger"
                        disabled={!isAdmin}
                        onClick={() => setDeleting(true)}
                      >
                        <TrashIcon />
                        Delete project
                      </DropdownMenuItem>
                    </PermissionTooltip>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <DetailColumns
        className="mt-8"
        main={
          <Card>
            <CardHeader>
              <CardTitle>Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              {project ? (
                <p className="text-body text-text-primary">
                  <span className="font-medium">
                    {formatNumber(project.allocatedTrees)}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium">
                    {formatNumber(project.plannedTrees)}
                  </span>{" "}
                  trees allocated across{" "}
                  <span className="font-medium">{formatNumber(project.siteCount)}</span>{" "}
                  {project.siteCount === 1 ? "site" : "sites"}
                  {over ? (
                    <>
                      {" — "}
                      <span className="text-warning">
                        {formatNumber(project.allocatedTrees - project.plannedTrees)}{" "}
                        over
                      </span>
                      . Sites may exceed the project total; nothing is blocked.
                    </>
                  ) : null}
                </p>
              ) : (
                <Skeleton className="h-4 w-3/4" />
              )}
            </CardContent>
          </Card>
        }
        aside={
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailFieldList className="sm:grid-cols-1">
                <DetailField label="Donor">
                  {project ? project.donorName : <Skeleton className="h-4 w-3/4" />}
                </DetailField>
                <DetailField label="Trees planned">
                  {project ? formatNumber(project.plannedTrees) : <Skeleton className="h-4 w-1/2" />}
                </DetailField>
                <DetailField label="Created">
                  {project ? formatDate(project.createdAt) : <Skeleton className="h-4 w-2/3" />}
                </DetailField>
              </DetailFieldList>
            </CardContent>
          </Card>
        }
      />

      {/* Section 11.2 zone 4: tabs at the bottom for child records. */}
      <Tabs defaultValue="sites" className="mt-8">
        <TabsList>
          <TabsTrigger value="sites">
            Sites
            <Badge variant="neutral">{formatNumber(project?.siteCount ?? 0)}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="sites">
          <Card>
            <CardHeader>
              <CardTitle>Sites</CardTitle>
              <div className="flex items-center gap-2">
                <ExportButton
                  title={project ? `${project.name} — Sites` : "Sites"}
                  columns={PROJECT_SITE_PDF_COLUMNS}
                  fetchPage={sitesFetchPage}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  render={<Link href={`/sites/new?projectId=${id}`} />}
                >
                  <PlusIcon />
                  New site
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sites === null ? (
                <div className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ) : sites.length === 0 ? (
                <EmptyState
                  variant="nothing-yet"
                  heading="No sites yet"
                  actionLabel="New site"
                  onAction={() => router.push(`/sites/new?projectId=${id}`)}
                >
                  A site holds its own tree count, budget and expenses.
                </EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead className="hidden md:table-cell">Location</TableHead>
                      <TableHead numeric>Trees</TableHead>
                      <TableHead numeric className="hidden lg:table-cell">
                        Planted
                      </TableHead>
                      <TableHead className="w-grid-cell text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sites.map((site) => (
                      <TableRow
                        key={site.id}
                        role="link"
                        tabIndex={0}
                        className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ring"
                        onClick={() => router.push(`/sites/${site.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            router.push(`/sites/${site.id}`)
                          }
                        }}
                      >
                        <TableCell>
                          <Truncate>{site.name}</Truncate>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Truncate>{site.locationName ?? "—"}</Truncate>
                        </TableCell>
                        <TableCell numeric>{formatNumber(site.plannedTrees)}</TableCell>
                        <TableCell numeric className="hidden lg:table-cell">
                          {formatDate(site.plantationStartDate)}
                        </TableCell>
                        <TableCell className="text-right">
                          {/*
                            The row is itself a link to the site, so
                            this button has to stop the click AND the
                            Enter/Space keydown from reaching it —
                            otherwise unlinking also navigates away and
                            the user never sees that it worked.
                          */}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={unlinking !== null}
                            onClick={(event) => {
                              event.stopPropagation()
                              void unlink(site)
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {unlinking === site.id ? "Unlinking…" : "Unlink"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {project ? (
        <DeleteRecordDialog
          open={deleting}
          onOpenChange={setDeleting}
          recordName={project.name}
          what="project"
          /*
           * §15's confirmation only applies to a project that CAN be
           * deleted. One that still has sites is not a deletion waiting
           * to be confirmed — it is a record in use, so the dialog
           * states the cause and offers the one thing that resolves it,
           * which is the shape `blocked` exists for (commit 223cda3).
           *
           * Unlinking all of them here is the shortcut; the per-row
           * Unlink above is the same action one site at a time, for
           * when only some of them should come off.
           */
          blocked={
            project.siteCount > 0
              ? {
                  reason: `This project has ${formatNumber(project.siteCount)} ${
                    project.siteCount === 1 ? "site" : "sites"
                  } covering ${formatNumber(project.allocatedTrees)} trees. Unlinking keeps every one of them — they simply stop belonging to a project, and the project can then be deleted.`,
                  actionLabel: `Unlink ${formatNumber(project.siteCount)} ${
                    project.siteCount === 1 ? "site" : "sites"
                  }`,
                  done: `${formatNumber(project.siteCount)} ${
                    project.siteCount === 1 ? "site is" : "sites are"
                  } no longer in this project`,
                  run: async () => {
                    // ONE request, scoped by the server to this
                    // project. The page holds at most 100 sites, so
                    // detaching the ones it happens to have would quietly
                    // miss the rest of a larger project and leave the
                    // delete to fail on sites nobody saw.
                    await api.post(`/projects/${id}/unlink-sites`, {})
                    forgetAll()
                  },
                }
              : undefined
          }
          // Stay open and become the delete confirmation. The user
          // clicked Delete project; unlinking was the obstacle, not
          // the errand.
          continueToDelete
          /*
           * Only ever the no-sites wording now: the control above
           * cannot open this dialog while sites exist. The branch that
           * explained why a delete would fail is gone with it — a
           * confirmation that has to talk somebody out of the button it
           * is offering was never a confirmation (commit 223cda3).
           */
          consequences={
            <>This project has no sites. Removing it cannot be undone.</>
          }
          onConfirm={() => api.delete(`/projects/${id}`)}
          // Only ever reached by a real delete: `continueToDelete`
          // above means the unlink does not call this.
          onDeleted={() => router.push("/projects")}
        />
      ) : null}
    </PageScroller>
  )
}
