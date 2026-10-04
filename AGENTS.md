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
| More than 6 options | `searchable-select` | Search box fixed above the list. `search` makes it ask the server as the user types (300 ms, at most 50 rows; access plan P8): the people and site pickers |
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

**Truncation only works if the column has a bounded width.** A table
sized from its content is at the mercy of its longest value: it either
overflows its container or starves its other columns. `white-space:
nowrap` gives one long cell an enormous preferred width and the browser
honours it. Measured on the site Expenses tab, one pasted paragraph made
its cell 2791px and the table 3310px inside a 927px container, pushing
Bill no. and Amount off screen. Declaring a cell truncated is not enough
— the column it sits in must have a width its content cannot override.
Section 17.1 says where that width comes from.

**A header cell truncates like any other cell.** A clipped header loses
the word that says what the column means, which is worse than a clipped
value: the reader can often infer a value from its neighbours, never the
label.

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

### 17.1 Table column widths

Agreed 23 Sep 2026, after a pasted paragraph broke the expenses table.

A column is as wide as the data it holds, the same way a field is.

**Fixed widths go to the columns whose content has a known maximum** —
a date, a period label, a reference number, an amount. **The free-text
columns take what is left and truncate** — a cost head, a description,
a note. They are the only columns where truncation is the intended
outcome, so they are the ones to squeeze.

Sized the other way the predictable columns starve. Measured before this
rule: two free-text columns at a fixed 280px each left 76px apiece for
Date, Period and Amount in a 927px table, and the Amount header rendered
as "Amoun".

**Widths come from a named vocabulary, never a number written into a
screen.** Section 17 already does this for fields, for the same reason:
a width the design system cannot see cannot be changed in one place, and
two screens showing the same data drift apart. The vocabulary lives in
`globals.css` beside the other sizing tokens.

An amount column is sized to the largest figure the product can show,
not the largest in today's data.

---

## 18. Date and number formats

One format across the whole software.

| Type          | Format               | Example              |
|---------------|----------------------|----------------------|
| Date          | `DD/MM/YY`           | 21/03/26             |
| Date and time | `DD/MM/YY, h:mm A`   | 21/03/26, 3:45 PM    |
| Number        | Indian grouping      | 12,45,680            |
| Amount        | Two decimals always  | 4,200.00             |
| Currency      | Symbol before, no gap| ₹4,200.00            |

Rules:

- **Day first, always.** `21/03/26` is the twenty-first of March. This
  file previously forbade numeric dates on the grounds that 12/08/2026
  reads as two different dates depending on the reader. That was
  overruled on 23 Sep 2026 by the client, for whom day-first numeric is
  the form everyone here already reads and writes, and who never asked
  for the spelled-out month. The ambiguity the old rule feared is a
  reader-outside-India problem, and it is accepted knowingly rather
  than forgotten. **The two-digit year carries the same trade**: a
  printed sheet does not say which century, which matters most in an
  exported PDF that outlives the screen it came from. Widening `YY` to
  `YYYY` is a one-line change in `lib/format.ts` if that ever bites.
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

- Displays and accepts `DD/MM/YY`, matching section 18.
- The field accepts typed entry as well as calendar selection. Never
  calendar-only.
- **Typing is digits only; the field inserts the slashes.** Six digits,
  `210326`, become `21/03/26` as they are typed. Nobody types a
  separator, so nobody can type it wrong, and the field never has to
  guess between `21/03/26`, `21-03-26` and `21.03.26`.
- The empty field shows `dd/mm/yy` as its placeholder. It states the
  order the field expects before anything is typed, which is when the
  user needs to know it. It is a hint, not a label: section 1 rule 12
  still applies and the field carries a real label as well.
- An unparseable or impossible entry — `32/03/26` — shows the inline
  error of section 11.3 rule 6. It must never silently discard what
  was typed and restore the old value: the user is then left looking
  at a date they did not enter, with nothing on screen saying why.
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

1. Hide controls for entire areas the user has no access to. A user who holds no permission in invoicing does not see Invoices in the sidebar at all.
2. Disable individual actions the user can see but cannot perform, and always attach a tooltip saying why, in the wording of section 26.2: "Only people allowed to delete clients can do this."
3. Never show a control that fails after being clicked.
4. Read-only users see the same screens with fields disabled, not a separate stripped-down screen.
5. **Permissions are not roles.** Code asks whether the user holds a permission (section 26.3), never which role they hold. No screen checks for an administrator, and no code carries an isAdmin flag. The administrator's role is an ordinary role that happens to hold every permission. Roles are created and renamed by each client, so nothing on screen or in code may depend on a role's name.

