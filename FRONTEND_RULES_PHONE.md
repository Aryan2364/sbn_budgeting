# Design and Build Rules: Phone

Part of the rules in FRONTEND_RULES.md (see its section 0.3). That file's rules apply here too, and section numbers match across all the files.

Read this file completely before building or changing anything that shows on a phone. On phone screens, its rules win over FRONTEND_RULES.md wherever they differ.

## 41. Phone

Phones get their own layout, designed for the work people do away from a desk: adding and updating records, comments, approvals and rejections, notifications, finding a record, and short reports. Planning and analysis stay on the computer.

Everything in sections 1 to 40 applies on phones unless this section says otherwise. Where it does, this section wins, on phone screens only.

### 41.1 What the phone is for

| On phone | How it works there |
|---|---|
| Add and edit records | One-column form, Save fixed at the bottom (section 41.7) |
| Comments and messages | On a screen of their own, with the message box above the keyboard (section 41.6 rule 5) |
| Everything waiting on me | My work, the phone's home (section 41.15) |
| Approve and reject | Buttons fixed at the bottom of the record, or several at once from a list (section 41.6) |
| Notifications | A screen of their own, and phone notifications once installed (section 41.12) |
| Find and open a record | A searchable list of rows (section 41.5) |
| Dashboards and reports | Headline figures, one chart and short lists (section 41.10) |
| Personal settings | Profile, password, notification choices, sign out (section 41.18) |
| Photos, scanning, check-in, signatures | When a feature needs them (section 41.16) |

| Changes shape on phone | Becomes |
|---|---|
| List table and card grid | A list of rows (section 41.5) |
| Board (section 35) | A list of one status at a time, moved with "Move to" (section 41.5) |
| Report table (section 34) | Row names and one measure at a time (section 41.10) |
| Detail page tabs (section 11.2 zone 4) | One row per related list, each opening that list (section 41.6) |

Stays on the computer: Gantt charts and other timelines, the data entry grid (section 31), bulk selection except approve and reject (sections 22, 41.6), the access screens (section 40), organisation settings (section 11.5), and any report built for analysis (section 41.10 rule 4).

Rules:

1. Each product lists every screen in its plan.md under one of these three groups before building its phone screens. A screen not listed stays on the computer.
2. A new screen is placed in a group when it is agreed, not after it is built.
3. A computer-only screen opened on a phone shows the page of section 41.11, never a squeezed desktop layout.

**Less, not squeezed**

A desktop screen has room for a lot. A phone screen does not, and a phone screen that tries to hold everything is hard to use. The phone screen holds what the person needs for the task in hand, and nothing more.

4. A phone screen is designed from the task, not copied from the desktop screen. Start from one question: what does the person open this screen to do on a phone? The screen holds what that needs.
5. "Make the phone screen of this desktop screen" is a request to decide what belongs on the phone, not to fit everything in. Before building, sort every element of the desktop screen into three groups: **on the screen**, **one tap away** (a row that opens it, the three-dot menu, a sheet) and **computer only**. Show that list to the owner, and build only once it is agreed. It is recorded in plan.md with the screen.
6. Limits for one phone screen, as maximums, not targets: one primary action; two buttons in the action bar; two icon buttons in the app bar; four key facts on a record; three lines and two supporting facts in a list row; one chart on a report screen; five tabs.
7. What does not make the cut goes one tap away, or stays on the computer. It is never made to fit by smaller text, tighter spacing, placing things side by side, a sideways scroll, or extra tabs.
8. When it is not clear whether something is essential on the phone, ask. Never settle the doubt by including it.
9. This applies to the owner's requests too. When a request would crowd a phone screen (past rule 6's limits, or by any means rule 7 rules out), say so plainly before building: name what would have to move one tap away, and propose the lighter screen. Build the crowded version only if the owner, having heard this, still confirms it, and record the exception and its reason in plan.md.

### 41.2 Which layout a device gets

1. The phone layout is used when the screen's shorter side is under 600px and its main pointer is touch. A computer with display scaling, whose screen reports a small size, keeps the desktop layout. Turning a phone sideways does not switch it to the desktop layout. A tablet, and a narrow browser window on a computer, keep the desktop layout and section 9.
2. One function decides this: useLayout() in lib/layout.ts, returning "phone" or "desktop". It also returns the width band (desktop, laptop, tablet, narrow). No other code measures the screen; useBoardAvailable (section 4.1) asks it.
3. The server makes the first guess from the browser's mobile hint (Sec-CH-UA-Mobile, or the user agent where the browser sends no hint, as Safari does) and sets data-layout on the html element, so the first paint is already the right layout and the phone token values (section 41.9) apply from the start. The browser confirms on load. Where the guess was wrong (a foldable, a small tablet), it swaps once and saves the measured answer in a cookie the server reads from then on. Apart from that one correction, a screen never paints one layout and then swaps. A device whose shorter side changes mid-use, such as a foldable being unfolded, switches layout then, keeping the screen and anything typed. Any cache in front of the pages keeps a separate copy per layout.
4. **Same address, both layouts.** A link from a notification, WhatsApp or email opens the same record on any device. There are no separate phone addresses (no /m/…).
5. **Phone-only addresses on desktop.** My work and Notifications are list pages on desktop too (section 11.1). Personal settings open the settings page at the matching section. More and the phone search page have no desktop form; their addresses open the dashboard. A large dialog that becomes a screen on phone (section 41.8 rule 10) keeps its address, which on desktop opens the page beneath with the dialog open.

### 41.3 One product, two layouts

The phone is a second layout of the same product, not a second product.

1. **Shared, written once:** data fetching, permissions (section 26) and the record's own answers (section 26.5), validation, the formatters (section 18), the status-to-colour map (section 2.4), the words (section 37), and the backend.
2. **Different per layout:** the arrangement only. A form has one set of fields, in one order, with one set of labels and one validation (section 4 rule 1); the phone shows them in one column.
3. **No business rule lives in a screen or component.** A rule such as "a creator cannot approve their own record" comes from the server or lib/. A native app later (section 41.19) then rebuilds only the screens, and everything shared carries over.
4. A component used in both layouts gains a phone variant through useLayout(). It is never copied (section 4 rule 4).

