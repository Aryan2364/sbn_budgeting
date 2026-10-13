"use client"

import * as React from "react"
import { DownloadIcon } from "lucide-react"

import { useInstall } from "@/lib/install"
import { InstallSheet } from "@/components/shell/install-sheet"
import { Button } from "@/components/ui/button"
import type { InstallSheetText } from "@/components/shell/install-sheet"

/**
 * More's "Install app" button - section 41.12 rule 8, plan-phone 5.7 and
 * Phase 5. Sits in MoreScreen's `actions` slot, above Sign out, styled
 * the same full-width secondary button (section 2 rule 1: parallel
 * actions look alike).
 *
 *   - Nothing is shown until useInstall() is ready (41.12 rule 8: never
 *     show it and then remove it).
 *   - Hidden once the app is installed (install.installed).
 *   - Where the browser can ask its own question (Chrome-based,
 *     canPrompt), the button asks it directly.
 *   - Otherwise it opens InstallSheet with the platform's own steps
 *     (iPhone, or any other browser's menu).
 *
 * `text` (plan-phone D7): PHONE_WORDS.more.install for the button label,
 * and PHONE_WORDS.install for the sheet. Defaults are the kit's English.
 */
function InstallButton({
  label = "Install app",
  sheetText,
}: {
  label?: string
  sheetText?: Partial<InstallSheetText>
}) {
  const install = useInstall()
  const [sheetOpen, setSheetOpen] = React.useState(false)

  if (!install.ready || install.installed) return null

  async function handleClick() {
    if (install.canPrompt) {
      await install.prompt()
      return
    }
    setSheetOpen(true)
  }

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => void handleClick()}>
        <DownloadIcon aria-hidden />
        {label}
      </Button>
      <InstallSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        platform={install.platform}
        text={sheetText}
      />
    </>
  )
}

export { InstallButton }
