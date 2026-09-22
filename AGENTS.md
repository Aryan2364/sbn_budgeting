<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


**Product:** Sadbhavna tracking tool
**Brand colour:** #174443

# Design and Build Rules

## 0. How to use this file

Read this file completely before writing any code in this project.

These rules are not suggestions. If a rule prevents you from doing
something, stop and ask rather than working around it.

If something is not covered here, ask before inventing an answer.
Do not fill gaps with your own judgement.

---

## 1. Hard prohibitions

These are absolute. Breaking any of them is a bug, not a style choice.

1. Never write a hex colour code, an rgb() value, or a named colour
   anywhere except `globals.css`. Everywhere else, use theme tokens only.
2. Never use inline styles for colour, spacing, or typography.
3. Never create a new component file if an existing component in
   `components/ui` can do the job.
4. Never build the same thing twice. If an element appears on more than
   one screen, it exists once in code and is imported.
5. Never rely on browser or operating system defaults for hover, focus,
   tooltips, scrollbars, or dialogs. Every one of these is styled.
6. Never let text overflow its container.
7. Never render an unbounded list. Everything is paginated.
8. Never nest a scrollable area inside another scrollable area **that
   scrolls the same axis**. The prohibition is about a collision: two
   same-axis scrollers trap the pointer in the inner one and the page
   underneath stops responding, so the user loses the page without
   understanding why. A vertical outer with a horizontal inner has no
   such collision — the two never compete for the same gesture — and
   is permitted. Section 31.4's data entry grid is exactly that shape
   and is correct.
9. Never use a spacing value outside the spacing scale in section 5.
10. Never install a new package without asking first.
11. Never place a back arrow button on a page. Use breadcrumbs.
12. Never use placeholder text as a substitute for a field label.

---

## 2. Colour

### 2.1 The swap requirement

This is a hard requirement of the whole system. Changing the brand colour
must be a change in one place only. Every screen must follow automatically.
Different products built from this system will use different brand colours.
Nothing outside `globals.css` may know what the brand colour actually is.

### 2.2 Brand colour, current product

Primary brand colour is bottle green, `#174443`.

Five shades are derived from it:

| Token             | Value     | Used for                                      |
|-------------------|-----------|-----------------------------------------------|
| primary           | `#174443` | Resting state of main buttons, active tabs    |
| primary-hover     | `#1E5A58` | Mouse over. Note: lighter, not darker         |
| primary-pressed   | `#0F3231` | The instant of click                          |
| primary-ring      | `#2A6F6C` | Keyboard focus outline                        |
| primary-subtle    | `#E8F2F1` | Selected rows, highlighted panels             |
| primary-border    | `#C6DEDC` | Borders on primary-subtle surfaces            |
| primary-foreground| `#FFFFFF` | Text and icons on primary                     |

Because this brand colour is dark, the hover state goes **lighter** and the
pressed state goes **darker**. When the brand colour is changed to a light
colour, this reverses: hover darkens, pressed darkens further.

White text on `#174443` measures about 10.8 to 1 contrast. Any replacement
brand colour must measure at least 4.5 to 1 against its foreground.

**All seven are edited together.** They are explicit values, not
derivations of `primary`. A formula cannot flip the hover direction
between a dark and a light brand, and would not land on these hexes in
any case. Section 2.1 asks for the change to happen in one *place* —
the brand block in `globals.css` — not on one line.

This is also what the brand swap test checks. Change `--primary` to an
obviously wrong colour, load `/kitchen-sink`, and sweep every element's
background, text, border and outline. **The test passes when nothing
other than the five derived shades — `primary-hover`, `primary-pressed`,
`primary-ring`, `primary-subtle`, `primary-border` — is left holding the
old colour.** Those five staying behind is correct. Anything else
holding it is a component reaching around the tokens.

**`/kitchen-sink` is local-only and is not in the repository.**
`frontend/app/kitchen-sink/` is listed in `frontend/.gitignore` and
`frontend/.dockerignore`, so it is absent from the CI checkout, from the
built image and from the server — the URL is a 404 on a deployed site,
and that is correct rather than a fault to fix. A gallery of every
control in the product is a development tool; it was never meant to be
served from the live domain.

**A fresh clone therefore has no kitchen-sink and cannot run the brand
swap test until someone supplies the page.** That is the cost of keeping
it off the server this way, and it is deliberate. If the test needs to
be runnable from a clean checkout, the folder has to come back into the
repo and be excluded at build time instead.

### 2.3 Neutral greys

| Token           | Value     | Contrast on white | Used for                    |
|-----------------|-----------|-------------------|-----------------------------|
| text-primary    | `#171717` | about 17.9 to 1   | Body text, headings         |
| text-secondary  | `#525252` | about 7.8 to 1    | Labels, supporting text     |
| text-muted      | `#737373` | about 4.7 to 1    | Timestamps, counts, helpers |
| border          | `#D4D4D4` | —                 | Standard borders            |
| border-light    | `#E5E5E5` | —                 | Dividers, disabled borders  |
| surface         | `#FFFFFF` | —                 | Cards, inputs, dialogs      |
| surface-sunken  | `#FAFAFA` | —                 | Page background, toolbars   |
| surface-control | `#F5F5F5` | —                 | Secondary button fills      |

`text-muted` must never be set lighter than `#737373`. Lighter greys fail
the contrast minimum and are the most common accessibility failure.

Because `text-muted` sits close to the minimum, it is only for information
the user can afford to miss. Never use it for a price, a status, or an
instruction.

### 2.4 Status colours

| Meaning | Text      | Background | Used for                              |
|---------|-----------|------------|---------------------------------------|
| success | `#166534` | `#DCFCE7`  | Paid, Approved, Active, Completed     |
| warning | `#92400E` | `#FEF3C7`  | Pending, Due soon, Needs review       |
| danger  | `#991B1B` | `#FEE2E2`  | Overdue, Failed, Rejected, Delete     |

**Status colours never change when the brand colour changes.** An
orange-branded product still uses green for success and red for error.
These colours carry meaning, not brand.

There is deliberately no blue "information" colour. Neutral grey is used
for informational content instead.

---

## 3. Typography

Font family: Geist. Confirm it is actually loading. A serif fallback means
it has failed.

| Slot            | Size | Weight | Line height | Colour            |
|-----------------|------|--------|-------------|-------------------|
| Page title      | 30px | 500    | 1.25        | text-primary      |
| Section heading | 20px | 500    | 1.3         | text-primary      |
| Card heading    | 16px | 500    | 1.4         | text-primary      |
| Body            | 14px | 400    | 1.6         | text-primary      |
| Body strong     | 14px | 500    | 1.6         | text-primary      |
| Label           | 13px | 400    | 1.5         | text-secondary    |
| Meta            | 12px | 400    | 1.5         | text-muted        |

Rules:

1. Only two weights exist: 400 and 500. Never 600 or 700. If a heading is
   not standing out enough, add space around it, do not add weight.
2. Labels are always `text-secondary`. A label in `text-primary` reads as
   body text and the hierarchy collapses. This is a bug.
3. One page title per screen. Only one.
4. Hierarchy comes from size, weight and colour moving together, never
   from size alone.
5. Body strong is for the active navigation item, emphasis inside a
   sentence, table total rows, and values in label-value pairs.

**Compact mode is reserved but not built.** Write all type sizes and
spacing as tokens so a compact variant can be added later by changing
token values only, without touching any screen.

Note: these are screen sizes. Client documents produced in Word or PDF
follow a separate rule (headings 14, running text 12) and are unaffected.

---

## 4. Reuse discipline

This section prevents the most expensive category of inconsistency.

1. **Add and Edit are the same form component.** One file. Same fields,
   same order, same labels, same validation. Only the title text and the
   submit button label differ. Never build them separately.