### 41.4 The phone shell

Replaces section 12 on phone.

```
┌──────────────────────────────┐ ← phone's status bar (clock, battery), primary behind it
│ ‹   Invoice INV-2041      ⋯  │ ← app bar, primary
├──────────────────────────────┤
│                              │
│   content, surface-sunken    │
│                              │
├──────────────────────────────┤
│ My work  Clients  Tasks   More│ ← tab bar, top-level screens only
└──────────────────────────────┘ ← phone's navigation bar area
```

**App bar**

1. 56px tall (--spacing-topbar) plus the top safe area (section 41.13), filled primary, at --z-shell. It is the outermost band (section 36.4) of every phone screen, so every other header on the phone (card, sheet, popover) takes the accent form. The app bar sits beside the content, not around it, so the phone shell sets the band depth to one around the content and around every sheet it opens: it renders BandScope (header-band.tsx), and a nested header reads the depth through useBandLevel (section 36.4). The app bar and tab bar are fixed at 56px and do not grow with the text-size setting. Their labels stay on one line and truncate. This is the one exception to control heights being minimums. Their text is fixed in px too, so the bar title, the tab labels and the bar's text buttons (Select, section 41.6 rule 14) never grow with the text-size setting. This falls short of WCAG 1.4.4 (resize text) and is accepted knowingly: larger text would not fit the bars' fixed 56px. Everything else on the screen grows (section 41.9 rule 7).
2. Left: the back arrow on screens below the top level (rule 6). Nothing on top-level screens, except the close button of select mode (section 41.6 rule 15).
3. Then the page title: 20px, weight 500, on-brand, one line, truncated. It is the screen's one page title (section 3 rule 3).
4. Right: at most two icon buttons, in the on-brand variant (section 6.3.2), from the phone icon set (section 41.9 rule 9), or one text button such as Select (section 41.6 rule 14). The back arrow on the left does not count toward the two. On My work, Select replaces search while the Approvals chip is chosen.
5. On top-level screens, one of the two may be search, which opens a full-screen search page. It replaces Ctrl+K and command.tsx on phone. Before anything is typed, the search page lists the last 10 records the person opened, newest first.

**Back** (the phone exception to section 1 rule 11 and section 11.2)

6. Every screen below the top level has a back arrow (chevron-left) at the far left of the app bar, with the screen-reader label "Back".
7. It returns to the previous screen in the app. Where there is none, because the screen was opened from a notification or a link, it goes to the screen's parent in the structure: the level the breadcrumb would show above it. The parent of a screen opened from a row in More is More.
8. Breadcrumbs are not shown on phone. The back arrow and the title replace them.
9. Android's back button or gesture first closes any open sheet, menu or keyboard (each open sheet adds a history entry so this works), then goes to the previous screen in the app. On an open alert dialog, Android back presses its Cancel (section 24 rule 3), so the page is never left under an open confirmation. Inside a sheet with steps (section 41.8 rule 9), it returns to the previous step first. On a screen opened straight from a notification or a link there is no previous screen, and Android back leaves the app; the back arrow still goes to the parent (rule 7).
10. iPhone's swipe from the left edge goes back in the store app (Capacitor's back-swipe setting, section 41.19). An installed web app on iPhone has no system swipe-back, so there the arrow is the way back. Never build a home-made swipe-back gesture; it fights the browser and the system. The swipes the app does use (sheets, toasts, notification rows, photos, pull to refresh) are ignored when they start within 24px of a side edge, which belongs to the phone's own back gesture.

**Tab bar**

11. Shown on top-level screens only. Screens below the top level hide it, leaving the bottom of the screen for the action bar (section 41.6) and the keyboard.
12. 56px plus the bottom safe area, surface fill, a 1px border-light line on top, at --z-shell. No shadow (section 5.4 rule 2). The app bar and tab bar are fixed at 56px and do not grow with the text-size setting. Their labels stay on one line and truncate. This is the one exception to control heights being minimums. The tab labels stay at a fixed size, the trade-off recorded in rule 1.
13. Two to five tabs, of equal width. Tabs a person cannot use are not shown (rule 17), and the bar is never padded to make up a number. Each is a 22px icon over a 12px label at weight 500. Every tab has a visible label; never icons alone.
14. Active: icon and label in primary-text. Resting: text-secondary. Pressed: surface-control fill. No hover state.
15. The first tab is always **My work** (section 41.15) and the last is always **More**. More lists the product's other phone screens, personal settings (section 41.18), the install option (section 41.12) and Sign out. The tabs between are the product's own (section 0.1 item 4): the screens people open most, such as Notifications.
16. A tab may carry a count (section 6.8) at the top right of its icon. Over 99 shows "99+".
17. Tabs carry permissions like sidebar items (section 12.1): a tab the user cannot use is not rendered, and More lists only what they can open.
18. Tapping the active tab scrolls its screen back to the top.
19. The tab bar hides while the keyboard is open.

**Content area**

20. 16px (space-4) padding at the sides, plus the side safe areas, and 16px above the first block. No maximum width.

**Section tabs and the loading bar**

21. Section tabs (section 33) sit directly under the app bar, full width, the tabs sharing it equally, each label truncated to one line. Four at most (section 33.5).
22. The loading bar of section 5.6 runs directly under the app bar.

**First paint**

23. A screen below the top level gives its title, parent and actions through PageHeader (components/shell/page-header.tsx), which draws its app bar on the server, so the first paint already has the back arrow and no tab bar. A loading.tsx or Suspense skeleton for such a screen includes the screen's PageHeader. Without it, the shell's fallback app bar and the tab bar paint first, then change.
24. The :has rules in globals.css that read data-fixed-bottom and the page's app bar assume a route that is not showing is not kept in the page. Next's cacheComponents keeps hidden routes in the page, where they would still match: a hidden detail page's app bar would still hide the tab bar. A product that turns cacheComponents on re-checks these rules first.

### 41.5 Lists on phone

Replaces section 11.1 on phone. Card view and the view switcher are not used; rows replace both.

