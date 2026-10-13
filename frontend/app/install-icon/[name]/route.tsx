import { PRODUCT } from "@/lib/product"
import { ALL_INSTALL_ICONS, drawInstallIcon } from "@/lib/install-icon"

/**
 * The installed app's icons - section 41.12 rule 9:
 * /install-icon/192, /install-icon/512 and /install-icon/maskable, named
 * in the manifest (app/install-manifest/route.ts), and /install-icon/apple,
 * iPhone's home screen icon, linked from the head on phone only
 * (app/layout.tsx).
 *
 * WHY A ROUTE HANDLER AND NOT NEXT'S icon AND apple-icon CONVENTIONS. Those
 * add a <link> to every page's head, on a computer too: the browser could
 * pick one for the tab instead of today's favicon, and desktop Safari
 * reads the apple-touch-icon - a desktop change. A link tag also cannot
 * say "maskable". Served from here, the phone reads them through the
 * manifest and the phone-only apple-touch-icon link.
 *
 * Each draws the product's one mark, PRODUCT's (lib/product.tsx), the
 * same one the sign-in page and the offline screen show. Drawn once, when
 * the app is built (generateStaticParams); any other name is not found.
 */

export const dynamicParams = false

export function generateStaticParams() {
  return ALL_INSTALL_ICONS.map((icon) => ({ name: icon.name }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const icon = ALL_INSTALL_ICONS.find((candidate) => candidate.name === name)
  if (!icon) return new Response(null, { status: 404 })
  return drawInstallIcon(icon, PRODUCT.mark)
}