2. Any element appearing on more than one screen is defined once and
   imported. Buttons, cards, empty states, headers, filters.
3. Before creating anything, search the project for an existing component
   that does the job. Extend it rather than duplicating it.
4. If two screens need slightly different versions of the same thing, add
   a variant to the existing component. Do not create a second component.

### 4.1 Component inventory

**Search this table before building anything.** Rule 3 above says to
look for an existing component first; this is the list to look in. A
component missing from it gets built twice, which is the failure this
whole section exists to prevent.

**Add a row in the same commit that adds a component.** A table that is
behind is worse than no table, because it is believed.

#### Fields and controls — `components/ui`

| Need | Component | Notes |
|---|---|---|
| Text, email, number, phone entry | `input` | Height fixed 36px. Width from section 17 |
| **A password** | **`password-input`** | **Always. Never a bare `input type=password`** (section 32) |
| Long free text | `textarea` | |
| A field label | `label` | Carries the required asterisk |
| A field error | `inline-field-error` | Section 7.1. Never a toast |
| A prefix, suffix or in-field button | `input-group` | The ₹ addon, a search icon |
| Up to 6 options | `select` | Warns in dev past 6 options |
| More than 6 options | `searchable-select` | Search box fixed above the list |
| A date | `date-picker` | Typeable as well as pickable |
| A time | `time-picker` | 15-minute steps |
| A calendar surface | `calendar` | Inside `date-picker`; rarely used alone |
| One of several | `radio-group` | |
| A tick box | `checkbox` | The only user of `--radius-tick` |
| On or off | `switch` | |
| Any button | `button` | Four variants, three sizes. Nothing else |

#### Structure and feedback — `components/ui`

| Need | Component | Notes |
|---|---|---|
| A card | `card` | Header, content, footer, action |
| A table | `table` | `numeric` prop right-aligns |
| A chart | `bar-chart` | `CategoryBarChart`. Section 21 lives in it, not in the caller |
| Page controls | `pagination` | 25 rows a page |
| A status badge | `badge` | Status is never plain coloured text |
| A persistent message | `banner` | Section 7.1 |
| A transient confirmation | `sonner` | `toast.success(...)` |
| A destructive confirmation | `alert-dialog` | Section 15 |
| A dialog | `dialog` | Three widths only |
| A side panel | `sheet` | The sub-1024 nav overlay |
| A menu | `dropdown-menu` | `GroupLabel` needs a `Group` around it |
| A popover | `popover` | |
| A tooltip | `tooltip` | 400ms delay |
| Where the user is | `breadcrumb` | No back buttons anywhere |
| Switching views of one record | `tabs` | |
| Switching views of one section | `section-tabs` | Section 33. The list page's fifth zone |
| A person | `avatar` | |
| A divider | `separator` | |
| Loading | `skeleton` | Renders a block `<span>` |
| Nothing to show | `empty-state` | Three variants, and the variant matters |
| Text that must not overflow | `truncate` | `Truncate` and `Clamp` |
| A command list | `command` | Inside `searchable-select` |

#### Page shapes — `components/templates`

| Need | Component |
|---|---|
| The five page frames and the page header | `page` |
| A list page with data | `record-list` |
| List-page zones on their own | `list-page` |
| A detail page's columns and fields | `detail-page` |
| A form's frame, sections, fields and footer | `form-page` |
| A dashboard's tiles and panels | `dashboard-page` |
| A settings page's menu and layout | `settings-page` |

#### Product pieces — `components/forms`

| Need | Component |
|---|---|
| Add **and** Edit a project / site / expense | `project-form`, `site-form`, `expense-form` |
| Per-tree budget entry | `budget-grid` |
| A Settings master list | `master-section` |
| A delete confirmation | `delete-record-dialog` |
| A save that failed | `form-error` |
| A record breadcrumb | `record-breadcrumb` |
| A budget / actual / variance figure | `variance-figures` | The zero-budget ruling, written once |
| Cost head × period, at any scope | `head-period-grid` | Report 2 **and** the site Variance tab. One component |
| Period-wise budget vs variance | `period-summary-table` | Report 1 |
| A report's project / site scope | `report-scope` | `useReportScope` + the toolbar controls |
| A form whose options failed to load | `form-error` | `FormLoadFailed`, beside `FormError` |

#### The shell — `components/shell`

| Need | Component |
|---|---|
| The frame every page sits in | `app-shell` |
| The navigation list | `nav`, `sidebar` |
| The top bar | `top-bar` |
| Who is signed in | `session` |
| The sidebar's open/collapsed choice | `use-sidebar`, `sidebar-storage` |

---

## 5. Spacing, radius and borders

### 5.1 Spacing scale

Only these values may be used. There is no space-5, space-7 or space-9.

| Token     | Value | Used for                                        |
|-----------|-------|-------------------------------------------------|
| space-1   | 4px   | Icon to its label                               |
| space-2   | 8px   | Tightly related items, chip padding             |
| space-3   | 12px  | Inside small components                         |
| space-4   | 16px  | Card padding, standard gap                      |
| space-6   | 24px  | Between distinct blocks inside a section        |
| space-8   | 32px  | Between sections on a page                      |
| space-12  | 48px  | Above a major section heading, page top margin  |

If 16 feels too small and 24 too big, the answer is one of those two.
Never 20.

### 5.2 Grouping

1. **Space belongs above an element, not below.** A heading pushes down
   from what came before it. This keeps a heading attached to its own
   content instead of floating between two blocks.
2. **Related items sit closer than unrelated items.** A form label sits
   6px above its input, but 20px below the previous field. That difference
   is what tells the eye which label belongs to which box.

### 5.3 Radius and borders

- Radius 8px: buttons, inputs, badges, small controls
- Radius 12px: cards, dialogs, panels
- Radius 4px: tick boxes only. A 16px square at 8px radius reads as a
  radio button. The two values above were written for buttons, inputs
  and cards; a 16px control is smaller than anything they anticipated.
  The token is `--radius-tick` and it is used nowhere else.
- No other radius values
- Borders are 1px. The only exception is a 2px accent on an active tab.

---

## 6. Buttons

### 6.1 Hierarchy

| Level     | Appearance                              | Used for                    |
|-----------|-----------------------------------------|-----------------------------|
| primary   | Filled with primary, white text         | The one main action         |
| secondary | White fill, 1px border, dark text       | All other actions           |
| ghost     | Quiet, only inside toolbars             | See restriction below       |
| danger    | Filled with danger, white text          | Delete and irreversible acts|

Rules:

1. Exactly one primary button per screen or per dialog.
2. Everything else is secondary.
3. Ghost is allowed only for icon-only buttons inside a toolbar, and only
   when it has a visible border or fill.
4. **A button never has a transparent background and no border at the
   same time.** If the user cannot see it is a button, it is broken.

### 6.2 Fixed sizing

Height is fixed. Width grows with the label. Height never does.

- Default button: exactly 36px tall
- Small: 32px. Large: 40px. No other heights.
- Icon-only button: exactly 36 by 36px

This means two buttons with different label lengths on different pages are
always the same height.

### 6.3 Icon buttons

Every icon-only button has a filled background, a 1px border, and is
36 by 36px.

| State    | Fill      | Border    | Icon      |
|----------|-----------|-----------|-----------|
| resting  | `#F5F5F5` | `#D4D4D4` | `#171717` |
| hover    | `#E5E5E5` | `#A3A3A3` | `#171717` |
| pressed  | `#D4D4D4` | `#A3A3A3` | `#171717` |
| disabled | `#FAFAFA` | `#E5E5E5` | `#A3A3A3` |

Use the primary fill only for the single main action in a toolbar. Use the
danger fill only for delete.

Every icon-only button must carry a hidden text label for screen readers
and show a tooltip on hover. An icon alone is a guess.

