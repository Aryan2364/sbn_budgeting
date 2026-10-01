"use client"

import * as React from "react"
import Link from "next/link"
import { CircleCheckIcon, DownloadIcon, OctagonXIcon } from "lucide-react"

import {
  api,
  type ImportPreview,
  type ImportResult,
  type ImportRow,
  type ImportRowStatus,
} from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { errorMessage, useSession } from "@/components/shell/session"
import { toast } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FileUpload, type FileUploadItem } from "@/components/ui/file-upload"
import { PermissionTooltip } from "@/components/ui/permission-tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Truncate } from "@/components/ui/truncate"
import { RecordBreadcrumb } from "@/components/forms/record-breadcrumb"
import { downloadPeopleTemplate, parsePeopleSheet, SheetError, type ParsedSheet } from "./sheet"

/**
 * Import people from a spreadsheet (CONTRACT §2), platform admin only.
 *
 * Composition (logged in CONTRACT §9, fe-platform): the kit has no
 * import screen, so this is three panel cards in the Settings column,
 * top to bottom, each appearing when its step is reached:
 *
 *   1. Upload: section 29's file-upload (one .xlsx) and the template.
 *   2. Check: a section 34 report table, one row per spreadsheet row
 *      with its status badge, the field changes and the messages, and
 *      a pinned total row that is the summary. Not paginated (34.2):
 *      the rows are the file's, and a summary that covers one page is
 *      not a summary.
 *      The one primary action, Import, sits in this card's footer and is
 *      disabled with its reason while any row has an error.
 *   3. Result: what the commit did, and the ways forward.
 *
 * Nothing is written until Import is pressed. Running the same file
 * again is safe: every row comes back unchanged.
 */

/**
 * Status to badge colour, defined once. Recorded exception (2.4): these
 * are import outcomes, not the binding labels, so: new = success (a
 * person is added), update = warning (an existing record will change,
 * "needs review"), unchanged = neutral, error = danger.
 */
const STATUS: Record<ImportRowStatus, { label: string; variant: "success" | "warning" | "neutral" | "danger" }> = {
  new: { label: "New", variant: "success" },
  update: { label: "Update", variant: "warning" },
  unchanged: { label: "Unchanged", variant: "neutral" },
  error: { label: "Error", variant: "danger" },
}

/** The server's `changes[].field` keys, as words (section 37.3). */
const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  designation: "Designation",
  reportsTo: "Reports to",
  canLogin: "Can sign in",
  password: "Password",
  modules: "Access",
}

/** A change value as words: booleans read Yes / No, empty reads none. */
const showValue = (value: string | null) =>
  value === null || value === "" ? "none" : value === "true" ? "Yes" : value === "false" ? "No" : value

