"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const CONTENT_ID = "content"

/**
 * Section 12.3. 24px on every side, at most 1600px wide and centred. The
 * page header, with its title and one primary action, belongs to the
 * page, not to this.
 *
 * It is the skip link's target, so it takes focus (tabIndex -1) without
 * becoming a tab stop, and shows no ring: it is not a control.
 */
function ContentArea({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      id={CONTENT_ID}
      tabIndex={-1}
      data-slot="content-area"
      className={cn(
        "mx-auto w-full max-w-content-max min-w-0 flex-1 p-6 outline-none",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 39.1. The first Tab on every page reaches this, and it is
 * visible only while it has focus. It jumps past the sidebar and the top
 * bar to the page's content.
 *
 * Focus moves by script as well as by the href, because a hash link only
 * moves focus in some browsers, and not at all once the URL already ends
 * in #content. On the tooltip layer while focused: it has to show above
 * the shell it skips, and like a tooltip it is transient.
 */
function SkipToContent({ children = "Skip to content" }: { children?: React.ReactNode }) {
  return (
    <Button
      variant="secondary"
      nativeButton={false}
      render={<a href={`#${CONTENT_ID}`} />}
      data-slot="skip-to-content"
      onClick={(event) => {
        const target = document.getElementById(CONTENT_ID)
        if (!target) return
        event.preventDefault()
        target.focus()
        target.scrollIntoView({ block: "start" })
      }}
      className="fixed -top-12 left-2 z-(--z-tooltip) focus:top-2"
    >
      {children}
    </Button>
  )
}

export { ContentArea, SkipToContent, CONTENT_ID }
