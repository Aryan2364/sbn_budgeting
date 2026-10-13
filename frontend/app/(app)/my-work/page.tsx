import { redirectOnDesktop } from "@/lib/layout.server"
import { PhoneOnly } from "@/components/shell/phone-only"
import { MyWorkScreen } from "@/components/complaints/phone/my-work-screen"

/**
 * My work, the phone's home and first tab (kit 41.15, plan-phone L2 and
 * 5.1): complaints assigned to me that are still open. A phone-only
 * address (plan D1): its desktop form is the existing Assigned tab, so
 * on desktop the server redirects there, and PhoneOnly corrects a wrong
 * guess in the browser (41.2 rule 5).
 */
export default async function MyWorkPage() {
  await redirectOnDesktop("/complaints?tab=assigned")
  return (
    <PhoneOnly desktopHref="/complaints?tab=assigned">
      <MyWorkScreen />
    </PhoneOnly>
  )
}