**One exception: the close button in a dialog corner.** An X in the top
right of a dialog is the single icon in this product with no ambiguity
— there is nothing else it could mean and nowhere else it could take
you. Section 19 forbids a tooltip that carries information available
nowhere else, and here the information is available from the shape
itself, from Escape, and from clicking the backdrop. **The hidden text
label stays**, because a screen reader has none of those cues.

### 6.3.1 The exception: an icon button INSIDE a field

**An icon button rendered inside an input, a select, or any other
bordered field takes no fill and no border of its own.** The calendar
trigger on `date-picker`, the clock on `time-picker`, the eye toggle on
`password-input`, a clear button inside a search box: all of them, and
anything added later that sits inside a field.

**The reason is that the field is already the visible container.** A
bordered button inside a bordered input draws a box inside a box, and
the two borders sit two or three pixels apart — which reads as a
rendering fault rather than as a control.

**This does not weaken §6.1 rule 4.** That rule governs a control that
has to read as a button *on its own*, against a page background, where
a transparent shape with no border genuinely is invisible. An icon
inside a field is never on its own: the field around it is what says
"this is somewhere you interact". §6.3's filled-and-bordered treatment
is for **standalone** icon buttons — toolbars, page headers, table
rows.

**This is the same shape as the calendar day cell**, and that is the
precedent to reason from rather than treating this as a second special
case. In Phase 1 the day cells in `calendar` borrowed `Button`'s
`ghost` variant, inherited its fill and border for the same §6.1 rule 4
reason, and turned every day of the month into a grey box. The lesson
recorded then was that `ghost` is right for a button and wrong for
something nested inside another container. A field is another
container. **When a control lives inside something that already has a
border, it does not bring its own.**

**All four states still exist, plus focus (§6.4). They move to the
background rather than the border:**

| State | Treatment |
|---|---|
| resting | no fill, no border, icon in `text-secondary` |
| hover | subtle `surface-control` tint behind the icon, icon to `text-primary` |
| pressed | `surface-control-pressed` tint |
| disabled | icon to `text-muted`, no fill, pointer cursor removed |
| focus | **the `primary-ring` outline, fully visible, inset so the field does not clip it** |

**The focus ring is not optional here and not decorative.** Every other
state has a pointer behind it. A keyboard user has no pointer, so the
ring is the *only* signal that the icon inside the field is what Enter
will activate — and a field that swallows it leaves them unable to tell
whether focus is in the text or on the button.

The `in-field` variant on `button` carries all of this. Use it; do not
hand-roll the states, and do not reach for `ghost` inside a field.

### 6.4 States

Every interactive element defines four states: resting, hover, pressed,
disabled. Disabled reduces contrast and removes the pointer cursor.

**"Pressed" belongs to controls that are pressed** — a button, a menu
trigger, a tab, a checkbox, a row action. For these, hover changes the
background and pressed changes it further.

**A text-entry control is not pressed, it is focused.** An input, a
textarea, a search field, a combobox's text half. Its background does
not change on hover or while typing: that background carries text the
user is reading back, and it must not shift under them. Focus is
carried by the border and the `primary-ring` focus ring, which is what
the user actually looks for. Such a control still defines resting,
focus, disabled and invalid — it simply defines no hover or pressed
*fill*.

A pointer left over a field after a click holds `:hover` for as long as
the user types. A hover fill on a text field is therefore not a brief
highlight; it is how the field looks in use. That is what makes it
wrong rather than merely unnecessary.

Keyboard focus shows a visible ring in `primary-ring`. Never remove the
focus outline.

### 6.5 Composite controls

Agreed 22 Sep 2026, after the defect below was found on a live screen.

A composite control — a field with an icon addon, a field with a clear
button, an input group — has **one element that owns the border, the
radius and the height**. Everything inside sits within it.

1. **An inner element never carries the wrapper's full control height.**
   The wrapper's `h-control` is a border-box measurement and already
   includes its border. An inner child given that same `h-control` is
   two pixels taller than the space it has, overflows, and paints
   across the border on both edges. Inner elements size from the
   wrapper.
2. **A state fill is painted by the element that owns the border and
   the radius, never by a child.** A child has had its radius stripped,
   so its fill is a sharp-cornered rectangle that stops short wherever
   a sibling addon sits. `bg-transparent` on a child does not cancel
   that child's own hover and pressed fills — it only sets the resting
   one. Where a composite control needs a state fill, the outer element
   draws it, with the `has-[...]` and `group-*` selectors already used
   there for focus and disabled.

Measured on the list-page search field: `InputGroup` is `h-control`
plus `border`, leaving 34px of content; the inner input was a fixed
36px with `border-0`, and its `hover:bg-surface-control` still fired.
The result was a square grey block overlapping the border on all four
sides and stopping short of the search icon. The fill made a geometry
bug visible that `bg-transparent` had hidden — both are bugs, and the
sizing one is the older of the two.

---

## 7. Messages and notifications

### 7.1 Choosing the right place

| Pattern            | Used when                                          |
|--------------------|----------------------------------------------------|
| Toast              | Confirming an action the user just took. Temporary.|
| Inline field error | A specific form field is wrong.                    |
| Banner             | A condition that persists until resolved.          |
| Dialog             | The user must act. Destructive or irreversible.    |

The deciding question: can the user ignore it and carry on? Yes and
temporary means toast. Yes but it stays true means banner. No means
dialog. About one field means inline.

Never use a toast for a field validation error. The user has to remember
which field was wrong after it vanishes.

### 7.2 Rules

1. Every status message carries an icon as well as a colour. Colour alone
   is invisible to colour-blind users and fails accessibility checks.
2. Error text states the cause, then the next action. "Enter a complete
   email address, like name@company.com", not "Invalid email".
3. No exclamation marks. No "Error:" prefix. No "Oops". Never show a raw
   technical error message to a user.

### 7.3 General notifications

A notification such as "Rakesh assigned you a task" is neutral. It is
neither success nor failure.

1. Notifications are neutral by default: grey text on a plain surface.
2. The brand colour is used only for the unread dot and a faint row tint.
3. A status colour appears only when that item is genuinely a success,
   warning or failure, and then only as a small badge inside the row.
4. The row container stays neutral. Status lives in the badge.
5. General notifications belong in the notification centre (bell icon),
   not in toasts or banners. Toasts and banners are about the current
   screen. Notifications are about events elsewhere in the system.

---

## 8. Text overflow

Text must never overflow its container. Every text element uses one of
three behaviours.

| Behaviour | Where                                                    |
|-----------|----------------------------------------------------------|
| Truncate  | Table cells, list rows, chips, menu items, buttons       |
| Wrap      | Detail pages, dialog bodies, form helper text            |
| Clamp     | Card descriptions, notification rows, previews           |

- Truncate means one line ending in three dots, with the full text shown
  as a tooltip on hover.
- Clamp means stopping at two lines with a "Show more" link.
- Cards in a grid must all be the same height. Clamping is how this is
  achieved.

---

## 9. Responsive behaviour

Supported range: desktop and tablet.

| Name    | Width          | Behaviour                                        |
|---------|----------------|--------------------------------------------------|
| Desktop | 1280 and above | Full layout. Sidebar open. All columns shown.    |
| Laptop  | 1024 to 1279   | Sidebar collapses to icon rail. Grids 4 to 3.    |
| Tablet  | 768 to 1023    | Sidebar behind a menu button. Grids to 2 columns.|

Rules:

1. Every screen must be checked at 1280, 1024 and 768 pixels before it is
   considered done.
2. Layout widths are proportional, never fixed pixels. A two-column area
   is two equal fractions of available space, not two 400px boxes.
3. Any grid or flex column containing text must be allowed to shrink below
   its content width. Without this, a long word or unbroken number pushes
   the whole layout wider than the screen. This is the single most common
   cause of broken layouts.
