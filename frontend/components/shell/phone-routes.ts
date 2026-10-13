/**
 * Kit 41.1 rules 1 to 3 and plan-phone D2: THE LIST OF ADDRESSES THAT
 * HAVE A PHONE SCREEN. Written once, here. On phone, AppShell's
 * PhoneRouteGate (phone-route-gate.tsx) renders the computer-only page
 * (41.11) for every address in the shell that is NOT listed, so a new
 * route is computer-only on phone until someone decides otherwise (41.1
 * rule 1: "a screen not listed stays on the computer"). No page needs a
 * per-page ComputerOnly wrapper, and no Budget, Settings or Access page
 * is touched.
 *
 * TO GIVE A ROUTE A PHONE SCREEN: agree it in the plan's screen list
 * (41.1 rule 2), build its phone tree (PageHeader as the first direct
 * child, chosen by useLayout() in the route file), then add its pattern
 * here. Patterns match the whole pathname (no query string).
 *
 * The login page and `/` sit outside the shell and are not gated.
 */
const PHONE_ROUTES: readonly RegExp[] = [
  /^\/my-work\/?$/,
  /^\/more\/?$/,
  /^\/complaints\/?$/,
  /^\/complaints\/new\/?$/,
  // A complaint's record. Not the dashboard, which stays on the computer.
  /^\/complaints\/(?!dashboard\/?$)[^/]+\/?$/,
  /^\/complaints\/[^/]+\/comments\/?$/,
]

/** True when this address has a phone screen. */
function isPhoneRoute(pathname: string): boolean {
  return PHONE_ROUTES.some((pattern) => pattern.test(pathname))
}

export { PHONE_ROUTES, isPhoneRoute }
