"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { InfoIcon, PencilIcon } from "lucide-react"

import {
  ACCESS_PATHS,
  accessApi,
  type EffectiveModule,
  type EffectiveRow,
} from "@/lib/access-api"
import { pick, type PersonPick } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { UNIT } from "@/lib/permissions"
import { Banner, BannerDescription } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Label } from "@/components/ui/label"
import { SearchableSelect, type SearchOption } from "@/components/ui/searchable-select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table"
import { DetailField, DetailFieldList } from "@/components/templates/detail-page"
import { ListToolbar } from "@/components/templates/list-page"
import {
  namesText,
  PersonStatusBadge,
  scopesText,
  sitesByLocation,
  useAllUnits,
} from "@/components/access/person-access"
import { useAnswer } from "@/components/access/url-list"

/**
 * What they can do (kit 40.9, access plan P10): a read-only view of one
 * person's real access, from GET /access/people/:id/effective. Every
 * permission they hold, its combined scope, and every role that gave it;
 * every Pick, with what it is for. It changes nothing, so there is no
 * primary button (rule 2).
 *
 * The person is chosen in the toolbar with the server-search people
 * picker (access plan P8) and kept in the address (`?person=`), so the
 * view can be linked to and the People row action opens it directly
 * (rule 1).
 *
 * Its rows are the code catalogue, which only a release changes, so the
 * tables are not paginated (rule 6, the kit 1 rule 7 exception).
 */

export default function WhatTheyCanDoPage() {
  return (
    <React.Suspense fallback={null}>
      <WhatTheyCanDo />
    </React.Suspense>
  )
}

