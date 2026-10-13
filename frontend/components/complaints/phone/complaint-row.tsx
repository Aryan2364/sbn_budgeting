"use client"

import * as React from "react"

import type { Matchable } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { complaintPlace, type ComplaintRow } from "@/lib/complaints-api"
import { PhoneListRow } from "@/components/ui/phone-list"
import { ComplaintStatusBadge, ageLabel } from "@/components/complaints/status"
import { PHONE_WORDS } from "@/lib/phone-words"

/**
 * Plan-phone 5.1 and 5.2 (Q5): the one row shared by My work and
 * Complaints. Line 1 leads with the complaint's title (there is only
 * one kind, so no kind chips), with the status badge; line 2 is site ·
 * category; line 3 is "C-000123 · {date} ના રોજ નોંધાઈ · {age}" — or, while
 * a search matched another field, PhoneListRow's own `match` line.
 */
function ComplaintPhoneRow({ row }: { row: ComplaintRow & Matchable }) {
  return (
    <PhoneListRow
      href={`/complaints/${row.id}`}
      name={row.title}
      status={<ComplaintStatusBadge status={row.status} />}
      facts={[complaintPlace(row), row.category.name]}
      meta={PHONE_WORDS.list.rowMeta(row.reference, formatDate(row.raisedAt), ageLabel(row.ageDays))}
      match={
        row.matchedField
          ? { label: row.matchedField, text: row.matchedValue ?? "", matched: "" }
          : undefined
      }
    />
  )
}

export { ComplaintPhoneRow }
