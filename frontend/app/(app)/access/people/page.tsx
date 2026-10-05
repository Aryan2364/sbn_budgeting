"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  EllipsisIcon,
  FunnelIcon,
  ListChecksIcon,
  PencilIcon,
  PowerIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  ACCESS_PATHS,
  accessApi,
  byRoleOrder,
  type Named,
  type PersonRow,
} from "@/lib/access-api"
import { pick, query, type LocationPick } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { recordAnswer, UNIT, useCan } from "@/lib/permissions"
import { Count } from "@/components/ui/badge"
import { Banner, BannerAction, BannerClose, BannerTitle } from "@/components/ui/banner"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowLink,
} from "@/components/ui/table"
import { TextLink } from "@/components/ui/text-link"
import { Truncate } from "@/components/ui/truncate"
import { FilterChip } from "@/components/forms/expense-filter"
import { useClosableBanner } from "@/components/shell/closable-banner"
import {
  ListDataArea,
  ListPagination,
  ListSearch,
  ListToolbar,
} from "@/components/templates/list-page"
import {
  PersonStatusBadge,
  SelectedSitesSummary,
  useAllUnits,
  useSetActive,
} from "@/components/access/person-access"
import { useAnswer, useSearchInput, useUrlListState } from "@/components/access/url-list"
import { AccessHeaderMeta } from "../access-header"

/**
 * The People tab (kit 40.6, access plan P10): everyone, with the roles
 * they hold, the sites their Selected sites permissions reach, and
 * whether they are active. A list page (kit 11.1) under the Access
 * layout, which draws zone 1 and the tabs; this draws zone 1b (the
 * uncovered-sites banner, kit 40.8), the toolbar, the data area and the
 * pagination.
 *
 * Nothing here adds a person or edits their details: Settings › People
 * does that (kit 40.6 rule 9), so there is no primary button.
 *
 * Search, filters and the page live in the address (kit 27.3), so the
 * Roles tab's People link (`?roleId=`) lands here filtered, with the
 * filter showing as a chip, and opening a person and coming back keeps
 * the list as it was.
 */

const PAGE_SIZE = 25
const FILTER_KEYS = ["roleId", "status", "locationId", "unitsNoneChosen"] as const
type FilterKey = (typeof FILTER_KEYS)[number]
type Filters = Partial<Record<FilterKey, string>>

const STATUS_LABEL: Record<string, string> = { active: "Active", inactive: "Inactive" }
const NONE_CHOSEN_LABEL = `Selected ${UNIT.many}: none chosen`

export default function AccessPeoplePage() {
  return (
    <React.Suspense fallback={null}>
      <PeopleTab />
    </React.Suspense>
  )
}

