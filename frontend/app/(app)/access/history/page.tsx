"use client"

import * as React from "react"
import Link from "next/link"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FunnelIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react"

import {
  accessApi,
  AUDIT_ACTIONS,
  byRoleOrder,
  type AuditAction,
  type HistoryRow,
  type Named,
} from "@/lib/access-api"
import { pick, query, type PersonPick } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"
import { Count } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { SearchableSelect, type SearchOption } from "@/components/ui/searchable-select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowLink,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { FilterChip } from "@/components/forms/expense-filter"
import { DateRangeField, dateRangeLabel } from "@/components/forms/date-range-field"
import { DetailField, DetailFieldList } from "@/components/templates/detail-page"
import {
  ListDataArea,
  ListPagination,
  ListSearch,
  ListToolbar,
} from "@/components/templates/list-page"
import { useAnswer, useSearchInput, useUrlListState } from "@/components/access/url-list"
import { AccessHeaderMeta } from "../access-header"
import { affectedText, changeItems, changeSummary, KIND_LABEL } from "./history-words"

/**
 * Access history (kit 40.10, access plan P10): every access change
 * across the product, newest first, 25 a page. Read-only: no tick
 * boxes, no row actions, nothing to edit, delete or undo (rule 7).
 *
 * A list page (kit 11.1) under the Access layout. Search covers the
 * names of people and roles as they were (rules 4 and 5); filters are
 * Changed by, Affected person, Affected role, Kind of change and a date
 * range with the kit 27.4 presets, all in the address, so a person's
 * page links here filtered to them with the filter showing as a chip
 * (rule 8). When is the only sortable column (rule 1).
 *
 * Opening a row opens a sheet from the right with the full change
 * (rule 6). The open entry is in the address too (`?entry=`), so the
 * row's link is a real link (kit 11.1.2).
 */

const PAGE_SIZE = 25
const FILTER_KEYS = ["actorId", "personId", "roleId", "action", "from", "to"] as const
type FilterKey = (typeof FILTER_KEYS)[number]
type Filters = Partial<Record<FilterKey, string>>

export default function AccessHistoryPage() {
  return (
    <React.Suspense fallback={null}>
      <HistoryTab />
    </React.Suspense>
  )
}

