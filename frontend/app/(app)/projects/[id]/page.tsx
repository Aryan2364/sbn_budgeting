"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"

import { api, query, type ListResponse, type Matchable, type Project, type Site } from "@/lib/api"
import { formatDate, formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
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
              <Button
                variant="secondary"
                size="sm"
                render={<Link href={`/sites/new?projectId=${id}`} />}
              >
                <PlusIcon />
                New site
              </Button>
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
          consequences={
            project.siteCount > 0 ? (
              <>
                This project has {formatNumber(project.siteCount)}{" "}
                {project.siteCount === 1 ? "site" : "sites"} covering{" "}
                {formatNumber(project.allocatedTrees)} trees. Delete or move them
                first — the project cannot be removed while they exist.
              </>
            ) : (
              <>
                This project has no sites. Removing it cannot be undone.
              </>
            )
          }
          onConfirm={() => api.delete(`/projects/${id}`)}
          onDeleted={() => router.push("/projects")}
        />
      ) : null}
    </PageScroller>
  )
}
