import { redirect } from "next/navigation"

/**
 * Site locations became Locations (CONTRACT §4): the same rows, now
 * also where complaints are raised and who receives them. Old links
 * and bookmarks land on the new screen.
 */
export default function SiteLocationsRedirect() {
  redirect("/settings/locations")
}
