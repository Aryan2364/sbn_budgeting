"use client"

import * as React from "react"
import { ChevronRightIcon, LogOutIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { BLEED, BLOCK, INSET, ROW } from "@/components/shell/content-area"
import type { Needs } from "@/components/shell/nav"
import { phoneDestinations } from "@/components/shell/phone-nav"
import { usePermissions } from "@/lib/permissions"
import { ShellLink } from "@/components/shell/progress-bar"
import { Button } from "@/components/ui/button"

type MoreItem = {
  label: string
  href: string
  /** A Lucide icon element, rendered at 18px (section 23). */
  icon: React.ReactNode
  /** The small label the row is grouped under, such as "Account". */
  group?: string
  /** The permission that opens it (41.4 rule 17); none means everyone. */
  permission?: Needs
}

/**
 * One row of RowGroups: More's item, with the icon optional. A screen
 * whose rows have no fitting icon in section 23's map (personal settings:
 * there is none for a password) draws none on any of its rows, so peers
 * stay alike.
 */
type RowItem = Omit<MoreItem, "icon"> & { icon?: React.ReactNode }

type MoreAccount = {
  name: string
  /** A second line under the name, usually the email address. */
  detail?: string
}

/*
 * The screen runs its rows edge to edge (41.5 rule 8): BLEED pulls it out
 * over the content area's side padding, INSET puts text back on the
 * content's edge, ROW is one tappable row and BLOCK a block of them. All
 * four are content-area.tsx's, the one copy every phone block of rows
 * shares (section 4 rule 2).
 */

/** Rows grouped by their label, in the order the groups first appear. */
function groupItems(items: RowItem[]) {
  const groups: { label?: string; items: RowItem[] }[] = []
  for (const item of items) {
    const group = groups.find((g) => g.label === item.group)
    if (group) group.items.push(item)
    else groups.push({ label: item.group, items: [item] })
  }
  return groups
}

/**
 * Section 41.4 rule 15: the More tab's screen, the content inside the
 * phone frame (the app bar holds its title). It lists the product's
 * other phone screens - those not in the tab bar - and Sign out, which
 * lives here only.
 *
 *   - Every item goes through phoneDestinations() first (41.4 rule 17):
 *     More lists only what the person can open. This file never filters.
 *     Computer-only screens, organisation settings among them, are never
 *     passed in at all (41.1, 41.11 rule 2).
 *   - Until stage 5 builds the Notifications screen as a tab, the
 *     product reaches it from here (41.12 rule 1) as an ordinary item.
 *   - Personal settings (41.18) are one item here, opening their own
 *     screen of rows (components/templates/personal-settings.tsx), which
 *     is built from this file's AccountSummary and RowGroups.
 *   - The install option (41.12 rule 8) is added here in stage 6: More
 *     is the only place it lives, never a pop-up, and it is hidden once
 *     the app is installed.
 *   - Sign out acts rather than goes somewhere, so it is not a row: it is
 *     a full-width secondary button below the rows (a text button always
 *     has a fill or a border, 6.1 rule 5), with the log-out icon 4px from
 *     its label (23). Not a danger action, and no confirmation: nothing
 *     is lost, and signing in again gets it back.
 *
 * More has no desktop form (41.2 rule 5): its address opens the
 * dashboard there, which the route decides, not this component.
 */
/** More's own words (Tracking, plan-phone D7). Defaults are the kit's English. */
type MoreScreenText = { signOut: string }

const MORE_TEXT: MoreScreenText = { signOut: "Sign out" }

function MoreScreen({
  items,
  account,
  onSignOut,
  actions,
  text,
}: {
  items: MoreItem[]
  account: MoreAccount
  onSignOut: () => void
  /**
   * Tracking: further full-width actions grouped above Sign out - the
   * place for Install app (Phase 5, 41.12 rule 8) and the Notifications
   * switch row (Phase 6), which arrive as their own components.
   */
  actions?: React.ReactNode
  text?: Partial<MoreScreenText>
}) {
  const { can } = usePermissions()
  const t = text ? { ...MORE_TEXT, ...text } : MORE_TEXT
  return (
    <div data-slot="more-screen" className={cn("flex flex-col gap-6", BLEED)}>
      <AccountSummary account={account} />

      <RowGroups items={phoneDestinations(items, can)} />

      {/* The actions, below the rows and outside their list, grouped, 8px
          apart (41.9 rule 4); Sign out lives in More only and comes last
          (41.4 rule 15, 41.18 rule 1). */}
      <div className={cn("flex flex-col gap-2", INSET)}>
        {actions}
        <Button variant="secondary" className="w-full" onClick={onSignOut}>
          <LogOutIcon aria-hidden />
          {t.signOut}
        </Button>
      </div>
    </div>
  )
}

/**
 * Who is signed in, at the top of a phone screen of rows: More, and
 * personal settings (41.18). Wraps rather than truncates: an email
 * address cut short is not the person's address (41.8 rule 18). Sits
 * inside a BLEED block; INSET puts it on the content's edge.
 */
function AccountSummary({ account }: { account: MoreAccount }) {
  return (
    <div className={cn("flex min-w-0 flex-col", INSET)}>
      <p className="text-card-heading font-medium wrap-break-word text-text-primary">
        {account.name}
      </p>
      {account.detail ? (
        <p className="text-label wrap-break-word text-text-secondary">{account.detail}</p>
      ) : null}
    </div>
  )
}

/**
 * Rows grouped under labels, each row opening its own screen (41.18 rule
 * 1, 41.4 rule 15): More's rows and personal settings' rows, drawn once
 * (section 4 rule 2). Each group is a section named by its label, in
 * label style, over a BLOCK of ROWs with a chevron. Rows without a group
 * come first in a group with no label. It filters nothing: a caller that
 * lists destinations passes them through phoneDestinations() first
 * (41.4 rule 17). Sits inside a BLEED block, as its children are edge to
 * edge; it returns a fragment, so the parent's gap spaces the groups.
 */
function RowGroups({ items }: { items: RowItem[] }) {
  const groups = groupItems(items)
  const baseId = React.useId()

  return (
    <>
      {groups.map((group, gi) => {
        const labelId = `${baseId}-group-${gi}`
        return (
          <section
            key={group.label ?? `group-${gi}`}
            aria-labelledby={group.label ? labelId : undefined}
            className="flex flex-col gap-2"
          >
            {/* 41.18 rule 1: rows grouped under labels, in label style. */}
            {group.label ? (
              <h2 id={labelId} className={cn("text-label text-text-secondary", INSET)}>
                {group.label}
              </h2>
            ) : null}
            <ul className={BLOCK}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <ShellLink href={item.href} className={ROW}>
                    {item.icon}
                    <span className="min-w-0 flex-1 wrap-break-word">{item.label}</span>
                    <ChevronRightIcon aria-hidden className="ml-2" />
                  </ShellLink>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}

export { MoreScreen, AccountSummary, RowGroups }
export type { MoreItem, MoreAccount, RowItem, MoreScreenText }
