import * as React from "react"

import { useLayout } from "@/lib/layout"

/**
 * Section 41.7 rules 5 and 6 - the keyboard a field asks for, and what
 * its Enter key does on a phone.
 *
 * RULE 5: EACH FIELD ASKS FOR THE RIGHT KEYBOARD, and the Enter key says
 * what it does. fieldKeyboard(kind) returns the attributes, spread on the
 * input:
 *
 *   <Input {...fieldKeyboard("amount")} />
 *   <Input {...fieldKeyboard("text", { last: true, autoComplete: "name" })} />
 *
 * | kind        | inputMode | enterKeyHint        | autoComplete            |
 * |-------------|-----------|---------------------|-------------------------|
 * | amount      | decimal   | next (done if last) | off                     |
 * | quantity    | decimal   | next (done if last) | off                     |
 * | percentage  | decimal   | next (done if last) | off                     |
 * | pin         | numeric   | next (done if last) | postal-code             |
 * | phone       | tel       | next (done if last) | tel                     |
 * | email       | email     | next (done if last) | email                   |
 * | text        | text      | next (done if last) | the caller's, else none |
 * | longText    | text      | enter (new line)    | the caller's, else none |
 * | search      | search    | search              | off                     |
 *
 * `pin` is the Indian PIN code, the postal code (section 37.3), never a
 * secret number: a secret goes in password-input.tsx (section 32).
 *
 * WHY inputMode AND NEVER type. The keyboard comes from inputMode alone
 * on every phone the kit supports. `type` would bring things the kit does
 * not want, on the computer as well as the phone: type="email" adds the
 * browser's own validation bubble on submit (section 1 rule 5), type=
 * "search" draws the browser's own clear button beside the kit's
 * (section 27.1), and type="number" changes the value when the mouse
 * wheel turns over it and cannot show Indian grouping (section 18). So
 * none of these attributes changes how a field looks or behaves with a
 * mouse and a physical keyboard; they only choose the on-screen keyboard
 * and its Enter key, and name the value for autofill.
 *
 * `last` is the last SINGLE-LINE field of the form, whose Enter key
 * closes the keyboard (rule 6), so it says Done rather than Next. A long
 * text field after it does not change that: Enter never moves into a
 * long text field (usePhoneEnter, below), so the field before one is
 * still `last` when no single-line field follows. The table in rule 5
 * writes "Next" for the number rows because a number is rarely last; when
 * it is, Done is what its Enter key does, so it says that.
 *
 * RULE 6: ENTER ON A PHONE NEVER SAVES. usePhoneEnter() gives the form's
 * onKeyDown, below. On the computer it does nothing at all, so Enter in a
 * single-line field still saves the form there (section 39.2).
 *
 * No "use client" on purpose: a server component spreads fieldKeyboard()
 * on its fields, and every value a "use client" module exports reaches a
 * server module as a client reference, not a function it can call (the
 * reason lib/layout-shared.ts exists). usePhoneEnter is a hook, so only a
 * client component can call it anyway.
 */

type FieldKind =
  | "amount"
  | "quantity"
  | "percentage"
  | "pin"
  | "phone"
  | "email"
  | "text"
  | "longText"
  | "search"

type FieldKeyboardProps = Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  "inputMode" | "enterKeyHint" | "autoComplete" | "autoCapitalize" | "spellCheck"
>

function fieldKeyboard(
  kind: FieldKind,
  {
    last = false,
    autoComplete,
  }: {
    /**
     * The form's last single-line field, whatever long text fields follow
     * it: Enter closes the keyboard (Done).
     */
    last?: boolean
    /**
     * An autofill token for a text field, such as "name",
     * "organization", "street-address" or "address-level2" (city). Other
     * kinds carry their own.
     */
    autoComplete?: string
  } = {}
): FieldKeyboardProps {
  const next = last ? "done" : "next"
  switch (kind) {
    case "amount":
    case "quantity":
    case "percentage":
      // Off: a list of earlier amounts is never a useful suggestion.
      return { inputMode: "decimal", enterKeyHint: next, autoComplete: autoComplete ?? "off" }
    case "pin":
      return { inputMode: "numeric", enterKeyHint: next, autoComplete: autoComplete ?? "postal-code" }
    case "phone":
      return { inputMode: "tel", enterKeyHint: next, autoComplete: autoComplete ?? "tel" }
    case "email":
      // An address is never capitalised or spell-checked.
      return {
        inputMode: "email",
        enterKeyHint: next,
        autoComplete: autoComplete ?? "email",
        autoCapitalize: "none",
        spellCheck: false,
      }
    case "text":
      return { inputMode: "text", enterKeyHint: next, ...(autoComplete ? { autoComplete } : {}) }
    case "longText":
      // Enter makes a new line in a long text field (rule 5's table).
      return { inputMode: "text", enterKeyHint: "enter", ...(autoComplete ? { autoComplete } : {}) }
    case "search":
      return { inputMode: "search", enterKeyHint: "search", autoComplete: autoComplete ?? "off" }
  }
}

