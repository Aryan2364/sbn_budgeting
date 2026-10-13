import { TreePineIcon } from "lucide-react"

import type { Product } from "@/components/templates/sign-in-page"

/**
 * The product's one mark and name (kit section 0.1 item 5): the sign-in
 * page, the offline screen (app/offline/page.tsx) and the installed
 * app's icons (app/install-icon/[name]/route.tsx) all draw this same
 * mark, so a brand change touches one place.
 */
const PRODUCT: Product = { name: "Sadbhavna", mark: <TreePineIcon /> }

export { PRODUCT }