4. Touch targets are at least 44 by 44px on tablet.
5. Below 768px the layout must remain usable and must never break,
   overlap, or push content off screen. It is not optimised for phones,
   but it must not fall apart.
6. Dedicated mobile screens will be added later for a small set of
   specific tasks. They will be designed fresh, not by shrinking desktop
   screens.
7. Below 1024px the sidebar is hidden by default. The toggle then opens it
   as an overlay sliding over the content, rather than pushing the content
   sideways. Same button, different behaviour by screen width. Both
   behaviours must be built.

---

## 10. Scrolling

1. Vertical scroll is the default and always allowed.
2. **Horizontal scroll is a last resort.** First drop low-priority columns
   at narrower widths. Only a genuinely wide table, such as a ledger with
   more than eight columns at desktop width, may scroll sideways, and then
   the first column must be frozen.
3. Never nest a scrollable area inside another scrollable area **on
   the same axis** (section 1 rule 8). A horizontal scroller inside a
   vertical one is allowed.
4. Every table declares which columns are essential, which are secondary
   (hidden below 1024px), and which are tertiary (hidden below 768px).

Scroll ownership, decided per screen type:

- List page: the data area owns the scroll. The page itself does not scroll.
- Detail page: the page owns the scroll. Individual cards do not.
- A card scrolls internally only when it is a fixed-height live feed, such
  as an activity list or chat thread.

### Scrollbar styling

The browser default scrollbar is never used.

| Part          | Value     |
|---------------|-----------|
| Track         | `#F0F4F3` |
| Thumb         | `#A8BDBA` |
| Thumb hover   | `#7D9895` |
| Width         | 10px, fully rounded |

---

## 11. Page templates

Almost every screen is one of five types: list, detail, form, dashboard,
settings. Use the matching template. Do not invent new arrangements.

### 11.1 List page

Four fixed zones, in this order, always. Only zone 3 scrolls.

**A fifth zone is permitted and is optional: a section tab bar between
the header and the toolbar, defined in section 33.** It is the only
thing that may come between them, and a list page without one still
has exactly the four zones below.

1. **Header** — page title on the left, one primary action button on the
   right. Record count as meta text under the title. Does not scroll.
1a. **Section tabs** — optional. Section 33. Does not scroll.
2. **Toolbar** — search on the left at a fixed 260 to 320px width, never
   full width. Filter and sort as secondary buttons beside it. View
   switcher (list / card) on the far right as a joined pair, active side
   tinted with primary-subtle. Does not scroll.
3. **Data area** — the only scrolling zone. Fixed height calculated from
   the window height. Column headers stay visible while rows scroll.
4. **Pagination** — record count on the left, page controls on the right.
   Does not scroll.

Rules:

- Default page size is 25 records.
- Numbers are right-aligned. Text is left-aligned.
- Status is always a badge, never plain coloured text.

### 11.2 Detail page

1. **Breadcrumb** — first element on the page. Reflects the structure of
   the software, not the user's history. Maximum three levels. If four are
   needed, the structure is wrong.
2. **Record header** — record name as the page title, status badges beside
   it (never below), supporting meta line underneath. On the right: one
   primary action (usually Edit) and a three-dot menu for everything else.
3. **Content** — two columns on desktop. Main content at two-thirds width,
   summary sidebar at one-third. The sidebar drops below the main content
   on tablet.
4. **Related records** — tabs at the bottom for child records: invoices,
   tasks, documents, activity.

No back arrow buttons anywhere. Breadcrumbs replace them, because a back
button does something different depending on how the user arrived, which
is what makes people feel lost.

### 11.3 Form page

1. Add and Edit use the same component (see section 4).
2. Labels sit above their field. Never to the left, never as placeholder
   text inside the field.
3. Required fields carry a red asterisk on the label. Optional fields are
   not marked.
4. Fields are grouped into named sections with a section label.
5. Maximum two columns. Related fields sit side by side.
6. Validation runs when the user leaves a field, not on every keystroke.
   The error appears below the field and the field border turns danger red.
7. Actions sit in a footer bar, aligned right. Cancel on the left, primary
   on the right, always in that order.
8. A form with more than about twelve fields uses a fixed footer so the
   save button is always reachable.
9. Placeholder text shows an example format only. It is never the label.

---

### 11.4 Dashboard page

Four zones, top to bottom. A dashboard is read-only.

1. **Metric tiles** — a row of four. Each shows a label, one large number,
   and a change indicator against the previous period.
2. **Main chart** — one chart, full width.
3. **Two panels side by side** — usually items needing attention on the
   left, recent activity on the right.
4. **Nothing.** Dashboards end. They do not scroll for three screens.

Rules:

- No editing and no forms on a dashboard.
- Every tile links to the list page that explains the number.
- Every number states its period: "This month", "Last 30 days". A number
  with no stated period is meaningless.

### 11.5 Settings page

- Two-column layout: a vertical menu of sections on the left at about
  200px, content on the right.
- Each section is a set of cards, one card per group of related settings.
- **Each card has its own Save button.** Never one Save button for the
  whole settings page.
- **Each card's Save is a primary button, and this page is the one place
  section 6.1 rule 1 does not apply.** A settings page carries as many
  primary buttons as it has cards.

  Section 6.1 rule 1 says exactly one primary button per screen. It
  cannot hold here, and the more specific rule wins: a settings card is
  effectively its own screen, with its own fields and its own save, and
  a single Save governing the whole page is the exact failure the rule
  above exists to prevent. A card whose Save is styled secondary reads
  as optional, which is worse than the inconsistency.

  Settled, not open. Do not restyle these to secondary and do not raise
  it again.
- Destructive settings, such as deleting an account, sit in a separate
  card at the bottom with a danger-coloured border.

### 11.6 Card view

The alternative to list view on a list page.

- A card shows at most five pieces of information: title, status badge,
  two supporting facts, one meta line.
- All cards in a grid are the same height. Descriptions clamp to two lines
  to achieve this.
- Grid is 4 columns on desktop, 3 on laptop, 2 on tablet.
- The whole card is clickable, not only the title.
- Card view and list view show the same records with the same filters.
  Switching view changes appearance only, never content.
- The user's choice of view is remembered.

---

## 12. Application shell

The shell is the frame every page sits inside. It never changes between
pages.

### 12.1 Sidebar

- 260px wide when open. 64px icon rail when collapsed.
- Navigation items grouped under small section labels in meta style.
- Maximum seven items at the top level. Beyond that people stop scanning
  and start hunting.
- Active item: `primary-subtle` background, body strong weight, and a 3px
  accent bar in `primary` on its left edge. Three signals together.
- When collapsed, each icon shows a tooltip with its label on hover.
- The user's open or collapsed choice is saved and restored next visit.

**The sidebar never changes when the user drills into a record.** The
top-level section stays highlighted and the breadcrumb inside the page
shows the depth. Navigation that shifts under the user is what makes
people feel lost.

### 12.2 Top bar

52 to 56px tall, spanning the content area. Contains only:

1. Sidebar toggle, at the far left
2. Global search
3. Notification bell with unread dot in `primary`
4. User menu

Nothing else. Page actions belong in the page header, not here. Every
extra control in the top bar appears on every screen whether relevant
or not.

### 12.3 Content area

- 24px padding on all sides.
- Maximum width 1600px, centred. Beyond this, text lines become too long
  to read and tables look stranded.
- The page header, with the page title and the one primary action, belongs
  to the page, not to the shell.

---

## 13. Empty states

There are three, not one. Using the wrong one makes the software look
unintelligent.

| Situation           | Message                     | Action           |
|---------------------|-----------------------------|------------------|
| Nothing yet         | What would normally be here | Primary: create  |
| Nothing found       | Filters matched no records  | Clear filters    |
| Something failed    | What went wrong             | Retry            |

Each empty state has three parts: a short heading, one line explaining
how to change the situation, and one action button.