These are appearance rules only. Hiding a button is not security. The real permission check happens on the server.

The server side, and the contract between the two, is the backend kit's ACCESS_RIGHTS.md. Its vocabulary (permission, role, scope, unit, Pick) is used here unchanged.

**How to attach the reason.** Every disabled control in this system has pointer-events-none, so it never receives a hover and a tooltip attached to it never opens. The reason must be caught by a wrapper around the control that is not disabled, and the wrapper must also be focusable so keyboard users can reach the reason. When the action is permitted, the wrapper renders its children unchanged, with no extra element.

The wrapper must also open the tooltip on tap, because a tablet user can neither hover nor press Tab (section 19).

That wrapper is permission-tooltip.tsx. Do not write a second one, and never put a Tooltip directly on a disabled control. If permission-tooltip.tsx does not yet open on tap, fix it there, once, rather than at any call site.

### 26.1 Not known yet is not "not allowed"

The browser learns what the user may do from the server. Until the answer arrives nothing is known, and "not known" must not look like "not allowed".

1. A permission's answer has three values: true, false and undefined. undefined means not known yet.
2. While the answer is undefined, the control is disabled and shows **no reason**. A reason shown before the answer lands is a guess, and is wrong for everyone who turns out to be allowed.
3. When the answer lands, the control enables, or stays disabled and gains its reason. It does not move or change size; only its state changes.
4. A control is never hidden while the answer is undefined and then shown. That makes the toolbar jump (section 14 rule 1).
5. If the permissions failed to load, that is the failed branch of section 14 rule 3, not loading. Controls stay disabled without a reason, and the shell shows a danger banner (section 7.1): "We could not load what you can do here. Try again." with a "Try again" button.
6. A refresh of permissions already held (section 26.4) never returns answers to undefined. The old answers stand until the new ones arrive.

permission-tooltip.tsx takes allowed as true, false or undefined, and the prop is required: an optional prop lets a caller forget it, and a forgotten prop would read as "not known yet" for ever. Only a definite yes enables:

```tsx
const canDelete = useCan("clients.records.delete")
<PermissionTooltip allowed={canDelete} reason={reasonFor("clients.records.delete")}>
  <Button variant="danger" disabled={canDelete !== true}>Delete client</Button>
</PermissionTooltip>
```

### 26.2 Wording the reason

A reason names who may do it by what they are allowed to do, never by a role. Roles are named by each client and change; a permission's label does not.

| Case | Wording |
|---|---|
| The user lacks the permission | "Only people allowed to delete clients can do this." |
| The same, where asking is the next step | "Only people allowed to approve invoices can do this. Ask an administrator if you need it." |
| A rule about this record, not a permission (sections 15.1, 38.3) | State the fact: "You raised this invoice, so someone else must approve it." |
| A whole page (section 26.6) | Section 11.8's no-access wording, unchanged |

Rules:

1. Never "You do not have permission". It says nothing the disabled control did not already say.
2. Never a role name: not "Only an administrator can…", not "Only accountants can…".
3. "Ask an administrator" means a person who manages access, as in section 11.8. It is not a role check.
4. The words come from the permission's label through reasonFor(key) (section 26.3), so each permission has one wording everywhere. A caller writes its own reason only for a record rule (third row), and the server sends those (section 26.5).
5. Section 37 applies: sentence case, plain, cause first.

### 26.3 Asking: lib/permissions.ts

Every question about permissions goes through one file. No screen reads the permission list itself.

```ts
/** module.section.action, as declared in the backend catalogue. */
type PermissionKey = `${string}.${string}.${string}`

/** May this person do this at all? undefined = not known yet (26.1). */
function useCan(key: PermissionKey): boolean | undefined

/** "Any of", for an area opened by several permissions. */
function useCanAny(keys: PermissionKey[]): boolean | undefined

/** The module's see-amounts permission (26.7). */
function useCanSeeAmounts(module: string): boolean | undefined

/** For the shell and lists that ask many questions at once. */
function usePermissions(): {
  status: "loading" | "ready" | "failed"
  can: (key: PermissionKey) => boolean | undefined
  refresh: () => void
}

/** The section 26.2 sentence for a key, built from its label. */
function reasonFor(key: PermissionKey): string

/** The product's unit (section 0.1 item 8). */
const UNIT: { one: string; many: string; grouped: boolean }

/** Mounted once in the app shell. `initial` comes from the server (26.4). */
function PermissionsProvider(props: { initial: MyAccess | null; children: React.ReactNode }): React.ReactNode
```