function WhatTheyCanDo() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const personId = params.get("person") ?? ""

  const effective = useAnswer(personId ? `effective:${personId}` : null, () =>
    accessApi.getEffective(personId),
  )
  const units = useAllUnits()
  const [chosenName, setChosenName] = React.useState<string | null>(null)

  const searchPeople = React.useCallback(
    (q: string): Promise<SearchOption[]> =>
      pick.people({ q }).then((rows: PersonPick[]) =>
        rows.map((p) => ({ value: p.id, label: p.name, detail: p.designationName })),
      ),
    [],
  )

  function choose(id: string, label: string | null) {
    setChosenName(label)
    const next = new URLSearchParams(params.toString())
    next.set("person", id)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  const data = personId ? effective.value : null
  const person = data?.person

  return (
    <>
      {/* Kit 40.9 rule 1: the toolbar holds one control, the person. */}
      <ListToolbar className="items-end">
        <div className="flex w-search max-w-full min-w-0 flex-col gap-2">
          <Label htmlFor="what-they-can-do-person">Person</Label>
          <SearchableSelect
            id="what-they-can-do-person"
            search={searchPeople}
            value={personId || undefined}
            selectedLabel={person?.name ?? chosenName}
            onValueChange={(id, option) => choose(id, option?.label ?? null)}
            placeholder="Choose a person"
            searchPlaceholder="Search people"
            emptyMessage={(q) => `No people match '${q}'.`}
          />
        </div>
        {/* Rule 2: Edit access is secondary; this view changes nothing. */}
        <div className="ml-auto">
          {personId ? (
            <Button variant="secondary" nativeButton={false} render={<Link href={ACCESS_PATHS.person(personId)} />}>
              <PencilIcon />
              Edit access
            </Button>
          ) : (
            <Button variant="secondary" disabled>
              <PencilIcon />
              Edit access
            </Button>
          )}
        </div>
      </ListToolbar>

      {/* The page frame does not scroll; this area does (kit 10). */}
      <div className="-mx-1 mt-6 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {!personId ? (
          <EmptyState variant="nothing-yet" heading="No one chosen">
            Choose a person to see what they can do.
          </EmptyState>
        ) : effective.state === "failed" ? (
          <EmptyState
            variant="failed"
            heading="What they can do could not be loaded"
            onAction={effective.refresh}
          >
            {effective.error}
          </EmptyState>
        ) : !data || !person ? (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Rule 10: the view still shows what would apply. */}
            {/* Pending banner rule 3: no close, it explains why none of
                this applies. Rule 1: one line. */}
            {!person.active ? (
              <Banner variant="neutral" layout="line">
                <InfoIcon />
                <BannerDescription>
                  {`${person.name} is inactive, so none of this applies until they are activated.`}
                </BannerDescription>
              </Banner>
            ) : null}

            {/* Rule 3: the summary. */}
            <section className="flex flex-col gap-4" aria-labelledby="what-they-can-do-name">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="what-they-can-do-name" className="text-section font-medium text-text-primary">
                  {person.name}
                </h2>
                <PersonStatusBadge active={person.active} />
              </div>
              <DetailFieldList className="lg:grid-cols-4">
                <DetailField label="Roles">
                  {namesText(person.roles) ?? "No roles"}
                </DetailField>
                <DetailField label={`Selected ${UNIT.many}`}>
                  {person.units.length === 0
                    ? "None ticked"
                    : (sitesByLocation(
                        person.units.map((u) => u.id),
                        units.units,
                      ) ?? `${formatNumber(person.units.length)} ${UNIT.many}`)}
                </DetailField>
                <DetailField label={`${capitalise(UNIT.many)} they lead`}>
                  {namesText(person.ledUnits) ?? "None"}
                </DetailField>
                <DetailField label="Team">
                  {person.teamSize === 0
                    ? "Nobody reports to them"
                    : `${formatNumber(person.teamSize)} ${person.teamSize === 1 ? "person" : "people"} under them`}
                </DetailField>
              </DetailFieldList>
              {/* Rule 11: workflow rules are not permissions. */}
              <p className="text-body text-text-secondary">
                Some actions also depend on the record itself, such as who raised it.
              </p>
            </section>

            {/* Rule 4: one card per module where they hold something, in catalogue order. */}
            {data.modules.map((module) => (
              <ModuleCard key={module.module} module={module} />
            ))}

            {data.modules.length === 0 ? (
              <p className="text-body text-text-secondary">
                {`${person.name} holds no permissions.`}
              </p>
            ) : null}

            {data.noAccessTo.length > 0 ? (
              <p className="text-body text-text-secondary">
                {`No access to: ${data.noAccessTo.join(", ")}.`}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}

/** Kit 40.9 rules 5 to 9: one module's see amounts, then Section / Action / Scope / From. */
function ModuleCard({ module }: { module: EffectiveModule }) {
  // Rows arrive in catalogue order, grouped by section; the spine names
  // each section once, across its rows (rule 6).
  const groups: { label: string; rows: EffectiveRow[] }[] = []
  for (const row of module.rows) {
    const last = groups.at(-1)
    if (last && last.label === row.sectionLabel) last.rows.push(row)
    else groups.push({ label: row.sectionLabel, rows: [row] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{module.label}</CardTitle>
      </CardHeader>
      {module.seeAmounts ? (
        <CardContent className="border-b border-border-light">
          <p className="text-body text-text-primary">
            {module.seeAmounts.held
              ? `Sees amounts: yes, from ${module.seeAmounts.from.map((r) => r.name).join(", ")}`
              : "Sees amounts: no"}
          </p>
        </CardContent>
      ) : null}
      {module.rows.length === 0 ? (
        <CardContent>
          <p className="text-body text-text-secondary">Nothing else in this module.</p>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-grid-head">Section</TableHead>
                <TableHead className="w-col-narrow">Action</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) =>
                group.rows.map((row, index) => (
                  <TableRow key={row.key}>
                    {index === 0 ? (
                      <TableRowHeader rowSpan={group.rows.length} className="align-top">
                        {group.label}
                      </TableRowHeader>
                    ) : null}
                    <TableCell>{row.action}</TableCell>
                    <TableCell className="whitespace-normal">
                      <ScopeText row={row} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <FromText row={row} />
                    </TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}

/**
 * Rule 7: the combined reach, "Team, Selected sites"; All replaces the
 * rest (the server combines). Rule 9: a Pick says what it is for, "All,
 * for add expenses".
 */
function ScopeText({ row }: { row: EffectiveRow }) {
  if (row.kind === "pick" && row.neededBy && row.neededBy.length > 0) {
    return (
      <ul className="flex flex-col gap-1">
        {row.neededBy.map((need) => (
          <li key={need.key} className="break-words">
            {`${scopesText(need.scopes)}, for ${need.label}`}
          </li>
        ))}
      </ul>
    )
  }
  return <span className="break-words">{scopesText(row.scopes)}</span>
}

/** Rule 8: every role that grants it, each with its own scope where they differ. */
function FromText({ row }: { row: EffectiveRow }) {
  const differ = new Set(row.from.map((f) => scopesText(f.scopes))).size > 1
  return (
    <span className="break-words">
      {row.from.map((f) => (differ ? `${f.name} (${scopesText(f.scopes)})` : f.name)).join(", ")}
    </span>
  )
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
