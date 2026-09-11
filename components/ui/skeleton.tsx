import { cn } from "@/lib/utils"

/**
 * Section 14: grey placeholder blocks in the shape of the content that
 * is coming, never a spinning wheel. The layout arrives first, so the
 * page does not jump when the data lands.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"span">) {
  return (
    // A block-level <span>, not a <div>: a skeleton stands in for text
    // that has not arrived, so it has to be legal wherever that text
    // was going to sit - inside a heading, a paragraph or a label. A
    // <div> in any of those is invalid nesting and breaks hydration.
    <span
      data-slot="skeleton"
      className={cn(
        "block animate-pulse rounded-lg bg-surface-control",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
