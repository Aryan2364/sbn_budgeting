import * as React from "react"
import Link from "next/link"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

/**
 * Section 11.2's breadcrumb, in one place.
 *
 * It reflects the structure of the software, not the user's history,
 * and it is capped at three levels — a fourth means the structure is
 * wrong, so the type only allows two ancestors plus the current page.
 *
 * There are no back arrows anywhere (section 1 rule 11). This is what
 * replaces them.
 */
export function RecordBreadcrumb({
  trail,
  current,
}: {
  trail: [] | [{ label: string; href: string }] | [
    { label: string; href: string },
    { label: string; href: string },
  ]
  current: React.ReactNode
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((step) => (
          <React.Fragment key={step.href}>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={step.href} />}>
                {step.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </React.Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
