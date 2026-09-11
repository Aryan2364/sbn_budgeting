"use client"

import * as React from "react"
import {
  CheckIcon,
  CircleAlertIcon,
  DownloadIcon,
  FilterIcon,
  IndianRupeeIcon,
  OctagonXIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Banner,
  BannerAction,
  BannerDescription,
  BannerTitle,
} from "@/components/ui/banner"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Clamp, Truncate } from "@/components/ui/truncate"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { InlineFieldError } from "@/components/ui/inline-field-error"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationBar,
  PaginationContent,
  PaginationCount,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/sonner"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { TimePicker, type TimeValue } from "@/components/ui/time-picker"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  formatAmount,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/format"

/* -------------------------------------------------------------------
   Page scaffolding local to this reference page. Nothing here is a
   product component; product screens use the section 11 templates.
   ------------------------------------------------------------------- */

/** Section 18, rendered from the real utilities rather than restated. */
const SAMPLE_MOMENT = new Date(2026, 7, 12, 15, 45)

const FORMAT_EXAMPLES = [
  {
    label: "Currency",
    call: "formatCurrency(420000n)",
    output: formatCurrency(420000n),
  },
  {
    label: "Currency, large",
    call: "formatCurrency(124568000n)",
    output: formatCurrency(124568000n),
  },
  {
    label: "Currency, negative",
    call: "formatCurrency(-1550050n)",
    output: formatCurrency(-1550050n),
  },
  {
    label: "Amount",
    call: "formatAmount(420000n)",
    output: formatAmount(420000n),
  },
  {
    label: "Number",
    call: "formatNumber(1245680)",
    output: formatNumber(1245680),
  },
  {
    label: "Percentage",
    call: "formatPercent(12.35)",
    output: formatPercent(12.35),
  },
  {
    label: "Percentage, negative",
    call: "formatPercent(-4.05)",
    output: formatPercent(-4.05),
  },
  {
    label: "Date",
    call: "formatDate(...)",
    output: formatDate(SAMPLE_MOMENT),
  },
  {
    label: "Date and time",
    call: "formatDateTime(...)",
    output: formatDateTime(SAMPLE_MOMENT),
  },
  {
    label: "Absent value",
    call: "formatCurrency(null)",
    output: formatCurrency(null),
  },
]

