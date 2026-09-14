import { CircleAlertIcon } from "lucide-react"

import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { EmptyState } from "@/components/ui/empty-state"

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

/**
 * A form whose OPTIONS could not be loaded — which is a different
 * failure from a save that did not go through, and used to render as
 * one.
 *
 * All three forms funnelled both into a single `error` state shown by
 * `FormError`, whose title is the hardcoded "Could not save". So a
 * failed load told the user a save had failed before they had typed
 * anything: the wrong cause (section 7.2 rule 2), and no way to try
 * again (section 13's failed state wants a way forward).
 *
 * It is also not survivable in place. A form whose project, site or
 * cost-head lists are empty cannot be filled in correctly, so this
 * replaces the form rather than sitting above it.
 */
export function FormLoadFailed({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <EmptyState
      variant="failed"
      heading="This form could not be loaded"
      onAction={onRetry}
    >
      {message} Nothing has been saved.
    </EmptyState>
  )
}