Rules:

1. Keys are typed, and the type and each key's label are generated from the backend catalogues, never written by hand. A key that does not exist is a type error, not a control that is silently always disabled.
2. useCan answers "may this person do this at all". It never answers "on this record". That is section 26.5.
3. Never check a role name, and never write an isAdmin flag (section 26 rule 5).

### 26.4 Keeping the answer fresh

1. The server renders the user's permissions into the page with the shell (the backend kit's /me payload). The sidebar and the first screen are therefore right on first paint, with no "not known yet" state.
2. The browser asks again in three cases only: when any request comes back "not allowed" (403); when the tab regains focus, at most once every 10 seconds; and after the user saves anything on the access screens (section 40). Never on 404 or 409; those are not access changes.
3. A refresh keeps the old answers until the new ones land (section 26.1 rule 6).
4. A request refused with 403 shows an error toast with the reason (section 7.1), and the control that sent it moves to disabled with its reason once the refreshed permissions land. It is never left looking usable (section 26 rule 3).
5. A page the user loses access to while it is open is not torn down mid-task. Its controls disable, and the next navigation shows section 26.6.

### 26.5 Record-level answers come from the server

Whether a person may act on one particular record depends on things the browser does not know: the record's unit, its owner, the reporting line, its status. The browser never works these out.

1. Each record the server sends carries its own answers for the actions shown on it: `can: { edit: true, approve: "You raised this invoice, so someone else must approve it." }`. true means allowed; a string is the reason it is not.
2. A row or record action is enabled only when useCan(key) and the record's own answer are both true.
3. The record's reason is shown as given, through permission-tooltip.tsx.
4. Lists show only records the user may see. A filter, search or export never offers a record the user cannot open, so there is no "you cannot open this" state inside a list.
5. A refusal for a workflow rule (409) is an error toast carrying the server's plain reason, then the record reloads.

### 26.6 Opening a page you cannot use

1. Every page whose area belongs to a permission checks it on the server before rendering anything, through one helper in lib/permissions.server.ts:

```ts
/** Returns the no-access page to render, or null to carry on. */
async function guardPage(key: PermissionKey | PermissionKey[]): Promise<React.ReactNode | null>
```

```tsx
export default async function InvoicesPage() {
  const denied = await guardPage("invoices.records.view")
  if (denied) return denied
  // ...
}
```

2. When the answer is no, the page renders the section 11.8 "No access" page inside the shell. It does not redirect, so the address stays in the bar and the user can send it to whoever manages access.
3. The sidebar and top bar stay (section 11.8 rule 1).
4. The check lives in the page or its layout, once. Next's forbidden() is not used while it is experimental in the version this kit runs; if a product enables it, guardPage calls forbidden() and app/forbidden.tsx renders the same page.
5. **A record outside the user's scope is not found, not forbidden.** The server answers 404 for it, and the screen shows the section 11.8 "Page not found" page. Saying "no access" would confirm that the record exists.

### 26.7 See amounts

Some modules have one see-amounts permission covering sensitive figures: cost, rates, salary. The server removes those figures from everything it sends, including exports and reports.

1. A person who cannot see amounts does not see the amount column at all. Never an empty cell, a dash, "Hidden" or a padlock in its place. An empty amount cell reads as "Not set" or zero (section 31.2), which is false.
2. The same applies to totals, summary tiles, chart series, sorts and filters built from those figures. A report whose only purpose is the amounts is an area, and section 26 rule 1 hides it.
3. Columns are chosen with useCanSeeAmounts(module) once, before the table renders, so columns never appear and vanish.
4. A form field holding an amount follows the same rule: absent, not disabled.

### 26.8 Brought across from the rest of the kit (access plan P7 step 1)

Copied from `Kits/frontend-kit/FRONTEND_RULES.md` (committed 9273e7d) so
the permission rules can be read in one place. The kit is the authority;
where this copy and the kit differ, the kit is right.

**Kit section 1, rule 7, with its exceptions** (this file's own rule 7
above predates them):

