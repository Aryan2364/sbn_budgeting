import { redirect } from "next/navigation"

/**
 * Site locations became Locations (CONTRACT §4): the same rows. Old
 * links and bookmarks land on the new screen.
 */
export default function SiteLocationsRedirect() {
  redirect("/settings/locations")
}
