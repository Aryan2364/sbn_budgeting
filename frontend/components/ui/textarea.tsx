"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"
import { cn } from "@/lib/utils"

/**
 * Section 17: free-form text spans all 12 columns, so a textarea is the
 * one field that is allowed to be full width. Everything else about it
 * matches Input.
 *
 * ON PHONE (41.7 rule 11) a long-text field grows as the person types and
 * never scrolls inside itself; the page scrolls (section 1 rule 8). Two
 * things do it:
 *
 *   - field-sizing: content, which the field already carries in both
 *     layouts, grows it with its text where the browser has it (Chrome,
 *     and so Android's browsers).
 *   - Where the browser does not (Safari on the iPhones the kit
 *     supports, at the time of writing), a fallback sets the field's height to its text's height on every
 *     change. It runs only in the phone layout and only when the browser
 *     lacks field-sizing, so nothing changes on the computer. The height
 *     is a runtime measurement of the text, not a spacing choice
 *     (section 1 rule 2).
 *
 * `phone:overflow-y-hidden` keeps it from ever scrolling inside itself,
 * and `phone:max-h-none` lifts any cap a caller set for the computer, so
 * a cap can never bring that inner scroll back on phone. It is full
 * width already (w-full), and the 480px field cap never applied to it.
 */
function Textarea({
  className,
  ref,
  ...props
}: React.ComponentProps<"textarea">) {
  const { layout } = useLayout()
  const own = React.useRef<HTMLTextAreaElement | null>(null)
  // Whether the browser has field-sizing is known only in the browser, so
  // it is asked inside the effects, never while rendering.
  const phone = layout === "phone"

  React.useLayoutEffect(() => {
    const el = own.current
    if (!el || !phone || supportsFieldSizing()) return
    const grow = () => fitHeight(el)
    // Typing, and a turn of the phone that changes the line length.
    el.addEventListener("input", grow)
    window.addEventListener("resize", grow)
    return () => {
      el.removeEventListener("input", grow)
      window.removeEventListener("resize", grow)
      el.style.removeProperty("height")
    }
  }, [phone])

  // A value set from outside (a restored draft, a reset) is not an input
  // event, so the height follows every render as well.
  React.useLayoutEffect(() => {
    if (phone && own.current && !supportsFieldSizing()) fitHeight(own.current)
  })

  // The caller's ref, kept working beside this component's own (React 19
  // passes ref as a prop, section 4.2).
  const setRef = React.useCallback(
    (el: HTMLTextAreaElement) => {
      own.current = el
      const cleanup = typeof ref === "function" ? ref(el) : undefined
      if (ref && typeof ref !== "function") ref.current = el
      return () => {
        own.current = null
        if (typeof cleanup === "function") cleanup()
        else if (typeof ref === "function") ref(null)
        else if (ref) ref.current = null
      }
    },
    [ref]
  )

  return (
    <textarea
      ref={setRef}
      data-slot="textarea"
      className={cn(
        "field-sizing-content flex min-h-16 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-body text-text-primary transition-colors duration-(--duration-fast)",
        "placeholder:text-text-muted",
        "outline-none focus-visible:border-primary-ring focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-0 focus-visible:outline-primary-ring",
        /*
         * Section 6.4: hover changes the background, pressed changes it
         * SECTION 6.4: A TEXT-ENTRY CONTROL IS NOT PRESSED, IT IS
         * FOCUSED. It carries no hover fill and no pressed fill - only
         * the border moves on hover, and focus is carried by the
         * border and the primary-ring.
         *
         * This field once had both fills. They were added to satisfy
         * `state-matrix-check`, which had correctly reported that it
         * declared no states - and the wrong half was fixed. The
         * background of a text field is carrying text the user is
         * reading back, and a pointer left over the field after a
         * click holds `:hover` for as long as they type. A hover fill
         * here is not a brief highlight, it is how the field looks in
         * use.
         *
         * `enabled:` so a disabled field does not light up under the
         * pointer.
         */
        "enabled:hover:border-border-strong",
        "disabled:cursor-default disabled:border-border-light disabled:bg-surface-sunken disabled:text-text-muted",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        className,
        // After the caller's classes, so a computer-only cap stays off
        // the phone (41.7 rule 11).
        "phone:max-h-none phone:overflow-y-hidden"
      )}
      {...props}
    />
  )
}

function supportsFieldSizing(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")
}

/**
 * The text's own height. Set to auto first, so the field can shrink when
 * text is deleted; min-h-16 still holds the two-line minimum. scrollHeight
 * leaves out the border, and the field is border-box, so the border is
 * added back.
 */
function fitHeight(el: HTMLTextAreaElement) {
  const style = window.getComputedStyle(el)
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight + border}px`
}

export { Textarea }
