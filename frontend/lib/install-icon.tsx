import * as React from "react"
import type { ImageResponse } from "next/og"

import { INSTALL_COLOURS } from "@/lib/install-settings"

/**
 * The installed app's icons - section 41.12 rule 9: 192px, 512px, a
 * maskable icon with the mark inside its safe circle, and iPhone's home
 * screen icon (180px).
 *
 * DRAWN, NOT STORED. Next's own ImageResponse (next/og) draws each one, so
 * the kit needs no image files and no image package (section 1 rule 10).
 *
 * THE PRODUCT'S ONE MARK (stage 6 decision 13). The mark drawn is the
 * product's own - KIT_PRODUCT's (app/demo/product.tsx), the same mark the
 * sign-in page and the offline screen show - passed in by the route that
 * serves the icons. A product that replaces its mark there gets icons of
 * the new mark with no change here. A product with its own artwork for
 * the icons replaces drawInstallIcon instead.
 *
 * Who serves them: app/install-icon/[name]/route.tsx, at
 * /install-icon/<name>:
 *   - 192, 512 and maskable are listed in the manifest
 *     (app/install-manifest/route.ts) and nowhere else, so a computer's
 *     browser tab keeps the favicon it has today.
 *   - apple is iPhone's apple-touch-icon, linked from the head on phone
 *     only (app/layout.tsx's generateMetadata).
 *
 * The inline style objects are ImageResponse's only way to style what it
 * draws (it has no stylesheet), and the colours are the install colours
 * of lib/install-settings.ts - the install settings' exception to section
 * 1 rules 1 and 2. Nothing here is ever on a screen.
 */

type InstallIcon = {
  /** The last part of the icon's address: /install-icon/<name>. */
  name: string
  /** Width and height in px. */
  size: number
  /** The manifest's purpose: "any" is drawn as it is, "maskable" is cut to the phone's shape. */
  purpose: "any" | "maskable"
  /** The mark's width as a share of the icon's. */
  mark: number
}

/*
 * HOW BIG THE MARK IS.
 *
 * "any" icons, and iPhone's: the mark takes 60% of the width, on a
 * primary ground that runs to every edge. iPhone and most Android
 * launchers round the corners themselves.
 *
 * The maskable icon: a launcher may cut it to any shape that keeps the
 * central circle whose diameter is 80% of the icon (the safe circle,
 * 41.12 rule 9). The mark is drawn in a square box 50% of the icon wide,
 * centred, and an SVG never paints outside its box. The box's corners are
 * 0.5 x 0.707 = 35.4% of the icon from the centre, inside the safe
 * circle's 40%, so ANY mark is inside the safe circle, whatever its shape
 * - the rule holds when a product changes its mark. Keep the maskable
 * mark at or below 56% (0.4 / 0.707) of the width. The ground runs to
 * every edge, so whatever shape the launcher cuts is filled.
 */
const INSTALL_ICONS: readonly InstallIcon[] = [
  { name: "192", size: 192, purpose: "any", mark: 0.6 },
  { name: "512", size: 512, purpose: "any", mark: 0.6 },
  { name: "maskable", size: 512, purpose: "maskable", mark: 0.5 },
]

/** iPhone's home screen icon (apple-touch-icon), 180px, drawn like an "any" icon. Not in the manifest. */
const APPLE_ICON: InstallIcon = { name: "apple", size: 180, purpose: "any", mark: 0.6 }

/** Every icon /install-icon/<name> serves. */
const ALL_INSTALL_ICONS: readonly InstallIcon[] = [...INSTALL_ICONS, APPLE_ICON]

/* ------------------------------------------------------------------
   Reading the mark.

   ImageResponse draws SVG elements, not components that run in the
   browser. The product mark is a React element - a Lucide icon in the kit
   (<HexagonIcon />), or the product's own <svg>. A Lucide icon's inner
   part is a client component, which cannot run here, so the mark is read
   down to its drawing: a Lucide icon to its icon nodes (the paths Lucide
   draws on its 24 by 24 grid), anything else to the <svg> element it
   renders. A mark that is neither (a client component of the product's
   own) stops the icon route with an error naming the fix.
   ------------------------------------------------------------------ */