7. Never render an unbounded list. Everything is paginated. The exceptions are the report table (section 34.2), the unit picker (section 40.7) and the tables of "What they can do" (section 40.9), and only because their rows come from master data or the code catalogue, which grow only when an administrator edits a list or a release ships.

**Kit section 4.1, the permission rows:**

| File | What it is |
|---|---|
| permission-tooltip.tsx | Makes a disabled control's reason reachable by hover, keyboard focus and tap (sections 19, 26). A tooltip on the disabled control itself never opens. allowed is true, false or undefined, and is required; undefined means not known yet and shows no reason (section 26.1). |

Specified in the kit, not yet built (Tracking builds them first, P10;
RESOLUTIONS PQ4):

| File | What it will be |
|---|---|
| permission-grid.tsx | The role editor's grid for one module (section 40.3): sections down, actions across, a tick and a scope in each cell, partly ticked module and row ticks, the "Also includes" line for Picks (section 40.5), and a read-only form. |
| unit-picker.tsx | The selected-units tick list on a person's access page (section 40.7): every unit, grouped where the product groups them, with partly ticked group ticks, the "8 of 48" counts, and search above 50 units. Not SearchableSelect: that chooses one value, and this chooses many. |

**Kit section 11.8, the No access page:**

| Page | Heading | Line | Actions |
|---|---|---|---|
| No access | You don't have access to this page | Ask an administrator if you need it. | Primary: "Go to dashboard" |

**Kit section 12.1, the sidebar's permission bullets:**

- **An item belongs to a permission.** Each item may carry the permission key, or several meaning "any of", that opens its area (section 26.3). An item the user cannot use is not rendered (section 26 rule 1), and a group whose items are all hidden loses its label too. The seven-item limit counts the full configured list, not what one user sees: the person who can see everything must still see seven or fewer.
- The sidebar is drawn from the permissions the server sent with the page (section 26.4), so it is right on first paint and never shows an item and then removes it.

**This product's declared first-paint exception** (access plan 3.3):
Sadbhavna keeps its token in `localStorage`, so section 26.4 rule 1
cannot hold. The shell renders nothing permission-dependent until
`/auth/me` lands, and `guardPage` (26.6) runs in the browser, in
`lib/permissions.ts`; there is no `lib/permissions.server.ts`.

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

---

## 40. Access screens

Who may do what is set on four screens. Every product with roles uses them as written here. The backend kit's ACCESS_RIGHTS.md fixes what each screen must show and do (its section 7.4); this section fixes how it looks and behaves. A product without configurable roles skips this section.

The words are the backend kit's, used the same way on every screen and in every message:

| Word | Meaning |
|---|---|
| Permission | One action on one section of one module: "Invoices › Records › Approve" |
| Role | A named set of permissions, each carrying a scope. People hold one or more roles, and their access is the sum of them |
| Scope | Which records a permission reaches: Own, Team, Selected units or All |
| Unit | The product's one business-unit dimension (section 0.1 item 8). On screen, always the product's own word |
| Pick | Seeing names only, to choose them in a list on another screen. Never shown as a tick (section 40.5) |

Scope labels, exactly, in this order wherever scopes are listed:

| Scope | Label | Meaning |
|---|---|---|
| Own | Own | Records they created or are named on |
| Team | Team | Their own, plus those of everyone under them in the reporting line, plus the units they or those people lead |
| Selected units | "Selected " and the unit's plural: "Selected branches" | The units ticked on their access page, plus the units they lead |
| All | All | Every record |

There is no "None". An unticked permission is no access.

### 40.1 Where the four screens live

1. One sidebar item, **Access**, with the shield icon, behind the permission that manages access. Everyone else does not see it (section 26 rule 1).
2. Inside it, four section tabs (section 33), in this order: **Roles**, **People**, **What they can do**, **History**. Four is the section 33.5 limit, and nothing else is added here.
3. The role editor (section 40.3) and a person's access page (section 40.7) are pages under their tab, reached by opening a row. Breadcrumbs: "Access › Roles › Office accountant", "Access › People › Rakesh Mehta".
4. Neither is a dialog. Both hold more than a short form, and both can raise a warning that would otherwise need a dialog inside a dialog (section 24 rule 4).
5. Changes take effect on the person's next request. No screen says "may take a few minutes".

### 40.2 Roles list (the Roles tab)

