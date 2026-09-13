import { redirect } from "next/navigation"

/**
 * Settings is the three masters: cost heads, site locations, people.
 *
 * There was a "General" tab here holding an organisation name, a
 * contact email and a phone number. It was never wired to anything —
 * no table, no endpoint, no submit handler — so its Save buttons did
 * nothing at all, silently. It also carried a "Delete organisation"
 * card offering to remove every project, site, budget and expense.
 * A control that destroys the entire dataset does not belong in the
 * interface, least of all one whose siblings did nothing.
 *
 * The sidebar and every existing bookmark still point at /settings, so
 * this redirects rather than 404s. Cost heads is first in the section
 * menu, which makes it the landing section.
 */
export default function SettingsPage() {
  redirect("/settings/cost-heads")
}