const plural = (n: number, one: string, many: string) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`

type Step =
  | { kind: "empty" }
  | { kind: "reading" }
  | { kind: "checking"; sheet: ParsedSheet }
  | { kind: "checked"; sheet: ParsedSheet; preview: ImportPreview }
  | { kind: "failed"; sheet: ParsedSheet; message: string }
  | { kind: "done"; sheet: ParsedSheet; result: ImportResult }

export default function ImportPeoplePage() {
  const { can } = useSession()
  const [files, setFiles] = React.useState<FileUploadItem[]>([])
  const [step, setStep] = React.useState<Step>({ kind: "empty" })
  const [committing, setCommitting] = React.useState(false)
  const [commitError, setCommitError] = React.useState<string | null>(null)
  const [downloading, setDownloading] = React.useState(false)
  /** Which file the current step belongs to, so a stale parse is ignored. */
  const current = React.useRef<string | null>(null)

  const check = React.useCallback(async (sheet: ParsedSheet) => {
    setStep({ kind: "checking", sheet })
    setCommitError(null)
    try {
      const preview = await api.post<ImportPreview>("/users/import/preview", {
        rows: sheet.rows,
      })
      setStep({ kind: "checked", sheet, preview })
    } catch (caught) {
      setStep({ kind: "failed", sheet, message: errorMessage(caught) })
    }
  }, [])

  const read = React.useCallback(
    async (item: FileUploadItem) => {
      if (!item.file) return
      current.current = item.id
      setStep({ kind: "reading" })
      try {
        const sheet = await parsePeopleSheet(item.file)
        if (current.current !== item.id) return
        await check(sheet)
      } catch (caught) {
        if (current.current !== item.id) return
        setStep({ kind: "empty" })
        // Section 29: a file that failed stays in the list, in danger,
        // with Retry.
        setFiles((list) =>
          list.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: "failed",
                  error:
                    caught instanceof SheetError
                      ? caught.message
                      : "This file could not be read. Save it as .xlsx and choose it again.",
                }
              : f,
          ),
        )
      }
    },
    [check],
  )

  function onFilesChange(next: FileUploadItem[]) {
    setFiles(next)
    const ready = next.find((f) => f.status === "ready" && f.file)
    if (next.length === 0) {
      current.current = null
      setStep({ kind: "empty" })
      setCommitError(null)
    } else if (ready && ready.id !== current.current) {
      void read(ready)
    }
  }

  async function commit(sheet: ParsedSheet) {
    setCommitting(true)
    setCommitError(null)
    try {
      const result = await api.post<ImportResult>("/users/import/commit", { rows: sheet.rows })
      // The result card says what happened; no toast repeating it.
      setStep({ kind: "done", sheet, result })
    } catch (caught) {
      setCommitError(errorMessage(caught))
    } finally {
      setCommitting(false)
    }
  }

  async function template() {
    setDownloading(true)
    try {
      await downloadPeopleTemplate()
    } catch (caught) {
      toast.error(`The template could not be made. ${errorMessage(caught)}`)
    } finally {
      setDownloading(false)
    }
  }

  const sheet = "sheet" in step ? step.sheet : null

  return (
    <div className="flex flex-col gap-6">
      <RecordBreadcrumb
        trail={[{ label: "People", href: "/settings/people" }]}
        current="Import people"
      />

      <Card>
        <CardHeader>
          <CardTitle>Import people from Excel</CardTitle>
          <CardAction>
            <Button
              variant="on-brand"
              size="sm"
              onClick={template}
              disabled={downloading}
            >
              <DownloadIcon />
              {downloading ? "Preparing template" : "Download template"}
            </Button>
          </CardAction>
          <CardDescription>
            One person per row. People are matched to existing records by phone,
            then email, never by name, so running the same file twice changes
            nothing the second time. Nothing is saved until you press Import.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <FileUpload
            id="people-file"
            value={files}
            onChange={onFilesChange}
            accept=".xlsx"
            maxFiles={1}
            maxBytes={5 * 1024 * 1024}
            compressImages={false}
            noun={{ one: "spreadsheet", many: "spreadsheets" }}
            description="Excel (.xlsx), up to 5 MB. Use the template's columns."
            onRetry={(item) => {
              current.current = null
              setFiles((list) =>
                list.map((f) => (f.id === item.id ? { ...f, status: "ready", error: undefined } : f)),
              )
              void read({ ...item, status: "ready" })
            }}
            disabled={committing}
          />
        </CardContent>
      </Card>

      {step.kind === "reading" || step.kind === "checking" ? (
        <Card>
          <CardHeader>
            <CardTitle>{step.kind === "reading" ? "Reading the spreadsheet" : "Checking every row"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </CardContent>
        </Card>
      ) : null}

      {step.kind === "failed" ? (
        <Banner variant="danger">
          <OctagonXIcon />
          <BannerTitle>The rows could not be checked</BannerTitle>
          <BannerDescription>
            {step.message}{" "}
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => check(step.sheet)}>
              Check again
            </Button>
          </BannerDescription>
        </Banner>
      ) : null}

      {step.kind === "checked" && sheet ? (
        <PreviewCard
          sheet={sheet}
          preview={step.preview}
          canCommit={can.platformAdmin}
          committing={committing}
          commitError={commitError}
          onCommit={() => commit(sheet)}
        />
      ) : null}

      {step.kind === "done" ? (
        <Card>
          <CardHeader>
            <CardTitle>Import finished</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4">
            <Banner variant="success">
              <CircleCheckIcon />
              <BannerTitle>
                {plural(step.result.created, "person added", "people added")},{" "}
                {formatNumber(step.result.updated)} updated,{" "}
                {formatNumber(step.result.unchanged)} unchanged
              </BannerTitle>
              <BannerDescription>
                New people can open Complaints as members. Anyone without a
                password cannot sign in until one is set in People.
              </BannerDescription>
            </Banner>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" nativeButton={false} render={<Link href="/settings/people" />}>
                Open people
              </Button>
              <Button variant="secondary" onClick={() => check(step.sheet)}>
                Check this file again
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  current.current = null
                  setFiles([])
                  setStep({ kind: "empty" })
                }}
              >
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function PreviewCard({
  sheet,
  preview,
  canCommit,
  committing,
  commitError,
  onCommit,
}: {
  sheet: ParsedSheet
  preview: ImportPreview
  canCommit: boolean
  committing: boolean
  commitError: string | null
  onCommit: () => void
}) {
  const { summary } = preview
  const changing = summary.new + summary.update

  const denial = !canCommit
    ? "Only a platform administrator can import people"
    : summary.error > 0
      ? `${plural(summary.error, "row has an error", "rows have errors")}. Fix ${
          summary.error === 1 ? "it" : "them"
        } in the spreadsheet, then choose the file again.`
      : null

  const rowFor = (index: number): ImportRow | undefined => sheet.rows[index]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check the changes</CardTitle>
      <CardDescription>
        {plural(sheet.rows.length, "row", "rows")} read. {plural(summary.new, "person", "people")}{" "}
        will be added, {formatNumber(summary.update)} updated and{" "}
        {formatNumber(summary.unchanged)} left as they are.
        {summary.error > 0 ? ` ${plural(summary.error, "row has an error", "rows have errors")}.` : ""}
      </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-4">
        {/* Fixed layout: Details takes what is left and wraps, instead
            of pushing the table past the card. Changes and messages
            share one column so neither is squeezed to a word a line. */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead numeric className="w-col-count">Row</TableHead>
              <TableHead className="w-1/4">Name</TableHead>
              <TableHead className="w-col-status">Status</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row) => {
              const source = rowFor(row.index)
              const status = STATUS[row.status]
              const isError = row.status === "error"
              return (
                <TableRow key={row.index}>
                  <TableCell numeric>{formatNumber(sheet.sourceRows[row.index] ?? row.index + 2)}</TableCell>
                  <TableCell>
                    <div className="min-w-0">
                      <Truncate>{source?.name || "No name"}</Truncate>
                      <span className="block min-w-0 text-meta text-text-muted">
                        <Truncate>{source?.phone || "No phone"}</Truncate>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {row.changes.length === 0 && row.messages.length === 0 ? (
                      <span className="text-text-secondary">
                        {row.status === "unchanged" ? "Already matches" : "—"}
                      </span>
                    ) : (
                      <div className="flex min-w-0 flex-col gap-2">
                        {row.messages.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {row.messages.map((message) => (
                              <li
                                key={message}
                                className={
                                  isError
                                    ? "flex min-w-0 items-start gap-1 break-words text-danger"
                                    : "min-w-0 break-words text-text-secondary"
                                }
                              >
                                {isError ? (
                                  <OctagonXIcon aria-hidden="true" className="mt-1 size-icon shrink-0" />
                                ) : null}
                                <span className="min-w-0">{message}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {row.changes.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {row.changes.map((change) => (
                              <li key={change.field} className="min-w-0 break-words">
                                <span className="text-text-secondary">
                                  {FIELD_LABEL[change.field] ?? change.field}:{" "}
                                </span>
                                {row.status === "new" || change.from === null ? (
                                  <span className="font-medium">{showValue(change.to)}</span>
                                ) : (
                                  <>
                                    {showValue(change.from)} →{" "}
                                    <span className="font-medium">{showValue(change.to)}</span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          {/* Section 34.1: the total row is the answer, and it is pinned. */}
          <TableFooter sticky>
            <TableRow>
              <TableCell colSpan={4}>
                {plural(summary.new, "new", "new")}, {formatNumber(summary.update)} to update,{" "}
                {formatNumber(summary.unchanged)} unchanged, {plural(summary.error, "error", "errors")}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>

        {commitError ? (
          <Banner variant="danger">
            <OctagonXIcon />
            <BannerTitle>Nothing was imported</BannerTitle>
            <BannerDescription>{commitError}</BannerDescription>
          </Banner>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end">
        <PermissionTooltip allowed={denial === null} reason={denial ?? ""}>
          <Button onClick={onCommit} disabled={denial !== null || committing}>
            {committing
              ? "Importing"
              : changing === 0
                ? "Import (nothing to change)"
                : `Import ${plural(changing, "person", "people")}`}
          </Button>
        </PermissionTooltip>
      </CardFooter>
    </Card>
  )
}