Never show a blank area. Never show only the words "No data".

Never offer "Add your first client" to someone whose filter simply
matched nothing.

---

## 14. Loading states

1. Use skeletons — grey placeholder blocks in the shape of the content
   that is coming. Not a spinning wheel. The layout arrives first and the
   page does not jump when data lands.
2. A button that triggers a save shows a loading state on the button
   itself and becomes disabled while working, so nobody clicks Save three
   times and creates three records.

---

## 15. Destructive actions

1. Any irreversible action opens a confirmation dialog. Never delete on a
   single click.
2. The dialog names what is being deleted, and states what else will be
   affected: "This will also remove 4 invoices and 3 open tasks."
3. The confirm button uses the danger style and states the actual verb:
   "Delete client". Never "OK" or "Yes".
4. Cancel is the safer option and sits on the left.
5. For genuinely dangerous deletions, require the user to type the record
   name before the confirm button becomes active.

A confirmation that does not state the consequences is not a
confirmation. It is a speed bump.

---

## 16. Dropdowns and select menus

### 16.1 Trigger

- Height exactly 36px, matching input fields. Chevron on the right.
- The chevron points down when closed and up when open.
- Empty state: grey placeholder text, normal border.
- Disabled state: faded border and faded fill, same as buttons.

### 16.2 Menu

- Width exactly matches the trigger width. Never wider, never narrower.
- 12px radius, 1px border, soft shadow.
- Options are 36px tall with 12px horizontal padding.
- Maximum menu height about 280px, roughly seven rows, then it scrolls
  internally using the custom scrollbar from section 10.
- **Selected and hovered must look different.** Selected is
  `primary-subtle` with a tick on the right. Hovered is neutral grey.
  These are two different meanings and must never share one style.
- The menu never extends past the edge of the screen. It flips upward
  when there is no room below.

### 16.3 Long lists

- More than 6 options: the menu gets a search box fixed at the top, which
  does not scroll with the options.
- More than about 20 options: it should not be a dropdown. Use a
  searchable picker or a dialog.

### 16.4 Keyboard

A dropdown must be fully operable by keyboard: arrow keys move between
options, Enter selects, Escape closes, typing a letter jumps to options
beginning with it. Focus returns to the trigger when the menu closes.

Data entry staff work far faster on the keyboard than the mouse. A
mouse-only dropdown slows down the people who use the software most.

---

## 17. Field widths

A field is as wide as the data it holds. Never full width by default.
The eye uses field width as a clue about what belongs in the box.

Forms use a 12-column grid.

| Span | Used for                                                    |
|------|-------------------------------------------------------------|
| 3    | PIN code, amount, quantity, year, percentage                |
| 4    | Phone number, date, short dropdown, reference number        |
| 6    | Person name, company name, email address, city              |
| 12   | Street address, description, notes, anything free-form      |

Rules:

- Minimum field width 160px.

  **One exception, and it is narrow: an amount cell in a repeating
  matrix** — every cell in it holding the same unit, and a column header
  naming the dimension that unit varies across. Section 31 defines it.
  Such a cell is sized to its content, with its own floor of 120px.

  This is **not** a general exemption for grids, and not for tables with
  editable fields. A cell whose unit is not given by its column, or
  whose neighbours hold something else, is a form field on an unusual
  background and takes the 160px minimum like any other.
- A single-line field never exceeds 480px. Longer than that is
  uncomfortable to read back.
- Number fields align their content right. Text fields align left.
- Fields that belong together sit on the same row.

---

## 18. Date and number formats

One format across the whole software.

| Type          | Format               | Example              |
|---------------|----------------------|----------------------|
| Date          | `DD Mon YYYY`        | 12 Aug 2026          |
| Date and time | `DD Mon YYYY, h:mm A`| 12 Aug 2026, 3:45 PM |
| Number        | Indian grouping      | 12,45,680            |
| Amount        | Two decimals always  | 4,200.00             |
| Currency      | Symbol before, no gap| ₹4,200.00            |

Rules:

- Never display a date in numeric-only form. 12/08/2026 means two
  different dates depending on who reads it.
- "2 hours ago" style is allowed in activity feeds and notifications only.
  Everywhere else uses the full date.
- All numbers, amounts and dates are right-aligned in tables.
- Date input fields accept typed entry as well as the calendar picker.
  Forcing people to click through a calendar for a birth date is slow.

---

## 19. Tooltips

- Appear after about a 400 millisecond delay on hover, and immediately on
  keyboard focus.
- Dark surface, white text, 13px, maximum width 240px, 8px radius.
- Never contain buttons, links, or anything clickable.
- Never carry information that is available nowhere else. The single
  exception is the label of an icon-only button.
- Flip position to stay within the screen.

If the only way to learn something is to hover over it, touch users and
keyboard users never learn it.

---

## 20. Date and time pickers

### 20.1 Date picker

- Displays and accepts `DD Mon YYYY`, matching section 18.
- The field accepts typed entry as well as calendar selection. Never
  calendar-only.
- The calendar opens in a popover aligned to the left edge of the field.
- Week starts on Monday.
- Today is outlined. The selected date is filled with `primary`.
  Unavailable dates are faded and not clickable.
- A date range picker shows two months side by side and states the
  selected range as text below the calendar.
- Field width: 4 columns (section 17).

### 20.2 Time picker

- 12-hour format with AM and PM, matching the date and time format.
- Separate hour and minute controls. Both typeable and selectable.
- Minutes step in 15-minute intervals by default.
- Never show seconds unless the product genuinely requires them.
- Field width: 3 columns (section 17).

There is no ready-made time picker in the component library. It must be
built as a custom component following these rules.

---

## 21. Chart colours

Charts need their own palette. It is a different problem from brand colour:
the colours must stay distinguishable side by side and in a small legend.

Categorical sequence, used in this order:

| Position | Colour    | Name                    |
|----------|-----------|-------------------------|
| 1        | `#174443` | Deep teal (brand)       |
| 2        | `#C2841D` | Ochre                   |
| 3        | `#3B5A9A` | Indigo                  |
| 4        | `#A34A5E` | Rose                    |
| 5        | `#6FA8A4` | Light teal              |
| 6        | `#7A7268` | Warm grey               |

Positions 1 and 2 are maximally different because most charts have only
two or three series.

For a single measure across a range (heat maps, single-series columns),
use a sequential ramp from light teal to deep teal in five steps instead.

Rules:

- Maximum six series in one chart. Group the smallest into "Other".
- **Never use the status colours in a chart** unless the chart is about
  status. A red bar meaning "third quarter" will be read as a problem.
- Label lines and bars directly where space allows, rather than forcing
  the eye to a legend and back.
- Bar chart axes always start at zero. Line charts may start elsewhere
  but must say so.

**Recharts draws them.** Agreed 7 Sep 2026 under rule 10. This section
was written expecting a library — a categorical palette, a series cap,
direct labelling, a zero baseline — and hand-rolling SVG to satisfy it
is more work for a worse result.

**Every rule above lives in `components/ui/bar-chart.tsx`, not in the
screen that calls it.** The caller names its series and never names a
colour; the six status colours are not reachable from it; a seventh
series throws rather than drawing a colour nobody chose. Use the
section 21 palette tokens, never Recharts' own defaults.

**A chart's own text is styled in CSS, not through Recharts' props.**
`fill` and `fontSize` on a Recharts element become SVG presentation
attributes, and a presentation attribute cannot hold a `var()` — so a
token cannot reach one. Style the SVG text with real CSS rules
instead, or the colour arrives from outside `globals.css`.

---

## 22. Bulk selection and actions

- A tick box is the first column of any list where more than one record
  can sensibly be acted on at once.
- When one or more rows are selected, the toolbar is replaced **in place**
  by the action bar. Search and filters are hidden while a selection is
  active. Nothing is pushed down.
