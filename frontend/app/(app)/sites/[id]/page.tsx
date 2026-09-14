"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  api,
  query,
  type BudgetGrid,
  type Expense,
  type ListResponse,
  type Matchable,
  type Project,
  type Site,
} from "@/lib/api"
import { formatAmount, formatCurrency, formatDate, formatNumber } from "@/lib/format"
import { multiplyPaise, sumPaise } from "@/lib/money"
import { anchorLabel, periodAnchor, periodLabel } from "@/lib/periods"
import { errorMessage, useSession } from "@/components/shell/session"
import { Badge } from "@/components/ui/badge"
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner"
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
import {
  Pagination,
  PaginationBar,
  PaginationContent,
  PaginationCount,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
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
import { HeadPeriodGrid } from "@/components/forms/head-period-grid"
import { DeleteRecordDialog } from "@/components/forms/delete-record-dialog"

/** Section 11.1: the product's page size is 25 everywhere. */
const EXPENSES_PAGE_SIZE = 25

/** Section 11.2. The detail template, with data. */
export default function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <React.Suspense fallback={null}>
      <SiteDetail params={params} />
    </React.Suspense>
  )
}

function SiteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAdmin } = useSession()

  /**
   * Which tab is open lives in the URL, not in component state.
   *
   * The Reports list drills into a specific site's VARIANCE tab
   * (`/sites/:id?tab=variance`), so the target tab has to be
   * addressable. Keeping it in the URL also means the browser's own
   * back button returns to the tab the user came from — which is the
   * navigation the product has instead of a back BUTTON (section 1
   * rule 11).
   */
  const tab = searchParams.get("tab") === "variance" ? "variance" : "expenses"

  const [site, setSite] = React.useState<Site | null>(null)
  const [project, setProject] = React.useState<Project | null>(null)
  const [budget, setBudget] = React.useState<BudgetGrid | null>(null)
  /**
   * The expenses PAGE, plus the API's own total.
   *
   * It used to keep only `data` from a `pageSize: 25` fetch and render
   * all of it with no page controls — so a site with 200 expenses
   * showed 25 rows, no way to reach the rest, and **a tab badge reading
   * 25**, which is a wrong number a user has every reason to trust.
   * The badge now shows `total`; the rows are a page.
   */
  const [expenses, setExpenses] = React.useState<Expense[] | null>(null)
  const [expenseTotal, setExpenseTotal] = React.useState(0)
  const [expensePage, setExpensePage] = React.useState(1)
  const [expensePages, setExpensePages] = React.useState(1)
  const [varianceRows, setVarianceRows] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const reload = React.useCallback(() => {
    let cancelled = false
    api
      .get<Site>(`/sites/${id}`)
      .then(async (found) => {
        if (cancelled) return
        setSite(found)
        const [proj, grid, expenseList] = await Promise.all([
          api.get<Project>(`/projects/${found.projectId}`),
          api.get<BudgetGrid>(`/sites/${id}/budget`),
          api.get<ListResponse<Expense & Matchable>>(
            `/expenses${query({ siteId: id, page: expensePage, pageSize: EXPENSES_PAGE_SIZE, sort: "spentOn", direction: "desc" })}`,
          ),
        ])
        if (cancelled) return
        setProject(proj)
        setBudget(grid)
        setExpenses(expenseList.data)
        setExpenseTotal(expenseList.total)
        setExpensePages(
          Math.max(1, Math.ceil(expenseList.total / (expenseList.pageSize || EXPENSES_PAGE_SIZE))),
        )
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught))
      })
    return () => {
      cancelled = true
    }
  }, [id, expensePage])

  React.useEffect(() => reload(), [reload])

  if (error) {
    return (
      <PageScroller>
        <EmptyState
          variant="failed"
          heading="This site could not be loaded"
          onAction={() => reload()}
        >
          {error}
        </EmptyState>
      </PageScroller>
    )
  }

  // Per-tree total across all heads and periods. Null when nothing is
  // budgeted, which reads "Budget not set" rather than 0.00.
  const perTree = budget ? sumPaise(budget.cells.map((c) => c.perTreePaise)) : null
  const siteBudget = site ? multiplyPaise(perTree, site.plannedTrees) : null
  const spent = expenses ? sumPaise(expenses.map((e) => e.amountPaise)) : null

  const over =
    project !== null && project.allocatedTrees > project.plannedTrees

  return (
    <PageScroller>
      <RecordBreadcrumb
        trail={[{ label: "Sites", href: "/sites" }]}
        current={site ? site.name : <Skeleton className="h-4 w-32" />}
      />

      <PageHeader
        className="mt-4"
        title={site ? site.name : <Skeleton className="h-8 w-64 max-w-full" />}
        badges={
          site ? <Badge variant="neutral">{site.projectName}</Badge> : null
        }
        meta={
          site ? (
            `${formatNumber(site.plannedTrees)} trees · planted ${formatDate(
              site.plantationStartDate,
            )}`
          ) : (
            <Skeleton className="h-3 w-48 max-w-full" />
          )
        }
        actions={
          <>
            <Button render={<Link href={`/sites/${id}/edit`} />}>
              <PencilIcon />
              Edit
            </Button>
            {isAdmin ? (
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
                    <DropdownMenuItem variant="danger" onClick={() => setDeleting(true)}>
                      <TrashIcon />
                      Delete site
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />

      {/*
        Question 5: over-allocation warns and never blocks. It stays
        true until somebody changes a number, so section 7.1 makes it a
        banner rather than a toast that vanishes. Section 7.2 rule 1
        gives it an icon as well as a colour.
      */}
      {over && project ? (
        <Banner variant="warning" className="mt-6">
          <TriangleAlertIcon />
          <BannerTitle>
            {project.name} is over its planned tree count
          </BannerTitle>
          <BannerDescription>
            Its sites cover {formatNumber(project.allocatedTrees)} trees against a
            plan of {formatNumber(project.plannedTrees)} —{" "}
            {formatNumber(project.allocatedTrees - project.plannedTrees)} over.
            Nothing is blocked; adjust a tree count if that is wrong.
          </BannerDescription>
        </Banner>
      ) : null}

      <DetailColumns
        className="mt-8"
        main={
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Budget</CardTitle>
              </div>
              <Button
                variant="secondary"
                size="sm"
                render={<Link href={`/sites/${id}/budget`} />}
              >
                <PencilIcon />
                Edit budget
              </Button>
            </CardHeader>
            <CardContent>
              {budget === null || site === null ? (
                <Skeleton className="h-4 w-3/4" />
              ) : perTree === null ? (
                <p className="text-body text-text-secondary">
                  Budget not set. Nothing has been entered for this site yet.
                </p>
              ) : (
                <>
                  <p className="text-page-title font-medium tabular-nums text-text-primary">
                    {formatCurrency(siteBudget)}
                  </p>
                  {/* Section 3: every budget figure states its basis. */}
                  <p className="mt-1 text-label text-text-secondary">
                    {formatCurrency(perTree)} per tree ×{" "}
                    {formatNumber(site.plannedTrees)} trees, across all five
                    periods
                  </p>
                </>
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
                <DetailField label="Project">
                  {site ? (
                    <Link
                      href={`/projects/${site.projectId}`}
                      className="text-primary hover:text-primary-hover"
                    >
                      {site.projectName}
                    </Link>
                  ) : (
                    <Skeleton className="h-4 w-3/4" />
                  )}
                </DetailField>
                <DetailField label="Location">
                  {site ? (site.locationName ?? "—") : <Skeleton className="h-4 w-1/2" />}
                </DetailField>
                <DetailField label="Trees">
                  {site ? formatNumber(site.plannedTrees) : <Skeleton className="h-4 w-1/2" />}
                </DetailField>
                <DetailField label="Plantation started">
                  {site ? formatDate(site.plantationStartDate) : <Skeleton className="h-4 w-2/3" />}
                </DetailField>
                <DetailField label="Plantation completed">
                  {site ? (
                    site.plantationCompleteDate ? (
                      formatDate(site.plantationCompleteDate)
                    ) : (
                      <span className="font-normal text-text-secondary">
                        Not yet recorded
                      </span>
                    )
                  ) : (
                    <Skeleton className="h-4 w-2/3" />
                  )}
                </DetailField>
                {/*
                  WHICH DATE THE PERIODS ARE MEASURED FROM, said out
                  loud. Client instruction, 7 Sep 2026: the complete
                  date anchors them, with the start date as her own
                  stated fallback until it exists.

                  Two sites can put the same expense date in different
                  periods, and without this the reason is invisible —
                  somebody would have to know the rule AND know which
                  of the two dates this site has. Section 19 is the
                  same argument: if the only way to learn something is
                  to already know it, nobody learns it.
                */}
                <DetailField label="Budget periods run from">
                  {site ? (
                    <>
                      {formatDate(periodAnchor(site).date)}
                      <span className="mt-0.5 block text-meta font-normal text-text-muted">
                        the {anchorLabel(periodAnchor(site).source)}
                        {periodAnchor(site).source === "start"
                          ? " — until a complete date is recorded"
                          : ""}
                      </span>
                    </>
                  ) : (
                    <Skeleton className="h-4 w-2/3" />
                  )}
                </DetailField>
                <DetailField label="Site manager">
                  {site ? (site.managerName ?? "—") : <Skeleton className="h-4 w-2/3" />}
                </DetailField>
                <DetailField label="Site supervisor">
                  {site ? (site.supervisorName ?? "—") : <Skeleton className="h-4 w-2/3" />}
                </DetailField>
              </DetailFieldList>
            </CardContent>
          </Card>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          // replace, not push: flipping a tab is not a place the back
          // button should have to walk through one step at a time.
          // scroll: false keeps the page where the user left it.
          router.replace(`/sites/${id}?tab=${String(value)}`, { scroll: false })
        }}
        className="mt-8"
      >
        {/* Sibling tabs are styled and behave identically: if one
            carries a count badge, they all do. */}
        <TabsList>
          <TabsTrigger value="expenses">
            Expenses
            <Badge variant="neutral">{formatNumber(expenseTotal)}</Badge>
          </TabsTrigger>
          <TabsTrigger value="variance">
            Variance
            <Badge variant="neutral">{formatNumber(varianceRows)}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Expenses</CardTitle>
                {spent !== null ? (
                  <p className="text-meta text-text-muted">
                    {formatCurrency(spent)} on this page
                  </p>
                ) : null}
              </div>
              <Button
                variant="secondary"
                size="sm"
                render={<Link href={`/expenses/new?siteId=${id}`} />}
              >
                <PlusIcon />
                New expense
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {expenses === null ? (
                <div className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ) : expenses.length === 0 ? (
                <EmptyState
                  variant="nothing-yet"
                  heading="No expenses yet"
                  actionLabel="New expense"
                  onAction={() => router.push(`/expenses/new?siteId=${id}`)}
                >
                  Expenses are booked against a cost head and a budget period.
                </EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead numeric>Date</TableHead>
                      <TableHead>Cost head</TableHead>
                      <TableHead className="hidden md:table-cell">Period</TableHead>
                      <TableHead className="hidden lg:table-cell">Bill no.</TableHead>
                      <TableHead numeric>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow
                        key={expense.id}
                        role="link"
                        tabIndex={0}
                        className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ring"
                        onClick={() => router.push(`/expenses/${expense.id}/edit`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            router.push(`/expenses/${expense.id}/edit`)
                          }
                        }}
                      >
                        <TableCell numeric>{formatDate(expense.spentOn)}</TableCell>
                        <TableCell>
                          <Truncate>{expense.costHeadName}</Truncate>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {periodLabel(expense.period)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Truncate>{expense.billNumber ?? "—"}</Truncate>
                        </TableCell>
                        <TableCell numeric>
                          {formatAmount(expense.amountPaise)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>

            {/* Section 1 rule 7: the rest of the expenses are reachable. */}
            {expenses !== null && expensePages > 1 ? (
              <PaginationBar>
                <PaginationCount>
                  {formatNumber(expenseTotal)} in total
                </PaginationCount>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        aria-disabled={expensePage <= 1}
                        className={expensePage <= 1 ? "pointer-events-none opacity-50" : undefined}
                        onClick={(event) => {
                          event.preventDefault()
                          setExpensePage((p) => Math.max(1, p - 1))
                        }}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-3 text-label text-text-secondary">
                        Page {formatNumber(expensePage)} of {formatNumber(expensePages)}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        aria-disabled={expensePage >= expensePages}
                        className={expensePage >= expensePages ? "pointer-events-none opacity-50" : undefined}
                        onClick={(event) => {
                          event.preventDefault()
                          setExpensePage((p) => Math.min(expensePages, p + 1))
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </PaginationBar>
            ) : null}
          </Card>
        </TabsContent>

        {/*
          keepMounted so the tab's count badge is right before anybody
          opens it. Its sibling's badge is always accurate — a peer
          reading 0 until clicked would be worse than no badge at all.
        */}
        <TabsContent value="variance" keepMounted>
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Variance by cost head and year</CardTitle>
                {/*
                  Section 3: every budget figure states its basis, and
                  with five periods the basis names the period too —
                  which here is the column the figure sits in. Stated
                  once for the table rather than nineteen times.
                */}
                {site ? (
                  <p className="mt-1 text-meta text-text-muted">
                    Budgets are the per-tree amount ×{" "}
                    {formatNumber(site.plannedTrees)} trees, per period.
                    Tree counts are live — change one and these move.
                  </p>
                ) : null}
              </div>
            </CardHeader>
            {/*
              `overflow-x-auto` because this host cannot scroll and the
              grid is wider than it.

              On /reports the grid sits in the list page's data area,
              which scrolls both axes, so the seven columns are
              reachable at 1024 and 768. Here it sits in a Card, and
              Card is `overflow-hidden` — so at 768 the table stayed
              960px wide inside a 709px box and the Total column was
              simply cut off at 985px with no way to reach it. Section
              34.3's frozen first column was present and useless:
              nothing to freeze against.

              Section 1 rule 8 permits this — the page scrolls
              vertically, this scrolls horizontally, and two different
              axes never compete for the same gesture.

              The trade: on THIS screen the sticky header and total row
              resolve against this container rather than the page, so
              they do not pin as they do on /reports. Reachable content
              beats a pinned total; if both are wanted, the tab needs a
              height-constrained data area of its own, which is a
              section 30 question rather than a class name.
            */}
            <CardContent className="overflow-x-auto p-0">
              {/* The SAME component Report 2 uses, scoped to this site
                  instead of to a project. Not a second version. */}
              <HeadPeriodGrid siteId={id} onRowCount={setVarianceRows} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {site ? (
        <DeleteRecordDialog
          open={deleting}
          onOpenChange={setDeleting}
          recordName={site.name}
          what="site"
          consequences={
            <>
              This will also remove the site&rsquo;s budget
              {budget && budget.cells.length > 0
                ? ` (${formatNumber(budget.cells.length)} budgeted cells)`
                : ""}
              . Expenses booked against it are not deleted, and the site cannot
              be removed while any exist.
            </>
          }
          onConfirm={() => api.delete(`/sites/${id}`)}
          onDeleted={() => router.push("/sites")}
        />
      ) : null}
    </PageScroller>
  )
}
