"use client"

import * as React from "react"
import { DownloadIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import type { PdfColumn, PdfTotalRow } from "@/lib/pdf-export"

/**
 * The maximum number of rows a single export will fetch. Past this the
 * button refuses rather than freezing the tab or silently truncating
 * the report (a silently truncated report is worse than a refused one).
 */
const MAX_EXPORT_ROWS = 10_000

/** The page size every export pages through the list endpoint at. */
const EXPORT_PAGE_SIZE = 100

export interface ExportPdfFetchResult<T> {
  data: T[]
  /** Total rows matching the current search/filter/sort, across all pages. */
  total: number
}

/**
 * Downloads a real PDF of every row matching the screen's current
 * search/filter/sort — not the 25 (or 100) on screen. It pages the
 * caller's `fetchPage` at `pageSize=100` (the API's own hard cap, see
 * `backend/src/common/list-query.ts`) until every matching row has been
 * collected, then hands them to `lib/pdf-export.ts` to lay out.
 *
 * `fetchPage` receives the page number and page size to request and
 * must return exactly the rows for that page plus the grand total row
 * count for the current search/filter/sort — i.e. call the SAME
 * endpoint the on-screen table uses, with the same search/sort/filter
 * params baked in by the caller, varying only `page` and `pageSize`.
 *
 * `@react-pdf/renderer` (and the Gujarati font it renders with) is heavy,
 * so it is imported dynamically inside `exportPdfTable` rather than at
 * module scope — it never enters the bundle for a page that only shows
 * this button.
 */
export function ExportPdfButton<T>({
  label = "Export PDF",
  className,
  fetchPage,
  columns,
  title,
  buildTotalRow,
  contextDescription,
}: {
  /** Button label. Defaults to "Export PDF". */
  label?: string
  className?: string
  /**
   * Pages through every row matching the current search/filter/sort.
   * Called with page=1,2,3… at `pageSize=100` until `data.length <
   * pageSize` or `total` rows have been collected.
   */
  fetchPage?: (page: number, pageSize: number) => Promise<ExportPdfFetchResult<T>>
  /** Column definitions: header, how to read a cell, numeric alignment. */
  columns?: PdfColumn<T>[]
  /** Report title, used as the PDF heading and the downloaded filename's seed. */
  title?: string
  /** Built once all rows are collected, from those rows, for the bold total row. */
  buildTotalRow?: (rows: T[]) => PdfTotalRow | undefined
  /**
   * The active search/filter/sort described in words, e.g.
   * `Search: "cement" · Sort: Date (newest first)`. Shown under the PDF
   * heading — a printed report that does not say it was filtered is a
   * lie by omission.
   */
  contextDescription?: string
}) {
  const [loading, setLoading] = React.useState(false)

  const handleClick = React.useCallback(async () => {
    if (loading) return
    if (!fetchPage || !columns) return

    setLoading(true)
    try {
      const rows: T[] = []
      let page = 1
      let total = Infinity

      while (rows.length < total) {
        const result = await fetchPage(page, EXPORT_PAGE_SIZE)
        rows.push(...result.data)
        total = result.total

        if (rows.length > MAX_EXPORT_ROWS) {
          toast.error(
            `This report has more than ${MAX_EXPORT_ROWS.toLocaleString("en-IN")} matching rows. Narrow the search or filters before exporting.`,
          )
          return
        }

        if (result.data.length === 0) break
        page += 1
      }

      const { exportPdfTable } = await import("@/lib/pdf-export")
      await exportPdfTable({
        title: title ?? label,
        columns,
        rows,
        totalRow: buildTotalRow?.(rows),
        context: contextDescription,
      })
    } catch {
      // Section 7.2 rule 3: never a raw technical error.
      toast.error("The PDF could not be generated. Try again.")
    } finally {
      setLoading(false)
    }
  }, [loading, fetchPage, columns, title, label, buildTotalRow, contextDescription])

  return (
    <Button
      type="button"
      variant="secondary"
      className={className}
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      {loading ? "Exporting…" : label}
    </Button>
  )
}
