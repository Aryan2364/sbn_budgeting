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
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
