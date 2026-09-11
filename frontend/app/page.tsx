import { redirect } from "next/navigation"

/**
 * The application opens on the dashboard, which is the first item in
 * the sidebar (section 12.1). There is no separate landing screen.
 */
export default function Home() {
  redirect("/dashboard")
}
