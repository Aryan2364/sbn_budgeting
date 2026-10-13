import { redirectOnDesktop } from "@/lib/layout.server"
import { PhoneOnly } from "@/components/shell/phone-only"
import { PhoneMoreScreen } from "@/components/complaints/phone/more-screen"

/**
 * More, the phone's last tab (kit 41.4 rule 15, plan-phone 5.7). A
 * phone-only address (plan D1): on desktop the server redirects to `/`,
 * and PhoneOnly corrects a wrong guess in the browser (41.2 rule 5).
 */
export default async function MorePage() {
  await redirectOnDesktop("/")
  return (
    <PhoneOnly desktopHref="/">
      <PhoneMoreScreen />
    </PhoneOnly>
  )
}
