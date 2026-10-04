"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"

import { ACCESS_PATHS } from "@/lib/access-api"
import { SectionTabs } from "@/components/ui/section-tabs"

/**
 * The Access section's fixed chrome (kit 40.1, 11.1 zone 1, 33.2), shared
 * by app/(app)/access/layout.tsx and the four tab pages under it.
 *
 * The layout draws ONE page header ("Access") and the four section tabs,
 * so they never flicker or shift as the user moves between tabs. What
 * belongs to the active tab goes INTO that header through two slots:
 *
 *   <AccessHeaderMeta>8 roles</AccessHeaderMeta>        the record count (11.1 zone 1)
 *   <AccessHeaderActions><Button>Add role</Button></AccessHeaderActions>   the one primary
 *
 * A tab page renders only zones 2 to 4 under the tabs: its toolbar, data
 * area and pagination (RecordList with `headerless`, which reports its
 * total through `onResult`). The role editor and a person's access page
 * are pages under their tab with their own breadcrumb and record header
 * (kit 40.1 rule 3); the layout draws no tabs on them.
 */

/** Kit 40.1 rule 2: the four tabs, in this order. Paths, so each tab has its own address (kit 33.4). */
export const ACCESS_TABS = [
  { value: "roles", label: "Roles", href: ACCESS_PATHS.roles },
  { value: "people", label: "People", href: ACCESS_PATHS.people },
  { value: "what-they-can-do", label: "What they can do", href: ACCESS_PATHS.whatTheyCanDo },
  { value: "history", label: "History", href: ACCESS_PATHS.history },
] as const

export type AccessTab = (typeof ACCESS_TABS)[number]

/** The tab whose list page this address is, or null for a page under a tab (or /access itself). */
export function accessTabFor(pathname: string): AccessTab | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  return ACCESS_TABS.find((tab) => tab.href === path) ?? null
}

interface Slots {
  meta: HTMLElement | null
  actions: HTMLElement | null
}

const SlotsContext = React.createContext<Slots>({ meta: null, actions: null })

/** Layout only: the header's two slot elements, found by ref once mounted. */
export function AccessHeaderSlotsProvider({ value, children }: { value: Slots; children: React.ReactNode }) {
  return <SlotsContext.Provider value={value}>{children}</SlotsContext.Provider>
}

/** A tab page's record count, shown as the header's meta line. */
export function AccessHeaderMeta({ children }: { children: React.ReactNode }) {
  const { meta } = React.useContext(SlotsContext)
  return meta ? createPortal(children, meta) : null
}

/** A tab page's one primary action (kit 11.1 zone 1), on the right of the header. */
export function AccessHeaderActions({ children }: { children: React.ReactNode }) {
  const { actions } = React.useContext(SlotsContext)
  return actions ? createPortal(children, actions) : null
}

/**
 * Kit 33: the section tabs, wired to the four tab addresses. Switching
 * replaces the history entry rather than adding one (33.4). Inside a
 * Suspense boundary because SectionTabs reads the search params.
 */
export function AccessTabs({ value }: { value: AccessTab["value"] }) {
  const router = useRouter()
  return (
    <React.Suspense fallback={<div className="mt-6 h-9 shrink-0" />}>
      <SectionTabs
        tabs={ACCESS_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
        value={value}
        onValueChange={(next) => {
          const tab = ACCESS_TABS.find((t) => t.value === next)
          if (tab) router.replace(tab.href, { scroll: false })
        }}
      />
    </React.Suspense>
  )
}