function PeopleTab() {
  const list = useUrlListState(FILTER_KEYS)
  const { search, page, filters } = list
  const [searchInput, setSearchInput] = useSearchInput(search, list.setSearch)

  const request = `/access/people${query({ page, search, ...filters })}`
  const people = useAnswer(request, () =>
    accessApi.listPeople({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      sort: "name",
      direction: "asc",
      roleId: filters.roleId,
      status: filters.status as "active" | "inactive" | undefined,
      locationId: filters.locationId,
      unitsNoneChosen: filters.unitsNoneChosen === "true",
    }),
  )
  const result = people.value
  const rows = result?.data ?? []
  const total = result?.total ?? 0

  // Pending banner rule 2: closable, back when more sites go uncovered.
  const uncovered = result?.uncoveredUnits ?? []
  const uncoveredBanner = useClosableBanner("uncovered-sites", uncovered.length)
  const showUncovered = uncovered.length > 0 && !uncoveredBanner.hidden

  const units = useAllUnits()
  const roles = useAnswer("roles", () => accessApi.listRoles({ pageSize: 100 }))
  const locations = useAnswer("locations", () => pick.locations({ includeInactive: true }))
  const roleList = React.useMemo(() => [...(roles.value?.data ?? [])].sort(byRoleOrder), [roles.value])

  const refresh = people.refresh
  const setActive = useSetActive(refresh)

  const activeFilters = FILTER_KEYS.filter((key) => filters[key])
  const filtered = activeFilters.length > 0 || search !== ""

  const roleName = (id: string) => roleList.find((r) => r.id === id)?.name ?? "Role"
  const locationName = (id: string) => locations.value?.find((l) => l.id === id)?.name ?? "Location"

  return (
    <>
      <AccessHeaderMeta>
        {people.state === "ready" && result
          ? `${formatNumber(total)} ${total === 1 ? "person" : "people"}`
          : "Loading people"}
      </AccessHeaderMeta>

      {/* Kit 40.8 and 11.1 zone 1b: decided by the server, sent with the list. */}
      {showUncovered ? (
        <UncoveredBanner units={uncovered} onClose={uncoveredBanner.dismiss} />
      ) : null}

      <ListToolbar className={showUncovered ? "mt-4" : undefined}>
        <ListSearch
          label="Search people"
          placeholder="Search people"
          title="Searches name, designation and roles"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onClear={() => setSearchInput("")}
        />
        {search && people.state === "ready" ? (
          <span className="text-label text-text-secondary">
            {formatNumber(total)} {total === 1 ? "result" : "results"}
          </span>
        ) : null}
        <PeopleFilterButton
          filters={filters}
          onApply={list.setFilters}
          roles={roleList}
          locations={locations.value}
        />
      </ListToolbar>

      {/* Kit 27.3: active filters as removable chips, and Clear all. */}
      {activeFilters.length > 0 ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          {filters.roleId ? (
            <FilterChip
              label={`Role: ${roleName(filters.roleId)}`}
              onRemove={() => list.setFilters({ ...filters, roleId: undefined })}
            />
          ) : null}
          {filters.status ? (
            <FilterChip
              label={`Status: ${STATUS_LABEL[filters.status] ?? filters.status}`}
              onRemove={() => list.setFilters({ ...filters, status: undefined })}
            />
          ) : null}
          {filters.locationId ? (
            <FilterChip
              label={`Location: ${locationName(filters.locationId)}`}
              onRemove={() => list.setFilters({ ...filters, locationId: undefined })}
            />
          ) : null}
          {filters.unitsNoneChosen ? (
            <FilterChip
              label={NONE_CHOSEN_LABEL}
              onRemove={() => list.setFilters({ ...filters, unitsNoneChosen: undefined })}
            />
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => list.setFilters({})}>
            Clear all
          </Button>
        </div>
      ) : null}

      <ListDataArea
        footer={
          <ListPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={people.state === "loading" ? null : total}
            onPageChange={list.setPage}
            emptyLabel="0 people"
            loadingLabel="Loading people"
          />
        }
      >
        {people.state === "failed" ? (
          <EmptyState variant="failed" heading="The people could not be loaded" onAction={refresh}>
            {people.error}
          </EmptyState>
        ) : people.state === "ready" && rows.length === 0 && filtered ? (
          <EmptyState
            variant="nothing-found"
            heading={search ? `No people match '${search}'` : "No people match these filters"}
            actionLabel="Clear filters"
            onAction={() => list.write({ q: null, page: null, roleId: null, status: null, locationId: null, unitsNoneChosen: null })}
          >
            Clearing the search and filters will show everyone.
          </EmptyState>
        ) : people.state === "ready" && rows.length === 0 ? (
          <EmptyState variant="nothing-yet" heading="No people yet">
            People are added under Settings › People. Their roles are given here.
          </EmptyState>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roles</TableHead>
                {/* Kit 40.6 rule 1: secondary, hidden below 1024. */}
                <TableHead className="hidden lg:table-cell">{`Selected ${UNIT.many}`}</TableHead>
                <TableHead className="w-col-status">Status</TableHead>
                <TableHead className="w-col-actions">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.state === "loading"
                ? Array.from({ length: 8 }, (_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-2/3" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-1/2" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell />
                    </TableRow>
                  ))
                : rows.map((row) => (
                    <PersonTableRow
                      key={row.id}
                      row={row}
                      units={units.units}
                      onSetActive={setActive}
                    />
                  ))}
            </TableBody>
          </Table>
        )}
      </ListDataArea>
    </>
  )
}

// ---------------------------------------------------------------------
// One row (kit 40.6 rules 1 to 7)
// ---------------------------------------------------------------------