A list page (section 11.1).

1. Columns: Name (TableRowLink, free width, truncates), People (col-count, right-aligned), row actions (col-actions).
2. **People** is the number of active people holding the role now. It is a link that opens the People tab filtered to that role, with the filter showing as a chip (section 27.3). Zero is written "0" and is not a link.
3. Job roles are named after the job ("Office accountant"). Add-on roles, held on top of a job role, start with "+" ("+ Invoice approver"). The "+" is how they are told apart; there is no Type column.
4. Default sort: job roles first, then add-on roles, each alphabetical.
5. Row actions in the three-dot menu: Edit, Duplicate, Delete.
6. A role can be deleted only while nobody holds it. Otherwise Delete is disabled with its reason (section 15.1): "3 people have this role. Remove it from them before deleting it." Deleting follows section 15. The history keeps the role's name (section 40.10).
7. **The system role** (the one that holds every permission) cannot be edited or deleted. Its Edit and Delete are disabled with "This role always holds every permission and cannot be changed." Its row opens the editor read-only (section 40.3 rule 14).
8. Duplicate opens the role editor as a new role, named "Copy of Office accountant", with every tick and scope copied. Nothing is saved until Save.
9. **Add role** is the page's one primary button. It opens the role editor empty.

### 40.3 Role editor: the permission grid

A form page (section 11.3) with a fixed footer (section 11.3 rule 8), because it is long.

```
Access › Roles › Office accountant
Office accountant                                                      [⋯]
14 people have this role
┌─ Details ───────────────────────────────────────────────────────────────┐
│ Name *                     Description                                  │
└─────────────────────────────────────────────────────────────────────────┘
Own: records they created or are named on. Team: ... All: every record.
┌─ Invoices ──────────────────────────────────────────────────────────────┐
│ [▣] Everything in Invoices   [ ] See amounts (cost, rates)              │
│ ┌──────────────────────────┬────────────┬────────────┬────────────┐     │
│ │ Section                  │ View       │ Add        │ Approve    │     │
│ ├──────────────────────────┼────────────┼────────────┼────────────┤     │
│ │ [■] Records              │ [■] All ▾  │ [■] Own ▾  │ [■] Own ▾  │     │
│ │     Also includes: pick clients       │            │            │     │
│ │ [▣] Payments             │ [■] Team ▾ │ [ ]        │            │     │
│ │ [ ] Reports              │ [ ]        │            │            │     │
│ └──────────────────────────┴────────────┴────────────┴────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
═══════════════════════════════════════════════════════════ fixed footer ═
                                                   [Cancel]  [Save role]
```

[■] ticked, [▣] partly ticked, [ ] unticked; a blank cell means that section has no such action. "All ▾" is the scope as an inline choice (section 40.4).

**The page**

1. Breadcrumb, then the record header (section 11.2): the role name as the page title, and "14 people have this role" as the meta line. The three-dot menu holds Duplicate and Delete.
2. A Details card (name and description). Then one line stating the meaning of each scope, once, so the scope menus need no explanations of their own. Then one panel card (section 36.10) per module, in the catalogue's order. Every module in the catalogue appears, including ones added since the role was last edited; their ticks start empty.
3. The page owns the vertical scroll (section 10). Each module's table scrolls sideways inside its own overflow-x-auto container when it is too wide, with the Section column frozen and its 1px right border (sections 31.4, 34.3). The card must not clip it.
4. **One Save for the whole role**, the primary button in the fixed footer, labelled "Save role", with Cancel on its left (section 11.3 rule 7). Never a Save per module card: a role is one record, and saving half of it gives people half a role. This is not a settings page, so section 11.5's Save per card does not apply.
5. Unsaved changes are guarded (section 11.3 rule 10, unsaved-changes.tsx). Ctrl+S saves (section 39.5).
6. The save toast states the effect: "Office accountant saved. 14 people have the new permissions from their next request."

**The module card**

7. The band holds the module name only. Ticks never sit on a band: a primary tick on a primary ground cannot be seen.
8. The first line of the card body holds the module tick, "Everything in Invoices", and the module's see-amounts tick where the module has one (section 26.7), naming what it covers: "See amounts (cost, rates)".
9. The module tick is ticked when every permission in the module is ticked, partly ticked when some are, and unticked when none are. Ticking it ticks every unticked permission at its starting scope (section 40.4 rule 4); permissions already ticked keep their scope. Unticking it clears the whole module, see amounts included.

