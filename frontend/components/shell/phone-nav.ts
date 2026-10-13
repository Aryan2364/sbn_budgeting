import { canAny, type Can, type Needs } from "@/components/shell/nav"

/**
 * Section 41.4 rule 17: the phone's tab bar and More carry permissions
 * like the sidebar's items (12.1). A tab the person cannot use is not
 * rendered, and More lists only what they can open (26 rule 1).
 *
 * THIS IS THE ONE PLACE THAT DECIDES IT (plan-phone D4). tab-bar.tsx and
 * more-screen.tsx pass every item they are given through this function,
 * with the `can` of lib/permissions.ts (usePermissions().can), and no
 * caller filters its list on its own. Two places that each decide which
 * destinations a person may see will, one day, disagree.
 *
 * An item carries `permission`: a key, or several meaning "any of"
 * (nav.ts canAny), and no permission means everyone. It is shown only
 * when the answer is a definite yes: the shell renders nothing until the
 * permissions have landed (session.tsx RequireSession), so the bar is
 * right on the first paint and never shows a tab and then removes it.
 * Never a role or an admin flag (26 rule 5).
 *
 * Computer-only screens (41.11 rule 2) never reach this list at all:
 * they are left out by the product's own list of phone screens
 * (phone-routes.ts, 41.1 rule 1), not filtered here.
 */
function phoneDestinations<T extends { href: string; permission?: Needs }>(
  items: T[],
  can: Can
): T[] {
  return items.filter((item) => item.permission === undefined || canAny(can, item.permission) === true)
}

export { phoneDestinations }
