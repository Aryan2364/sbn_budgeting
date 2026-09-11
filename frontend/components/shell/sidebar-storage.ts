/**
 * Deliberately NOT a "use client" module.
 *
 * app/layout.tsx is a server component and needs this string to build
 * the inline restore script. A value imported from a "use client"
 * module reaches the server as a client reference, not as the string -
 * importing it from use-sidebar.ts produced
 * `localStorage.getItem(undefined)` in the rendered HTML, and the
 * saved choice silently never came back.
 */
export const SIDEBAR_STORAGE_KEY = "sadbhavna.sidebar"
