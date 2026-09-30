"use client"

import * as React from "react"

import { CommandDialog } from "@/components/ui/command"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { pressShowingUndo } from "@/components/ui/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * Section 39. Mount <KeyboardShortcuts> once, around the application.
 *
 * | Ctrl+K                 | global search (command.tsx), content from `search`     |
 * | /                      | focus the list page's search box (listSearchProps)     |
 * | Ctrl+S                 | save the form in the open dialog, else the focused     |
 * |                        | form, else the page's only form; with none, the        |
 * |                        | browser keeps the key                                  |
 * | Ctrl+Z, outside a field| press the Undo on the showing toast; else nothing      |
 * | ?                      | the "Keyboard shortcuts" dialog                        |
 *
 * On a Mac, Cmd replaces Ctrl. "/" and "?" work only outside a text
 * field, so they never interrupt typing, and inside a field every Ctrl
 * key of 39.4 is left to the browser. Ctrl+K and "?" do nothing while a
 * dialog is open: section 24 rule 4 never opens a dialog from inside one.
 *
 * The Enter behaviours of 39.2 are per field, so they are helpers the
 * field spreads rather than global keys: enterSends, ctrlEnterSaves and
 * searchBoxKeys, below.
 */

type Shortcut = { keys: string; action: string }

type ContextValue = {
  openSearch: () => void
  openShortcuts: () => void
  closeSearch: () => void
}

const ShortcutsContext = React.createContext<ContextValue | null>(null)

function useKeyboardShortcuts() {
  const value = React.useContext(ShortcutsContext)
  if (!value) throw new Error("useKeyboardShortcuts needs a <KeyboardShortcuts> above it.")
  return value
}

/** Spread on the list page's search input so "/" can find it. */
const listSearchProps = { "data-list-search": "" } as const

const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image", "hidden"])

function isTextField(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type)
  if (el instanceof HTMLElement && el.isContentEditable) return true
  const role = el.getAttribute("role")
  return role === "textbox" || role === "searchbox" || role === "combobox"
}

const noSubscribe = () => () => {}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
}

/** Rendered and not hidden. Not offsetParent: a dialog is position: fixed, whose offsetParent is always null. */
function isShown(el: Element) {
  return el.getClientRects().length > 0
}

function openDialogs(): Element[] {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(
    (d) => !d.hasAttribute("data-closed") && isShown(d)
  )
}

/** The form Ctrl+S saves: the open dialog's, the focused one, or the only one. */
function formToSave(): HTMLFormElement | null {
  const dialog = openDialogs().at(-1)
  if (dialog) return dialog.querySelector("form")
  const focused = document.activeElement?.closest("form")
  if (focused) return focused
  const forms = document.querySelectorAll("form")
  return forms.length === 1 ? forms[0] : null
}

function KeyboardShortcuts({
  search,
  searchTitle = "Search",
  extra = [],
  children,
}: {
  /** What Ctrl+K opens: the product's <Command> list for global search. */
  search?: React.ReactNode
  searchTitle?: string
  /** A product's own shortcuts, listed in the dialog too (39.5). */
  extra?: Shortcut[]
  children: React.ReactNode
}) {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  // "Ctrl" on the server, the real platform's word once in the browser.
  const mod = React.useSyncExternalStore(
    noSubscribe,
    () => (isMac() ? "Cmd" : "Ctrl"),
    () => "Ctrl"
  )

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const modifier = isMac() ? event.metaKey : event.ctrlKey
      const inText = isTextField(document.activeElement)
      const key = event.key.toLowerCase()

      if (modifier && !event.altKey && !event.shiftKey) {
        if (key === "k") {
          // Taken even inside a dialog, where it opens nothing (24 rule
          // 4), so it does not fall through to the browser's own Ctrl+K.
          event.preventDefault()
          if (search && !openDialogs().length) setSearchOpen(true)
          return
        }
        if (key === "s") {
          const form = formToSave()
          if (!form) return
          event.preventDefault()
          form.requestSubmit()
          return
        }
        if (key === "z" && !inText) {
          if (pressShowingUndo()) event.preventDefault()
          return
        }
        return
      }

      if (inText || modifier || event.altKey) return
      if (event.key === "/") {
        const box = [...document.querySelectorAll<HTMLElement>("[data-list-search]")].find(isShown)
        if (!box) return
        event.preventDefault()
        box.focus()
        return
      }
      if (event.key === "?") {
        if (openDialogs().length) return
        event.preventDefault()
        setHelpOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [search])

  const context = React.useMemo<ContextValue>(
    () => ({
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      openShortcuts: () => setHelpOpen(true),
    }),
    []
  )

  const rows: Shortcut[] = [
    { keys: `${mod}+K`, action: "Open global search" },
    { keys: "/", action: "Move to the list's search box" },
    { keys: `${mod}+S`, action: "Save the form you are in, or the form in the open dialog" },
    { keys: `${mod}+Z`, action: "Undo the change in the toast that is showing (outside a text field)" },
    { keys: "?", action: "Show this list of shortcuts" },
    ...extra,
  ]

  return (
    <ShortcutsContext.Provider value={context}>
      {children}
      {search ? (
        <CommandDialog title={searchTitle} open={searchOpen} onOpenChange={setSearchOpen}>
          {search}
        </CommandDialog>
      ) : null}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-col-ref">Keys</TableHead>
                  <TableHead>What it does</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.keys}>
                    <TableCell>
                      <kbd className="font-mono text-label text-text-primary">{r.keys}</kbd>
                    </TableCell>
                    <TableCell className="whitespace-normal">{r.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-label text-text-secondary">
              &quot;/&quot; and &quot;?&quot; work only when you are not typing in a field.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </ShortcutsContext.Provider>
  )
}

/**
 * 39.2, a comment or message box: Enter sends, Shift+Enter makes a new
 * line. Spread the result as onKeyDown.
 */
function enterSends(send: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }
}

/**
 * 39.2, a long text field in a form (description, notes): Enter makes a
 * new line, and Ctrl+Enter (Cmd+Enter on a Mac) saves the form.
 */
function ctrlEnterSaves(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return
  if (!(isMac() ? event.metaKey : event.ctrlKey)) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}

/**
 * 39.2, a search box: Enter runs the search at once (not after the 300ms
 * pause of 27.1), and Escape clears the text first, so only a second
 * Escape closes the layer the box sits in.
 */
function searchBoxKeys({
  value,
  onClear,
  onSearch,
}: {
  value: string
  onClear: () => void
  onSearch: () => void
}) {
  return (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Enter") {
      event.preventDefault()
      onSearch()
    } else if (event.key === "Escape" && value) {
      event.preventDefault()
      event.stopPropagation()
      onClear()
    }
  }
}

export {
  KeyboardShortcuts,
  useKeyboardShortcuts,
  listSearchProps,
  enterSends,
  ctrlEnterSaves,
  searchBoxKeys,
  type Shortcut,
}