function PersonTableRow({
  row,
  units,
  onSetActive,
}: {
  row: PersonRow & { matchedField?: string | null; matchedValue?: string | null }
  units: ReturnType<typeof useAllUnits>["units"]
  onSetActive: (person: Named, active: boolean) => Promise<void>
}) {
  const router = useRouter()
  const canManage = useCan("access.rights.manage")
  const rolesText = row.roles.map((r) => r.name).join(", ")
  const toggle = row.active
    ? recordAnswer(canManage, "access.rights.manage", row.can.deactivate)
    : recordAnswer(canManage, "access.rights.manage", row.can.activate)

  return (
    <TableRow>
      <TableCell>
        <span className="flex min-w-0 flex-col">
          <TableRowLink render={<Link href={ACCESS_PATHS.person(row.id)} />} className="block min-w-0">
            <Truncate>{row.name}</Truncate>
          </TableRowLink>
          {/* Kit 27.1: where the search matched, when not on the name. */}
          {row.matchedField ? (
            <span className="mt-1 block min-w-0 text-meta text-text-muted">
              <Truncate>{`${row.matchedField}: ${row.matchedValue ?? ""}`}</Truncate>
            </span>
          ) : row.designationName ? (
            <span className="mt-1 block min-w-0 text-meta text-text-muted">
              <Truncate>{row.designationName}</Truncate>
            </span>
          ) : null}
        </span>
      </TableCell>
      <TableCell>
        {/* Kit 40.6 rule 2: every role, job roles first (the server's order), truncated with the full list in the tooltip. */}
        {rolesText ? (
          <Truncate>{rolesText}</Truncate>
        ) : (
          <span className="text-text-muted">No roles</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <SelectedSitesSummary unitIds={row.unitIds} usesUnits={row.usesUnits} units={units} />
      </TableCell>
      <TableCell>
        <PersonStatusBadge active={row.active} />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="secondary" size="icon" aria-label={`Actions for ${row.name}`} />}
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(ACCESS_PATHS.person(row.id))}>
              <PencilIcon />
              Edit access
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(ACCESS_PATHS.whatTheyCanDoFor(row.id))}>
              <ListChecksIcon />
              What they can do
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Kit 40.11 rule 1: the last person who can manage access
                cannot be deactivated, and the reason shows before the
                server is reached. */}
            <PermissionTooltip allowed={toggle.allowed} reason={toggle.reason}>
              <DropdownMenuItem
                disabled={toggle.allowed !== true}
                onClick={() => void onSetActive(row, !row.active)}
              >
                <PowerIcon />
                {row.active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            </PermissionTooltip>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------
// Kit 40.8: sites nobody covers
// ---------------------------------------------------------------------

function UncoveredBanner({ units, onClose }: { units: Named[]; onClose: () => void }) {
  const [open, setOpen] = React.useState(false)
  const n = units.length
  // Pending banner rule 1 (overrides kit 40.8): the count and one
  // action, on one line. The names are in the dialog Review opens.
  const sentence =
    n === 1
      ? `1 ${UNIT.one} has nobody covering it.`
      : `${formatNumber(n)} ${UNIT.many} have nobody covering them.`

  return (
    <>
      <Banner variant="warning" layout="line" className="mt-6 shrink-0">
        <TriangleAlertIcon />
        <BannerTitle>{sentence}</BannerTitle>
        <BannerAction>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Review {UNIT.many}
          </Button>
        </BannerAction>
        <BannerClose onClick={onClose} />
      </Banner>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{`${capitalise(UNIT.many)} nobody covers`}</DialogTitle>
            <DialogDescription>
              {`Until someone covers a ${UNIT.one}, its records are seen only by people who can see everything. Name a manager or supervisor on the ${UNIT.one}, or tick it on a person's access page.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="flex flex-col gap-2">
              {units.map((unit) => (
                <li key={unit.id} className="min-w-0">
                  <TextLink render={<Link href={`/sites/${unit.id}`} />}>{unit.name}</TextLink>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------
// Filters (kit 27.3, 40.6 rule 5): one panel behind one button
// ---------------------------------------------------------------------

const ANY = "__any__"

function PeopleFilterButton({
  filters,
  onApply,
  roles,
  locations,
}: {
  filters: Filters
  onApply: (next: Filters) => void
  roles: Named[]
  locations: LocationPick[] | null
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Filters>(filters)
  const count = FILTER_KEYS.filter((key) => filters[key]).length

  const roleOptions: Record<string, string> = { [ANY]: "Any role" }
  for (const role of roles) roleOptions[role.id] = role.name
  const locationOptions: Record<string, string> = { [ANY]: "Any location" }
  for (const location of locations ?? []) locationOptions[location.id] = location.name

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
              <Label htmlFor="people-filter-role">Role</Label>
              <SearchableSelect
                id="people-filter-role"
                options={roleOptions}
                value={draft.roleId ?? ANY}
                onValueChange={(v) => setDraft((d) => ({ ...d, roleId: v === ANY ? undefined : v }))}
                searchPlaceholder="Search roles"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="people-filter-status">Status</Label>
              <Select
                items={{ [ANY]: "Anyone", active: "Active", inactive: "Inactive" }}
                value={draft.status ?? ANY}
                onValueChange={(v: string | null) =>
                  setDraft((d) => ({ ...d, status: v === "active" || v === "inactive" ? v : undefined }))
                }
              >
                <SelectTrigger id="people-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Anyone</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="people-filter-location">Location</Label>
              <SearchableSelect
                id="people-filter-location"
                options={locationOptions}
                value={draft.locationId ?? ANY}
                onValueChange={(v) => setDraft((d) => ({ ...d, locationId: v === ANY ? undefined : v }))}
                disabled={locations === null}
                placeholder={locations === null ? "Loading locations" : "Choose a location"}
                searchPlaceholder="Search locations"
              />
              <p className="text-label text-text-secondary">
                {`People who lead a ${UNIT.one} there, or have one ticked.`}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Switch
                id="people-filter-none-chosen"
                checked={draft.unitsNoneChosen === "true"}
                onCheckedChange={(checked: boolean) =>
                  setDraft((d) => ({ ...d, unitsNoneChosen: checked ? "true" : undefined }))
                }
              />
              <div className="min-w-0">
                <Label htmlFor="people-filter-none-chosen">{NONE_CHOSEN_LABEL}</Label>
                <p className="mt-1 text-label text-text-secondary">
                  {`Only people whose roles use selected ${UNIT.many} and who have none ticked.`}
                </p>
              </div>
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

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
