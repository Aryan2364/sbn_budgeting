"use client"

import * as React from "react"

import { usePermissions } from "@/lib/permissions"
import { PHONE_WORDS } from "@/lib/phone-words"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/templates/page"
import { PhoneList, phoneListBranch, type PhoneListSort } from "@/components/ui/phone-list"
import { useComplaintMasters } from "@/components/complaints/use-masters"
import { useComplaintFilterSheet } from "@/components/complaints/phone/complaint-filter-sheet"
import { ComplaintPhoneRow } from "@/components/complaints/phone/complaint-row"
import {
  useComplaintListAddress,
  useComplaintPhoneList,
  type ListCriteria,
} from "@/components/complaints/phone/list-criteria"

/**
 * Plan-phone 5.1: My work — exactly the server's `tab=assigned`
 * (complaints assigned to me that are still open, L2), no backend
 * change. Same search/filter/sort sheets as Complaints (5.1), fixed to
 * this one tab; no section tabs, and no kind chips (Q5: there is only
 * one kind, so line 1 is the complaint's title).
 *
 * PageHeader is the first direct child of the fragment (top level: no
 * `parent`), so the app bar sticks and the tab bar shows.
 */
function MyWorkScreen() {
  const { can } = usePermissions()
  const { criteria, apply } = useComplaintListAddress()
  const list = useComplaintPhoneList("assigned", criteria)
  const masters = useComplaintMasters({ activeOnly: false })

  const siteOptions = React.useMemo(
    () => (masters.sites ?? []).map((s) => ({ value: s.id, label: s.name })),
    [masters.sites],
  )
  const categoryOptions = React.useMemo(
    () => (masters.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    [masters.categories],
  )

  const setFilters = (next: { status?: string; siteId?: string; categoryId?: string }) =>
    apply({ ...criteria, status: next.status, siteId: next.siteId, categoryId: next.categoryId }, "push")

  const filter = useComplaintFilterSheet({
    tab: "assigned",
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

  return (
    <>
      <PageHeader title={PHONE_WORDS.titles.myWork} />
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
        empty={<EmptyState variant="nothing-waiting" text={PHONE_WORDS.emptyState} />}
        add={{ label: PHONE_WORDS.add, href: "/complaints/new", allowed: can("complaints.complaints.raise") }}
        text={PHONE_WORDS.list}
        listKey="my-work"
      />
    </>
  )
}

export { MyWorkScreen }