function Section({
  n,
  title,
  note,
  children,
}: {
  n: string
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="text-section font-medium text-text-primary">
        <span className="text-text-muted">{n}. </span>
        {title}
      </h2>
      {note ? (
        <p className="mt-2 max-w-[70ch] text-body text-text-secondary">{note}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-meta text-text-muted">{children}</p>
}

/**
 * One column of the state matrix. `force` replays hover, pressed and
 * focus through the [data-force] rules in globals.css, so all four
 * states plus the focus ring are visible at once without a pointer or
 * the keyboard being on any of them.
 */
function StateCell({
  state,
  children,
}: {
  state: "resting" | "hover" | "pressed" | "disabled" | "focus"
  children: React.ReactNode
}) {
  const forced = state === "hover" || state === "pressed" || state === "focus"
  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta text-text-muted">{state}</p>
      <div data-force={forced ? state : undefined}>{children}</div>
    </div>
  )
}

const STATES = ["resting", "hover", "pressed", "disabled", "focus"] as const

function StateMatrix({
  label,
  render,
}: {
  label: string
  render: (state: (typeof STATES)[number]) => React.ReactNode
}) {
  return (
    <div className="border-b border-border-light py-4 last:border-b-0">
      <p className="text-label text-text-secondary">{label}</p>
      <div className="mt-3 flex flex-wrap items-start gap-8">
        {STATES.map((s) => (
          <StateCell key={s} state={s}>
            {render(s)}
          </StateCell>
        ))}
      </div>
    </div>
  )
}

const COLOUR_GROUPS: {
  group: string
  tokens: { name: string; className: string; onDark?: boolean }[]
}[] = [
  {
    group: "Brand",
    tokens: [
      { name: "primary", className: "bg-primary", onDark: true },
      { name: "primary-hover", className: "bg-primary-hover", onDark: true },
      { name: "primary-pressed", className: "bg-primary-pressed", onDark: true },
      { name: "primary-ring", className: "bg-primary-ring", onDark: true },
      { name: "primary-subtle", className: "bg-primary-subtle" },
      { name: "primary-border", className: "bg-primary-border" },
    ],
  },
  {
    group: "Surfaces and lines",
    tokens: [
      { name: "surface", className: "bg-surface" },
      { name: "surface-sunken", className: "bg-surface-sunken" },
      { name: "surface-control", className: "bg-surface-control" },
      { name: "border", className: "bg-border" },
      { name: "border-light", className: "bg-border-light" },
      { name: "border-strong", className: "bg-border-strong" },
    ],
  },
  {
    group: "Status",
    tokens: [
      { name: "success", className: "bg-success", onDark: true },
      { name: "success-bg", className: "bg-success-bg" },
      { name: "warning", className: "bg-warning", onDark: true },
      { name: "warning-bg", className: "bg-warning-bg" },
      { name: "danger", className: "bg-danger", onDark: true },
      { name: "danger-bg", className: "bg-danger-bg" },
    ],
  },
  {
    group: "Charts",
    tokens: [
      { name: "chart-1", className: "bg-chart-1", onDark: true },
      { name: "chart-2", className: "bg-chart-2", onDark: true },
      { name: "chart-3", className: "bg-chart-3", onDark: true },
      { name: "chart-4", className: "bg-chart-4", onDark: true },
      { name: "chart-5", className: "bg-chart-5" },
      { name: "chart-6", className: "bg-chart-6", onDark: true },
    ],
  },
]

const TYPE_SLOTS = [
  { slot: "Page title", className: "text-page-title font-medium text-text-primary" },
  { slot: "Section heading", className: "text-section font-medium text-text-primary" },
  { slot: "Card heading", className: "text-card-heading font-medium text-text-primary" },
  { slot: "Body", className: "text-body text-text-primary" },
  { slot: "Body strong", className: "text-body font-medium text-text-primary" },
  { slot: "Label", className: "text-label text-text-secondary" },
  { slot: "Meta", className: "text-meta text-text-muted" },
]

const SPACING_STEPS = [
  { token: "space-1", className: "w-1" },
  { token: "space-2", className: "w-2" },
  { token: "space-3", className: "w-3" },
  { token: "space-4", className: "w-4" },
  { token: "space-6", className: "w-6" },
  { token: "space-8", className: "w-8" },
  { token: "space-12", className: "w-12" },
]

const LOCATIONS = {
  rampur: "Rampur",
  kheda: "Kheda",
  bharuch: "Bharuch",
  navsari: "Navsari",
}

/** Twelve, to exercise the section 16.2 scroll cap and the 16.3 search box. */
const DISTRICTS = {
  ahmedabad: "Ahmedabad",
  amreli: "Amreli",
  anand: "Anand",
  ankleshwar: "Ankleshwar",
  banaskantha: "Banaskantha",
  bharuch: "Bharuch",
  bhavnagar: "Bhavnagar",
  dahod: "Dahod",
  gandhinagar: "Gandhinagar",
  jamnagar: "Jamnagar",
  junagadh: "Junagadh",
  kheda: "Kheda",
  mehsana: "Mehsana",
  navsari: "Navsari",
  panchmahal: "Panchmahal",
  rajkot: "Rajkot",
}

/* Counts and money as they are actually stored - a plain integer and
   bigint paise - so the table runs through lib/format.ts rather than
   hand-writing the strings the formatter exists to produce. */
const SITES = [
  { site: "Rampur North", project: "Green Belt", trees: 5000, budget: 170000000n, status: "success" as const },
  { site: "Rampur South", project: "Green Belt", trees: 3200, budget: 108800000n, status: "warning" as const },
  { site: "Kheda Block C", project: "Riverbank", trees: 1450, budget: 49300000n, status: "danger" as const },
]

const LONG_SITE_NAME =
  "Rampur North Riverbank Compensatory Plantation Block C Extension"

export default function KitchenSinkPage() {
  const [date, setDate] = React.useState<Date | undefined>(
    new Date(2026, 7, 12)
  )
  const [time, setTime] = React.useState<TimeValue | undefined>({
    hour: 9,
    minute: 30,
    meridiem: "AM",
  })
  const [district, setDistrict] = React.useState<string | undefined>("kheda")

  return (
    <main className="mx-auto w-full max-w-content-max p-6">
      <header>
        <h1 className="text-page-title font-medium text-text-primary">
          Kitchen sink
        </h1>
        <p className="mt-2 text-label text-text-secondary">
          Every primitive in every state. This page is the reference for
          what the components do, not a product screen.
        </p>
      </header>

      <div className="mt-12">
        {/* ---------------------------------------------------------- */}
        <Section
          n="1"
          title="Colour tokens"
          note="Named by job, never by value. Every one resolves to a variable in globals.css, which is the only file that contains a colour. Change the brand there and this whole page follows."
        >
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {COLOUR_GROUPS.map((g) => (
              <div key={g.group}>
                <p className="text-label text-text-secondary">{g.group}</p>
                <div className="mt-3 overflow-hidden rounded-xl border border-border-light">
                  {g.tokens.map((t) => (
                    <div
                      key={t.name}
                      className={`flex h-9 items-center px-3 text-meta ${t.className} ${
                        t.onDark ? "text-primary-foreground" : "text-text-primary"
                      }`}
                    >
                      {t.name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Caption>
            Status colours never change when the brand colour changes. There
            is deliberately no blue information colour; neutral grey carries
            informational content.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="2"
          title="Type scale"
          note="Two weights exist, 400 and 500. If a heading is not standing out enough, add space around it rather than weight. Labels are always text-secondary; a label in text-primary reads as body text and the hierarchy collapses."
        >
          <div className="overflow-hidden rounded-xl border border-border-light bg-surface">
            {TYPE_SLOTS.map((t) => (
              <div
                key={t.slot}
                className="flex items-baseline gap-6 border-b border-border-light px-4 py-3 last:border-b-0"
              >
                <span className="w-36 shrink-0 text-meta text-text-muted">
                  {t.slot}
                </span>
                <span className={t.className}>Rampur North plantation site</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="3"
          title="Spacing scale"
          note="Only these steps exist. There is no space-5, space-7 or space-9. If 16 feels too small and 24 too big, the answer is one of those two, never 20."
        >
          <div className="rounded-xl border border-border-light bg-surface p-4">
            {SPACING_STEPS.map((s) => (
              <div key={s.token} className="flex items-center gap-4 py-1">
                <span className="w-24 shrink-0 text-meta text-text-muted">
                  {s.token}
                </span>
                <span className={`h-3 bg-primary-subtle ${s.className}`} />
              </div>
            ))}
          </div>
          <Caption>
            Space belongs above an element, not below, so a heading stays
            attached to its own content instead of floating between two
            blocks.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="4"
          title="State matrix"
          note="Section 6.4: every interactive element defines four states, and keyboard focus shows a visible ring in primary-ring. Hover, pressed and focus are replayed here through [data-force] rules scoped to this page, so all five columns are visible at once without a pointer sitting on any of them."
        >
          <div className="rounded-xl border border-border-light bg-surface px-4">
            <StateMatrix
              label="Button, primary"
              render={(s) => <Button disabled={s === "disabled"}>Save site</Button>}
            />
            <StateMatrix
              label="Button, secondary"
              render={(s) => (
                <Button variant="secondary" disabled={s === "disabled"}>
                  Cancel
                </Button>
              )}
            />
            <StateMatrix
              label="Button, ghost"
              render={(s) => (
                <Button variant="ghost" disabled={s === "disabled"}>
                  Toolbar action
                </Button>
              )}
            />
            <StateMatrix
              label="Button, danger"
              render={(s) => (
                <Button variant="danger" disabled={s === "disabled"}>
                  Delete site
                </Button>
              )}
            />
            <StateMatrix
              label="Icon button, 36x36"
              render={(s) => (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit site"
                  disabled={s === "disabled"}
                >
                  <PencilIcon />
                </Button>
              )}
            />
            <StateMatrix
              label="Input"
              render={(s) => (
                <Input
                  className="w-44"
                  defaultValue="Rampur North"
                  disabled={s === "disabled"}
                />
              )}
            />
            <StateMatrix
              label="Select trigger"
              render={(s) => (
                <Select defaultValue="rampur" items={LOCATIONS} disabled={s === "disabled"}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rampur">Rampur</SelectItem>
                    <SelectItem value="kheda">Kheda</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <StateMatrix
              label="Tick box"
              render={(s) => (
                <Checkbox defaultChecked disabled={s === "disabled"} aria-label="Select" />
              )}
            />
            <StateMatrix
              label="Radio"
              render={(s) => (
                <RadioGroup defaultValue="a">
                  <RadioGroupItem value="a" disabled={s === "disabled"} aria-label="Option" />
                </RadioGroup>
              )}
            />
            <StateMatrix
              label="Switch"
              render={(s) => (
                <Switch defaultChecked disabled={s === "disabled"} aria-label="Toggle" />
              )}
            />
          </div>
          <Caption>
            The disabled column reduces contrast and removes the pointer
            cursor. The focus column is the ring a keyboard user sees; it is
            never removed.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="5"
          title="Buttons in use"
          note="Exactly one primary button per screen or dialog; everything else is secondary. Ghost keeps a fill and a border, because a control the user cannot see is a control is broken."
        >
          <Row>
            <Button>
              <PlusIcon />
              New project
            </Button>
            <Button variant="secondary">
              <DownloadIcon />
              Download
            </Button>
            <Button variant="secondary">
              <FilterIcon />
              Filter
              <Badge variant="primary">2</Badge>
            </Button>
          </Row>
          <Caption>Icons are 16px in a button and sit 4px from their label.</Caption>

          <div className="mt-6">
            <Row>
              <Button size="sm">Small, 32px</Button>
              <Button>Default, 36px</Button>
              <Button size="lg">Large, 40px</Button>
            </Row>
            <Caption>
              Height is fixed. Width grows with the label; height never does.
            </Caption>
          </div>

          <div className="mt-6">
            <Row>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon" aria-label="Edit site" />}
                >
                  <PencilIcon />
                </TooltipTrigger>
                <TooltipContent>Edit site</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon-sm" aria-label="Search" />}
                >
                  <SearchIcon />
                </TooltipTrigger>
                <TooltipContent>Search</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="primary" size="icon" aria-label="Add row" />}
                >
                  <PlusIcon />
                </TooltipTrigger>
                <TooltipContent>Add row</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="danger" size="icon" aria-label="Delete row" />}
                >
                  <TrashIcon />
                </TooltipTrigger>
                <TooltipContent>Delete row</TooltipContent>
              </Tooltip>
            </Row>
            <Caption>
              Every icon-only button carries a hidden text label and a tooltip.
              An icon alone is a guess. Hover one to see the tooltip.
            </Caption>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="6"
          title="Badges and avatars"
          note="Status is always a badge, never plain coloured text. Every status badge carries an icon as well as a colour, because colour alone is invisible to colour-blind users."
        >
          <Row>
            <Badge variant="success">
              <CheckIcon />
              Completed
            </Badge>
            <Badge variant="warning">
              <TriangleAlertIcon />
              Needs review
            </Badge>
            <Badge variant="danger">
              <OctagonXIcon />
              Over budget
            </Badge>
            <Badge>Draft</Badge>
            <Badge variant="primary">12</Badge>
          </Row>
          <Caption>
            Neutral is the default: a notification or a count is neither
            success nor failure.
          </Caption>
          <div className="mt-6">
            <Row>
              <Avatar size="sm">
                <AvatarFallback>SR</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>AJ</AvatarFallback>
              </Avatar>
              <Avatar size="lg">
                <AvatarFallback>RM</AvatarFallback>
              </Avatar>
            </Row>
            <Caption>Initials only. No images are loaded in this system yet.</Caption>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="7"
          title="Fields"
          note="A field is as wide as the data it holds. Labels sit above the field, never beside it and never as placeholder text. Placeholder text shows an example format only."
        >
          <div className="rounded-xl border border-border-light bg-surface p-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-6">
                <Label htmlFor="ks-site" required>
                  Site name
                </Label>
                <Input id="ks-site" className="mt-1.5" defaultValue="Rampur North" />
              </div>
              <div className="col-span-12 sm:col-span-4">
                <Label htmlFor="ks-date">Date of expense</Label>
                <div className="mt-1.5">
                  <DatePicker id="ks-date" value={date} onValueChange={setDate} />
                </div>
              </div>
              <div className="col-span-12 sm:col-span-3">
                <Label htmlFor="ks-time">Time</Label>
                <div className="mt-1.5">
                  <TimePicker id="ks-time" value={time} onValueChange={setTime} />
                </div>
              </div>
              <div className="col-span-12 sm:col-span-3">
                <Label htmlFor="ks-trees">Number of trees</Label>
                <Input id="ks-trees" className="mt-1.5 text-right" defaultValue="5,000" />
              </div>
              <div className="col-span-12 sm:col-span-3">
                <Label htmlFor="ks-amount">Amount</Label>
                <div className="mt-1.5">
                  <InputGroup>
                    <InputGroupAddon>
                      <IndianRupeeIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="ks-amount"
                      defaultValue="4,200.00"
                      className="text-right"
                    />
                  </InputGroup>
                </div>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <Label htmlFor="ks-invalid">Bill number</Label>
                <Input id="ks-invalid" className="mt-1.5" defaultValue="—" aria-invalid />
                <InlineFieldError>
                  Enter the bill number printed on the voucher, like
                  RGB/2026/114.
                </InlineFieldError>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <Label htmlFor="ks-disabled">Project</Label>
                <Input
                  id="ks-disabled"
                  className="mt-1.5"
                  defaultValue="Green Belt"
                  disabled
                />
              </div>
              <div className="col-span-12">
                <Label htmlFor="ks-notes">Remarks</Label>
                <Textarea
                  id="ks-notes"
                  className="mt-1.5"
                  placeholder="Anything the next person needs to know"
                />
              </div>
            </div>
          </div>
          <Caption>
            3 columns for an amount, a quantity or a time, 4 for a date or a
            short dropdown, 6 for a name, 12 for anything free-form. Error
            text states the cause, then the next action.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="8"
          title="Date and time pickers"
          note="Both accept typed entry as well as selection. Forcing someone to click through a calendar for a date they already know is slow. The week starts on Monday, today is outlined and the selected day is filled with primary. Minutes step in 15s and there are no seconds."
        >
          <div className="flex flex-wrap items-start gap-8">
            <div className="w-56">
              <Label htmlFor="ks-date-2">Date, 4 columns</Label>
              <div className="mt-1.5">
                <DatePicker id="ks-date-2" value={date} onValueChange={setDate} />
              </div>
            </div>
            <div className="w-40">
              <Label htmlFor="ks-time-2">Time, 3 columns</Label>
              <div className="mt-1.5">
                <TimePicker id="ks-time-2" value={time} onValueChange={setTime} />
              </div>
            </div>
            <div>
              <p className="text-label text-text-secondary">Calendar, on its own</p>
              <div className="mt-1.5">
                <Popover>
                  <PopoverTrigger
                    render={<Button variant="secondary">Open the calendar</Button>}
                  />
                  <PopoverContent align="start" className="w-auto p-2">
                    <Calendar mode="single" selected={date} onSelect={setDate} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <Caption>
            Type &quot;9:20&quot; into the time field and it snaps to the
            nearest 15-minute step rather than rejecting the entry. The
            calendar only ever renders inside a popover, which mounts when
            it is opened - it is never server-rendered, so react-day-picker
            deriving &quot;today&quot; at render time cannot cause a
            mismatch.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="9"
          title="Dropdowns, menus and pickers"
          note="The menu is exactly the trigger's width. Selected and hovered look different: selected is primary-subtle with a tick, hovered is neutral grey. Sharing one style makes it impossible to tell what is actually chosen."
        >
          <div className="flex flex-wrap items-start gap-6">
            <div className="w-64">
              <Label htmlFor="ks-select">Site location</Label>
              <div className="mt-1.5">
                <Select defaultValue="rampur" items={LOCATIONS}>
                  <SelectTrigger id="ks-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rampur">Rampur</SelectItem>
                    <SelectItem value="kheda">Kheda</SelectItem>
                    <SelectItem value="bharuch">Bharuch</SelectItem>
                    <SelectItem value="navsari">Navsari</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="w-64">
              <Label htmlFor="ks-select-empty">Empty</Label>
              <div className="mt-1.5">
                <Select items={LOCATIONS}>
                  <SelectTrigger id="ks-select-empty">
                    <SelectValue placeholder="Select a location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rampur">Rampur</SelectItem>
                    <SelectItem value="kheda">Kheda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-6">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="secondary">Row actions</Button>}
                />
                <DropdownMenuContent>
                  {/* Base UI throws MenuGroupContext is missing if a
                      GroupLabel is not inside a Group. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Rampur North</DropdownMenuLabel>
                    <DropdownMenuItem>
                      <PencilIcon />
                      Edit site
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <DownloadIcon />
                      Download expenses
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="danger">
                      <TrashIcon />
                      Delete site
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="pt-6">
              <Popover>
                <PopoverTrigger render={<Button variant="secondary">Filter panel</Button>} />
                <PopoverContent align="start">
                  <p className="text-label text-text-secondary">Project</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox id="ks-f1" defaultChecked />
                      <Label htmlFor="ks-f1">Green Belt</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="ks-f2" />
                      <Label htmlFor="ks-f2">Riverbank</Label>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Button variant="secondary" size="sm">
                      Clear all
                    </Button>
                    <Button size="sm">Apply</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="pt-6">
              <Sheet>
                <SheetTrigger render={<Button variant="secondary">Open sheet</Button>} />
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>Site details</SheetTitle>
                    <SheetDescription>
                      A sheet is for a side task that keeps the list visible
                      behind it.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="px-4">
                    <p className="text-body text-text-secondary">
                      Rampur North, Green Belt, 5,000 trees.
                    </p>
                  </div>
                  <SheetFooter>
                    <SheetClose render={<Button variant="secondary">Close</Button>} />
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-start gap-6">
            <div className="w-64">
              <Label htmlFor="ks-long-select">Sixteen options, plain dropdown</Label>
              <div className="mt-1.5">
                <Select defaultValue="ahmedabad" items={DISTRICTS}>
                  <SelectTrigger id="ks-long-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DISTRICTS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Caption>
                Here only to show the section 16.2 scroll cap: the menu stops
                at about seven rows and scrolls internally. A list this long
                should not be a plain dropdown in a product screen.
              </Caption>
            </div>

            <div className="w-64">
              <Label htmlFor="ks-searchable">Sixteen options, searchable</Label>
              <div className="mt-1.5">
                <SearchableSelect
                  id="ks-searchable"
                  options={DISTRICTS}
                  value={district}
                  onValueChange={setDistrict}
                  searchPlaceholder="Search districts"
                  emptyMessage="No district matches that search."
                />
              </div>
              <Caption>
                Section 16.3: past six options the menu gets a search box fixed
                at the top, which does not scroll with the options. This is
                what a long list uses.
              </Caption>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="10"
          title="Text overflow"
          note="Text must never overflow its container. Truncate for table cells and rows, one line ending in three dots with the full text as a tooltip. Clamp for card descriptions and previews, two lines then a Show more link."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border-light bg-surface p-4">
              <p className="text-label text-text-secondary">Truncate</p>
              <div className="mt-3 w-64 rounded-lg border border-border-light px-3 py-2">
                <Truncate>{LONG_SITE_NAME}</Truncate>
              </div>
              <Caption>Hover it: the full name appears as a tooltip.</Caption>
              <div className="mt-3 w-64 rounded-lg border border-border-light px-3 py-2">
                <Truncate>Rampur North</Truncate>
              </div>
              <Caption>
                A name that fits gets no tooltip. A tooltip that repeats what
                is already on screen is noise.
              </Caption>
            </div>
            <div className="rounded-xl border border-border-light bg-surface p-4">
              <p className="text-label text-text-secondary">Clamp</p>
              <div className="mt-3">
                <Clamp className="text-body text-text-secondary">
                  This site covers the compensatory plantation block on the
                  north bank, including the extension strip added in the
                  second season. The per-tree budget was revised once, after
                  the pitting rate was renegotiated with the contractor, and
                  the revision applies to every head from that date onward.
                </Clamp>
              </div>
              <Caption>
                Two lines, then Show more. This is also how a grid of cards
                stays level.
              </Caption>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="11"
          title="Tabs and breadcrumbs"
          note="Breadcrumbs replace back arrows, because a back button does something different depending on how the user arrived. The active tab carries a 2px accent, primary text and medium weight - three signals together."
        >
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Sites</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Rampur North</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Tabs defaultValue="budget" className="mt-6">
            <TabsList>
              <TabsTrigger value="budget">Budget</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="variance">Variance</TabsTrigger>
              <TabsTrigger value="locked" disabled>
                Disabled
              </TabsTrigger>
            </TabsList>
            <TabsContent value="budget">
              <p className="text-body text-text-secondary">
                Per-tree cost by head. The panel keeps the same padding on
                every tab, so switching does not shift the layout.
              </p>
            </TabsContent>
            <TabsContent value="expenses">
              <p className="text-body text-text-secondary">
                Expenses booked against this site.
              </p>
            </TabsContent>
            <TabsContent value="variance">
              <p className="text-body text-text-secondary">
                Budget against actual, one row per cost head.
              </p>
            </TabsContent>
          </Tabs>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="12"
          title="Table"
          note="Numbers are right-aligned and text is left-aligned, always. Column headers stay put while rows scroll. A selected row is tinted primary-subtle; the total row carries body-strong weight."
        >
          <div className="overflow-hidden rounded-xl border border-border-light bg-surface">
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <span className="sr-only">Select</span>
                    </TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead numeric>Trees</TableHead>
                    <TableHead numeric>Budget</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SITES.map((s, i) => (
                    <TableRow key={s.site} selected={i === 0}>
                      <TableCell>
                        <Checkbox defaultChecked={i === 0} aria-label={s.site} />
                      </TableCell>
                      <TableCell className="max-w-48">
                        <Truncate>{i === 2 ? LONG_SITE_NAME : s.site}</Truncate>
                      </TableCell>
                      <TableCell>{s.project}</TableCell>
                      <TableCell numeric>{formatNumber(s.trees)}</TableCell>
                      <TableCell numeric>{formatAmount(s.budget)}</TableCell>
                      <TableCell>
                        <Badge variant={s.status}>
                          {s.status === "success" ? <CheckIcon /> : null}
                          {s.status === "warning" ? <TriangleAlertIcon /> : null}
                          {s.status === "danger" ? <OctagonXIcon /> : null}
                          {s.status === "success"
                            ? "Under budget"
                            : s.status === "warning"
                              ? "Needs review"
                              : "Over budget"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell />
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell numeric>
                      {formatNumber(SITES.reduce((n, s) => n + s.trees, 0))}
                    </TableCell>
                    <TableCell numeric>
                      {formatAmount(SITES.reduce((n, s) => n + s.budget, 0n))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            <PaginationBar>
              <PaginationCount>Showing 1 to 3 of 148</PaginationCount>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#" isActive>
                      1
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#">2</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#">3</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </PaginationBar>
          </div>
          <Caption>
            The third row&apos;s name is truncated with a tooltip. The tree
            counts and amounts are stored as an integer and as bigint paise
            and rendered through lib/format.ts, so the total is summed in
            bigint and formatted once rather than typed out.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="13"
          title="Cards"
          note="12px radius, a 1px border-light edge, no shadow. Descriptions clamp to two lines so a grid of cards stays level."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>Rampur North</CardTitle>
                  <CardDescription>
                    Green Belt · 5,000 trees · Manager Sunita Rao
                  </CardDescription>
                </div>
                <CardAction>
                  <Badge variant="success">
                    <CheckIcon />
                    Active
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="text-body text-text-secondary">
                  The whole card is clickable in a list, not only the title.
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="secondary" size="sm">
                  View site
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Loading</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Separator</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body text-text-secondary">Above the line</p>
                <Separator className="my-3" />
                <p className="text-body text-text-secondary">Below the line</p>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="14"
          title="Messages"
          note="Can the user ignore it and carry on? Yes and temporary means a toast. Yes but it stays true means a banner. No means a dialog. About one field means an inline field error. A toast is never used for a field validation error."
        >
          <div className="flex flex-col gap-4">
            <Banner>
              <CircleAlertIcon />
              <BannerTitle>Three sites have no budget entered</BannerTitle>
              <BannerDescription>
                Their expenses are counted in the totals, but their variance
                cannot be calculated until a per-tree cost is set.
              </BannerDescription>
              <BannerAction>
                <Button size="sm" variant="secondary">
                  Show those sites
                </Button>
              </BannerAction>
            </Banner>

            <Banner variant="success">
              <CheckIcon />
              <BannerTitle>Budget saved</BannerTitle>
              <BannerDescription>
                All eleven cost heads now carry a per-tree amount.
              </BannerDescription>
            </Banner>

            <Banner variant="warning">
              <TriangleAlertIcon />
              <BannerTitle>Tree count changed</BannerTitle>
              <BannerDescription>
                Rampur North moved from 5,000 to 4,600 trees, so every budget
                figure for this site has been recalculated.
              </BannerDescription>
            </Banner>

            <Banner variant="danger">
              <OctagonXIcon />
              <BannerTitle>The expense could not be saved</BannerTitle>
              <BannerDescription>
                The connection dropped partway through. Nothing was recorded,
                so the entry is safe to submit again.
              </BannerDescription>
              <BannerAction>
                <Button size="sm" variant="secondary">
                  Try again
                </Button>
              </BannerAction>
            </Banner>
          </div>

          <div className="mt-6">
            <Row>
              <Button variant="secondary" onClick={() => toast.success("Site saved")}>
                Success toast
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast.error("The site could not be saved. Nothing was recorded.")
                }
              >
                Error toast, never auto-dismisses
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast.undo("9 expenses deleted", () => toast.message("Restored"))
                }
              >
                Toast with Undo
              </Button>
            </Row>
            <Caption>
              Bottom right, 360px fixed, at most three stacked, every one with
              a close button.
            </Caption>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="15"
          title="Dialogs"
          note="Three widths: 400 for confirmations, 560 for short forms, 800 when there are tabs or a table inside. A confirmation that does not state the consequences is not a confirmation, it is a speed bump."
        >
          <Row>
            <Dialog>
              <DialogTrigger
                render={<Button variant="secondary">Short form, 560px</Button>}
              />
              <DialogContent size="md">
                <DialogHeader>
                  <DialogTitle>Add cost head</DialogTitle>
                  <DialogDescription>
                    The per-tree amount is multiplied by the site tree count to
                    give the head budget.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 sm:col-span-6">
                      <Label htmlFor="ks-head" required>
                        Cost head
                      </Label>
                      <Input id="ks-head" className="mt-1.5" placeholder="Pitting" />
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <Label htmlFor="ks-per-tree" required>
                        Per tree
                      </Label>
                      <Input
                        id="ks-per-tree"
                        className="mt-1.5 text-right"
                        placeholder="34.00"
                      />
                    </div>
                  </div>
                </DialogBody>
                <DialogFooter>
                  <DialogClose render={<Button variant="secondary">Cancel</Button>} />
                  <Button>Add cost head</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="danger">Delete site</Button>} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Rampur North?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will also remove 11 budget rows and 214 expenses. It
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Delete site</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Row>
          <Caption>
            The confirm button states the actual verb, never OK or Yes. Cancel
            is the safer option and sits on the left. A confirmation closes
            only through Cancel or the action, so Escape and the backdrop do
            nothing.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="16"
          title="Empty states"
          note="Three, not one. The variant is a closed set rather than free-form props, because offering 'Add your first site' to someone whose filter simply matched nothing makes the software look unintelligent."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border-light bg-surface">
              <EmptyState
                variant="nothing-yet"
                heading="No sites yet"
                actionLabel="New site"
              >
                Sites hold the tree count, the budget and the expenses for one
                location. Add the first one to begin.
              </EmptyState>
            </div>
            <div className="rounded-xl border border-border-light bg-surface">
              <EmptyState variant="nothing-found" heading="No sites match “kheda”">
                Two filters are still applied. Clearing them will widen the
                search.
              </EmptyState>
            </div>
            <div className="rounded-xl border border-border-light bg-surface">
              <EmptyState variant="failed" heading="The list could not be loaded">
                The connection dropped while fetching sites. Nothing has
                changed.
              </EmptyState>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="17"
          title="Loading"
          note="Skeletons in the shape of the content that is coming, never a spinning wheel. The layout arrives first, so the page does not jump when the data lands."
        >
          <div className="overflow-hidden rounded-xl border border-border-light bg-surface">
            <div className="flex items-center gap-4 border-b border-border-light bg-surface-sunken px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-control w-28" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-border-light px-4 py-3 last:border-b-0"
              >
                <Skeleton className="h-4 w-4 rounded-(--radius-tick)" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-4 w-24" />
              </div>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="18"
          title="Date and number formats"
          note="Section 18. One format across the whole software, and one file that produces it: lib/format.ts. Money is stored as bigint paise and only becomes readable here. A number, amount or date that reaches a screen without passing through these functions is a bug."
        >
          <div className="overflow-hidden rounded-xl border border-border-light bg-surface">
            {FORMAT_EXAMPLES.map((example) => (
              <div
                key={example.label}
                className="flex flex-wrap items-baseline gap-4 border-b border-border-light px-4 py-3 last:border-b-0"
              >
                <span className="w-40 shrink-0 text-label text-text-secondary">
                  {example.label}
                </span>
                <code className="text-meta text-text-muted">{example.call}</code>
                <span className="ml-auto text-body font-medium tabular-nums text-text-primary">
                  {example.output}
                </span>
              </div>
            ))}
          </div>
          <Caption>
            The rupee symbol sits before the number with no gap, grouping is
            Indian, and an amount always carries two decimals so a column of
            them lines up. A date is never numeric-only: 12/08/2026 means two
            different dates depending on who reads it.
          </Caption>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          n="19"
          title="Scrollbars"
          note="The browser default is never used. 10px, fully rounded, in the scroll tokens. A scrolling area never nests inside another one."
        >
          <div className="max-h-40 max-w-md overflow-y-auto rounded-xl border border-border-light bg-surface p-4">
            {Array.from({ length: 14 }).map((_, i) => (
              <p key={i} className="py-1 text-body text-text-secondary">
                Row {i + 1} — the thumb and track come from the scroll tokens.
              </p>
            ))}
          </div>
        </Section>
      </div>
    </main>
  )
}