- The action bar states the count against the total: "14 of 100 selected".
- Maximum four bulk actions visible. More go in a three-dot menu.

### 22.1 Persistent selection

Selection persists across filter and search changes. It is a running set
the user builds up: search "aryan", take 5; search "rishabh", take 4;
act on all 9 together.

- **Selected rows are never pinned above the results.** The current
  filter's results display normally. Pinning buries what the user is
  searching for.
- Rows already in the selection are marked with a faint `primary-subtle`
  row tint when they appear in a filtered result.
- A "Show selected only" toggle in the action bar filters the list down to
  the selection, so the user can review before acting.
- "Select all matching" is scoped to the current filter and **adds** to
  the running set. It never replaces it.
- "Clear selection" is always visible in the action bar.
- Selection clears when the user leaves the page. Persistent means within
  the screen, not across the session.

### 22.2 Safety

- Destructive bulk actions follow section 15 and must state the count:
  "Delete 9 clients?" with a way to review the list.
- After a bulk change, the success toast carries an Undo link lasting
  about 10 seconds. Undo is kinder than a confirmation people click
  through anyway.

---

## 23. Icons

- **Lucide only.** Never mix icon sets. Never use emoji as icons.
- Three sizes: 16px in buttons and inputs, 18px in navigation and
  toolbars, 22px in empty states. Nothing else.
- Icons inherit the colour of the text beside them. The only exception is
  a status icon, which takes its status colour.
- An icon never appears alone without a visible label or a tooltip.
- Icons sit 4px from their label.
- Never use an icon where the meaning is not obvious. Three dots, arrows
  and abstract shapes need a label.

### 23.1 Icon map — one meaning, one icon, everywhere

| Meaning   | Icon              | Meaning    | Icon             |
|-----------|-------------------|------------|------------------|
| Edit      | `pencil`          | Close      | `x`              |
| Delete    | `trash`           | More       | `dots`           |
| Add       | `plus`            | Duplicate  | `copy`           |
| Search    | `search`          | Confirm    | `check`          |
| Filter    | `filter`          | Date       | `calendar`       |
| Sort      | `arrows-sort`     | Download   | `download`       |
| Show      | `eye`             | Hide       | `eye-off`        |

`eye` and `eye-off` are the **one** pair for show and hide, and they are
a pair: whatever reveals something hides it again with the other one.
Never a crossed-out padlock, never a different icon per screen.

Extend this table rather than inventing icons per screen.

### 23.2 Shell and navigation icons

The shell's own icons, fixed the same way. A navigation item's icon is
part of the item, not a per-screen choice.

| Meaning         | Icon               | Meaning     | Icon                |
|-----------------|--------------------|-------------|---------------------|
| Product mark    | `tree-pine`        | Sign out    | `log-out`           |
| Sidebar toggle  | `panel-left`       | User        | `user`              |
| Notifications   | `bell`             | List view   | `list`              |
| Dashboard       | `layout-dashboard` | Card view   | `layout-grid`       |
| Projects        | `folder`           | Rising      | `trending-up`       |
| Sites           | `map-pin`          | Falling     | `trending-down`     |
| Expenses        | `receipt`          |             |                     |
| Reports         | `chart-column`     |             |                     |
| Settings        | `settings`         |             |                     |

One toggle icon, not two: `panel-left` in every state, with the tooltip
and the screen-reader label stating the action - "Collapse sidebar",
"Expand sidebar", "Open navigation". An icon that swaps as well as its
label makes the control read as two different buttons.

---

## 24. Dialog sizes

Three widths only.

| Size   | Width | Used for                          |
|--------|-------|-----------------------------------|
| Small  | 400px | Confirmations                     |
| Medium | 560px | Short forms                       |
| Large  | 800px | Tabs or a table inside the dialog |

- Height grows with content up to 80% of the window height, then the
  dialog body scrolls internally while header and footer stay fixed.
- Every dialog has a title and a close button top right, 36 by 36, with
  a filled background per section 6.3.
- Dialogs close on Escape and on clicking the backdrop. Confirmations are
  the exception: they close only via Cancel or the action.
- **Never open a dialog from inside a dialog.** If a dialog needs to lead
  somewhere else, it should be a page.

The backdrop behind a dialog, alert dialog or sheet is the `--backdrop`
token. It is derived from `--text-primary` rather than being a colour of
its own, so nothing new enters the palette and a theme change carries it.
All three components point at that one token; none of them defines its
own overlay.

---

## 25. Toasts

- Position: bottom right.
- Duration: 4 seconds for a simple confirmation, 6 seconds when it carries
  an Undo link. **Error toasts never auto-dismiss** — they stay until
  closed.
- Maximum three stacked. Older ones are replaced beyond that.
- Width 360px fixed. Never full width.
- Every toast has a close button.
- A toast never carries information available nowhere else. If the user
  misses it, nothing is lost. A toast is a whisper, not a record.

---

## 26. Permissions in the interface

- **Hide** controls for entire areas the user has no access to. A user
  with no finance role does not see Invoices in the sidebar at all.
- **Disable** individual actions the user can see but cannot perform, and
  always attach a tooltip saying why: "Only an administrator can delete
  clients."
- **Never show a control that fails after being clicked.** A permission
  error after the fact is the worst option of the three.
- Read-only users see the same screens with fields disabled, not a
  separate stripped-down screen. Building a second read-only version of
  every screen doubles the work and guarantees the two drift apart.

**These are appearance rules only.** Hiding a button is not security. The
real permission check happens on the server. Anyone can unhide a button
with browser tools.

---

## 27. Search, sort, filter and date ranges

### 27.1 Search

**Search covers every meaningful text field on the record by default**,
not a chosen few: name, title, department, email, phone, tags, reference
numbers, status labels, and the names of related people.

Search that silently misses is worse than search that finds too much. A
user who types "Finance" and gets nothing concludes no such record exists,
with no way to tell that they simply searched a field the box does not
cover.

- Fields excluded from search must be declared and justified. Long
  free-text notes are the usual exclusion, because they flood results.
- When a match is found in a field other than the main title, **the result
  row shows where it matched** — `Rishabh Mehta — Delivery`, with the
  matched text highlighted. Without this, results look random.
- The placeholder names the record type, not the field list: "Search
  clients". A tooltip on the field carries the full list of searchable
  fields.
- Search runs about 300 milliseconds after the user stops typing, not on
  every keystroke.
- A clear button appears inside the field once there is text.
- The result count shows beside the field: "12 results".
- Search combines with filters. It never replaces them.
- When search returns nothing, the empty state states what was searched:
  "No clients match 'finance'", with an option to clear. Never a blank
  list.

### 27.2 Sort

- Tables sort by clicking the column header. A chevron shows direction,
  and only the active column shows one.
- Card view uses a Sort dropdown instead, since there are no headers.
- Every list declares its default sort, usually newest first.
- Not every column is sortable. Declare which are.
- Sort survives page changes.

### 27.3 Filter

- The Filter button opens a panel. Filters are never scattered across the
  toolbar.
- **Active filters appear as removable chips below the toolbar**, so the
  user can always see why the list is short and can remove any single
  condition in one click. Without chips, people forget they applied a
  filter and report missing records as a bug.
- A count badge sits on the Filter button when filters are active.
- "Clear all" is always available.
- Filters, search and sort persist when the user opens a record and comes
  back to the list.

### 27.4 Date ranges

The same preset list on every screen:

Today · Yesterday · Last 7 days · Last 30 days · This month · Last month ·
Last 3 months · This financial year · Custom range

- The active preset is highlighted with `primary-subtle` and a `primary`
  border.
- Custom range opens the two-month calendar from section 20.1.
- The chosen range always displays as readable text: "1 Aug 2026 to
  29 Aug 2026". Never only as "Custom".
- Financial year means April to March.

---

## 28. Dark mode