**The table**

10. Rows are the module's sections; columns are the module's actions, in the catalogue's order, with short names: "View", "Add", "Edit", "Delete", "Approve", "Export" (section 37). A cell for an action its section does not have is empty: no tick, no dash. It is not a disabled tick, because no one can ever tick it, and a disabled control would need a reason.
11. The Section column is the row spine (TableRowHeader, section 34.3): tinted, body strong, frozen. It starts with a row tick that is ticked, partly ticked or unticked across that section's actions, and behaves like the module tick for one row. A ticked row is a value, not a selection, so the row takes no selected tint.
12. Each cell is a tick box, with its scope beside it once ticked (section 40.4).
13. The permission that manages access is never offered on an ordinary role. The module holding it appears only on the system role.
14. **The system role's editor is read-only.** Every permission is ticked at All, every tick is disabled, scopes are plain text, there is no Save, and one neutral banner sits above the first module card: "This role always holds every permission, in every module, at All. It cannot be changed."

**Keyboard**

15. Tab moves through the ticks and scope choices in reading order. Space ticks (section 39.2). Enter or Space on a scope opens its menu. The grid does not use the spreadsheet movement of section 39.6: its cells are controls, not text fields.

Component: permission-grid.tsx (pending, section 4.1). It renders one module. The page owns the whole role, the cross-module Picks and the one Save.

### 40.4 Scope on a tick

1. A ticked cell shows its scope beside the tick as an inline choice (sections 6.7 and 40.3): the scope's label in primary-text, underlined, with the 12px chevron, 8px (space-2) from the tick. An unticked cell shows the tick alone.
2. Scope is chosen per tick, never per row or per module. "View all, edit own" is the most common shape a role takes.
3. The choice offers only the scopes that section can honour (backend kit section 3.4), in the order of the table above. Where a section offers one scope, the scope is plain text beside the tick, not a choice.
4. **A new tick starts at the narrowest scope.** That is Own wherever the section offers it, otherwise the only scope it offers. The administrator widens it on purpose. A tick never starts at All because All is convenient, and ticking again after unticking starts at the narrowest scope again. This is least privilege: a mistake that gives too little is noticed and fixed; one that gives too much is not.
5. Every action column is col-scope wide (section 17.1), so a column never changes width as scopes change and the scope label never truncates. col-scope is measured on "Selected units" and re-measured for the product's own unit word (section 0.1 item 8).
6. A scope's screen-reader label names the permission: "Scope for approve invoices".

### 40.5 Picks

Some permissions need Pick on another section, so the person can choose from that list on a form: adding an invoice needs Pick on clients. The catalogue in code says which.

