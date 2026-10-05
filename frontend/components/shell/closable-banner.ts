"use client"

import { usePermissions } from "@/lib/permissions"
import { useBannerDismissal } from "@/components/ui/banner"
import { useSession } from "@/components/shell/session"

/**
 * A closable page banner (KIT-PENDING-banners.md rule 2), for the
 * signed-in person: their close is remembered under their own id, per
 * condition, and the banner returns when `level` rises past the level
 * it was closed at.
 *
 * Rule 4, at most one banner per page: while the shell shows its
 * "permissions failed" banner above every page, a closable page banner
 * steps aside rather than stacking under it.
 */
export function useClosableBanner(
  condition: string,
  level: number,
): { hidden: boolean; dismiss: () => void } {
  const { user } = useSession()
  const { status } = usePermissions()
  const { hidden, dismiss } = useBannerDismissal({ userId: user?.id, condition, level })
  return { hidden: hidden || status === "failed", dismiss }
}
