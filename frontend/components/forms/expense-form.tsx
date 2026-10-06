"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { TrashIcon } from "lucide-react"

import {
  api,
  pick,
  type BudgetGrid,
  type CostHeadPick,
  type Expense,
  type RecordCan,
  type Site,
  type SitePick,
} from "@/lib/api"
import {
  reasonFor,
  recordAnswer,
  useCan,
  useCanAll,
  useCanSeeAmounts,
} from "@/lib/permissions"
import { formatCurrency, formatDate } from "@/lib/format"
import { parseRupeesToPaise, paiseToRupeeInput } from "@/lib/money"
import {
  PERIODS,
  PERIOD_VALUES,
  anchorLabel,
  derivePeriod,
  periodAnchor,
  periodLabel,
} from "@/lib/periods"
import { errorMessage } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { SearchableSelect, type SearchOption } from "@/components/ui/searchable-select"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { PageColumn, PageHeader } from "@/components/templates/page"
import {
  FormField,
  FormFooter,
  FormFrame,
  FormScrollArea,
  FormSection,
} from "@/components/templates/form-page"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { FormError, FormLoadFailed } from "@/components/forms/form-error"
import { DeleteRecordDialog } from "@/components/forms/delete-record-dialog"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function fromIsoDate(text: string | undefined): Date | undefined {
  if (!text) return undefined
  const [year, month, day] = text.split("-").map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

/**
 * Add and Edit, in ONE component (section 4 rule 1).
 *
 * The fields are what the spreadsheet has (question 2) plus a free-form
 * description of what the money was spent on: site, date, cost head,
 * period, amount, description, bill / voucher number, approved by.
 * **There is no upload control** (question 4) — considered and ruled
 * out, so it is not missing by accident.
 *
 * Whether this person may save an existing expense is the server's
 * answer for that record (kit 26.5): `can.edit` on the expense, together
 * with holding `budget.expenses.edit` at all. Anyone who may not sees
 * the same form read-only, with Save disabled and the reason on it
 * (kit 26). Delete the same, with `can.delete`.
 *
 * Site and cost head choose through their Picks (access plan P7
 * inventory 1 and 2): the cost-head list is Settings, under manage (D3).
 * Sites search the server as the user types (access plan P8): a Pick
 * answers at most 50 and nothing caps the number of sites.
 *
 * Kit 26.7: without see amounts the Amount field is absent, not
 * disabled. Adding and editing expenses need see amounts (plan 5.3.1),
 * so such a person only ever sees the form read-only.
 */
export function ExpenseForm({ expenseId }: { expenseId?: string }) {
  const router = useRouter()
  const canEditAny = useCan("budget.expenses.edit")
  const canDeleteAny = useCan("budget.expenses.delete")
  const seeAmounts = useCanSeeAmounts("budget")
  /** Adding needs the key and see amounts; the server refuses either missing. */
  const createAnswer = useCanAll(["budget.expenses.create", "budget.amounts.see"])
  const params = useSearchParams()
  const isEdit = expenseId !== undefined

  const [siteId, setSiteId] = React.useState(params.get("siteId") ?? "")
  const [costHeadId, setCostHeadId] = React.useState("")
  const [spentOn, setSpentOn] = React.useState<Date | undefined>(undefined)
  const [chosenPeriod, setChosenPeriod] = React.useState<number | null>(null)
  const [amount, setAmount] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [billNumber, setBillNumber] = React.useState("")
  const [approvedBy, setApprovedBy] = React.useState("")

  /** The chosen site's Pick row: its name, and the dates the period is measured from. */
  const [site, setSite] = React.useState<SitePick | null>(null)
  /** The rows the site search has returned, so a choice keeps its dates. */
  const foundSites = React.useRef(new Map<string, SitePick>())
  const [heads, setHeads] = React.useState<CostHeadPick[]>([])
  const [budgetedHeadIds, setBudgetedHeadIds] = React.useState<Set<string> | null>(null)

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  /** Names the record in the confirmation, so nobody deletes the wrong one. */
  const [expenseName, setExpenseName] = React.useState<string | null>(null)
  /**
   * Section 13: a failed LOAD is its own state, not a failed save.
   * Kept apart from `error`, which carries save failures only.
   */
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  /** The server's answers for this expense (kit 26.5). `undefined` until it has loaded. */
  const [recordCan, setRecordCan] = React.useState<RecordCan | undefined>(undefined)

  /**
   * Whether this user may save, and if not, why. While anything is still
   * loading the answer is "not known yet": Save is disabled and claims
   * no reason (kit 26.1).
   */
  const save = !isEdit
    ? createAnswer
    : seeAmounts === false
      ? // Editing needs see amounts too (plan 5.3.1); the server says 403.
        { allowed: false, reason: reasonFor("budget.amounts.see") }
      : seeAmounts === undefined
        ? { allowed: undefined, reason: "" }
        : recordAnswer(
        canEditAny,
        "budget.expenses.edit",
        recordCan?.edit,
      )
  const remove = recordAnswer(canDeleteAny, "budget.expenses.delete", recordCan?.delete)
  const mayEdit = save.allowed
  const readOnly = mayEdit !== true

  /**
   * Whether the user has taken the period into their own hands.
   *
   * Until they do, changing the date moves the period with it. Once
   * they override it, the date stops touching it — a suggestion that
   * keeps overwriting a deliberate choice is not a suggestion.
   */
  const [periodOverridden, setPeriodOverridden] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const prefilled = params.get("siteId")
    Promise.all([
      pick.costHeads(),
      expenseId ? api.get<Expense>(`/expenses/${expenseId}`) : null,
    ])
      .then(async ([headList, expense]) => {
        // The saved (or prefilled) site's own row, for its period
        // dates: found through the Pick by the name the expense
        // carries, or, arriving from a site page, read from that site.
        let chosen: SitePick | null = null
        if (expense) {
          chosen = await pick
            .sites({ q: expense.siteName })
            .then((rows) => rows.find((r) => r.id === expense.siteId) ?? null)
            .catch(() => null)
        } else if (prefilled) {
          chosen = await api
            .get<Site>(`/sites/${prefilled}`)
            .then((s): SitePick => ({
              id: s.id,
              name: s.name,
              projectId: s.projectId,
              plantationStartDate: s.plantationStartDate,
              plantationCompleteDate: s.plantationCompleteDate,
            }))
            .catch(() => null)
        }
        return [headList, expense, chosen] as const
      })
      .then(([headList, expense, chosen]) => {
        if (cancelled) return
        // The saved head, by the name the expense carries, so an
        // existing expense reads correctly even outside the Pick's rows
        // (display is not picking).
        const headRows = [...headList]
        if (expense && !headRows.some((h) => h.id === expense.costHeadId)) {
          headRows.push({
            id: expense.costHeadId,
            name: expense.costHeadName,
            sortOrder: Number.MAX_SAFE_INTEGER,
            isActive: false,
          })
        }
        if (expense) {
          // The name the expense carries, even if the Pick did not find the row.
          setSite(
            chosen ?? {
              id: expense.siteId,
              name: expense.siteName,
              projectId: null,
              plantationStartDate: "",
              plantationCompleteDate: null,
            },
          )
        } else if (chosen) {
          setSite(chosen)
        } else if (prefilled) {
          // A site this person cannot reach: start without one.
          setSiteId("")
        }
        // The spreadsheet's order of heads, as the grid and the reports use.
        setHeads(headRows.sort((a, b) => a.sortOrder - b.sortOrder))
        if (expense) {
          setSiteId(expense.siteId)
          setCostHeadId(expense.costHeadId)
          setSpentOn(fromIsoDate(expense.spentOn))
          setChosenPeriod(expense.period)
          // An existing row's period is what was stored, not what the
          // date would suggest now (question 6).
          setPeriodOverridden(true)
          setAmount(expense.amountPaise !== undefined ? paiseToRupeeInput(expense.amountPaise) : "")
          setDescription(expense.description ?? "")
          setBillNumber(expense.billNumber ?? "")
          setApprovedBy(expense.approvedBy ?? "")
          setRecordCan(expense.can ?? {})
          /*
            Section 15: the confirmation names what is being deleted, so
            nobody removes the wrong row. An expense has no name of its
            own, so it is identified the way a person would read it off
            the list — amount, head and date.
          */
          setExpenseName(
            // Kit 26.7: without see amounts the amount is absent, so the
            // name is the head and the date alone, never "₹0.00".
            expense.amountPaise !== undefined
              ? `${formatCurrency(expense.amountPaise)} — ${expense.costHeadName}, ${formatDate(expense.spentOn)}`
              : `${expense.costHeadName}, ${formatDate(expense.spentOn)}`,
          )
        }
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setLoadError(errorMessage(caught))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `params` is read once, for the prefill; a later change of address
    // is a new page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, reloadTick])

  const searchSites = React.useCallback(
    (query: string): Promise<SearchOption[]> =>
      pick.sites({ q: query }).then((rows) => {
        for (const row of rows) foundSites.current.set(row.id, row)
        return rows.map((row) => ({ value: row.id, label: row.name }))
      }),
    [],
  )

  /**
   * Which cost heads this site has budgeted.
   *
   * The checklist says the head is "picked from the heads defined in
   * that site's budget". An unbudgeted head is still shown, greyed with
   * a note, rather than hidden — Rajkot's Irrigation is real spend
   * against a head with no budget, and a picker that cannot express it
   * would make that expense impossible to enter.
   */
  React.useEffect(() => {
    let cancelled = false
    // The no-site case goes through the same promise as the fetch, so
    // nothing calls setState straight out of the effect body.
    Promise.resolve()
      .then(() =>
        siteId ? api.get<BudgetGrid>(`/sites/${siteId}/budget`) : null,
      )
      .then((grid) => {
        if (cancelled) return
        setBudgetedHeadIds(
          grid ? new Set(grid.cells.map((cell) => cell.costHeadId)) : null,
        )
      })
      .catch(() => {
        if (!cancelled) setBudgetedHeadIds(null)
      })
    return () => {
      cancelled = true
    }
  }, [siteId])

  /**
   * Which date the period is measured from (client instruction,
   * 7 Sep 2026): the plantation COMPLETE date when the site has one,
   * the start date until then. `periodAnchor` is the only place that
   * chooses, so the hint below and the derivation cannot disagree.
   */
  const anchor = React.useMemo(
    () => (site && site.plantationStartDate ? periodAnchor(site) : null),
    [site],
  )

  // Question 6: the form PRE-FILLS the period by deriving it from the
  // date against that anchor. The value the user confirms is what gets
  // stored; nothing re-derives it at read time.
  const suggested = React.useMemo(() => {
    if (!anchor || !spentOn) return null
    return derivePeriod(toIsoDate(spentOn), anchor.date)
  }, [anchor, spentOn])

  /**
   * Derived, not synced. Until the user overrides it the period simply
   * IS the suggestion, so there is nothing to copy into state and
   * nothing to fall out of date. Once they override, `period` holds
   * their choice and the suggestion becomes advice in the hint.
   */
  const period = periodOverridden ? chosenPeriod : suggested

  function validate(): Record<string, string> {
    const found: Record<string, string> = {}
    if (!siteId) found.siteId = "Choose the site this expense belongs to"
    if (!costHeadId) found.costHeadId = "Choose a cost head"
    if (!spentOn) found.spentOn = "Enter the date, like 21/03/26"
    if (period === null) found.period = "Choose a period"
    const parsed = parseRupeesToPaise(amount)
    if (!parsed.ok) found.amount = parsed.error
    else if (parsed.paise === null) found.amount = "Enter the amount spent"
    return found
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (readOnly) return
    const found = validate()
    if (Object.keys(found).length > 0) {
      setFieldErrors(found)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const parsed = parseRupeesToPaise(amount)
      const body = {
        siteId,
        costHeadId,
        spentOn: toIsoDate(spentOn!),
        period,
        amountPaise: parsed.ok ? parsed.paise! : "0",
        description: description || null,
        billNumber: billNumber || null,
        approvedBy: approvedBy || null,
      }
      const saved = isEdit
        ? await api.patch<Expense>(`/expenses/${expenseId}`, body)
        : await api.post<Expense>("/expenses", body)
      toast.success(isEdit ? "Expense saved" : "Expense recorded")
      router.push(`/sites/${saved.siteId}`)
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }

  const headOptions = Object.fromEntries(
    heads.map((h) => [
      h.id,
      budgetedHeadIds && !budgetedHeadIds.has(h.id)
        ? `${h.name} — not budgeted`
        : h.name,
    ]),
  )

  const differsFromSuggestion =
    suggested !== null && period !== null && period !== suggested

  return (
    <FormFrame>
      <FormScrollArea>
        <PageColumn>
          <RecordBreadcrumb
            trail={[{ label: "Expenses", href: "/expenses" }]}
            current={isEdit ? (mayEdit === false ? "View" : "Edit") : "New expense"}
          />

          <PageHeader
            className="mt-4"
            title={loading && isEdit ? <Skeleton className="h-8 w-64" /> : isEdit ? (mayEdit === false ? "Expense" : "Edit expense") : "New expense"}
          />

          {loadError !== null ? (
            <FormLoadFailed
              message={loadError}
              onRetry={() => {
                setLoadError(null)
                setLoading(true)
                setReloadTick((t) => t + 1)
              }}
            />
          ) : null}

          <FormError message={error} />

          <form id="expense-form" onSubmit={submit} className="mt-8">
            <FormSection label="Expense">
              <FormField
                span={6}
                label="Site"
                required
                htmlFor="siteId"
                error={fieldErrors.siteId}
              >
                <SearchableSelect
                  id="siteId"
                  search={searchSites}
                  selectedLabel={site?.id === siteId ? site.name : undefined}
                  value={siteId}
                  onValueChange={(next) => {
                    setSiteId(next)
                    setSite(foundSites.current.get(next) ?? null)
                  }}
                  disabled={loading || readOnly}
                  placeholder="Choose a site"
                  searchPlaceholder="Search sites"
                  emptyMessage={(q) => `No sites match '${q}'.`}
                />
              </FormField>

              <FormField
                span={4}
                label="Date"
                required
                htmlFor="spentOn"
                error={fieldErrors.spentOn}
              >
                <DatePicker
                  id="spentOn"
                  value={spentOn}
                  onValueChange={setSpentOn}
                  disabled={loading || readOnly}
                  invalid={Boolean(fieldErrors.spentOn) || undefined}
                />
              </FormField>

              <FormField
                span={4}
                label="Budget period"
                required
                htmlFor="period"
                hint={
                  anchor && spentOn && suggested !== null
                    ? differsFromSuggestion
                      ? `The date suggests ${periodLabel(suggested)}. You have chosen ${periodLabel(period)}; that is what will be stored.`
                      : /* The hint NAMES THE ANCHOR, not just the date.
                           Two sites can suggest different periods for
                           the same expense date, and without this the
                           reason is invisible. */
                        `From the date against a ${anchorLabel(anchor.source)} of ${formatDate(anchor.date)}.`
                    : "Choose the site and date and this fills itself in."
                }
                error={fieldErrors.period}
              >
                {/* Five options, so a plain Select rather than the
                    searchable picker (section 16.3's six-option line). */}
                <Select
                  value={period === null ? "" : String(period)}
                  onValueChange={(value: string | null) => {
                    if (value === null) return
                    setChosenPeriod(Number(value))
                    setPeriodOverridden(true)
                  }}
                  disabled={loading || readOnly}
                >
                  <SelectTrigger id="period">
                    {/* Base UI renders the raw VALUE unless given a
                        formatter, and these values are 0 to 4. Without
                        this the trigger reads "1" where the option that
                        set it reads "Year 1". */}
                    <SelectValue placeholder="Choose a period">
                      {(value: string | null) =>
                        value === null || value === ""
                          ? "Choose a period"
                          : periodLabel(Number(value))
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_VALUES.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {PERIODS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField
                span={6}
                label="Cost head"
                required
                htmlFor="costHeadId"
                error={fieldErrors.costHeadId}
              >
                <SearchableSelect
                  id="costHeadId"
                  options={headOptions}
                  value={costHeadId}
                  onValueChange={setCostHeadId}
                  disabled={loading || readOnly || !siteId}
                  placeholder={siteId ? "Choose a cost head" : "Choose a site first"}
                  searchPlaceholder="Search cost heads"
                />
              </FormField>

              {/* Kit 26.7: absent, not disabled, without see amounts. While
                  the answer is unknown the form is still loading. */}
              {seeAmounts !== false ? (
              <FormField
                span={3}
                label="Amount"
                required
                htmlFor="amount"
                error={fieldErrors.amount}
              >
                {/* Section 18: the rupee symbol sits before the number
                    with no gap, so it is an addon rather than a prefix
                    typed into the field. */}
                <InputGroup>
                  <InputGroupAddon>₹</InputGroupAddon>
                  <InputGroupInput
                    id="amount"
                    inputMode="decimal"
                    value={amount}
                    disabled={loading || readOnly}
                    aria-invalid={Boolean(fieldErrors.amount) || undefined}
                    className="text-right tabular-nums"
                    placeholder="4200.00"
                    onChange={(event) => setAmount(event.target.value)}
                    onBlur={(event) => {
                      const parsed = parseRupeesToPaise(event.target.value)
                      setFieldErrors((current) => {
                        const next = { ...current }
                        if (!parsed.ok) next.amount = parsed.error
                        else delete next.amount
                        return next
                      })
                    }}
                  />
                </InputGroup>
              </FormField>
              ) : null}

              <FormField span={12} label="Description" htmlFor="description">
                <Textarea
                  id="description"
                  value={description}
                  disabled={loading || readOnly}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </FormField>
            </FormSection>

            <FormSection label="Paper trail">
              <FormField span={4} label="Bill or voucher number" htmlFor="billNumber">
                <Input
                  id="billNumber"
                  value={billNumber}
                  disabled={loading || readOnly}
                  onChange={(event) => setBillNumber(event.target.value)}
                />
              </FormField>

              <FormField span={6} label="Approved by" htmlFor="approvedBy">
                <Input
                  id="approvedBy"
                  value={approvedBy}
                  disabled={loading || readOnly}
                  onChange={(event) => setApprovedBy(event.target.value)}
                />
              </FormField>
            </FormSection>
          </form>
        </PageColumn>
      </FormScrollArea>

      <FormFooter>
        {/*
          Delete sits on the LEFT, away from the primary action, and
          only when editing — there is nothing to delete on a new
          expense. `DELETE /expenses/:id` is admin-only, so a staff user
          sees it disabled with the reason rather than not at all
          (section 26).
        */}
        {isEdit ? (
          <div className="mr-auto">
            <PermissionTooltip allowed={remove.allowed} reason={remove.reason}>
              <Button
                variant="danger"
                disabled={remove.allowed !== true || saving || loading}
                onClick={() => setDeleting(true)}
              >
                <TrashIcon />
                Delete
              </Button>
            </PermissionTooltip>
          </div>
        ) : null}
        <Button
          variant="secondary"
          render={<Link href={siteId ? `/sites/${siteId}` : "/expenses"} />}
        >
          Cancel
        </Button>
        <PermissionTooltip allowed={save.allowed} reason={save.reason}>
          <Button type="submit" form="expense-form" disabled={saving || loading || readOnly}>
            {saving ? "Saving…" : isEdit ? "Save expense" : "Record expense"}
          </Button>
        </PermissionTooltip>
      </FormFooter>

      {/*
        Section 15: an irreversible action opens a confirmation that
        names the record and states the consequence. The confirm button
        carries the danger style and the real verb, and Cancel is the
        safer option on the left — all of which DeleteRecordDialog
        already does, which is why this is not a second dialog.
      */}
      {isEdit && expenseId ? (
        <DeleteRecordDialog
          open={deleting}
          onOpenChange={setDeleting}
          recordName={expenseName ?? "this expense"}
          what="expense"
          consequences={
            <>
              The amount comes off this site&rsquo;s actual spend
              immediately, so every variance figure that includes it
              changes. The budget is not affected.
            </>
          }
          onConfirm={() => api.delete(`/expenses/${expenseId}`)}
          onDeleted={() =>
            router.push(siteId ? `/sites/${siteId}?tab=expenses` : "/expenses")
          }
        />
      ) : null}
    </FormFrame>
  )
}
