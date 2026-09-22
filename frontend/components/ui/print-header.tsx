import { formatDateTime } from "@/lib/format"

/**
 * The print-only line that makes a printed sheet identify itself: the
 * report name and the date printed, per section 18's one date format
 * everywhere (`formatDateTime`).
 *
 * Kept separate from `ExportPdfButton` on purpose. That button usually
 * lives inside a toolbar the print stylesheet hides
 * (`[data-slot="list-toolbar"]` gets `display:none` in
 * `app/globals.css`), and a `.print-only` descendant cannot override a
 * `display:none` ancestor. `PrintHeader` has to be placed by the
 * calling screen somewhere that is NOT inside hidden chrome — the page
 * header, a card header, or the data area itself all qualify.
 *
 * `.print-only` is the shared utility from `app/globals.css`: hidden on
 * screen, shown only inside `@media print`. `mb-4` is section 5.1's
 * space-4 (16px) — the standard gap between distinct blocks, the same
 * value `mt-4` already uses elsewhere in these templates.
 */
export function PrintHeader({ title }: { title: string }) {
  return (
    <p className="print-only mb-4 text-body text-text-primary">
      {title} — Printed {formatDateTime(new Date())}
    </p>
  )
}
