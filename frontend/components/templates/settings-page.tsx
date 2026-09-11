"use client"

import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * Section 11.5.
 *
 * Two columns: a vertical menu of sections on the left at about 200px,
 * content on the right. Each section is a set of cards, one card per
 * group of related settings, and EACH CARD HAS ITS OWN SAVE BUTTON -
 * never one Save for the whole page. Destructive settings sit in a
 * separate card at the bottom with a danger-coloured border.
 *
 * The section menu is a second-level navigation and does not touch the
 * sidebar: the sidebar keeps Settings highlighted whichever section is
 * open (section 12.1).
 */
function SettingsLayout({
  menu,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { menu: React.ReactNode }) {
  return (
    <div
      data-slot="settings-layout"
      className={cn("flex flex-col gap-6 lg:flex-row", className)}
      {...props}
    >
      <div className="w-full shrink-0 lg:w-settings-menu">{menu}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
    </div>
  )
}

function SettingsMenu({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Settings sections"
      data-slot="settings-menu"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

/**
 * The same three active signals as the sidebar (section 12.1), for the
 * same reason: one signal is a hint, three are unmistakable. Sibling
 * items are styled and behave identically.
 */
function SettingsMenuItem({
  href,
  active,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link
      href={href}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-control items-center rounded-lg px-3 text-body text-text-secondary transition-colors",
        "hover:bg-surface-control hover:text-text-primary",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
        "data-active:bg-primary-subtle data-active:font-medium data-active:text-primary-pressed",
        "before:absolute before:inset-y-1 before:left-0 before:w-accent-bar before:rounded-full before:bg-primary before:opacity-0 before:transition-opacity",
        "data-active:before:opacity-100",
        className
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
    </Link>
  )
}

export { SettingsLayout, SettingsMenu, SettingsMenuItem }