**Structured for, not built.** Do not build a dark theme until explicitly
asked. Do build every colour so that a dark theme can be added later
without touching any screen.

Requirements from day one:

- Every colour token is named by its job (`surface`, `text-primary`,
  `border`, `primary`), never by its value. No token is ever called
  "green" or "grey".
- Light values sit in one block in `globals.css` that a dark block can sit
  beside. Nothing outside that file knows which theme is active.
- No screen, component, or class contains a colour decision that would
  need changing when the theme flips.

**Critical note for whoever builds it.** The brand colour `#174443` is
dark. On a dark background it nearly disappears. A dark theme must use a
lighter primary, around `#4A9A94`, with dark text on it rather than white.
Do not reuse the light-theme primary in dark mode.

The reason dark mode is not built now: every screen must be checked twice,
forever, once the theme exists. That doubles review work during the build
phase for no benefit. Structuring for it costs nothing. Building it costs
continuously.

---

## 29. File uploads and attachments

Uploads are **not a global feature**. There is no upload control anywhere
by default. A screen gets file upload only when it is explicitly asked
for, and the request states what the files are for.

When a screen does have uploads:

- The upload area is a bordered drop zone with a browse button inside it.
  Both dragging and clicking must work.
- Accepted file types and the size limit are stated visibly, before the
  user tries: "PDF, JPG or PNG. Up to 10 MB."
- Each uploaded file appears as a row with its name, size, a remove
  button, and a download link.
- Long file names truncate per section 8.
- Upload progress shows on the file row, not as a page-wide overlay.
- A failed upload keeps the file in the list marked with the danger colour
  and a Retry action. It does not vanish silently.
- Images show a small preview. Other file types show a file-type icon.
- Removing a file follows section 15 if the file is already saved. Files
  not yet saved may be removed without confirmation.

---

## 30. Still to be decided

Nothing outstanding. When a new pattern is needed, agree it first and add
it to this file before building it.

Agreed and moved out of this section: **the data entry grid**, now
section 31, **password fields**, now section 32, **section tabs**, now
section 33, and **report tables**, now section 34.

---

## 31. Data entry grid

Agreed 5 Sep 2026, before building, per section 30.

A grid is a table whose cells are editable and form a **matrix**: two
axes that both mean something, every cell holding the same unit, and
totals along each axis that have to be read together.

One screen so far — per-tree budget entry, 19 cost heads down the side
and 5 periods across the top, 95 cells, every one a rupee amount per
tree, each column a period.

**A list of records with editable fields is not a grid, it is a list. A
form is not a grid. One axis is not a matrix.** The exceptions below are
bought by that structure and do not travel outside it.

### 31.1 The cell

- An amount cell is **sized to its content, with a floor of 120px**
  (`--spacing-grid-cell`), not the section 17 minimum of 160px. Five
  160px fields plus a name column and a total do not fit the content
  area at any supported width.
- **120px is a floor, not a preference, and it is measured rather than
  chosen.** In Geist at 14px with tabular figures, `₹12,45,680.00` is
  94px of text; the standard input padding adds 24px and the border
  1.33px, giving 119.33px. 120px is that, rounded up.
- **A truncated number is worse than truncated text.** Section 8's three
  dots read as "there is more text", and there is no convention that
  reads as "there are more digits". A number missing its leading digits
  is not obviously wrong — it is quietly a different number.
- **Right-aligned, tabular figures** (sections 17 and 18), so digits line
  up down a column and the eye can compare them without reading.
- Height stays **36px**, matching every other control (section 6.2).
- Standard input border, focus ring and disabled treatment. It is an
  input in a table, not a new control.

### 31.2 Empty is not zero, and the data must follow the display

A cell nobody has filled in and a cell deliberately set to zero are
**different facts and must look different**.

- **Empty**: placeholder in `text-muted` reading `Not set`. Never `0`.
- **Zero**: `0.00` in `text-primary`.

**The stored data follows the display exactly, in both directions:**

| The user does this | The store does this |
|---|---|
| types `0` and saves | writes a row with the amount `0` |
| **clears a cell that held `0` and saves** | **deletes the row** |
| leaves a cell empty | writes nothing |

**Clearing a cell must delete the row, not write a zero.** Anything else
turns "I have not decided" into "I decided nothing", silently and in the
direction nobody asked for — and the two render differently everywhere
downstream.

**The round trip is a required test, not an implementation detail.**
Type `0`, save, clear, save: the row is gone and the cell reads `Not
set` again. A grid that can enter a state it cannot leave is broken.

### 31.3 Totals

- A row total sits in the last column; a column total in a footer row.
  Both are **body strong** (section 3 rule 5) and **never editable**.
  The grand total sits where the two meet.
- **A total over nothing is not zero.** Where every cell contributing to
  a total is empty, the total reads **`Budget not set`**, not `0.00` —
  the same distinction as section 31.2 and the same words the report
  uses. A row of blanks totalling `0.00` would state a decision nobody
  made.
- A total mixing an explicit zero with blanks **is** a number: the zero
  is data. Only an entirely empty row, column or grid is "not set".
- Totals recalculate as the user types. They are the only thing on the
  screen that moves while typing — section 11.3 rule 6 still governs
  *validation*, which waits for the field to be left.

### 31.4 Width and scroll

**Scroll engages on available space, not on a breakpoint.** The grid
sits in a container that scrolls sideways when it has to and does not
when it does not, with the **first column frozen** throughout. Tying it
to a breakpoint would get 1024 wrong, because the same width fits or
does not depending on whether the user has the sidebar open or railed.

Measured in the running application, not calculated. The grid's
intrinsic width is **1000px** — a 240px head column, five 120px cells, a
120px row total, and the borders between them. The table is `w-full`, so
where there is more room it stretches rather than leaving a gap.

| Width | Sidebar | Available | Scrolls |
|---|---|---|---|
| 1280 | rail, 64px | 1157px | **no** |
| 1280 | open, 260px | 961px | yes |
| 1024 | rail, 64px | 901px | yes |
| 768 | hidden | 709px | yes |

So it fits at desktop **with the sidebar railed**, which is the state
section 9 gives as the default from 1024 upward, and scrolls otherwise.
"Available" is narrower than the content area alone because the page's
own vertical scrollbar and the card border come out of it.

Two earlier drafts of this table were wrong in the same direction —
each was written from arithmetic before the screen existed, and each
claimed the grid fitted at a width where it does not. **Measure this
one in the browser after any change to the head column, the cell width
or the page padding.** It is a table of facts, not of intentions.

**The frozen column carries a 1px right border.** Without it the cells
sliding underneath read as clipping rather than as a boundary, and the
column looks broken rather than pinned.

**This is the one screen in the product that reaches for horizontal
scroll, and the only one that should.** Section 10 rule 2 calls it a
last resort and names the escape hatch; this is what the hatch is for.

The reason it qualifies is specific, and worth stating so that no other
screen borrows it: **seven columns, none of which can be dropped.**
Section 10 rule 4's usual answer is to hide secondary columns at
narrower widths — but there are no secondary columns here. Every one is
a period carrying real money, no period is optional, and hiding one
hides a figure the totals still include. A screen where a column *can*
be dropped must drop it instead.

### 31.5 Saving

- One primary action for the whole grid, in a **fixed footer** (section
  11.3 rules 7 and 8). Ninety-five cells is far past the twelve-field
  threshold that makes a footer fixed.
- **Never a Save per row or per cell.** Ninety-five saves is not
  granularity, it is ninety-five chances to leave the screen half
  written.
- Validation follows section 11.3 rule 6: on leaving a cell, not on
  every keystroke, with the error below the grid and the offending cell
  bordered in danger.

---

## 32. Password fields

**Every password field has a visibility toggle. It is never a bare
input.** `components/ui/password-input.tsx` is the component that
provides it, and it is the only way a password is entered anywhere in
this product — sign-in, setting somebody's password in Settings, and
anything added later.