1. **Pick has no column and no tick.** It is not something an administrator grants on its own.
2. **Picks follow the ticks.** Ticking a permission adds the Picks it needs, at that permission's scope or at the wider scope the catalogue fixes. When no ticked permission needs a Pick any longer, it goes.
3. **They are never added silently.** A row whose ticked permissions bring in Picks shows one line under the section name in its row spine, in label style: "Also includes: pick clients, pick price lists". Label style, not meta: text-muted fails contrast on the primary-subtle spine (section 2.3).
4. A list everyone may pick from (the catalogue's pick-for-everyone) is never mentioned.
5. Every Pick a person holds is listed in full, with what it is for, on What they can do (section 40.9).

### 40.6 People list (the People tab)

A list page (section 11.1).

1. Columns: Name (TableRowLink), Roles (free width, truncates), Selected units (free width, truncates), Status (col-status), row actions (col-actions). Below 1024px Selected units is secondary and hides (section 10 rule 4). The column header uses the product's unit word: "Selected branches".
2. **Roles** lists every role they hold, comma separated, job roles first, then add-on roles, each alphabetical. It truncates (section 8), with the full list in the tooltip and on the person's page, so the tooltip is never the only source. Never a count pill: section 6.8's count is for controls, not cells. A person with no roles reads "No roles".
3. **Selected units** summarises the units ticked on their page. Where units are grouped, by group: "North: all 6 · East: 2". Otherwise as a count: "4 branches".
   - If none of their roles uses the Selected units scope: "Not used by their roles", in text-muted.
   - If a role uses it and no unit is ticked: a warning badge, "None chosen". Their Selected units permissions then reach nothing, which is almost always a mistake.
4. **Status**: Active (success) or Inactive (neutral).
5. Filters (section 27.3): Role, Status, the unit group where there is one, and "Selected units: none chosen". The Role filter is what the Roles list's People link sets.
6. Row actions: Edit access, What they can do (opens that tab for this person), Deactivate or Activate.
7. Deactivating a person is reversible: it happens at once, with an Undo toast (section 38.1): "Rakesh Mehta deactivated. Their access ends on their next request."
8. Units nobody covers are reported in the list banner (section 40.8).
9. Adding a person and editing their own details belong to the product's people screens, not to Access. **Add person** appears here only if the product has no other place for it, and then it is the one primary button.

### 40.7 A person's access page

Opened from a People row. A form page with a fixed footer and one Save, like the role editor (section 40.3 rule 4).

**The page**

1. The record header holds the person's name, their Active or Inactive badge, and a meta line: who they report to, and the units they lead. "What they can do" is a secondary button that opens that tab for this person. The three-dot menu holds Deactivate (or Activate) and "View access history" (the History tab filtered to this person).
2. Save is "Save access". The toast: "Rakesh Mehta's access saved. It applies from their next request."
3. Removing your own access to these screens, by removing the role that gives it, is allowed while someone else can still manage access, but asks first in an alert dialog: "Remove your own access to these screens?" "You will no longer be able to manage roles or people. Someone else who can will have to give it back." Buttons: "Keep my access" and "Remove my access".

**Roles card**

4. One row per role held: the role name, the scopes that role uses in text-secondary, and a quiet remove icon button (x, tooltip "Remove role"). Job roles first, then add-on roles.
5. Below the rows, a picker of the roles not yet held (section 16.3) and a secondary **Add role** button beside it. Adding or removing changes the form, not the record, until Save.
6. Roles only add up. Nothing on this page grants or removes a single permission; only roles do.

**Selected units card, and the unit picker**

7. Shown only when at least one held role uses the Selected units scope. Otherwise one line replaces it: "None of their roles uses selected branches." Ticked units are kept, not cleared, in case such a role is added back.
8. The first line says which roles use it, and the count: "Used by Office accountant. 8 of 48 branches selected."
9. **Every unit is shown, unpaginated** (the section 1 rule 7 exception): paging would split a group and hide ticks. The page owns the scroll; the card never scrolls on its own (section 10).
10. **Search appears above 50 units.** At 50 or fewer, the list alone is quicker to scan than a search box. Above 50, a search box sits above the list and filters units by name, as section 27.1 describes. Ticks hidden by the search stay ticked.
11. **Groups, where the product groups its units.** Units sit under their group. Each group row has a tick that is ticked, partly ticked or unticked across its units, with "6 of 6" beside it. Ticking it ticks every unit in the group, and any unit can then be unticked on its own. What is stored is the units, never the group, so a unit added to the group later is not ticked. While a search is active, the group tick acts only on the units shown, and its label says so: "Tick the 2 shown". Groups start expanded and collapse instantly, never with an animated height (section 5.6 rule 1).
12. Units sit as tick boxes in a wrapping grid: 4 columns at 1280, 3 at 1024, 2 at 768 (section 9). Names truncate (section 8).
13. Units the person leads, which they see without being ticked, are listed at the foot of the card as text, with "(set on each unit)". They are not ticks here, because they are changed on the unit.
14. Deactivated units are not listed.
15. If a product's units could grow into the hundreds, this pattern needs agreeing again (section 30) before it is built.

Component: unit-picker.tsx (pending, section 4.1).

### 40.8 Units nobody covers

A new unit is not given to anyone automatically. Until someone covers it, its records are seen only by people with All scope.

1. While any active unit is uncovered, the People tab shows the list banner of section 11.1 zone 1b, in warning: "3 branches have nobody covering them: North yard, East depot, Plant 7." Past three names: "…and 4 more."
2. Its one action, **Review branches**, opens the product's units list filtered to the uncovered units, where a lead can be named or a person opened to tick it.
3. What "covered" means is decided by the server and sent as a list.

### 40.9 What they can do (the third tab)

A read-only view of one person's real access: every permission they hold, its scope, and which role gave it.

1. The toolbar holds one control: the person, chosen with the picker of section 16.3. The chosen person is in the URL, so the view can be linked to and the People row action opens it directly. With nobody chosen, the area shows section 13's nothing-yet state: "Choose a person to see what they can do."
2. **Edit access** is a secondary button that opens their access page. There is no primary button: this view changes nothing.
3. A summary under the toolbar: name and status badge, their roles in one line, their selected units in the form of section 40.6 rule 3, the units they lead, and the size of their team.
4. One panel card per module **where they hold at least one permission**, in catalogue order. After the last card, one line in text-secondary names the modules where they hold nothing: "No access to: Payroll, Stock." Absence is stated, not left to be inferred.
5. Each card's first line states see amounts, where the module has it: "Sees amounts: yes, from Office accountant" or "Sees amounts: no".
6. The table has the columns Section (the row spine, named once per group of rows), Action, Scope and From. It is not paginated: its rows are the code catalogue, which only a release changes (the section 1 rule 7 exception).
7. **Scope is the combined reach.** Scopes from several roles add up, so they are listed together: "Team, Selected branches". All replaces the rest: never "Own, All".
8. **From** names every role that grants the permission, each with its own scope where they differ: "Office accountant (Own), + Invoice approver (All)". This is how an administrator answers "why can they do this?".
9. **Picks are listed in full**, as rows with the action "Pick" and what they are for: "All, for add invoices".
10. An inactive person's view carries a neutral banner: "Rakesh Mehta is inactive, so none of this applies until they are activated." The table still shows what would apply.
11. Workflow rules (for example, that a creator cannot approve their own record) are not permissions and are not listed. One line under the summary says so: "Some actions also depend on the record itself, such as who raised it."

### 40.10 Access history (the fourth tab)

Every access change across the product, newest first. A record's own history (section 38.2) is unchanged; this is a separate list because access changes belong to no single record.

1. A list page (section 11.1). 25 rows per page. Default sort: newest first, and When is the only sortable column.
2. Columns: When (col-datetime, the section 18 date and time, never "2 hours ago"), Changed by, Affected (a person's name, or "Role: " and the role's name), Change (a one-line summary, free width, truncates).
3. One summary form per kind of change: "Role added: + Invoice approver", "Role removed: …", "3 permissions changed", "Branches: 2 added, 1 removed", "Lead changed", "Reports to changed", "Deactivated", "Activated", "Role created", "Role deleted".
4. Names show as they were at the time of the change. A role renamed or deleted since keeps its old name here.
5. Filters (section 27.3): Changed by, Affected person, Affected role, Kind of change, and the date range presets of section 27.4. Search covers the names of people and roles.
6. Clicking a row opens a sheet (sheet.tsx, from the right) with the full change: who, when and whom, then **Before** and **After** for each changed item, each line marked with the plus or minus icon and the words "Added" or "Removed". No status colours: a removal is not a failure.
7. Nobody can edit, delete or undo an entry. There are no tick boxes and no row actions, and the sheet has no button but Close.
8. A person's page links here filtered to that person (section 40.7 rule 1), with the filter showing as a chip. There is no second history list.

### 40.11 Someone must always be able to manage access

The server refuses to remove or deactivate the last person who can manage access. The screens show that before anyone tries, using section 15.1. The server sends, with each person, whether they are that last person.

1. On the last holder's row and page, Deactivate is disabled with the reason: "Rakesh Mehta is the only person who can manage access. Give that to someone else first."
2. On their page, removing the role that gives that access is disabled with the same reason.
3. The server checks regardless (section 26). If it refuses anyway, for example because two people acted at once, the refusal is an error toast with the same sentence, and the person's state reloads.
4. The words name what the person can do, not a role (section 26.2).

### 40.12 Checks before an access screen is done

1. Load every screen as someone who can manage access and as someone who cannot. The second sees no Access item, and gets the no-access page on every Access address.
2. Throttle the network and load a screen with permission-gated buttons: they show disabled without a reason, then settle, without moving (section 26.1).
3. In the role editor: tick a permission that needs a Pick. The "Also includes" line appears under its row. Untick it: the line goes. A new tick starts at the narrowest scope.
4. Tick a group of units, untick one, save, reload: the group reads partly ticked and the count is right.
5. With one person able to manage access, try every way to remove it: row action and person page. Each is disabled with its reason before the server is reached.
6. Section 9 widths: 1280, 1024 and 768. The permission grid scrolls sideways inside its card, the Section column stays frozen, the columns do not change width as scopes change, and the page never scrolls sideways.
