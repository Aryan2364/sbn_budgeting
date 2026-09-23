"use client"

import * as React from "react"
import { DownloadIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ExportColumn } from "@/lib/pdf-export"
import type { PdfTotalRow } from "@/lib/pdf-export"

/**
 * The maximum number of rows a single export will fetch. Past this the
 * button refuses rather than freezing the tab or silently truncating
 * the report (a silently truncated report is worse than a refused one).
 */
const MAX_EXPORT_ROWS = 10_000

/** The page size every export pages through the list endpoint at. */
const EXPORT_PAGE_SIZE = 100

export interface ExportFetchResult<T> {
  data: T[]
  /** Total rows matching the current search/filter/sort, across all pages. */
  total: number
}

type ExportFormat = "pdf" | "excel"

/**
 * Was `ExportPdfButton` — a labelled secondary button reading "Export
 * PDF". Renamed now that it offers two formats: an icon-only download
 * control (section 6.3) that opens a menu (section 16) offering PDF and
 * Excel.
 *
 * Downloads every row matching the screen's current search/filter/sort —
 * not the 25 (or 100) on screen. It pages the caller's `fetchPage` at
 * `pageSize=100` (the API's own hard cap, see
 * `backend/src/common/list-query.ts`) until every matching row has been
 * collected, then hands them to `lib/pdf-export.ts` or
 * `lib/excel-export.ts` to build the file — the SAME collected rows
 * either way, so the two formats can never disagree with each other or
 * with the screen.
 *
 * `fetchPage` receives the page number and page size to request and must
 * return exactly the rows for that page plus the grand total row count
 * for the current search/filter/sort — i.e. call the SAME endpoint the
 * on-screen table uses, with the same search/sort/filter params baked in
 * by the caller, varying only `page` and `pageSize`.
 *
 * `@react-pdf/renderer` (and the Gujarati/Devanagari fonts it renders
 * with) and `exceljs` are both heavy, so `lib/pdf-export.tsx` and
 * `lib/excel-export.ts` are imported dynamically inside their own
 * branch, and neither library nor its fonts ever enter the bundle for a
 * screen where nobody exports, or where somebody only ever exports the
 * other format.
 */
export function ExportButton<T>({
  label = "Download",
  className,
  fetchPage,
  columns,
  title,
  buildTotalRow,
  contextDescription,
}: {
  /** Screen-reader label and tooltip text. Defaults to "Download". */
  label?: string
  className?: string
  /**
   * Pages through every row matching the current search/filter/sort.
   * Called with page=1,2,3… at `pageSize=100` until `data.length <
   * pageSize` or `total` rows have been collected.
   */
  fetchPage?: (page: number, pageSize: number) => Promise<ExportFetchResult<T>>
  /**
   * Column definitions shared by both formats: header, how to read a
   * cell's text, numeric alignment, and (Excel only) the raw typed
   * value — date or amount — for that column.
   */
  columns?: ExportColumn<T>[]
  /** Report title, used as the PDF heading and both filenames' seed. */
  title?: string
  /**
   * Built once all rows are collected, from those rows, for the PDF's
   * bold total row. The Excel export never has a total row — the user's
   * explicit decision, since a trailing total breaks Excel's own sort
   * and pivots — so this is ignored on the Excel path.
   */
  buildTotalRow?: (rows: T[]) => PdfTotalRow | undefined
  /**
   * The active search/filter/sort described in words, e.g.
   * `Search: "cement" · Sort: Date (newest first)`. Shown under the PDF
   * heading only — a printed report that does not say it was filtered
   * is a lie by omission. The Excel export has no heading to carry it.
   */
  contextDescription?: string
}) {
  const [loading, setLoading] = React.useState<ExportFormat | false>(false)

  const runExport = React.useCallback(
    async (format: ExportFormat) => {
      if (loading) return
      if (!fetchPage || !columns) return

      setLoading(format)
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

        if (format === "pdf") {
          const { exportPdfTable } = await import("@/lib/pdf-export")
          await exportPdfTable({
            title: title ?? label,
            columns,
            rows,
            totalRow: buildTotalRow?.(rows),
            context: contextDescription,
          })
        } else {
          const { exportExcelTable } = await import("@/lib/excel-export")
          await exportExcelTable({
            title: title ?? label,
            columns,
            rows,
          })
        }
      } catch {
        // Section 7.2 rule 3: never a raw technical error.
        toast.error(
          format === "pdf"
            ? "The PDF could not be generated. Try again."
            : "The Excel file could not be generated. Try again.",
        )
      } finally {
        setLoading(false)
      }
    },
    [loading, fetchPage, columns, title, label, buildTotalRow, contextDescription],
  )

  const tooltipLabel = loading
    ? `Exporting ${loading.toUpperCase()}…`
    : label

  return (
    <DropdownMenu>
      <Tooltip>
        {/* Section 6.3: an icon-only button carries a hidden text label
            for screen readers as well as a tooltip on hover. */}
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={className}
                  aria-label={tooltipLabel}
                  disabled={!!loading}
                />
              }
            />
          }
        >
          {loading ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => runExport("pdf")}>PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={() => runExport("excel")}>Excel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