function HistoryTab() {
  const list = useUrlListState(FILTER_KEYS)
  const { search, page, filters, params } = list
  const direction = params.get("dir") === "asc" ? "asc" : "desc"
  const entryId = params.get("entry")
  const [searchInput, setSearchInput] = useSearchInput(search, list.setSearch)

  const request = `/access/history${query({ page, search, dir: direction, ...filters })}`
  const history = useAnswer(request, () =>
    accessApi.listHistory({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      sort: "at",
      direction,
      actorId: filters.actorId,
      personId: filters.personId,
      roleId: filters.roleId,
      action: filters.action as AuditAction | undefined,
      from: filters.from,
      to: filters.to,
    }),
  )
  const result = history.value
  const rows = result?.data ?? []
  const total = result?.total ?? 0

  const roles = useAnswer("roles", () => accessApi.listRoles({ pageSize: 100 }))
  const roleList = React.useMemo(() => [...(roles.value?.data ?? [])].sort(byRoleOrder), [roles.value])
  // Chip names for the two people filters (the address carries ids only).
  const actor = useAnswer(filters.actorId ? `person:${filters.actorId}` : null, () =>
    accessApi.getPerson(filters.actorId!),
  )
  const affected = useAnswer(filters.personId ? `person:${filters.personId}` : null, () =>
    accessApi.getPerson(filters.personId!),
  )

  const activeFilters = FILTER_KEYS.filter((key) => filters[key])
  const filterCount =
    activeFilters.filter((key) => key !== "from" && key !== "to").length + (filters.from || filters.to ? 1 : 0)
  const filtered = activeFilters.length > 0 || search !== ""

  /** The address of a row's sheet: this list as it is, plus the entry. */
  const entryHref = (id: string) => {
    const next = new URLSearchParams(params.toString())
    next.set("entry", id)
    return `?${next.toString()}`
  }
  const open = entryId ? rows.find((row) => row.id === entryId) ?? null : null

  return (
    <>
      <AccessHeaderMeta>
        {history.state === "ready" && result
          ? `${formatNumber(total)} ${total === 1 ? "change" : "changes"}`
          : "Loading changes"}
      </AccessHeaderMeta>

      <ListToolbar>
        <ListSearch
          label="Search history"
          placeholder="Search history"
          title="Searches the names of the people and roles involved, as they were at the time"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onClear={() => setSearchInput("")}
        />
        {search && history.state === "ready" ? (
          <span className="text-label text-text-secondary">
            {formatNumber(total)} {total === 1 ? "result" : "results"}
          </span>
        ) : null}
        <HistoryFilterButton
          filters={filters}
          count={filterCount}
          onApply={list.setFilters}
          roles={roleList}
          actorName={actor.value?.name ?? null}
          personName={affected.value?.name ?? null}
        />
      </ListToolbar>

      {activeFilters.length > 0 ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          {filters.actorId ? (
            <FilterChip
              label={`Changed by: ${actor.value?.name ?? "…"}`}
              onRemove={() => list.setFilters({ ...filters, actorId: undefined })}
            />
          ) : null}
          {filters.personId ? (
            <FilterChip
              label={`Affected person: ${affected.value?.name ?? "…"}`}
              onRemove={() => list.setFilters({ ...filters, personId: undefined })}
            />
          ) : null}
          {filters.roleId ? (
            <FilterChip
              label={`Affected role: ${roleList.find((r) => r.id === filters.roleId)?.name ?? "…"}`}
              onRemove={() => list.setFilters({ ...filters, roleId: undefined })}
            />
          ) : null}
          {filters.action ? (
            <FilterChip
              label={`Kind: ${KIND_LABEL[filters.action as AuditAction] ?? filters.action}`}
              onRemove={() => list.setFilters({ ...filters, action: undefined })}
            />
          ) : null}
          {filters.from || filters.to ? (
            <FilterChip
              label={dateRangeLabel(filters.from, filters.to) ?? ""}
              onRemove={() => list.setFilters({ ...filters, from: undefined, to: undefined })}
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
            total={history.state === "loading" ? null : total}
            onPageChange={list.setPage}
            emptyLabel="0 changes"
            loadingLabel="Loading changes"
          />
        }
      >
        {history.state === "failed" ? (
          <EmptyState variant="failed" heading="The history could not be loaded" onAction={history.refresh}>
            {history.error}
          </EmptyState>
        ) : history.state === "ready" && rows.length === 0 && filtered ? (
          <EmptyState
            variant="nothing-found"
            heading={search ? `No changes match '${search}'` : "No changes match these filters"}
            actionLabel="Clear filters"
            onAction={() =>
              list.write({ q: null, page: null, actorId: null, personId: null, roleId: null, action: null, from: null, to: null })
            }
          >
            Clearing the search and filters will show every change.
          </EmptyState>
        ) : history.state === "ready" && rows.length === 0 ? (
          <EmptyState variant="nothing-yet" heading="No changes yet">
            Every change to roles and people’s access is listed here as it happens.
          </EmptyState>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="group/head w-col-datetime">
                  {/* Kit 27.2 and 40.10 rule 1: When is the only sortable column. */}
                  <button
                    type="button"
                    onClick={() => list.write({ dir: direction === "desc" ? "asc" : null, page: null })}
                    className="flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-lg text-label text-inherit underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:-outline-offset-2 focus-visible:outline-current"
                    aria-label={`When, sorted ${direction === "desc" ? "newest first" : "oldest first"}`}
                  >
                    <span className="min-w-0 truncate">When</span>
                    {direction === "asc" ? (
                      <ChevronUpIcon className="size-4 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="size-4 shrink-0" />
                    )}
                  </button>
                </TableHead>
                <TableHead>Changed by</TableHead>
                <TableHead>Affected</TableHead>
                <TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.state === "loading"
                ? Array.from({ length: 8 }, (_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell><Skeleton className="h-4 w-3/4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-2/3" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-2/3" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-1/2" /></TableCell>
                    </TableRow>
                  ))
                : rows.map((row) => (
                    <TableRow key={row.id} selected={row.id === entryId}>
                      <TableCell className="tabular-nums">
                        <TableRowLink
                          render={<Link href={entryHref(row.id)} replace scroll={false} />}
                          className="block min-w-0"
                        >
                          <Truncate>{formatDateTime(row.at)}</Truncate>
                        </TableRowLink>
                      </TableCell>
                      <TableCell>{row.changedBy.name}</TableCell>
                      <TableCell>{affectedText(row)}</TableCell>
                      <TableCell>{changeSummary(row)}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        )}
      </ListDataArea>

      <ChangeSheet row={open} onClose={() => list.write({ entry: null })} />
    </>
  )
}

// ---------------------------------------------------------------------
// Rule 6: the sheet. Who, when and whom, then Before and After.
// ---------------------------------------------------------------------

function ChangeSheet({ row, onClose }: { row: HistoryRow | null; onClose: () => void }) {
  // Kept while the sheet animates closed, so its content does not vanish first.
  const [shown, setShown] = React.useState<HistoryRow | null>(row)
  if (row && row !== shown) setShown(row)
  const entry = row ?? shown

  return (
    <Sheet open={row !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent side="right" className="sm:max-w-dialog-md">
        {entry ? (
          <>
            <SheetHeader>
              <SheetTitle>{changeSummary(entry)}</SheetTitle>
              <SheetDescription>{affectedText(entry)}</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4">
              <DetailFieldList className="sm:grid-cols-1">
                <DetailField label="Changed by">{entry.changedBy.name}</DetailField>
                <DetailField label="When">{formatDateTime(entry.at)}</DetailField>
                <DetailField label="Affected">{affectedText(entry)}</DetailField>
                {entry.role && entry.targetType === "user" ? (
                  <DetailField label="Role">{entry.role.name}</DetailField>
                ) : null}
              </DetailFieldList>

              {changeItems(entry).map((item) => (
                <section key={item.label} className="flex flex-col gap-3">
                  <h3 className="text-card-heading font-medium text-text-primary">{item.label}</h3>
                  <ChangeLines heading="Before" lines={item.removed} kind="removed" />
                  <ChangeLines heading="After" lines={item.added} kind="added" />
                </section>
              ))}
            </div>
            {/* Rule 7: nothing to edit, delete or undo; the sheet's own Close (its corner) is the only button. */}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/** Each line with the plus or minus icon and the word, never a status colour (rule 6, kit 23.1). */
function ChangeLines({ heading, lines, kind }: { heading: string; lines: string[]; kind: "added" | "removed" }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label text-text-secondary">{heading}</p>
      {lines.length === 0 ? (
        <p className="text-body text-text-secondary">{kind === "added" ? "Nothing added" : "Nothing removed"}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((line, index) => (
            <li key={`${line}-${index}`} className="flex min-w-0 items-start gap-2 text-body text-text-primary">
              {kind === "added" ? (
                <PlusIcon className="mt-1 size-4 shrink-0" aria-hidden />
              ) : (
                <MinusIcon className="mt-1 size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 break-words">
                <span className="text-text-secondary">{kind === "added" ? "Added: " : "Removed: "}</span>
                {line}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Filters (kit 27.3, 27.4, 40.10 rule 5)
// ---------------------------------------------------------------------

const ANY = "__any__"

function HistoryFilterButton({
  filters,
  count,
  onApply,
  roles,
  actorName,
  personName,
}: {
  filters: Filters
  count: number
  onApply: (next: Filters) => void
  roles: Named[]
  actorName: string | null
  personName: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Filters>(filters)
  const [names, setNames] = React.useState<{ actor: string | null; person: string | null }>({
    actor: actorName,
    person: personName,
  })
  const [rangeKey, setRangeKey] = React.useState(0)
  const [dateError, setDateError] = React.useState<string | null>(null)

  const searchPeople = React.useCallback(
    (q: string): Promise<SearchOption[]> =>
      pick.people({ q }).then((rows: PersonPick[]) =>
        rows.map((p) => ({ value: p.id, label: p.name, detail: p.designationName })),
      ),
    [],
  )

  const roleOptions: Record<string, string> = { [ANY]: "Any role" }
  for (const role of roles) roleOptions[role.id] = role.name
  const kindOptions: Record<string, string> = { [ANY]: "Any kind" }
  for (const action of AUDIT_ACTIONS) kindOptions[action] = KIND_LABEL[action]

  function apply() {
    if (draft.from && draft.to && draft.from > draft.to) {
      setDateError("The end of the range must be on or after the start.")
      return
    }
    onApply(draft)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setDraft(filters)
          setNames({ actor: actorName, person: personName })
          setRangeKey((k) => k + 1)
          setDateError(null)
          setOpen(true)
        }}
      >
        <FunnelIcon />
        Filter
        {count > 0 ? <Count value={count} /> : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Filter history</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="history-filter-actor">Changed by</Label>
                <SearchableSelect
                  id="history-filter-actor"
                  options={{ [ANY]: "Anyone" }}
                  search={searchPeople}
                  value={draft.actorId ?? ANY}
                  selectedLabel={draft.actorId ? names.actor : null}
                  onValueChange={(v, option) => {
                    setNames((n) => ({ ...n, actor: option?.label ?? null }))
                    setDraft((d) => ({ ...d, actorId: v === ANY ? undefined : v }))
                  }}
                  searchPlaceholder="Search people"
                  emptyMessage={(q) => `No people match '${q}'.`}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="history-filter-person">Affected person</Label>
                <SearchableSelect
                  id="history-filter-person"
                  options={{ [ANY]: "Anyone" }}
                  search={searchPeople}
                  value={draft.personId ?? ANY}
                  selectedLabel={draft.personId ? names.person : null}
                  onValueChange={(v, option) => {
                    setNames((n) => ({ ...n, person: option?.label ?? null }))
                    setDraft((d) => ({ ...d, personId: v === ANY ? undefined : v }))
                  }}
                  searchPlaceholder="Search people"
                  emptyMessage={(q) => `No people match '${q}'.`}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="history-filter-role">Affected role</Label>
                <SearchableSelect
                  id="history-filter-role"
                  options={roleOptions}
                  value={draft.roleId ?? ANY}
                  onValueChange={(v) => setDraft((d) => ({ ...d, roleId: v === ANY ? undefined : v }))}
                  searchPlaceholder="Search roles"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="history-filter-kind">Kind of change</Label>
                <SearchableSelect
                  id="history-filter-kind"
                  options={kindOptions}
                  value={draft.action ?? ANY}
                  onValueChange={(v) => setDraft((d) => ({ ...d, action: v === ANY ? undefined : v }))}
                  searchPlaceholder="Search kinds of change"
                />
              </div>
            </div>
            <DateRangeField
              key={rangeKey}
              label="When"
              from={draft.from}
              to={draft.to}
              onChange={(from, to) => {
                setDraft((d) => ({ ...d, from, to }))
                setDateError(null)
              }}
              error={dateError}
            />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraft({})
                setRangeKey((k) => k + 1)
                setDateError(null)
              }}
            >
              Clear
            </Button>
            <Button type="button" onClick={apply}>
              Apply filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
