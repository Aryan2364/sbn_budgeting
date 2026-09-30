import * as React from "react"

import { cn } from "@/lib/utils"
import { BandScope, HeaderBand } from "@/components/ui/header-band"

/**
 * Section 36.10 - what this card IS.
 *
 * `panel` holds a section of a screen and its header LABELS what is
 * inside it, so the header is a brand band.
 *
 * `record` IS one record, rendered as a card - section 11.6 card view,
 * and a board card. Its title does not label the content beneath it;
 * the title, the reference and the amount are sibling attributes of
 * one thing. It takes NO band.
 *
 * Default `panel`, deliberately. Forgetting to mark a record card
 * gives a grid of brand bars, which is loud and gets fixed on sight;
 * forgetting to mark a panel gives a plain header, which is quiet and
 * survives review. Where a mistake is inevitable, make it the loud
 * one.
 */
const CardVariantContext = React.createContext<"panel" | "record">("panel")

/**
 * Sections 5.3, 5.4 and 11.6.
 * 12px radius, a 1px border-light edge and --shadow-card. The header
 * carries the card heading and, optionally, one action on the right; the
 * footer sits on surface-sunken so it reads as chrome rather than
 * content.
 *
 * Cards in a grid must all be the same height, which is what
 * CardDescription's two-line clamp is for (section 8).
 *
 * A RECORD card becomes clickable by holding a `CardLink` (section
 * 11.6: the whole card, not only the title). The card then carries the
 * states itself - hover fill and the rise to --shadow-menu, which is
 * the one shadow in the system that changes on hover (5.4 rule 3) -
 * and the focus ring, through `:has()`, because a keyboard user needs
 * to see which CARD is focused. That ring arrives through `:has()`, so
 * the transition names its properties rather than using
 * `transition-colors`, which would animate outline-color and leave the
 * ring black (section 6.4).
 */
function Card({
  className,
  variant = "panel",
  ...props
}: React.ComponentProps<"div"> & { variant?: "panel" | "record" }) {
  const card = (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-xl border border-border-light bg-surface text-body text-text-primary shadow-card",
        "data-[variant=record]:has-[[data-slot=card-link]]:relative",
        "data-[variant=record]:has-[[data-slot=card-link]]:transition-[background-color,box-shadow] data-[variant=record]:has-[[data-slot=card-link]]:duration-(--duration-fast)",
        "data-[variant=record]:has-[[data-slot=card-link]]:hover:bg-surface-control data-[variant=record]:has-[[data-slot=card-link]]:hover:shadow-menu",
        "data-[variant=record]:has-[[data-slot=card-link]]:active:bg-surface-control-pressed",
        "has-[[data-slot=card-link]:focus-visible]:outline-2 has-[[data-slot=card-link]:focus-visible]:[outline-style:solid] has-[[data-slot=card-link]:focus-visible]:outline-offset-2 has-[[data-slot=card-link]:focus-visible]:outline-primary-ring",
        className
      )}
      {...props}
    />
  )

  return (
    <CardVariantContext.Provider value={variant}>
      {/*
        Section 36.4: a PANEL is a banded region, so a table or a card
        inside it reads level 2 and takes the accent form rather than
        stacking a second solid band under this one.

        A RECORD card opens no scope, because it renders no band. A
        table inside one is the outermost band there and takes the
        solid fill - which is correct: there is nothing above it to
        collide with.
      */}
      {variant === "panel" ? <BandScope>{card}</BandScope> : card}
    </CardVariantContext.Provider>
  )
}

/**
 * Section 36: the card header is a brand band.
 *
 * Section 36.3: the band is ONE ROW, and description text sits below
 * it on the surface, where a description is content rather than
 * chrome. A band holding a two-line description would be ~72px of
 * solid brand and a different height on every card - which section
 * 11.6 cannot have, because cards in a grid must all be level.
 *
 * THE SPLIT HAPPENS HERE, not at the call site, for the reason
 * section 24 records about the dialog body: a structural requirement
 * the caller has to remember is one the caller forgets, and three of
 * four dialogs in the first product proved it. `CardDescription` must
 * be a DIRECT child of `CardHeader` for this to find it.
 */
function CardHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const variant = React.useContext(CardVariantContext)
  const items = React.Children.toArray(children)
  const isDescription = (child: React.ReactNode) =>
    React.isValidElement(child) && child.type === CardDescription

  const description = items.filter(isDescription)
  const titleRow = items.filter((child) => !isDescription(child))

  /*
   * Section 36.10: a record card takes no band. The title row keeps
   * the band's geometry - one row at `min-h-band`, the same height as
   * every other header in the kit - so a grid of record cards lines up
   * with a grid of panels beside it. Only the fill and the text colour
   * differ, which is the whole of the decision.
   */
  const record = variant === "record"

  return (
    <div
      data-slot="card-header"
      data-variant={variant}
      className={cn("flex flex-col", className)}
      {...props}
    >
      {record ? (
        <div
          data-slot="card-title-row"
          className="flex min-h-band shrink-0 items-center justify-between gap-3 px-4 py-2"
        >
          {titleRow}
        </div>
      ) : (
        <HeaderBand>{titleRow}</HeaderBand>
      )}
      {description.length > 0 ? (
        <div
          data-slot="card-header-description"
          className={cn(
            "px-4",
            // A panel's description is chrome under a band and carries
            // the rule that closes it. A record's is the first of its
            // supporting facts (11.6), so it just sits above the rest.
            record ? "pb-2" : "border-b border-border-light py-3"
          )}
        >
          {description}
        </div>
      ) : null}
    </div>
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      /*
       * No colour of its own ON A PANEL: it inherits `on-brand` from
       * the band, or `primary` in the accent form (36.4). On a RECORD
       * card there is no band, so the group-data selector puts it back
       * to text-primary - the record's name is the primary identifier
       * and reads as content, not as chrome.
       */
      className={cn(
        "text-card-heading font-medium",
        "group-data-[variant=record]/card:text-text-primary",
        className
      )}
      {...props}
    />
  )
}

/**
 * Section 11.6: makes a RECORD card clickable as a whole. Put it inside
 * CardTitle around the record's name.
 *
 * An `a` when there is somewhere to go (the usual case: 11.1.2 wants a
 * real address, so Enter and "open in new tab" work), a `button` when
 * the card only calls back. Its stretched ::after covers the card, so a
 * click anywhere opens the record. Anything else in the card that must
 * stay clickable in its own right (a CardAction menu) sits above it by
 * coming later in the markup and being positioned; CardAction already
 * is. Its own outline is removed because the card carries the ring.
 */
function CardLink({
  className,
  href,
  ...props
}: React.ComponentProps<"a"> & React.ComponentProps<"button">) {
  const classes = cn(
    "cursor-pointer text-left text-inherit outline-none after:absolute after:inset-0",
    className
  )

  if (href !== undefined) {
    return (
      <a
        data-slot="card-link"
        href={href}
        className={classes}
        {...(props as React.ComponentProps<"a">)}
      />
    )
  }

  return (
    <button
      type="button"
      data-slot="card-link"
      className={classes}
      {...(props as React.ComponentProps<"button">)}
    />
  )
}

/** Section 8: clamped to two lines so a grid of cards stays level. */
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("line-clamp-2 text-label text-text-secondary", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      // `relative`: paints above a CardLink's stretched hit area, which
      // comes earlier in the markup, so the action stays its own target.
      className={cn("relative flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("p-4", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border-light bg-surface-sunken px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardLink,
  CardAction,
  CardDescription,
  CardContent,
}
