import { redirectOnDesktop } from "@/lib/layout.server"
import { PhoneOnly } from "@/components/shell/phone-only"
import { PhoneCommentsScreen } from "@/components/complaints/phone/comments-screen"

/**
 * Plan-phone D1, 5.4: `/complaints/[id]/comments`, phone only. Desktop
 * has no separate comments address — the comments live on the record's
 * Activity card — so the server redirects there, and PhoneOnly corrects
 * a wrong guess in the browser (41.2 rule 5).
 */
export default async function ComplaintCommentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await redirectOnDesktop(`/complaints/${id}`)
  return (
    <PhoneOnly desktopHref={`/complaints/${id}`}>
      <PhoneCommentsScreen id={id} />
    </PhoneOnly>
  )
}
