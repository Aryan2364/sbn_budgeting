"use client"

import { format, isSameDay } from "date-fns"
import { CircleAlertIcon } from "lucide-react"

import { Banner, BannerAction, BannerClose, BannerDescription } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { formatDateTime } from "@/lib/format"
import type { Draft, DraftValues } from "@/lib/drafts"

/**
 * Section 41.7 rules 13 and 14: the banner at the top of a phone form
 * whose draft (lib/drafts.ts) was found when it opened. Place it first in
 * the form, above the fields. It draws nothing while useDraft has nothing
 * to offer, which is always on the computer.
 *
 *   <DraftBanner draft={draft} onUse={(kept) => setValues({ ...values, ...kept })} />
 *
 * Two forms, both neutral one-line banners (section 7.5), built from
 * banner.tsx so they take its phone form (41.8 rule 15):
 *
 *   - THE OFFER (rule 13): "You have an unsaved draft from 3:45 PM.",
 *     with "Use draft" and "Discard", and NO close button: the person
 *     chooses one. The banner is the one place on the form that holds
 *     two actions, as rule 13 sets out; both are secondary, because the
 *     form's one primary action is Save (6.1 rule 1).
 *   - NOT USED (rule 14): "Your draft from 3:45 PM was not used, because
 *     Suresh Patel changed this record at 4:10 PM." It reports, so it
 *     closes like any banner (7.5 rule 3), and closing it deletes the
 *     draft. It has no action: there is nothing left to do with the
 *     draft.
 *
 * TIMES (section 18). A time on the same day reads "3:45 PM" (h:mm A).
 * One from another day reads as the full date and time, "12 Aug 2026,
 * 3:45 PM", because a time alone would be a different moment.
 *
 * The draft banner counts toward a page's one banner (7.5 rule 5). The
 * words are English defaults; a product in another language passes
 * `text` from its strings file (37.6).
 */

type DraftBannerText = {
  /** "You have an unsaved draft from 3:45 PM." */
  offer: (when: string) => string
  /** "Your draft from 3:45 PM was not used, because Suresh Patel changed this record at 4:10 PM." */
  notUsed: (when: string, changedBy: string | null, changedAt: string) => string
  use: string
  discard: string
  close: string
  /**
   * Tracking (plan-phone D6): a sentence after the offer, such as "photos
   * are not kept in a draft", for a form whose draft leaves fields out.
   */
  note?: string
}

const TEXT: DraftBannerText = {
  offer: (when) => `You have an unsaved draft from ${when}.`,
  notUsed: (when, changedBy, changedAt) =>
    changedBy
      ? `Your draft from ${when} was not used, because ${changedBy} changed this record at ${changedAt}.`
      : `Your draft from ${when} was not used, because this record was changed at ${changedAt}.`,
  use: "Use draft",
  discard: "Discard",
  close: "Close",
}

/**
 * The time alone on the same day; the date and time on any other
 * (section 18). Tracking: from lib/format.ts, the product's one date
 * format (its DATE_TIME_FORMAT, whose clock part is "h:mm a"), so it
 * reads exactly as every other time on screen. Tracking's time-picker is
 * not ported (plan-phone 7.1).
 */
function when(date: Date, now: Date): string {
  return isSameDay(date, now) ? format(date, "h:mm a") : formatDateTime(date)
}

function DraftBanner<T extends DraftValues>({
  draft,
  onUse,
  text,
}: {
  /** What useDraft returned. */
  draft: Draft<T>
  /** "Use draft": set these values over the form's. */
  onUse: (values: Partial<T>) => void
  text?: Partial<DraftBannerText>
}) {
  const { offer } = draft
  if (!offer) return null
  const t = { ...TEXT, ...text }
  // Rendered only in the browser: an offer exists only once storage has
  // been read after hydration, so the clock read here never mismatches.
  const now = new Date()

  if ("conflict" in offer) {
    const { savedAt, changedBy, changedAt } = offer.conflict
    return (
      <Banner variant="neutral" layout="line">
        <CircleAlertIcon />
        <BannerDescription>
          {t.notUsed(when(savedAt, now), changedBy, when(changedAt, now))}
        </BannerDescription>
        <BannerClose label={t.close} onClick={draft.discard} />
      </Banner>
    )
  }

  return (
    <Banner variant="neutral" layout="line">
      <CircleAlertIcon />
      <BannerDescription>
        {t.note ? `${t.offer(when(offer.savedAt, now))} ${t.note}` : t.offer(when(offer.savedAt, now))}
      </BannerDescription>
      <BannerAction>
        <Button type="button" size="sm" variant="secondary" onClick={draft.discard}>
          {t.discard}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => onUse(draft.restore())}>
          {t.use}
        </Button>
      </BannerAction>
    </Banner>
  )
}

export { DraftBanner, type DraftBannerText }