**The screen, top to bottom**

1. App bar: the list's name as the title.
2. The search field, full width, with the search keyboard. It runs 300ms after typing stops and at once on the keyboard's search key (section 27.1).
3. One line: the count on the left ("148 clients"), Filter and Sort on the right as secondary buttons. Filter carries its count (section 6.8) when filters are active.
4. The list banner, if any (section 11.1 zone 1b, section 41.8 rule 15).
5. Active filter chips in one row that scrolls sideways (section 1 rule 8 allows it).
6. The rows.

Only the app bar and tab bar stay fixed. Search, the count line, the banner and the chips scroll away with the rows, and slide back in on a small scroll up, so the rows get the screen.

**Add**

7. Where the person may add, the add action is a round primary button, 56px, at the bottom right, 16px above the tab bar and in from the side, plus the safe areas, showing the plus icon, with the screen-reader label naming it: "Add client". It is the screen's one primary action. It sits within thumb reach because adding is the most common phone task. The last row stays clear of it: the list ends with 88px of space. It hides while the keyboard is open and in select mode (section 41.6 rule 14).

**Rows**

8. Edge to edge (the content area's side padding does not apply to the list) on surface, a 1px border-light line between rows, at least 64px tall, 12px (space-3) padding top and bottom, 16px at the sides.
9. Line 1: the record's name in body strong, up to two lines, with its status badge on the right.
10. Line 2: up to two supporting facts in label style, one line, truncated; the full values are on the record. An amount sits on the right of this line, right-aligned.
11. Line 3, optional: one meta line, such as the date or the owner.
12. The whole row opens the record. Its pressed state is a surface-control fill.
13. No tick boxes, no three-dot menu and no swipe actions on rows. Every action is taken on the record. Swipes and small menus on a moving list cause accidental approvals and deletions. Two exceptions: tick boxes in an approval list's select mode (section 41.6 rule 14), and the swipe that marks a notification read (section 41.12 rule 6).

**Loading more**

14. 25 rows first. The next 25 load as the user nears the end, with skeleton rows while they arrive. The count line always shows the true total.
15. After 200 rows, loading stops and one line says so: "Showing 200 of 1,480. Search or filter to find the rest." This keeps low-cost phones smooth, and replaces pagination (section 11.1.1) on phone.
16. Pulling down at the top reloads the list, with the loading bar of section 5.6 under the app bar and no spinner. The browser's own pull-to-refresh, which reloads the whole page, is turned off.
17. Opening a record and coming back keeps the scroll position, search, filters and sort (section 27.3).

**Filter and sort**

18. Filter opens a bottom sheet (section 41.8) holding every filter, with "Clear all" on the left of its footer and a primary "Show 12 results" on the right. The number follows the filters as they change.
19. Sort opens a bottom sheet of choices, one tick.

**A board on phone**

20. A list whose records have a board (section 35) shows one status at a time, or all of them. A row of status chips sits above the rows, starting with "All" and its true count, then in the board's column order, each with its true count: "New 12", "Quoted 8", "Won 3". The row scrolls sideways when it does not fit.
21. The chosen chip is primary-subtle with a primary-border edge and primary-text at weight 500, like a date preset (section 27.4). The rest are surface with a border. The choice is remembered.
22. A record is moved with "Move to" on the record, in its three-dot menu, or in its action bar when moving is its main action. The move is the same onMove as the board, optimistic and reverted on failure (section 35.6). There is no dragging on phone.

### 41.6 Records and approvals on phone

Replaces section 11.2 on phone.

1. App bar: back arrow, the record's name as the title, and the three-dot menu on the right for every action not in the action bar.
2. At the top of the content: the record's full name in card heading style, wrapping rather than truncating, then the status badges, then the meta line, then the **key facts**: up to four fields each record type names as its most important (for an invoice: client, amount, due date, owner), in a grid two wide, label above value. The rest of the record follows.
3. One column: the main content first, then what the summary sidebar holds on desktop.
4. Label-value pairs stack, label above value, as in a form.
5. Related records (section 11.2 zone 4) are one row each, "Invoices · 4" with a chevron, opening that list filtered to this record. Activity and comments show on the record itself, newest first, 10 at a time with "Show more", up to 100. Past that, one line says older activity is on the computer. The record holds no message box: "Add comment" at the top of the comments opens a comments screen, with the message box fixed at the bottom above the keyboard and the action bar hidden. The message box grows with its text up to 5 lines, then scrolls inside itself (section 41.7 rule 11). Back returns to the record.
6. Text wraps (section 8). Nothing on a record page truncates; the record is where the full text lives.

**The action bar**

7. The record's main actions sit in a bar fixed at the bottom of the screen: surface fill, a 1px border-light line on top, 12px (space-3) padding, plus the bottom safe area.
8. At most two buttons, sharing the width equally: the primary on the right, the other on the left as secondary. Example: "Reject" and "Approve". One action takes the full width.
9. A record with no main action has no action bar. An action the user cannot take follows section 26: disabled, with its reason on tap (section 41.8 rule 17).

**Approve and reject**

10. Approve happens at once, with the Undo toast (section 38.1). In the store app, a light vibration confirms it (section 41.9 rule 13).
11. Reject opens a bottom sheet for the reason, where the product requires one. Its primary button names the action: "Reject invoice".
12. Approving or rejecting from a list of pending items returns the user to that list, with the item gone and the Undo toast showing.
13. If someone else acted on the record first, the server refuses (section 26.5 rule 5): an error toast with its reason, then the record reloads.

**Approving several at once**

14. A list of items waiting for approval, including My work's approvals (section 41.15), has **Select** in the app bar; on My work, only while its Approvals chip is chosen. It puts a tick box on every row, and tapping a row then ticks it instead of opening it.
15. In select mode the tab bar hides, and the app bar shows the count, "5 selected", with a close button (x) on the left to leave select mode. The action bar shows "Reject" and "Approve 5".
16. At most 50 at once. A row the person cannot approve cannot be ticked: its tick box is disabled, with the reason on tap. Once 50 are ticked, the other tick boxes disable, with the reason "50 is the most at once".
17. Approve applies to all of them at once, with one Undo toast for all: "5 requests approved". Reject asks once for a reason, which applies to all.
18. Items someone else acted on first are left as they are, stay in the list with a warning badge naming what happened ("Approved by Suresh Patel") until the list is reloaded, and are counted in the toast: "4 approved. 1 skipped, marked in the list." The toast never carries what the list does not show (section 25).
19. Select mode is only for approve and reject. Every other bulk action stays on the computer (section 22).

### 41.7 Forms on phone

Replaces section 11.3 rules 5, 7 and 8, and section 17, on phone.

1. One column. Every field runs the full width of the content area. Section 17's spans and its 480px cap do not apply.
2. Labels above fields, required asterisks, section names and validation on leaving a field are unchanged (section 11.3).
3. Every form, whatever its length, is a screen of its own and saves from the action bar (section 41.6 rules 7 and 8): one full-width primary button, "Save client". Cancel is the back arrow, and the unsaved-changes warning (section 11.3 rule 10) still applies.
4. While the keyboard is open, the action bar sits directly above it, so Save is always in reach. The field being typed in scrolls into view above the bar.
5. Each field asks for the right keyboard, and the keyboard's Enter key says what it does (inputmode, type, enterkeyhint and autocomplete):

| Field | Keyboard | Enter key |
|---|---|---|
| Amount, quantity, percentage | Numbers with a decimal point | Next; Done on the last field |
| PIN code | Numbers | Next; Done on the last field |
| Phone number | Phone keypad | Next; Done on the last field |
| Email | Email keyboard | Next; Done on the last field |
| Other single-line text | Normal, with autocomplete | Next; Done on the last field |
| Long text | Normal | New line |
| Search | Search keyboard | Search |

6. On phone, Enter in a single-line field moves to the next field, and on the last field closes the keyboard. It never saves, whether the keyboard is on screen or attached. Saving is always the Save button. In a comment or message box, Enter makes a new line and the send button sends. The last field is the last single-line field: a long-text field is never the last field, and Enter never moves into one, so on the field before a long-text field that ends the form, Enter closes the keyboard. Sign-in is exempt, because it is not a record form: Enter in the email field moves to the password field, and Enter in the password, mobile number or OTP field submits that step (its key reads Go).
7. Select, searchable-select and multi-select open as bottom sheets (section 41.8). Section 16.3's limits stay.
8. Dates and times use the phone's own picker (section 41.9 rule 10).
9. Wherever images are accepted, the upload area (section 29) offers "Take photo" as well as choosing a file. There is no drag and drop on phone.
10. A tick box, radio or switch sits in a row at least 48px tall, and tapping anywhere on the row, label included, changes it.
11. A long-text field grows as the person types. It never scrolls inside itself; the page scrolls (section 1 rule 8). The one exception is the message box on a comments screen (section 41.6 rule 5). It is fixed above the keyboard, not inside the page's scroll, so it grows with its text up to 5 lines, then scrolls inside itself; grown further, it would cover the comments.

**Drafts**

12. What is typed into a form is kept on the phone as it is typed. A phone call, switching to another app, or the browser closing never loses it.
13. Opening the form again offers the draft back, with a banner: "You have an unsaved draft from 3:45 PM." It has two buttons, "Use draft" and "Discard", and no close button. These two buttons are the one exception to section 7.5 rule 1's single action.
14. On an edit form, if the record was changed after the draft was started, the draft is not offered. The banner says instead: "Your draft from 3:45 PM was not used, because Suresh Patel changed this record at 4:10 PM." This banner closes like any other, and the draft is deleted.
15. A draft is deleted once the form is saved or the draft discarded, after 7 days, and when the person signs out. It is kept for that person, form and record only, and never holds a password. Choosing "Leave" in the unsaved-changes warning (section 11.3 rule 10) discards it.

**Repeating rows**

16. Repeating rows in a form, such as an invoice's line items, show as a list of rows, each summarising one line (item, quantity, amount), with the total below. Tapping a row opens it as its own screen to edit, with Save in its action bar and Remove in its three-dot menu. "Add item" adds a line. Read-only tables inside a record show the same way, without editing.

**Focus on opening**

17. On phone, no screen puts a field in focus when it opens, so the keyboard never covers the screen unasked. The one exception is the search page (41.4 rule 5).

### 41.8 Sheets, menus and messages on phone

**Bottom sheets** are for choices, menus, filters, confirmations and a single short field, such as a reject reason. A dialog that holds a form becomes its own screen on phone (section 41.7 rule 3). Bottom sheets replace these on phone: other dialogs (section 24), select lists and dropdown menus (section 16), the three-dot menu, popovers, the filter panel, and the date range picker.

1. Built on sheet.tsx with side="bottom" (section 4.1).
2. Slides up from the bottom, full width, with a 12px radius on its top corners only, --shadow-dialog, over --backdrop.
3. A drag handle at the top, 32 by 4px in border, centred.
4. Height grows with content up to 90% of the screen minus the top safe area. While the keyboard is open, a sheet with a field sits directly above it, using the same hook as the fixed bars (section 41.13 rule 6), and shrinks to fit the space left. Beyond that the body scrolls, with header and footer fixed (section 24 rule 6).
5. Closes on a swipe down, a tap on the backdrop, Android back, or its close button. A swipe to close starts on the drag handle or the header, never in the scrolling body, so scrolling the body never closes the sheet. Confirmations close only through their buttons (section 24 rule 3). The unsaved-changes warning applies (section 11.3 rule 10).
6. Header: the title, in the accent form (section 41.4 rule 1). Footer: the buttons share its full width, primary on the right, plus the bottom safe area.
7. Rows in a list or menu sheet are 48px tall. Selected is primary-subtle with a tick, as section 16.2.
8. A searchable list opens the sheet at full height, with the search box fixed at the top, so the keyboard never covers the list. It takes the full height when it opens as a step inside a sheet (rule 9) too.
9. A choice inside a sheet, such as a select among filters, opens inside the same sheet, replacing its content, with a back arrow in the sheet header to return. Never a sheet on top of a sheet (section 24 rule 4).
10. On phone, a dialog's size decides its form, and the caller never chooses: a small dialog (confirmations, one short field) becomes a bottom sheet; a medium or large dialog becomes a full-screen layer with the app bar and a back arrow, which Android back closes. It keeps an address only where the product gave it one (section 41.2 rule 5).

**Alert dialog**

11. Stays a centred dialog on phone, the screen width minus 32px, its two buttons side by side, Cancel on the left. It never closes on a swipe or the backdrop (section 24 rule 3).

**Toasts** (replaces section 25's position and width on phone)

12. At the bottom, centred, the screen width minus 32px, above the tab bar or action bar. Held sideways, toasts stay inside the centred 600px column (section 41.13 rule 10).
13. One at a time, with two exceptions. A new toast replaces the one showing, unless that one is an error or an Undo toast: an error stays until closed, and an Undo toast is never replaced before its 10 seconds are up (section 38.1). The new toast then shows with it, one above the other, two at most. While an error and an Undo toast both show, a new confirmation or warning is not shown (section 25: a toast never carries anything that is not elsewhere). An Undo toast closes early only when a newer Undo toast replaces it, since only the latest change is undone from a toast, or when two newer errors stand in front of it; an older error waits hidden until one in front closes.
14. A sideways swipe dismisses it, as well as its close button. Durations are unchanged.

**Banners** (section 7.5 on phone)

15. A page banner may wrap to two lines, then truncates. Its action is a button styled as a standing text link (section 6.6 rule 5), on its own line below the text, and its close button sits top right.

**Tooltips** (section 19 on phone)

16. A phone has no hover, so there are no hover tooltips.
17. The one tooltip on phone is the reason a control is disabled (permission-tooltip.tsx). It opens on tap and closes on the next tap anywhere.
18. So nothing on phone depends on a tooltip. Icon-only buttons use only the phone icon set (section 41.9 rule 9), and text cut short is either clamped to two lines or shown in full one tap away.

**Focus in sheets**

19. On phone, a sheet takes focus itself when it opens, never a field inside it, so the keyboard stays closed until the person taps a field.

### 41.9 Touch, size and type

**No hover**

1. Every hover style sits inside @media (hover: hover), so it never sticks after a tap. On phone, the pressed state is the feedback.

**Sizes** (replaces section 6.2 and section 9 rule 4 on phone)

2. Every button size (small, default and large), inputs, select triggers and tabs are at least 44px tall on phone, visibly. Icon buttons are 44 by 44px. An icon button inside a field is 36 by 36px.
3. These are token values under the phone layout (section 41.2 rule 3), not per-component classes (section 3 rule 8).
4. Controls sit at least 8px (space-2) apart.

**Type** (token values under the phone layout)

| Slot | Desktop | Phone |
|---|---|---|
| Page title (in the app bar) | 30px | 20px |
| Section heading | 20px | 18px |
| Card heading | 16px | 16px |
| Body, body strong | 14px | 16px |
| Label | 13px | 14px |
| Meta | 12px | 12px |
| Text inside any field | 14px | 16px |

5. Text inside a field is never below 16px: anything smaller makes iPhone zoom in when the field is tapped.
6. Weights and colours are unchanged. Display (section 3) is not used on phone.
7. **Large text.** Sizes are in rem, so they grow with the phone's text-size setting. iPhone ignores that setting for rem unless the html element first takes the system body font (font: -apple-system-body) before Geist is set, so the phone layout does that. With the system body font, 1rem is 17px on iPhone at the default text size, so phone sizes come out about 6% larger on iPhone than the table says. This is accepted. At the largest setting text wraps rather than clips, and controls grow taller to fit it: on phone, every control height in this file is a minimum. Zooming is never blocked: no maximum-scale and no user-scalable=no in the viewport. Spacing stays in px on phone, so it does not grow with the text-size setting. Only type and control heights grow.

**Icons**

8. 22px in the app bar and tab bar. Elsewhere, section 23.
9. An icon-only button on phone uses only these icons, whose meaning needs no tooltip: back (chevron-left), close (x), more (ellipsis), add (plus), search (search), and show and hide (eye, eye-off) inside a password field. One drawn mark joins them: the dot on a notification row that marks it read or unread (section 41.12 rule 6). It is not a Lucide icon: a filled dot in primary while the row is unread, a hollow dot with a border outline once it is read. Its screen-reader label states the action: "Mark as read" or "Mark as unread". Everything else carries a visible text label. Each still has a screen-reader label.

**Dates and times**

10. Date and time fields open the phone's own picker (the wheel on iPhone, the calendar on Android) from the phone's own date or time field, laid transparent on top of the product's own field, so the tap lands on it. On top, not behind, is the only arrangement that opens the picker on every phone. The product's field shows the value as DD Mon YYYY and h:mm A (section 18), never the phone's format. The picker itself follows the phone's language and clock setting; it is the one place the phone's own format shows. Typed entry (section 20.1) and the 15-minute step (section 20.2) do not apply on phone.
11. Date ranges (section 27.4): the presets in a bottom sheet. "Custom range" asks for a start date and an end date, each with the phone's picker.

**Platform behaviour, not platform looks**

12. The product looks the same on iPhone and Android: the brand and these rules. It behaves the way each phone does: back (section 41.4), the system pickers (rule 10), the phone's share sheet ("Share" in a record's three-dot menu shares its link), the right keyboards (section 41.7), bottom sheets, and pull to refresh.
13. In the store app (section 41.19), approve, reject and each record's other main actions give one light vibration. Nothing else vibrates.

### 41.10 Dashboards and reports on phone

Phone reports answer one question per screen: "What is waiting for me?", "How much did we collect this month?"

1. **Dashboard** (section 11.4): the four tiles two to a row, then the main chart full width, then the items needing attention, then recent activity. Tiles still open their list.
2. **Charts** keep section 21. A chart that cannot be read at 320px wide is replaced on phone by its figures as a list.
3. **Report tables** (section 34) show the row names and one measure, chosen with the selector of section 34.4 above the table. The total row stays pinned at the bottom. Nothing scrolls sideways.
4. A report built for analysis (several measures side by side, pivots, exports) stays on the computer.
5. Every phone report states its period, chosen from the date presets in a bottom sheet (section 41.9 rule 11).

### 41.11 Computer-only screens

1. A computer-only screen opened on a phone shows a page built from empty-state.tsx, variant desktop-only, inside the phone shell:
   - Icon: monitor.
   - Heading: "This screen works on a computer"
   - Line: "Open it on a computer to use it. This link opens the same screen there."
   - Primary: "Share link", which opens the phone's share sheet so they can send it to themselves. Where the browser has no share sheet, it reads "Copy link" and copies the address. Secondary: "Go to home".
2. Computer-only screens never appear in the tab bar or in More.
3. Phone screens do not link to computer-only screens.

### 41.12 Notifications and installing

**Notifications**

1. On phone, notifications are a screen, as a tab or in More, not the bell panel of section 7.4. Its rows, the unread dot, and opening the item on tap follow section 7.4. "Mark all as read" sits in the app bar's three-dot menu. A row's text clamps at two lines with no "Show more" (section 8); the full text is on the item the row opens.
2. Notifications also arrive as phone notifications wherever the phone allows it: on Android in the browser or installed, on iPhone only once installed (rule 5). Each says what happened, and tapping it opens the same address as the in-app notification.
3. A phone notification shows on the lock screen, so it never carries amounts or private details. It names the event: "Invoice INV-2041 is waiting for your approval."
4. Permission to send notifications is asked only when it is useful, never on first open: the first time the person does something they would want to hear back about, such as submitting for approval. A short sheet says why, then the phone asks its own question. A no on the app's own sheet means it is offered again only in Notification choices (section 41.18). A no to the phone's own question cannot be asked again by the app, so Notification choices then explains how to allow notifications in the phone's settings.
5. On iPhone, a web app can send phone notifications only once it is installed on the home screen.
6. A sideways swipe on a notification row marks it read, or unread if it was read. It is the one swipe on a row (section 41.5 rule 13). It does nothing else, and swiping again reverses it, so it needs no Undo. The unread dot does the same on a tap: it is a 44px target, labelled "Mark as read" or "Mark as unread" for screen readers, so nothing depends on the swipe.

**Installing**

7. The app installs on the home screen as a progressive web app: its own icon and name, opening without the browser bar while keeping the phone's status bar (display "standalone", never "fullscreen"), held upright on Android. iPhone ignores the upright setting.
8. The install option lives in More only, never as a pop-up, and is hidden once the app is installed. In Chrome-based browsers on Android it uses the browser's own install prompt. Elsewhere it opens a sheet with the browser's own steps: on iPhone, tap Share, then "Add to Home Screen". Install is offered on phones only. A tablet or computer in the desktop layout is not offered it: the install tags (the manifest link, theme-color, iPhone's web-app tags and the home screen icon) are sent only when the server guesses phone (section 41.2 rule 3).
9. The install settings are each product's own (section 0.1 item 9): the app name, a short name of 12 characters or fewer, and icons (192px, 512px, and a maskable icon with the mark inside its safe circle). Four values follow the brand: the theme colour (primary), the background colour (surface), the colour of the mark on the icon (primary-foreground) and the iPhone status-bar setting (section 41.13 rule 4). All four sit in lib/install-settings.ts and are edited with the brand block (section 0.1 item 1). The colours cannot read a token, so they are the one place outside globals.css that holds a colour value (section 1 rule 1).
10. Being installed changes nothing about how screens look, except that the app now owns the space behind the phone's bars (section 41.13).

### 41.13 Different phones

Phones differ in width, in the bars at the top and bottom, and in notches and camera holes. Every phone screen adapts to all of them.

**Safe areas**

1. The viewport covers the whole screen (viewport-fit=cover), and the space each phone reserves is read from its safe-area insets (env(safe-area-inset-*)), through tokens in globals.css.
2. The app bar is padded by the top inset; the tab bar, action bar, sheets and toasts by the bottom inset; the content area and every bar and sheet by the side insets, which matter when a phone with a notch is turned sideways. While the keyboard is open, the bottom inset is 0, so bars sit directly on the keyboard.
3. A phone with gesture navigation reports a thin bottom inset, one with three buttons a taller one, and one with neither reports none. The layout uses what is reported and never assumes a size.
4. The phone's status bar sits on primary. On Android this comes from the theme-color tag, and the clock and icons are light on a dark brand and dark on a light brand. On iPhone, a dark brand uses the black-translucent status bar setting: the bar shows primary with light icons. A light brand uses the default setting: a white bar with dark icons above the app bar, because black-translucent would put light icons on a light colour. The theme-color tag is part of the install settings (section 41.12 rule 9).

**Height**

5. Screen heights use the visible height (dvh), never 100vh, so the browser bar sliding away or the keyboard opening never cuts content off or leaves a gap.
6. On Android the keyboard shrinks the visible area (interactive-widget=resizes-content in the viewport). iPhone ignores that setting, so there the visible area is measured (VisualViewport) to place fixed bars above the keyboard and to know when it is open (section 41.7 rule 4, section 41.4 rule 19). One shared hook does this for both.

**Width**

7. Designed for 360 to 430px. At 320px everything still works cleanly: nothing overflows, clips or overlaps. Section 9 rules 2 and 3 apply.

**Rotation**

8. **The phone is upright only.** No phone screen is designed for sideways use, including signature and chart views. A task that needs a wide screen is computer work (section 41.1). The one exception is viewing a photo or a PDF (rule 11).
9. The app is locked upright wherever the phone allows it: the installed app on Android (the install settings, section 41.12 rule 9) and the store app on both phones (section 41.19).
10. The phone browser and the installed app on iPhone cannot be locked. There, a sideways phone keeps the phone layout (section 41.2 rule 1), with the content in a centred column no wider than 600px. The app bar, tab bar and action bar stay full width. Nothing breaks, overlaps or stretches. There is never a "rotate your phone" cover.
11. **Photos and PDFs may turn sideways.** The full-screen photo viewer (section 41.16 rule 6) follows the phone's rotation and fills the whole screen, not the 600px column. Where the app is locked upright, the viewer lifts the lock while it is open and restores it on close: in the store app through Capacitor's screen orientation plugin, and in the installed Android app by opening the viewer in full screen and calling screen.orientation.lock("any"), then lock("portrait") on close. unlock() would only return to the upright setting. If the phone refuses, the viewer stays upright with pinch to zoom. PDFs open in the phone's own viewer (section 41.16 rule 18), which turns with the phone by itself.

**Dark mode**

12. Dark mode is deferred (section 28). The phone layout uses the light theme only (color-scheme: only light), whatever the phone's own setting, including Android's automatic dark mode.

### 41.14 Speed and connection

**Speed on low-cost phones**

1. The yardstick is a low-cost Android phone, around ₹10,000 with 4 GB of memory, on 4G. Never a laptop's phone preview.
2. Budgets:
   - A screen change shows its skeleton at once and its content within 1 second.
   - The installed app is usable within 3 seconds of opening.
   - A phone screen sends under 250 KB of compressed script, everything it needs included.
   - Scrolling a list shows no visible stutter.
   - A tap shows its pressed state immediately.
3. Heavy libraries load only on the screens that use them; charts, for one, load only where a chart shows.
4. No blur effects and no page-change animations on phone. Motion is section 5.6's list, with sheets sliding at --duration-slow.
5. Images are sized for the phone before they are sent, never shrunk by the browser.

**Connection**

6. When the connection drops, a neutral banner shows above the content: "You are offline. Changes cannot be saved until you are back online." It goes when the connection returns. It explains (section 7.5 rule 4) and outranks every other banner while it shows, because nothing else can be fixed offline.

7. A dropped connection never loses what was typed. A failed save keeps the form exactly as it was, with an error toast (cause, then next action), so the person can press Save again.
8. Working fully offline, saving now and sending later, is not built. A product that needs it agrees it first (section 30).

**Opening offline and new versions**

9. A service worker keeps the installed app's styles, scripts and fonts cached, with an offline screen. Pages are never cached, because they are private and change. So the installed app opened without a connection shows the offline screen, never the browser's error page: a static app bar with the product name, the offline banner (rule 6) and "Try again". It has no back arrow and no tab bar, because each needs the network.
10. Moving to a screen not yet loaded while offline shows the failed empty state (section 13) with "Try again", inside the shell.
11. When a new release is ready, a neutral banner says "A new version is ready", with a "Reload" button. It never shows on a form with unsaved changes; it waits until the person leaves the form. It can be closed, and comes back on the next opening of the app.

### 41.15 My work, the phone's home

1. The first tab of every product's phone layout is **My work**: everything waiting on this person, from every module, in one list, built on the phone list (section 41.5), so it loads 25 at a time and stops at 200. A product's dashboard, where it has one, is another tab or sits in More.
2. It holds only items that need this person's action: approvals waiting for them, tasks assigned to them, requests returned to them, items due or overdue. An item leaves the list once it is done.
3. The server builds the list. Each module declares what it puts there.
4. Order: overdue first, then due soonest, then newest.
5. Filter chips above the list, one per kind, with counts: "All 14", "Approvals 6", "Tasks 8". They follow section 41.5 rules 20 and 21.
6. Each row (section 41.5 rules 8 to 12) says what is needed, then the record: line 1 "Approve leave request", line 2 "Rakesh Mehta · 3 days", line 3 who sent it and when. Due soon and Overdue show as badges (section 2.4).
7. Tapping a row opens the record, with its action bar ready.
8. The My work tab carries the count of items waiting (section 6.8). The count is refreshed when My work opens, and again after each action the person takes, such as approving, so it never counts an item already done.
9. With nothing waiting, it shows the heading "Nothing is waiting for you" and the line "New approvals and tasks will appear here." It has no action button: there is nothing to create. This is empty-state.tsx's nothing-waiting variant, and it applies on both layouts, because My work is a list page on desktop too (section 41.2 rule 5). A list of approvals with nothing waiting uses the same variant, with its own heading and line, and no action either. These are the one exception to section 13's action.

### 41.16 Phone features

Products add these only when a feature request needs them. Each is built once, as a shared component, the first time it is needed, and added to section 4.1 in the same commit. The rules below apply from the first use.

**Asking the phone for permission** (camera, location, microphone; notifications follow section 41.12 rule 4)

1. Only at the moment of use, after the person taps the control that needs it. Never on opening the app.
2. One line first says why: "To take a photo of the bill, allow the camera."
3. If refused, the feature says how to allow it in the phone's settings, and offers the other way where there is one: choose a photo instead of taking one, type the code instead of scanning it.

**The features**

| Feature | How it works | Web app | Store app |
|---|---|---|---|
| Photos | Take one or more photos for a record, or choose from the gallery (section 41.7 rule 9) | Yes | Yes |
| Barcode and QR scanning | Fill a field by scanning | Partly (rule 8) | Yes |
| Location check-in | Record where and when the person was | Yes | Yes |
| Directions | Open an address in the phone's map app | Yes | Yes |
| Signature | Sign on the screen with a finger | Yes | Yes |
| Voice notes | Record a short note for a record | Yes | Yes |
| Reading a card or document | Fill fields from a photo, such as a business card | Yes | Yes |
| Contact actions | Call, WhatsApp, email or map from a record | Yes | Yes |
| Vibration | Confirm main actions (section 41.9 rule 13) | No | Yes |

**Photos**

4. Photos are shrunk on the phone before upload, to at most 1600px on the long side, so uploads are quick on mobile data.
5. Each photo shows as a thumbnail with its own progress, and a failed one retries on its own up to three times, then shows Retry (section 29).
6. Tapping a thumbnail opens it full screen, with pinch to zoom and a swipe to the next photo. It turns sideways with the phone (section 41.13 rule 11).

**Barcode and QR scanning**

7. Opens a full-screen camera view with a frame to aim at, and a "Type it instead" link. A read code fills the field, the scanner closes, and in the store app the phone vibrates once.
8. The web app uses the browser's built-in code reader where it has one (Android Chrome). iPhone's browser has none, so a scanning library is needed there; it is a new package and is agreed first (section 1 rule 10).

**Location check-in**

9. "Check in" records the place, the time and how accurate the reading was, at the moment it is tapped. "Check out" does the same.
10. Before saving, the person sees the address found. If the reading is less accurate than 100 metres, the screen says so.
11. Location is read only when the person taps. It is never tracked continuously or in the background. Background tracking needs the store app and is agreed first (section 30).

**Directions**

12. An address on a record opens the phone's own map app with directions to it. A map drawn inside the app needs a map library, a new package, agreed first.

**Signature**

13. A full-width box to sign in with a finger, with "Clear" and "Done". The signer's name and the date and time are printed under the saved signature.
14. A saved signature is never edited. A new one replaces it, and the change is in the history (section 38.2).

**Voice notes**

15. Up to 2 minutes. The person can play it back before attaching it. It is attached to the record like a file (section 29).

**Reading a card or document**

16. The photo is read on the server. Every field it fills is shown for checking before saving. Nothing read from a photo is saved without the person seeing it.

**Contact actions**

17. Tapping a phone number on a record opens a small sheet: Call, WhatsApp, Copy number. An email address opens the phone's mail app. An address opens directions (rule 12). A website opens the browser.

**Attachments**

18. Images open full screen, as rule 6. PDFs and other files open in a new window, in the phone's own viewer, which the person closes to return. In the installed app on iPhone, files are offered through the share sheet instead (Save to Files, WhatsApp), because a file opened inside the installed app can leave no way back.

### 41.17 Signing in on phone

The sign-in methods are set in section 11.7. On phone:

1. A strip across the top holds the product mark and name on primary, padded by the top safe area. The brand panel's headline and supporting line are not shown.
2. The form runs the full width of the content area. Its fields and its 44px button run the full width of the form.
3. Fields carry the right autocomplete values, so the phone's password manager and the code from the SMS fill in by themselves.
4. **Staying signed in.** On phone, a person stays signed in until they sign out, or until the app has not been used for 30 days. Signing in again on a phone is slow and annoying, so it is asked for rarely.
5. In the store app, a product may offer fingerprint or face unlock to open the app. It is set up once from personal settings and never replaces signing in for the first time.

### 41.18 Personal settings on phone

1. One screen of rows, grouped under labels, each opening its own screen: Profile, Password (where the product signs in with one) and Notification choices. The Notifications screen of section 41.12 rule 1 keeps its own name. Install app and Sign out live in More only (section 41.4 rule 15). The app's version sits at the foot in meta style.
2. Each screen that needs saving has its own Save in the action bar, as each card has on desktop (section 11.5).
3. Notification choices are switches, one per kind of notification, and save the moment they change (section 4.1, switch.tsx).
4. Organisation settings stay on the computer (section 41.1).

### 41.19 From web app to store app

1. **First release:** the web app, installable (section 41.12).
2. **Next:** the same code wrapped in Capacitor for the Play Store and App Store. Capacitor is a new package, added only when agreed (section 1 rule 10). The store app adds iPhone's swipe back, the confirming vibration and native phone notifications. Apple sometimes refuses apps that are only a website; these features make the difference.
3. **Only if needed:** a fully native app, in React Native with Expo, built only when the web version fails a check of section 41.20 in a way the web version cannot fix. Only the screens are rebuilt; everything in section 41.3 rule 1 carries over.
4. The decision is made from testing on real phones, and recorded in the product's plan.md.

### 41.20 Checks before a phone screen is done

Every phone screen passes these on real phones. A pass in a browser's phone preview catches layout problems early, but it is not a pass.

**On these phones**

1. A 320px-wide phone, a common Android phone (360px), an iPhone with a notch (390px), and a large phone (430px).
2. On Android, once with gesture navigation and once with three buttons.
3. Once installed on the home screen, and once in the browser.
4. Once with the largest text-size setting.

**Check**

5. Nothing sits under the status bar, notch, camera hole or navigation bar.
6. At 320px nothing overflows, and the page never scrolls sideways.
7. Tap a field: iPhone does not zoom, the field stays in view, and Save stays in reach above the keyboard.
8. Android back closes an open sheet first, then goes back a screen. The back arrow works on a screen opened straight from a notification.
9. Every tap target is at least 44 by 44px. A smaller visible control counts when its invisible tap area reaches 44px.
10. No hover style stays stuck after a tap.
11. On the low-cost Android phone, the budgets of section 41.14 rule 2 hold.
12. Turn off the connection, fill in a form and press Save: the offline banner shows, everything typed is kept, and Save works once back online.
13. Open a computer-only screen's address: the page of section 41.11 shows.
14. Fill in half a form, switch to another app, close the browser, then open the form again: the draft is offered back.
15. In select mode, approve three items, one of them already approved elsewhere: the toast counts it ("2 approved. 1 skipped, marked in the list."), the list marks it, the other two are approved, and Undo restores both.
16. Refuse each permission a feature asks for: the screen says how to allow it, and offers the other way.
17. Sign in with a mobile number: the phone offers the OTP from the SMS.
18. Check every screen in the product's own language: nothing clipped, especially the marks above and below letters (section 37.6).
19. In the installed app on iPhone, open an attached PDF and come back to the record.
20. Open the installed app with no connection: the offline screen shows (section 41.14 rule 9), with the app bar holding the product name, the offline banner and "Try again", not the browser's error page.
21. The screen's sorted list (section 41.1 rule 5) is in plan.md, and the screen is within the limits of section 41.1 rule 6, or its exception is recorded there.
22. Turn the phone sideways in the browser and in the installed app on iPhone: the content stays in a centred column and nothing breaks.
23. In the installed Android app, open a photo and turn the phone: the photo turns and fills the screen. Close it: the app is upright and locked again. Open a PDF and turn the phone: it turns.
24. Run the main tasks once with TalkBack on Android and once with VoiceOver on iPhone: every control is announced by name, and nothing needs a swipe.
