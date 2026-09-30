"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

/**
 * Section 33.3: three signals move together on the active tab - the
 * 2px primary accent (5.3), primary-text text, and medium weight.
 *
 * There is deliberately one tab appearance, not two. Sibling tabs are
 * styled and behave identically; if one gets a count badge, they all do.
 *
 * Section 5.6: a tab switch does not animate. The accent appears in one
 * step; only the hover colour eases, at the fast duration.
 */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("group/tabs flex flex-col", className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex w-full items-center gap-6 border-b border-border-light",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-control cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
        "text-body text-text-secondary transition-[color] duration-(--duration-fast) ease-enter hover:text-text-primary",
        "outline-none focus-visible:outline-2 focus-visible:[outline-style:solid] focus-visible:outline-offset-2 focus-visible:outline-primary-ring",
        "data-disabled:pointer-events-none data-disabled:text-text-muted",
        "data-active:font-medium data-active:text-primary-text data-active:hover:text-primary-text",
        // The 2px accent, section 5.3. No transition (5.6).
        "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:opacity-0",
        "data-active:after:opacity-100",
        // Tap area, 9 rule 4. The `tap-area` utility owns ::after, and
        // ::after is the accent here, so the same invisible extension
        // is drawn with ::before instead: centred, the tab's own size
        // with a 44px floor, touch screens only.
        "pointer-coarse:before:absolute pointer-coarse:before:top-1/2 pointer-coarse:before:left-1/2 pointer-coarse:before:size-full",
        "pointer-coarse:before:min-h-(--tap-target) pointer-coarse:before:min-w-(--tap-target) pointer-coarse:before:-translate-1/2",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 pt-6 text-body outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
