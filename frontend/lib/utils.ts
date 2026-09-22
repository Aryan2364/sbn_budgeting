import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge has to be told about the project's own token names.
 *
 * Its default rules treat any unrecognised `text-*` class as a text
 * colour. Our type scale is also in the `text-*` namespace, so without
 * this extension `cn("text-label", "text-text-secondary")` classified
 * both as colours, kept only the last, and silently dropped the font
 * size - every label rendered at the inherited 14px instead of 13px,
 * with no error anywhere.
 *
 * Anything added to the type scale in globals.css must be added here
 * too, or it will be dropped the same way.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "page-title",
            "section",
            "card-heading",
            "body",
            "label",
            "meta",
          ],
        },
      ],
      "text-color": [
        {
          text: ["text-primary", "text-secondary", "text-muted"],
        },
      ],
    },
    /**
     * Section 6.5: an inner element of a composite control has to be
     * able to override the wrapper-sized `h-control` it inherits (e.g.
     * `InputGroupInput` overriding `Input`'s height with `h-full`) and
     * have tailwind-merge actually drop the loser. Without this,
     * `h-control` and `h-full` are unrelated custom classes to
     * tailwind-merge and both end up in the class list, so which one
     * wins depends on generated CSS order rather than which was passed
     * last. Registering the control tokens on the `spacing` scale puts
     * `h-control`/`w-control`/`size-control` (and their `-sm`/`-lg`
     * variants) in the same group as `h-full`, `h-auto`, etc., so the
     * last one passed to `cn()` wins, same as every other utility here.
     */
    theme: {
      spacing: ["control", "control-sm", "control-lg"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
