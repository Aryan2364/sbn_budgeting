import { CircleAlertIcon } from "lucide-react"

import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner"

/**
 * A save that failed for a reason that is not about one field.
 *
 * Section 7.1: it stays true until the user does something about it,
 * so it is a banner rather than a toast. Section 7.2 rule 1: it carries
 * an icon as well as a colour, because colour alone is invisible to
 * colour-blind users.
 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <Banner variant="danger" className="mt-6">
      <CircleAlertIcon />
      <BannerTitle>Could not save</BannerTitle>
      <BannerDescription>{message}</BannerDescription>
    </Banner>
  )
}