/**
 * Whether the page is in the phone layout now, for code that runs in an
 * event and is not a component: the Enter helpers of keyboard-shortcuts.tsx.
 *
 * It reads data-layout on <html>, which LayoutProvider (lib/layout.ts)
 * writes from useLayout()'s measured answer, so it is the same answer,
 * read at the moment of the key press. It measures nothing itself (41.2
 * rule 2). Components ask useLayout().
 */
function isPhoneLayout(): boolean {
  return (
    typeof document !== "undefined" && document.documentElement.dataset.layout === "phone"
  )
}

/**
 * Input types that open no keyboard, or open the phone's own picker
 * (41.9 rule 10). Enter never moves focus onto them: focusing a date
 * field does not open its picker, and the keyboard would only close.
 */
const NOT_TYPED = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
  "hidden",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
])

/**
 * A single-line field that takes the on-screen keyboard, and that a
 * person can reach: where Enter may move to. Never a long text field
 * (a textarea): see usePhoneEnter.
 */
function singleLineField(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement) || NOT_TYPED.has(el.type)) return false
  if (el.disabled || el.readOnly || el.tabIndex < 0) return false
  // Base UI's hidden inputs behind a tick box or select are aria-hidden;
  // a field in a closed section is not rendered.
  if (el.closest('[aria-hidden="true"], [inert]')) return false
  return el.getClientRects().length > 0
}

/** The fields of the form, in the order they sit on the screen (39.1). */
function fieldsOf(container: HTMLElement): Element[] {
  return container instanceof HTMLFormElement
    ? Array.from(container.elements)
    : Array.from(container.querySelectorAll("input, textarea"))
}

/** Tick boxes, radios and switches: Base UI's Enter on them presses Save. */
const CHOICE_ROLES = new Set(["checkbox", "radio", "switch"])

/**
 * Rule 6, as the onKeyDown of the form (or of whatever holds its fields):
 *
 *   const phoneEnter = usePhoneEnter()
 *   <form onSubmit={save} onKeyDown={phoneEnter}>
 *
 * In the phone layout:
 *
 *   - Enter in a single-line field moves to the next SINGLE-LINE field
 *     that takes the keyboard. On the last single-line field it closes
 *     the keyboard, by taking focus off the field - even when a long text
 *     field follows it. Enter never moves into a long text field: the
 *     person taps one when they want to write in it, and arriving there
 *     by Enter would only leave the keyboard open over a box whose Enter
 *     makes new lines, with no way on but a tap. So fieldKeyboard's
 *     `last` is the last single-line field, and its key says Done.
 *   - It never saves: not from a field, and not from a tick box, radio
 *     or switch, whose Enter Base UI otherwise turns into a press of the
 *     form's Save. This holds with an attached keyboard as well as the
 *     on-screen one. Saving is the Save button, which Enter still presses
 *     when it has focus.
 *   - A long text field keeps Enter as a new line (rule 5).
 *
 * Left alone, in either layout: a key a field already handled (a search
 * box's Enter, a comment box's), an open list's Enter, which picks the
 * option, and anything typed in a sheet or menu this form opened. React
 * passes those up through the portal to this handler, but they are not
 * inside the form on the page, so they are not its fields.
 *
 * In the desktop layout it does nothing at all, so Enter in a
 * single-line field saves the form (39.2) exactly as before.
 */
function usePhoneEnter(): (event: React.KeyboardEvent<HTMLElement>) => void {
  const { layout } = useLayout()
  return React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (layout !== "phone") return
      if (event.key !== "Enter" || event.defaultPrevented || event.nativeEvent.isComposing) return
      const container = event.currentTarget
      const target = event.target
      if (!(target instanceof HTMLElement) || !container.contains(target)) return

      const role = target.getAttribute("role")
      if (role && CHOICE_ROLES.has(role)) {
        // Base UI waits for the end of this event before pressing Save,
        // and skips it once a handler on the way up has prevented it.
        event.preventDefault()
        return
      }
      if (target instanceof HTMLTextAreaElement || target.isContentEditable) return
      if (!(target instanceof HTMLInputElement) || NOT_TYPED.has(target.type)) return
      // An open list inside the field (a combobox): Enter picks the option.
      if (target.getAttribute("aria-expanded") === "true") return

      // Stops the browser's implicit submission of the form (rule 6).
      event.preventDefault()
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

      const fields = fieldsOf(container).filter(singleLineField)
      const at = fields.indexOf(target)
      // A read-only field is not one of them: Enter there does nothing.
      if (at < 0) return
      const next = fields[at + 1]
      if (next) next.focus()
      else target.blur()
    },
    [layout]
  )
}

export { fieldKeyboard, usePhoneEnter, isPhoneLayout, type FieldKind, type FieldKeyboardProps }
