"use client"

import * as React from "react"

import type { InstallPlatform } from "@/lib/install"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

/** The kit's own English, kept as the default so any other caller is unaffected (plan-phone D7, 37.6 rule 2). */
type InstallSheetText = {
  title: string
  iPhoneIntro: string
  iPhoneSteps: readonly string[]
  otherSteps: string
}

const WORDS: InstallSheetText = {
  // One action, one wording: the button that opens this sheet reads
  // "Install app" too.
  title: "Install app",
  iPhoneIntro: "Add the app to your Home Screen, so it opens like any other app.",
  iPhoneSteps: [
    "Tap Share in the browser's toolbar.",
    'Tap "Add to Home Screen". If you do not see it, scroll down the list.',
    "Tap Add.",
  ],
  otherSteps: `Open the browser's menu and choose "Install app" or "Add to Home screen".`,
}

/**
 * Section 41.12 rule 8: where the browser cannot ask its own install
 * question - Safari on iPhone, Firefox, or Chrome once its question has
 * been answered - More's "Install app" button (plan-phone 5.7) opens
 * this bottom sheet (41.8) with the browser's own steps.
 *
 *   - On iPhone: tap Share, then "Add to Home Screen", then Add.
 *   - Anywhere else: one line, the browser's menu and its "Install app"
 *     or "Add to Home screen".
 *
 * It only explains: there is nothing to choose, so it has no footer, and
 * it closes like every bottom sheet - its close button, a swipe down,
 * the backdrop or Android back (41.8 rule 5). Controlled: the row that
 * opens it holds `open`.
 *
 * `text` (plan-phone D7): the phone words, from PHONE_WORDS.install.
 * The default above is the kit's English, so any other caller is
 * unaffected.
 */
function InstallSheet({
  open,
  onOpenChange,
  platform,
  text,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  platform: InstallPlatform
  text?: Partial<InstallSheetText>
}) {
  const t = text ? { ...WORDS, ...text } : WORDS
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {platform === "ios" ? (
            <div className="flex flex-col gap-4 text-body text-text-primary">
              <p>{t.iPhoneIntro}</p>
              <ol className="flex list-decimal flex-col gap-2 pl-6">
                {t.iPhoneSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-body text-text-primary">{t.otherSteps}</p>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

export { InstallSheet }
export type { InstallSheetText }