type LucideNode = readonly (readonly [string, Record<string, unknown>])[]

type MarkDrawing =
  | { kind: "lucide"; nodes: LucideNode; strokeWidth: number }
  | { kind: "svg"; element: React.ReactElement<React.SVGProps<SVGSVGElement>> }

const FORWARD_REF = Symbol.for("react.forward_ref")
const MEMO = Symbol.for("react.memo")
const CLIENT_REFERENCE = Symbol.for("react.client.reference")

function markError(): Error {
  return new Error(
    "lib/install-icon.tsx: the product mark cannot be drawn into the app icon. Use a Lucide icon or a plain <svg> element (not a client component) as the product's mark, or replace drawInstallIcon with the product's own artwork."
  )
}

/** Reads a mark element down to what it draws (see above). */
function readMark(node: React.ReactNode, depth = 0): MarkDrawing {
  if (depth > 8 || !React.isValidElement(node)) throw markError()
  const props = (node.props ?? {}) as Record<string, unknown>

  // A Lucide icon, at the point where it hands its paths to Lucide's Icon.
  if (Array.isArray(props.iconNode)) {
    const width = Number(props.strokeWidth ?? 2)
    return {
      kind: "lucide",
      nodes: props.iconNode as LucideNode,
      strokeWidth: Number.isFinite(width) && width > 0 ? width : 2,
    }
  }

  const type = node.type as unknown
  if (type === "svg") {
    return { kind: "svg", element: node as React.ReactElement<React.SVGProps<SVGSVGElement>> }
  }

  if (typeof type === "object" && type !== null) {
    const wrapped = type as { $$typeof?: symbol; render?: (p: unknown, ref: unknown) => React.ReactNode; type?: unknown }
    if (wrapped.$$typeof === FORWARD_REF && wrapped.render) {
      return readMark(wrapped.render(props, null), depth + 1)
    }
    if (wrapped.$$typeof === MEMO && wrapped.type) {
      return readMark(React.createElement(wrapped.type as React.ElementType, props), depth + 1)
    }
  }

  if (typeof type === "function") {
    const fn = type as ((p: unknown) => React.ReactNode) & { $$typeof?: symbol; prototype?: { isReactComponent?: unknown } }
    if (fn.$$typeof !== CLIENT_REFERENCE && !fn.prototype?.isReactComponent) {
      return readMark(fn(props), depth + 1)
    }
  }

  throw markError()
}

/** The mark, drawn `size` px square in on-theme. */
function drawMark(drawing: MarkDrawing, size: number): React.ReactElement {
  if (drawing.kind === "lucide") {
    // As Lucide draws it: its 24 by 24 grid, a round-capped stroke, no fill.
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={INSTALL_COLOURS.onTheme}
        strokeWidth={drawing.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {drawing.nodes.map(([tag, attrs], index) => {
          const { key, ...rest } = attrs
          return React.createElement(tag, { ...rest, key: String(key ?? index) })
        })}
      </svg>
    )
  }
  // The product's own <svg>: sized to the box, its currentColor in on-theme.
  const style = drawing.element.props.style
  return React.cloneElement(drawing.element, {
    width: size,
    height: size,
    style: { ...style, color: INSTALL_COLOURS.onTheme },
  })
}

/** Draws one icon: the product's mark in on-theme, centred on the theme colour. */
async function drawInstallIcon(
  icon: Pick<InstallIcon, "size" | "mark">,
  productMark: React.ReactNode
): Promise<ImageResponse> {
  // Loaded here, not at the top: the root layout reads this file's icon
  // table (APPLE_ICON), and must not load the image renderer with it.
  const og = await import("next/og")
  const markSize = Math.round(icon.size * icon.mark)
  const mark = drawMark(readMark(productMark), markSize)
  return new og.ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: INSTALL_COLOURS.theme,
        }}
      >
        {mark}
      </div>
    ),
    { width: icon.size, height: icon.size }
  )
}

export { INSTALL_ICONS, APPLE_ICON, ALL_INSTALL_ICONS, drawInstallIcon }
export type { InstallIcon }
