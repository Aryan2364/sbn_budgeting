"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { usePageGuard } from "@/lib/permissions"
import { PageFrame, PageHeader } from "@/components/templates/page"
import { AccessHeaderSlotsProvider, AccessTabs, accessTabFor } from "./access-header"

/**
 * Kit 40.1: the Access section. One sidebar item (nav.ts), four section
 * tabs in this order: Roles, People, What they can do, History.
 *
 * Kit 26 rule 1 and 26.6: everything here is behind access.rights.manage.
 * Someone without it never sees the sidebar item, and a typed or shared
 * address lands on the no-access page (11.8) inside the shell. The API
 * refuses them too (every /access route is @Can('access.rights.manage')).
 *
 * On the four tab addresses the layout draws zone 1 (the page header)
 * and zone 1a (the section tabs) once, so neither flickers between tabs;
 * the tab page fills the header's meta and primary action through the
 * slots in ./access-header.tsx and draws zones 2 to 4 itself. The role
 * editor and a person's access page are pages under their tab, reached
 * by opening a row, with their own breadcrumb (40.1 rule 3): the layout
 * draws nothing around them.
 */
export default function AccessLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const denied = usePageGuard("access.rights.manage")
  const [meta, setMeta] = React.useState<HTMLElement | null>(null)
  const [actions, setActions] = React.useState<HTMLElement | null>(null)
  const slots = React.useMemo(() => ({ meta, actions }), [meta, actions])

  if (denied) return denied

  const tab = accessTabFor(pathname)
  if (!tab) return <>{children}</>

  return (
    <PageFrame>
      <PageHeader
        title="Access"
        meta={<span ref={setMeta} />}
        actions={<div ref={setActions} className="flex items-center gap-2 empty:hidden" />}
      />
      <AccessTabs value={tab.value} />
      <AccessHeaderSlotsProvider value={slots}>{children}</AccessHeaderSlotsProvider>
    </PageFrame>
  )
}
