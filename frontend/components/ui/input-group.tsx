"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/**
 * Section 6.5: the group owns the border, the radius, the height AND
 * every state. The control inside is a child with its radius removed,
 * so any state it painted would show as a sharp rectangle inside the
 * rounded border - which is exactly what its own focus ring did before.
 *
 * It is a text-entry control (6.4): hover moves the border only, focus
 * is the primary-ring outline on the GROUP, invalid turns the border
 * danger. The ring arrives through `has-[:focus-visible]`, so the transition names
 * border-color rather than using `transition-colors`, which would
 * animate outline-color and leave the ring black (6.4).
 */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex h-control w-full min-w-0 items-center rounded-lg border border-border bg-surface outline-none",
        "transition-[border-color] duration-(--duration-fast)",
        "not-has-disabled:hover:border-border-strong",
        "has-disabled:border-border-light has-disabled:bg-surface-sunken",
        "has-[[data-slot=input-group-control]:focus-visible]:border-primary-ring has-[[data-slot=input-group-control]:focus-visible]:outline-2 has-[[data-slot=input-group-control]:focus-visible]:[outline-style:solid] has-[[data-slot=input-group-control]:focus-visible]:outline-offset-0 has-[[data-slot=input-group-control]:focus-visible]:outline-primary-ring",
        "has-[[data-slot][aria-invalid=true]]:border-danger has-[[data-slot][aria-invalid=true]:focus-visible]:outline-danger",
        "in-data-[slot=combobox-content]:focus-within:border-inherit",
        "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>textarea]:h-auto has-[>[data-align=block-end]]:[&>input]:pt-3 has-[>[data-align=block-start]]:[&>input]:pb-3 has-[>[data-align=inline-end]]:[&>input]:pr-1.5 has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        className
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 py-1.5 text-sm font-medium text-text-secondary select-none group-data-[disabled=true]/input-group:text-text-muted [&>kbd]:rounded-lg [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start":
          "order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
        "inline-end":
          "order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        "block-end":
          "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
)

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva(
  "flex items-center gap-2 text-sm",
  {
    variants: {
      size: {
        xs: "h-control-sm gap-1 rounded-lg px-3 [&>svg:not([class*='size-'])]:size-4",
        sm: "",
        "icon-xs":
          "size-control-sm rounded-lg p-0 has-[>svg]:p-0",
        "icon-sm": "size-control p-0 has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
)

function InputGroupButton({
  className,
  type = "button",
  variant = "in-field",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset"
  }) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-text-secondary [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        /*
         * Section 6.5. `InputGroup` owns the border, the radius and the
         * height, and this control sits inside it.
         *
         * `h-full`, NOT the `h-control` that `Input` carries on its
         * own. The group's `h-control` is a border-box measurement and
         * already includes its 1px border, so it leaves 34px of content
         * box. An inner element given the same 36px is two pixels
         * taller than the space it has, overflows, and paints across
         * the border on both edges.
         *
         * `focus-visible:outline-0`: the ring is the group's (6.5).
         * Input's own ring would paint a sharp rectangle inside the
         * rounded border.
         */
        "h-full flex-1 rounded-none border-0 bg-transparent focus-visible:outline-0 disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-2 focus-visible:outline-0 disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
