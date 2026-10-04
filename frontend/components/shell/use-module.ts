"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  allowedModules,
  homeHref,
  moduleForPath,
  moduleHome,
  MODULES,
  pathPinsModule,
  type ModuleDef,
  type ModuleKey,
} from "@/components/shell/nav"
import { usePermissions } from "@/lib/permissions"

/**
 * The active module (CONTRACT section 4). It comes from the path; only
 * /settings, which both modules share, falls back to the module the user
 * was last in. That memory lives in sessionStorage - per tab, like the
 * route itself - and is read as an external store, so /settings renders
 * the remembered module without a cascading render.
 */
const STORAGE_KEY = "sadbhavna.module"

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function readRemembered(): ModuleKey | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY)
    return value === "budget" || value === "complaints" ? value : null
  } catch {
    return null
  }
}

function remember(key: ModuleKey) {
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY) === key) return
    window.sessionStorage.setItem(STORAGE_KEY, key)
  } catch {
    // Storage disabled: /settings then shows the user's first module.
  }
  for (const listener of listeners) listener()
}

export function useModules(): {
  /** Every module this user has, in product order. */
  modules: ModuleDef[]
  active: ModuleDef
  /** Where choosing a module in the switcher goes: its first item this user can use. */
  homeOf: (mod: ModuleDef) => string
} {
  const pathname = usePathname()
  const { can } = usePermissions()
  const remembered = React.useSyncExternalStore(subscribe, readRemembered, () => null)

  const modules = allowedModules(can)
  const key = moduleForPath(pathname, remembered, modules.map((mod) => mod.key))

  // Writing the pinned module to storage is a side effect on an external
  // system, so it belongs in an effect (no React state is set here).
  const pinned = pathPinsModule(pathname)
  React.useEffect(() => {
    if (pinned) remember(pinned)
  }, [pinned])

  const active = MODULES.find((mod) => mod.key === key) ?? MODULES[0]
  return { modules, active, homeOf: (mod) => moduleHome(mod, can) ?? homeHref(can) }
}

/**
 * The first place this user can open (CONTRACT §4), from their
 * permissions: `/` goes there, sign-in lands there, and the no-access
 * page's "Go to dashboard" leads there.
 */
export function useHomeHref(): string {
  const { can } = usePermissions()
  return homeHref(can)
}