### Why it is a rule and not a preference

A password field hides what is typed, and the failure it causes is
specific: the person cannot tell a typo from a wrong password. They get
the same message either way, so they try the same wrong thing again.
On a phone keyboard, or with a long generated password pasted in
badly, or for anyone who does not touch-type, the field is the problem
rather than the password.

Hiding it by default is still right, because someone can be standing
behind the screen. Both are true, which is why this is a toggle and not
a setting.

### The toggle

- An **icon-only button**, and therefore section 6.3 — but it sits
  inside a field, so **§6.3.1 governs it**: no fill and no border of
  its own, because the input already provides the container. It still
  carries a hidden text label for screen readers and a tooltip on
  hover. The **`in-field`** variant supplies all four states plus the
  focus ring — do not restate them, and do not use `ghost` here.
- **`eye` to show, `eye-off` to hide** (section 23.1). One pair, never a
  padlock, never a different icon per screen.
- The label and tooltip state the **action**, not the state: `Show
  password` when hidden, `Hide password` when shown. It also carries
  `aria-pressed`, so a screen reader gets the state as well.
- It sits **inside the field, on the right**, and is **32×32**
  (`icon-sm`) rather than 36×36. That is the same exception
  `date-picker` and `time-picker` already take: a 36px button cannot sit
  inside a 36px field and still show its own border.
- It is `type="button"`. A toggle inside a form that submits the form is
  a bug waiting for the first person who presses Enter.

### Hidden by default, and it does not remember

**The field is hidden on every mount, and the shown state is never
remembered.** Not in a parent that outlives the screen, not in
`localStorage`, not in the URL, not in a context.

The reason to hide a password is that other people can see the screen,
and that reason does not expire because the person revealed it once. A
toggle that remembers is a toggle that eventually shows a password to a
room.

In practice this means the state is plain component state initialised to
`false`, and **the reset on unmount is the feature, not an
implementation detail.** Do not lift it, memoise it across mounts, or
persist it.

### What it does not do

- **No strength meter, no rules displayed as the user types.** Not asked
  for. If password rules are ever added they are an inline field error
  on blur (section 7.1), like every other validation.
- **No confirm-password field.** A visible password is what makes a
  confirmation unnecessary; adding both is asking the same question
  twice.



---

## 33. Section tabs

Agreed 12 Sep 2026, before building, per section 30.

**This is the product's first sub-navigation, and it is deliberately
the only one.** It exists because the Reports section grew from one
report to three, and three sibling screens that answer the same
question differently are not three sidebar entries — section 12.1 caps
the sidebar at seven items for a reason, and a report is not a
destination in its own right.

### 33.1 What it is, and what it is not

**Section tabs switch between SIBLING VIEWS OF ONE SECTION.** Three
reports over the same data. Not steps, not a wizard, not filters, and
not a place to hide a screen that deserves its own sidebar entry.

They are distinct from `tabs` on a detail page (section 11.2 zone 4),
which switch between a record's **child collections** — its expenses,
its variance. Same component, different job, and the difference is the
test: a detail page's tabs are about **one record**, section tabs are
about **one section of the product**.

**Use the existing `tabs` component.** There is no second tab
component and there will not be one (section 4 rule 3). What follows
is where it sits and how it behaves on a list page, not a new
appearance.

### 33.2 Placement

**Between the header and the toolbar. Nowhere else.**

The header names the section and the tab bar divides it, so the tab
must come after the title it qualifies. The toolbar comes after the
tabs, because search, filters and sort belong to the **active tab**
rather than to the section — a search box above a tab bar implies it
searches all three, and it does not.

**It does not scroll.** Like the header, the toolbar and the
pagination bar, it is fixed chrome; only the data area scrolls beneath
it. A tab bar that scrolls away is a tab bar the user has to hunt
upward for, which is the failure section 11.1 exists to prevent.

### 33.3 Appearance

Inherited from the `tabs` component, restated here only so the numbers
are checkable:

- Tab height **36px**, matching every other control (section 6.2).
- **24px** between tabs (`space-6`), on a 1px `border-light` rule
  running the full content width.
- Active tab carries **three signals together**: `primary` text,
  weight 500, and a **2px** `primary` accent along its bottom edge —
  the one place section 5.3 permits a border thicker than 1px.
- Resting tabs are `text-secondary` and go `text-primary` on hover.
- Keyboard focus shows the `primary-ring` outline. Arrow keys move
  between tabs, as the component already provides.
- **Sibling tabs are styled and behave identically.** If one carries a
  count badge, they all do (section 4 rule 2 and the parallel-items
  rule). A tab bar where one tab has a badge and its neighbour does
  not reads as two kinds of control.

### 33.4 State

**The active tab lives in the URL**, as a query parameter, so a report
can be linked to and the browser's own back button returns to the tab
the user came from. That is the navigation this product has instead of
a back button (section 1 rule 11).

Switching tabs **replaces** the history entry rather than pushing one:
flipping between three reports should not make the back button walk
through every flip.

**The toolbar's state belongs to its tab.** Search, filters and sort
do not carry across, because they filter different columns on each.

### 33.5 The limit

**Maximum four section tabs.** Past that it is not a section with
views, it is a section with a navigation problem, and the answer is
different information architecture rather than a fifth tab.

There is **one section tab bar per screen**, and it never nests inside
another.


---

## 34. Report tables

Agreed 14 Sep 2026, before building, per section 30.

A **report table** is a read-only table whose purpose is a conclusion:
one row per thing being compared, and a **total row** that is the
answer the screen exists to produce. The variance report's two
year-wise screens are the ones that exist today.

It is not a list page. A list page shows records you might open; a
report shows figures you read together. That difference decides both
rules below.

### 34.1 The total row is pinned, like the header

**On a report table carrying a total row, the total is sticky in the
same way the column header is sticky.**

The header and the total are not the same kind of information and that
is exactly why both have to stay: **a header tells you what a column
means; a total tells you what the report concluded.** Losing the header
leaves you reading unlabelled numbers. Losing the total leaves you
reading a table whose answer is somewhere below the fold — which is
worse, because the answer is the thing you came for and nothing on
screen tells you it exists.

Measured on the head-wise report before this rule: at 21 cost heads in
a 503px data area, **thirteen rows and the entire total row sat below
the fold**, and the grand total was off-screen the moment the report
opened. The header was already pinned. The asymmetry was the bug.

### 34.2 Do not paginate a report table

**A report shows every row, and scrolls.** Splitting the rows across
pages breaks the comparison the screen is for: the cost-head report
exists to show all heads against all periods, and a total that covers
only the rows on page 2 is not a total.

This is the narrow exception to section 1 rule 7. **It is bought by the
total row**, which is what makes an unpaginated table honest — the
reader can always see the full answer even when they cannot see every
row. A report table without a pinned total may not use this exception.

The row count is bounded by master data, not by transactions. Nineteen
cost heads at seed, twenty-one today; it grows by admin edits, not by
use. **A table whose rows grow with USE is a list and paginates.**

### 34.3 The first column freezes when the table scrolls sideways

Where a report table is wider than its container, it scrolls
horizontally under section 10 rule 2 and **the first column freezes**,
carrying a 1px right border so the cells sliding underneath read as a
boundary rather than as clipping.

Section 31.4 already established this for the data entry grid and the
reasoning is identical: scrolling sideways into unlabelled numbers is
the precise failure section 10 rule 2 exists to prevent. Measured on
the head-wise report at 1024 and 768, the table is 959px against 901
and 709 of container — it scrolls at both, and without a frozen column
the cost head name is the first thing to leave.

**Measure it in the browser after any change to the column set.**
Section 31.4 carries two wrong width tables written from arithmetic
before the screen existed; this section is not going to be a third.