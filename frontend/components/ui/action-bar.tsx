"use client"

import * as React from "react"

import { useLayout } from "@/lib/layout"
import {
  ActionBarFrame,
  checkActionBarButtons,
  MAX_ACTION_BAR_BUTTONS,
} from "@/components/ui/sheet"

/**
 * Section 41.6 rules 7 to 9 and 41.7 rules 3 and 4 - the phone's action
 * bar: a record's main actions, or a form's Save, fixed at the bottom of
 * the screen.
 *
 * The bar itself is ActionBarFrame in sheet.tsx, the one implementation a
 * full-screen dialog's footer draws too: the frame, the two-button limit,
 * the shared width, a disabled action's size, the bottom-bar contract and
 * keeping the field being typed in above the bar while the keyboard is
 * open. This component only places it: fixed to the bottom of the screen,
 * on the shell layer (5.5), in the phone layout.
 *
 *   - At most two buttons, sharing the width equally, in the order
 *     written: the secondary first, on the left, the primary last, on the
 *     right (rule 8, 11.3 rule 7). One action takes the full width. More
 *     than two throws, as the app bar does past its limit: the rest
 *     belong in the app bar's three-dot menu (rule 1).
 *   - No buttons, no bar (rule 9): `{canApprove && <Button/>}` that comes
 *     out empty renders nothing, and no bottom padding is kept for it.
 *   - An action the person cannot take stays in the bar, disabled, inside
 *     <PermissionTooltip>, which opens its reason on a tap (rule 9, 26,
 *     41.8 rule 17).
 *
 * On a phone guess useLayout() answers "phone" while rendering on the
 * server and hydrating, so the bar - and the bottom padding the bottom-bar
 * contract keeps for it - is in the server's HTML.
 *
 * Put it last in the page, after the content: the reading and Tab order
 * then follow the screen, top to bottom (39.1).
 *
 * DESKTOP: renders nothing. A desktop record's main actions live in its
 * record header - one primary, the rest in the three-dot menu (11.2 zone
 * 2) - and a desktop form's in its footer bar, Cancel beside Save (11.3
 * rule 7). Neither is a bar fixed to the bottom of the screen, and the
 * phone's has no Cancel (the back arrow is Cancel, 41.7 rule 3), so one
 * component drawing both would have to guess which buttons to drop. A
 * page writes its desktop actions where they belong and its ActionBar at
 * the end, and each shows in its own layout. The limit is still checked
 * on desktop, so a third button fails there too, not only on a phone.
 */
function ActionBar({
  children,
  label = "Actions",
  className,
}: {
  /** At most two buttons: the secondary first, the primary last. */
  children?: React.ReactNode
  /** Names the bar for screen readers. */
  label?: string
  /** For the row of buttons. */
  className?: string
}) {
  const count = checkActionBarButtons(children, WHERE_THE_REST_GO)
  const { layout } = useLayout()
  if (layout !== "phone" || count === 0) return null
  return (
    <ActionBarFrame
      fixed
      slot="action-bar"
      label={label}
      whereTheRestGo={WHERE_THE_REST_GO}
      className={className}
    >
      {children}
    </ActionBarFrame>
  )
}

const WHERE_THE_REST_GO = "Put the rest in the three-dot menu in the app bar (41.6 rule 1)."

export { ActionBar, MAX_ACTION_BAR_BUTTONS }
