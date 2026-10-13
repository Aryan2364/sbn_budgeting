"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { usePermissions } from "@/lib/permissions"
import { PHONE_WORDS } from "@/lib/phone-words"
import { GU_COMMON } from "@/components/complaints/gu"
import { complaintsApi, type ComplaintCounts, type ComplaintTab } from "@/lib/complaints-api"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/templates/page"
import { PhoneList, phoneListBranch, type PhoneListSort } from "@/components/ui/phone-list"
import { useComplaintMasters } from "@/components/complaints/use-masters"
import { ComplaintTabs } from "@/components/complaints/complaint-tabs"
import { useComplaintFilterSheet } from "@/components/complaints/phone/complaint-filter-sheet"
import { ComplaintPhoneRow } from "@/components/complaints/phone/complaint-row"
import {
  useComplaintsTabListAddress,
  useComplaintPhoneList,
  type ListCriteria,
} from "@/components/complaints/phone/list-criteria"

/** Which tab a person most likely wants when they arrive with none chosen (matches desktop). */
function defaultTab(counts: ComplaintCounts): ComplaintTab {
  return counts.assigned > 0 ? "assigned" : "all"
}

const EMPTY_COPY: Record<ComplaintTab, { heading: string; line: string; action: "raise" | "all" }> = {
  assigned: {
    heading: "તમને કોઈ ફરિયાદ સોંપાઈ નથી",
    line: "તમે જે સાઇટના સુપરવાઇઝર છો ત્યાં નોંધાયેલી ફરિયાદો, તમે ઉકેલો ત્યાં સુધી અહીં દેખાશે.",
    action: "all",
  },
  raised: {
    heading: "તમે હજી કોઈ ફરિયાદ નોંધાવી નથી",
    line: "તમે નોંધાવો તે ફરિયાદો અહીં દેખાશે, જેથી તે બંધ થાય ત્યાં સુધી તમે તેને જોઈ શકો.",
    action: "raise",
  },
  all: {
    heading: "હજી કોઈ ફરિયાદ નથી",
    line: "તમે નોંધાવો તે, અથવા તમને મોકલાય તે ફરિયાદો અહીં દેખાશે.",
    action: "raise",
  },
}

/**
 * Plan-phone 5.2: Complaints — the desktop's own three tabs (મને સોંપેલી
 * / મેં નોંધાવેલી / બધી), each with its server count, on the phone list
 * (41.5). Scope (own, team, whole organisation) stays the server's.
 *
 * `/complaints` (the route file) renders this instead of the desktop
 * `ComplaintList` on phone (useLayout); desktop is untouched.
 */
function ComplaintsScreen() {
  const router = useRouter()
  const { can } = usePermissions()
  const { criteria, apply } = useComplaintsTabListAddress()
  const hadTab = React.useRef(false)

  const [counts, setCounts] = React.useState<ComplaintCounts | null>(null)
  React.useEffect(() => {
    let cancelled = false
    complaintsApi
      .counts()
      .then((next) => {
        if (cancelled) return
        setCounts(next)
        if (!hadTab.current) {
          hadTab.current = true
          const tab = defaultTab(next)
          apply({ ...criteria, tab }, "replace")
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // Once, like the desktop list: the counts are a convenience, not the
    // list's own source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = useComplaintPhoneList(criteria.tab, criteria)
  const masters = useComplaintMasters({ activeOnly: false })

  const siteOptions = React.useMemo(
    () => (masters.sites ?? []).map((s) => ({ value: s.id, label: s.name })),
    [masters.sites],
  )
  const categoryOptions = React.useMemo(
    () => (masters.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    [masters.categories],
  )

  const switchTab = (tab: ComplaintTab) =>
    apply({ tab, q: "", sort: "raisedAt", direction: "desc" }, "push")

  const setFilters = (next: { status?: string; siteId?: string; categoryId?: string }) =>
    apply({ ...criteria, status: next.status, siteId: next.siteId, categoryId: next.categoryId }, "push")

  const filter = useComplaintFilterSheet({
    tab: criteria.tab,
    search: criteria.q,
    applied: { status: criteria.status, siteId: criteria.siteId, categoryId: criteria.categoryId },
    onApply: setFilters,
    sites: siteOptions,
    categories: categoryOptions,
  })

  const sort: PhoneListSort = {
    options: [
      { value: "raisedAt:desc", label: PHONE_WORDS.sort.newest },
      { value: "raisedAt:asc", label: PHONE_WORDS.sort.oldest },
      { value: "number:desc", label: PHONE_WORDS.sort.number },
      { value: "site:asc", label: PHONE_WORDS.sort.site },
    ],
    value: `${criteria.sort}:${criteria.direction}`,
    onChange: (value) => {
      const [sortKey, direction] = value.split(":") as [ListCriteria["sort"], "asc" | "desc"]
      apply({ ...criteria, sort: sortKey, direction }, "push")
    },
  }

  const copy = EMPTY_COPY[criteria.tab]
  const empty =
    copy.action === "raise" ? (
      <EmptyState
        variant="nothing-yet"
        heading={copy.heading}
        actionLabel={GU_COMMON.raise}
        onAction={() => router.push("/complaints/new")}
      >
        {copy.line}
      </EmptyState>
    ) : (
      <EmptyState variant="nothing-yet" heading={copy.heading} actionLabel="બધી ફરિયાદો જુઓ" onAction={() => switchTab("all")}>
        {copy.line}
      </EmptyState>
    )

  return (
    <>
      <PageHeader
        title={PHONE_WORDS.titles.complaints}
        tabs={<ComplaintTabs value={criteria.tab} counts={counts} onValueChange={switchTab} />}
      />
      <PhoneList
        {...phoneListBranch(
          list.state === "failed" ? { state: "failed", onRetry: list.onRetry } : { state: list.state },
        )}
        noun={{ one: PHONE_WORDS.titles.complaints, many: PHONE_WORDS.titles.complaints }}
        rows={list.rows}
        total={list.total}
        rowKey={(row) => row.id}
        renderRow={(row) => <ComplaintPhoneRow row={row} />}
        onLoadMore={list.onLoadMore}
        onRefresh={list.onRefresh}
        search={{ value: criteria.q, onChange: (q) => apply({ ...criteria, q }, "replace") }}
        filter={filter}
        sort={sort}
        empty={empty}
        add={{ label: PHONE_WORDS.add, href: "/complaints/new", allowed: can("complaints.complaints.raise") }}
        text={PHONE_WORDS.list}
        listKey={`complaints-${criteria.tab}`}
      />
    </>
  )
}

export { ComplaintsScreen }
