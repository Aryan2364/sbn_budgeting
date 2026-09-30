"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { ExternalLinkIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Section 6.6. A link goes somewhere; a button does something. Anything
 * that saves, deletes, submits or opens a dialog is a Button instead.
 *
 * Three of the four appearances live here. The fourth - a record's name
 * in a table row - is TableRowLink in table.tsx, and is not repeated.
 *
 * - `standing`: on its own ("Forgot your password?"). primary-text, body
 *   weight, underline on hover.
 * - `inline`: inside a sentence. primary-text, always underlined.
 * - `on-brand`: on a brand band or the sign-in brand panel. on-brand,
 *   always underlined.
 *
 * A visited link looks the same as an unvisited one: the colour is set
 * explicitly and there is no :visited rule. A link to another website
 * opens in a new tab and carries the external-link icon after its text
 * (23.1), with the fact spelled out for a screen reader. A link with
 * nowhere to go (no href) renders as plain text (rule 4).
 *
 * Pass `render={<Link href=... />}` for client-side routing; the href is
 * read from the rendered element too, so the external check still runs.
 */
type Appearance = "standing" | "inline" | "on-brand"

const APPEARANCE: Record<Appearance, string> = {
  standing: "text-primary-text no-underline hover:underline",
  inline: "text-primary-text underline",
  "on-brand": "text-on-brand underline",
}

/** Another website: an absolute http(s) URL whose origin is not this one. */
function isExternal(href: string | undefined) {
  if (!href || !/^https?:\/\//i.test(href)) return false
  if (typeof window === "undefined") return true
  try {
    return new URL(href).origin !== window.location.origin
  } catch {
    return false
  }
}

type TextLinkProps = useRender.ComponentProps<"a"> & {
  appearance?: Appearance
}

function TextLink({
  appearance = "standing",
  className,
  render,
  href,
  children,
  ...props
}: TextLinkProps) {
  const renderedHref =
    href ??
    (React.isValidElement<{ href?: unknown }>(render) &&
    typeof render.props.href === "string"
      ? render.props.href
      : undefined)
  const external = isExternal(renderedHref)

  const element = useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        href,
        ...({ "data-slot": "text-link" } as React.HTMLAttributes<HTMLAnchorElement>),
        className: cn(
          "text-body underline-offset-2 decoration-1",
          APPEARANCE[appearance],
          // An inline link sits between lines of text, where a 44px tap
          // extension would reach into the lines above and below and take
          // their taps (9 rule 4's "never overlap"), so only the links
          // that stand alone take it.
          appearance !== "inline" && "tap-area",
          "rounded-sm outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2",
          appearance === "on-brand"
            ? "focus-visible:outline-on-brand"
            : "focus-visible:outline-primary-ring",
          external && "inline-flex items-center gap-1",
          className
        ),
        ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
        children: (
          <>
            {children}
            {external ? (
              <>
                <ExternalLinkIcon aria-hidden className="size-4 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </>
            ) : null}
          </>
        ),
      },
      props
    ),
  })

  if (!renderedHref) {
    // Rule 4: nowhere to go, so it is plain text, not a dead link.
    return (
      <span data-slot="text-link" className={cn("text-body", className)}>
        {children}
      </span>
    )
  }

  return element
}

export { TextLink, type Appearance as TextLinkAppearance }
