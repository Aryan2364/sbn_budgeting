"use client"

import * as React from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Section 32. A password field with a visibility toggle.
 *
 * **Every password field is this component.** A bare
 * `<Input type="password" />` is a bug: somebody typing a secret they
 * cannot see, into a field that rejects it without saying why, has no
 * way to tell a typo from a wrong password.
 *
 * The toggle is an icon-only button sitting INSIDE the field, so it
 * takes the `in-field` variant of section 6.3.1 rather than `ghost`:
 * no fill and no border of its own, because the field around it is
 * already the visible container. All four states plus focus come from
 * that variant rather than being restated here. It carries a hidden
 * text label for screen readers and a tooltip on hover.
 *
 * **It defaults to hidden on every mount and never remembers being
 * shown.** The state lives in this component and nowhere else — not
 * lifted to a parent that outlives the screen, not in storage, not in a
 * URL. Somebody who reveals a password, navigates away and comes back
 * must find it hidden again, because the reason to hide it in the first
 * place is that other people can see the screen, and that does not
 * expire because somebody revealed it once.
 *
 * The in-field button is 32x32 (`icon-sm`) rather than section 6.3's
 * 36x36, which is the same exception `date-picker` and `time-picker`
 * already take: a 36px button cannot sit inside a 36px field.
 *
 * What it deliberately does NOT do, so the next person does not add
 * them by reflex: no strength meter, no confirm-password field. See
 * section 32.
 */
function PasswordInput({
  className,
  disabled,
  showLabel = "Show password",
  hideLabel = "Hide password",
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  /** Overridden only where "password" is the wrong word for the secret. */
  showLabel?: string
  hideLabel?: string
}) {
  /**
   * Deliberately plain component state, initialised to false.
   *
   * Do not lift this, memoise it across mounts, or persist it. The
   * reset on unmount IS the feature.
   */
  const [shown, setShown] = React.useState(false)

  const label = shown ? hideLabel : showLabel

  return (
    <div
      data-slot="password-input"
      className={cn(
        "relative flex w-full max-w-field-max items-center",
        className
      )}
    >
      <Input
        {...props}
        type={shown ? "text" : "password"}
        disabled={disabled}
        // Section 23: leaves room for the 32px button plus its inset.
        className="pr-11"
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="in-field"
              size="icon-sm"
              disabled={disabled}
              aria-label={label}
              aria-pressed={shown}
              // A credential autofill tool should fill the field, not
              // the toggle, and the toggle is not part of the form's
              // data.
              tabIndex={0}
              onClick={() => setShown((current) => !current)}
              className="absolute right-1"
            />
          }
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { PasswordInput }
