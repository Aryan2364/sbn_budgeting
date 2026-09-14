"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { TrashIcon } from "lucide-react"

import {
  api,
  query,
  type BudgetGrid,
  type CostHead,
  type Expense,
  type ListResponse,
  type Matchable,
  type Site,
} from "@/lib/api"
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
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { SearchableSelect } from "@/components/ui/searchable-select"
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
import { PermissionTooltip } from "@/components/forms/permission-tooltip"

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
 * The fields are exactly what the spreadsheet has (question 2): site,
 * date, cost head, period, bill / voucher number, approved by, amount.
 * **There is no description field** and **no upload control**
 * (questions 2 and 4) — both were considered and ruled out, so neither
 * is missing by accident.
 */
export function ExpenseForm({ expenseId }: { expenseId?: string }) {
  const router = useRouter()
  const { isAdmin } = useSession()
  const params = useSearchParams()
  const isEdit = expenseId !== undefined

  const [siteId, setSiteId] = React.useState(params.get("siteId") ?? "")
  const [costHeadId, setCostHeadId] = React.useState("")
  const [spentOn, setSpentOn] = React.useState<Date | undefined>(undefined)
  const [chosenPeriod, setChosenPeriod] = React.useState<number | null>(null)
  const [amount, setAmount] = React.useState("")
  const [billNumber, setBillNumber] = React.useState("")
  const [approvedBy, setApprovedBy] = React.useState("")

  const [sites, setSites] = React.useState<Site[]>([])
  const [heads, setHeads] = React.useState<CostHead[]>([])
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
    Promise.all([
      api.get<ListResponse<Site & Matchable>>(
        `/sites${query({ pageSize: 100, sort: "name", direction: "asc" })}`,
      ),
      api.get<ListResponse<CostHead & Matchable>>(
        `/cost-heads${query({ pageSize: 100, sort: "sortOrder", direction: "asc" })}`,
      ),
      expenseId ? api.get<Expense>(`/expenses/${expenseId}`) : null,
    ])
      .then(([siteList, headList, expense]) => {
        if (cancelled) return
        setSites(siteList.data)
        setHeads(headList.data)
        if (expense) {
          setSiteId(expense.siteId)
          setCostHeadId(expense.costHeadId)
          setSpentOn(fromIsoDate(expense.spentOn))
          setChosenPeriod(expense.period)
          // An existing row's period is what was stored, not what the
          // date would suggest now (question 6).
          setPeriodOverridden(true)
          setAmount(paiseToRupeeInput(expense.amountPaise))
          setBillNumber(expense.billNumber ?? "")
          setApprovedBy(expense.approvedBy ?? "")
          /*
            Section 15: the confirmation names what is being deleted, so
            nobody removes the wrong row. An expense has no name of its
            own, so it is identified the way a person would read it off
            the list — amount, head and date.
          */
          setExpenseName(
            `${formatCurrency(expense.amountPaise)} — ${expense.costHeadName}, ${formatDate(expense.spentOn)}`,
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
  }, [expenseId, reloadTick])

  const site = sites.find((s) => s.id === siteId) ?? null

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
  const anchor = React.useMemo(() => (site ? periodAnchor(site) : null), [site])

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
    if (!spentOn) found.spentOn = "Enter the date, like 12 Aug 2026"
    if (period === null) found.period = "Choose a period"
    const parsed = parseRupeesToPaise(amount)
    if (!parsed.ok) found.amount = parsed.error
    else if (parsed.paise === null) found.amount = "Enter the amount spent"
    return found
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
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

  const siteOptions = Object.fromEntries(sites.map((s) => [s.id, s.name]))
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
            current={isEdit ? "Edit" : "New expense"}
          />

          <PageHeader
            className="mt-4"
            title={loading && isEdit ? <Skeleton className="h-8 w-64" /> : isEdit ? "Edit expense" : "New expense"}
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
                  options={siteOptions}
                  value={siteId}
                  onValueChange={setSiteId}
                  disabled={loading}
                  placeholder="Choose a site"
                  searchPlaceholder="Search sites"
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
                  disabled={loading}
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
                  disabled={loading}
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
                  disabled={loading || !siteId}
                  placeholder={siteId ? "Choose a cost head" : "Choose a site first"}
                  searchPlaceholder="Search cost heads"
                />
              </FormField>

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
                    disabled={loading}
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
            </FormSection>

            <FormSection label="Paper trail">
              <FormField span={4} label="Bill or voucher number" htmlFor="billNumber">
                <Input
                  id="billNumber"
                  value={billNumber}
                  disabled={loading}
                  onChange={(event) => setBillNumber(event.target.value)}
                />
              </FormField>

              <FormField span={6} label="Approved by" htmlFor="approvedBy">
                <Input
                  id="approvedBy"
                  value={approvedBy}
                  disabled={loading}
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
            <PermissionTooltip
              allowed={isAdmin}
              reason="Only an administrator can delete an expense"
            >
              <Button
                variant="danger"
                disabled={!isAdmin || saving || loading}
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
        <Button type="submit" form="expense-form" disabled={saving || loading}>
          {saving ? "Saving…" : isEdit ? "Save expense" : "Record expense"}
        </Button>
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
