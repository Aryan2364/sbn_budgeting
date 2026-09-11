import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Section 11.2. In order, top to bottom:
 *
 *   1. Breadcrumb    - the FIRST element on the page. It reflects the
 *                      structure of the software, not the user's
 *                      history, and it is capped at three levels. There
 *                      is no back arrow anywhere (section 1 rule 11):
 *                      a back button does something different
 *                      depending on how the user arrived, which is
 *                      what makes people feel lost.
 *   2. Record header - the record name as the page title, status
 *                      badges BESIDE it, meta line underneath, one
 *                      primary action and a three-dot menu on the
 *                      right. That is `PageHeader` from page.tsx.
 *   3. Content       - two columns: main at two-thirds, summary
 *                      sidebar at one-third, dropping below the main
 *                      content on tablet.
 *   4. Related       - tabs at the bottom for child records.
 *
 * The page owns the scroll (section 10). The cards inside it do not.
 */
function DetailColumns({
  main,
  aside,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  main: React.ReactNode
  /** The summary sidebar. Drops below the main content below 1024px. */
  aside: React.ReactNode
}) {
  return (
    <div
      data-slot="detail-columns"
      className={cn("grid grid-cols-1 gap-6 lg:grid-cols-3", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">{main}</div>
      <div className="flex min-w-0 flex-col gap-6">{aside}</div>
    </div>
  )
}

/**
 * A label and its value, the pattern the summary sidebar is made of.
 * Section 3 rule 5: the value carries body-strong weight, the label
 * stays text-secondary. Section 8: values wrap on a detail page rather
 * than truncating - there is room, and the whole point of the page is
 * to read the record.
 */
function DetailField({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & { label: React.ReactNode }) {
  return (
    <div data-slot="detail-field" className={cn("min-w-0", className)} {...props}>
      <dt className="text-label text-text-secondary">{label}</dt>
      <dd className="mt-1 text-body font-medium break-words text-text-primary">
        {children}
      </dd>
    </div>
  )
}

function DetailFieldList({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      data-slot="detail-field-list"
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}
      {...props}
    />
  )
}

export { DetailColumns, DetailField, DetailFieldList }
