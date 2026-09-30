"use client"

import * as React from "react"

/**
 * The state matrix's own alarm.
 *
 * **A state matrix can only verify what it forces.** The forcing rules
 * in `globals.css` covered six slots; every other interactive control
 * rendered in a "hover" column was simply showing its resting
 * appearance, and looked verified while being unverified. Worse, two of
 * the six — `input` and `select-trigger` — were forced here while
 * having no hover styles of their own at all, so the matrix displayed a
 * state the component could not produce for a real user. It manufactured
 * evidence in one direction and withheld it in the other.
 *
 * Neither failure is visible by looking. Both are obvious the moment
 * something compares the forced cell against the resting one, which is
 * all this does: after paint, for every element inside a `[data-force]`
 * cell, find its resting twin and check that they actually differ.
 *
 * **It fails loudly, in the page, in the way the matrix is read** — a
 * danger panel naming every control whose forced state is
 * indistinguishable from resting. Silence is the pass.
 *
 * Development only. It compiles away in production, because it exists
 * to catch a design-system regression while somebody is looking at the
 * design system.
 */

/**
 * Only things a person can actually interact with.
 *
 * The first run of this check flagged fifteen "failures", every one of
 * them an inner decorative part — a tick glyph, a switch knob, the text
 * span inside a select trigger, a radio group's container. None of them
 * has states of its own or should: they inherit the control's. A check
 * that reports those is noise, and noise is how a check stops being
 * read, which is the same way the matrix stopped being trusted.
 */
const INTERACTIVE = [
  "button",
  "input",
  "textarea",
  "select",
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
  '[role="tab"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  /*
   * A whole-card click target (section 11.6, and section 35.5 for the
   * board) is interactive and no generic selector reaches it: the
   * element carrying the states is the card, while the focusable node
   * is a button inside it with no states of its own. Left out, the card
   * would be exactly what this check exists to catch - a forcing rule
   * in globals.css that nothing ever compares.
   */
  '[data-slot="board-card"]',
  // The same shape for a clickable record card (section 11.6): the card
  // carries the states, the CardLink inside it carries none.
  '[data-slot="card"][data-variant="record"]:has([data-slot="card-link"])',
].join(", ")

/**
 * Focusable nodes with no states of their own to compare: a CardLink's
 * belong to the card around it, and the chosen side of a single-choice
 * view switcher is not actionable - pressing it changes nothing - so it
 * deliberately has no hover.
 */
const STATES_ON_PARENT =
  '[data-slot="card-link"], [data-slot="view-switcher-item"][data-pressed]'

/**
 * The states this check is about: the ones section 6.4 requires every
 * interactive element to define and that a forcing rule replays.
 * `resting` is the baseline and `disabled` is compared by eye; anything
 * else in `[data-force]` is a different kind of demo and not this
 * check's business.
 */
const FORCED_CONTROL_STATES = ["hover", "pressed", "focus"]

/** What we compare. Enough to catch a state that does nothing. */
function signature(el: Element): string {
  const c = getComputedStyle(el)
  return [
    c.backgroundColor,
    c.borderTopColor,
    c.borderBottomColor,
    c.color,
    c.opacity,
    c.outlineStyle === "none" ? "" : `${c.outlineColor} ${c.outlineWidth}`,
  ].join("|")
}

function key(el: Element): string {
  const slot = el.getAttribute("data-slot") ?? el.tagName.toLowerCase()
  const variant = el.getAttribute("data-variant")
  return variant ? `${slot}:${variant}` : slot
}

export function StateMatrixCheck() {
  const [dead, setDead] = React.useState<string[]>([])

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return

    // After paint, and after fonts settle, or the first measurement
    // catches a half-styled page and cries wolf.
    const timer = window.setTimeout(() => {
      /** Resting signatures, taken from anything OUTSIDE a forced cell. */
      const resting = new Map<string, string>()
      for (const el of document.querySelectorAll("[data-slot]")) {
        if (el.closest("[data-force]")) continue
        // Skipped here as well as in the forced cells: otherwise the chosen
        // side of a view switcher becomes the "resting twin" of an unchosen
        // one, the two always differ, and a missing hover rule is never seen.
        if (!el.matches(INTERACTIVE) || el.matches(STATES_ON_PARENT)) continue
        const disabled =
          (el as HTMLInputElement).disabled ||
          el.hasAttribute("data-disabled") ||
          el.getAttribute("aria-disabled") === "true"
        if (disabled) continue
        if (!resting.has(key(el))) resting.set(key(el), signature(el))
      }

      const found: string[] = []
      for (const cell of document.querySelectorAll("[data-force]")) {
        const state = cell.getAttribute("data-force")
        // An ALLOWLIST, not "everything except resting and disabled".
        // `[data-force]` is also used to hold a non-control state still
        // for the page - section 35.6.1's drop target is a COLUMN
        // state, and the cards and buttons sitting inside a tinted
        // column are identical to resting because nothing claims
        // otherwise. Blocklisting the two states known at the time
        // meant the first new kind of forced state arrived as four
        // false alarms, which is how a check stops being read.
        if (!state || !FORCED_CONTROL_STATES.includes(state)) continue
        for (const el of cell.querySelectorAll("[data-slot]")) {
          if (!el.matches(INTERACTIVE) || el.matches(STATES_ON_PARENT)) continue
          const k = key(el)
          const base = resting.get(k)
          // No resting twin on the page means nothing to compare
          // against — not a failure, just not covered here.
          if (base === undefined) continue
          if (signature(el) === base) {
            const line = `${k} — "${state}" is identical to resting`
            if (!found.includes(line)) found.push(line)
          }
        }
      }
      setDead(found.sort())
    }, 600)

    return () => window.clearTimeout(timer)
  }, [])

  if (process.env.NODE_ENV === "production" || dead.length === 0) return null

  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-danger-border bg-danger-bg p-4"
    >
      <p className="text-card-heading font-medium text-danger">
        The state matrix is not verifying {dead.length}{" "}
        {dead.length === 1 ? "control" : "controls"}
      </p>
      <p className="mt-2 text-body text-danger">
        Each control below renders identically in the named column and at
        rest, so that column proves nothing about it. Either the control
        is missing the state (section 6.4 requires four plus focus), or
        the forcing rule in <code>globals.css</code> does not cover it.
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {dead.map((line) => (
          <li key={line} className="text-body text-danger">
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
