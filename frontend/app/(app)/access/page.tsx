import { redirect } from "next/navigation"

import { ACCESS_PATHS } from "@/lib/access-api"

/** /access opens its first tab, Roles (kit 40.1). The layout has already refused anyone without access. */
export default function AccessPage() {
  redirect(ACCESS_PATHS.roles)
}
