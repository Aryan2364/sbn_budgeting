/**
 * The one place a downloaded Excel export gets built. Mirrors
 * `lib/pdf-export.tsx`'s structure and reuses its `ExportColumn`
 * definitions (AGENTS.md section 1 rule 4) so a caller never defines its
 * columns twice for the two formats. Replaces the earlier CSV export,
 * which carried no formatting and forced Excel to guess column widths
 * and cell types — the reason this file exists.
 *
 * "Basic, nothing out of the way" per the client's own words: sized
 * columns, a bold brand-coloured header, frozen header + autofilter,
 * real typed date and amount cells. No extra styling beyond that.
 */

import ExcelJS from "exceljs"

import { buildExportFilename } from "@/lib/format"
import { resolveBrandColors } from "@/lib/pdf-export"
import type { ExportColumn } from "@/lib/pdf-export"

export interface ExportExcelOptions<T> {
  /** The report title: the seed for the downloaded filename and for the sheet name. */
  title: string
  columns: ExportColumn<T>[]
  rows: T[]
}

/** `dd/mm/yy`, matching AGENTS.md section 18 / `lib/format.ts`'s `DATE_FORMAT`. */
const EXCEL_DATE_FORMAT = "dd/mm/yy"

/**
 * Two decimals, Indian digit grouping. ExcelJS/the xlsx number-format
 * grammar has no built-in Indian grouping (`#,##0` groups in 3s
 * everywhere), so this hand-writes the Lakh/Crore grouping as literal
 * digit-position groups: `##,##,##0.00`. Excel's number-format engine
 * groups the LAST 3 digits together and then every 2 after that,
 * reading right to left — exactly the shape this literal produces.
 */
const EXCEL_AMOUNT_FORMAT = "##,##,##0.00;-##,##,##0.00"

/**
 * Whether a string round-trips through a JS number with NO loss and NO
 * ambiguity: digits only, no sign, no decimal point, no whitespace, no
 * leading zero unless the whole value is exactly `"0"`, and inside
 * `Number.isSafeInteger`'s range so a long reference number is never
 * silently rounded. Used only by a column that opts in via
 * `ExportColumn.excelNumericSafe` (see there for why this is never
 * applied automatically) — a free-text reference field like Bill no.
 * can legitimately hold `007`, `12-A` or `INV/2026/001`, and every one
 * of those must fail this check and stay text exactly as typed.
 */
export function isSafeExcelInteger(text: string): boolean {
  if (!/^(0|[1-9]\d*)$/.test(text)) return false
  return Number.isSafeInteger(Number(text))
}

/** `rgb(r, g, b)` -> `RRGGBB`, the form ExcelJS's ARGB fill/font colours take. */
function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (!match) return "174443" // brand fallback, never read outside this parse failure
  const [, r, g, b] = match
  return [r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("").toUpperCase()
}

/**
 * Excel forbids `: \ / ? * [ ]` in a sheet name and caps it at 31
 * characters. A name that violates either makes the workbook refuse to
 * open, so both are enforced here rather than trusted to the caller's
 * `title`, which is free text (e.g. "Site: Ranthambore" is a valid page
 * title and an invalid sheet name).
 */
function sanitizeSheetName(title: string): string {
  const cleaned = title.replace(/[:\\/?*[\]]/g, " ").trim() || "Export"
  return cleaned.length > 31 ? cleaned.slice(0, 31).trim() : cleaned
}

/**
 * Column width sized to its content, in Excel's "characters" width unit
 * (roughly one digit of the default font). Computed from the header text
 * and every cell's own DISPLAYED text — `col.cell(row)`, the same
 * formatted string the screen and the PDF show — never from the raw
 * `excelValue`. A date's `excelValue` is a JS `Date`; measuring its
 * `toISOString()` (24 characters) against the 8-character `dd/mm/yy` it
 * actually renders as is exactly the `########`-shaped bug this exporter
 * exists to fix, just moved one column format sideways. A numeric
 * `excelValue` has the same problem in the other direction: the bare
 * number `11974` measures short of the `11,974.00` it displays as.
 *
 * Defensive against every column shape (a column with only `cell`, one
 * with `excelValue`, one with neither `numeric` nor `excelValue`) so a
 * width can never come out `NaN` or `undefined` — `Number.isFinite`
 * guards the one path that could theoretically produce something else,
 * with a fallback wide enough to show a short header.
 */
/**
 * ExcelJS's OWN "no explicit width" sentinel — `Column.DEFAULT_COLUMN_WIDTH`
 * in `node_modules/exceljs/lib/doc/column.js`. A column whose `width`
 * comes out to exactly this value is treated by ExcelJS as NOT having a
 * custom width at all (`isCustomWidth`/`isDefault` compare `=== 9`), so
 * `Column.toModel` drops it from the workbook's `<cols>` entirely —
 * which is exactly the "Period column has no width" defect: its content
 * ("Period" + "Initial") happened to compute to precisely 9. Any column
 * can land on 9 depending on its data, so this is nudged away from
 * every time, not special-cased for one column.
 */
const EXCELJS_DEFAULT_COLUMN_WIDTH = 9

function computeColumnWidth(header: string, values: string[]): number {
  let longest = header.length
  for (const value of values) {
    const length = (value ?? "").length
    if (length > longest) longest = length
  }
  // +2 padding, floor from the header (so a short-content, long-header
  // column like "Description" is never narrower than its own title),
  // ceiling so one long free-text cell cannot stretch the sheet.
  const width = Math.max(header.length + 2, Math.min(longest + 2, 60))
  const safeWidth = Number.isFinite(width) ? width : header.length + 2 || 12
  return safeWidth === EXCELJS_DEFAULT_COLUMN_WIDTH ? safeWidth + 0.01 : safeWidth
}

/**
 * Builds and downloads an `.xlsx` of the given rows.
 *
 * - **Header row**: bold, brand fill with a contrasting foreground —
 *   `resolveBrandColors` (moved here from `lib/pdf-export.tsx`, still
 *   defined only there) reads the same computed CSS tokens the PDF uses,
 *   so this file never writes a brand hex of its own (section 1 rule 1)
 *   and a `--primary` change in `globals.css` reaches both exports alike.
 * - **Frozen header + autofilter** so the header stays visible while
 *   scrolling and every column is filterable from the header row.
 * - **Typed cells.** A date column's `excelValue` returns the underlying
 *   `Date`, written as a real date cell with a `dd/mm/yy` number format —
 *   sorts and filters as a date. An amount column's `excelValue` returns
 *   a `number` built from `paiseToRupeeInput` (lib/money.ts's exact,
 *   string-based paise->rupees conversion) and then `Number(...)` on
 *   THAT decimal string — never `paise / 100` or any float
 *   multiplication — so the only rounding that ever happens is the one
 *   IEEE-754 double already does converting a decimal literal to binary,
 *   the same rounding any spreadsheet number undergoes, not an
 *   additional error introduced by this exporter. The cell gets a
 *   two-decimal, Indian-grouped, right-aligned number format.
 * - **Absent stays absent.** `excelValue` returning `null` (or `cell`
 *   returning the on-screen "—") writes a genuinely empty cell — never
 *   `0`, per section 31.2.
 * - **A free-text reference column stays text UNLESS a specific value
 *   is safely numeric.** `excelNumericSafe` (see `ExportColumn`) opts a
 *   column like Bill no. into this per-cell check, never a blanket
 *   conversion — `87` becomes a real number so it sorts correctly, but
 *   `007` and `INV/2026/001` stay text exactly as typed, because a
 *   free-text field can legitimately hold either.
 * - **No total row** — the CSV work's decision carries over unchanged: a
 *   trailing total breaks a spreadsheet's own sort and pivot behaviour.
 *   The PDF keeps its total row.
 */
export async function exportExcelTable<T>(options: ExportExcelOptions<T>): Promise<void> {
  const { title, columns, rows } = options

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sanitizeSheetName(title), {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  const colors = resolveBrandColors()
  const headerFill = rgbToHex(colors.primary)
  const headerFontColor = rgbToHex(colors.primaryForeground)

  const columnTexts = columns.map((col) => rows.map((row) => col.cell(row)))

  sheet.columns = columns.map((col, index) => ({
    header: col.header,
    width: computeColumnWidth(col.header, columnTexts[index]),
  }))

  for (const row of rows) {
    const values = columns.map((col) => {
      const raw = col.excelValue ? col.excelValue(row) : col.cell(row)
      if (raw === null || raw === undefined || raw === "—") return null
      if (raw instanceof Date) return raw
      if (typeof raw === "number") return raw
      // A column with no `excelValue` (plain text) falls back to `cell`'s
      // string as-is — section 31.2 still applies via the "—" check above.
      // `excelNumericSafe` opts THIS specific cell into becoming a real
      // number, but only when it is exactly a plain integer — "007" and
      // "INV/2026/001" fall straight through to the text branch below.
      if (col.excelNumericSafe && isSafeExcelInteger(raw)) return Number(raw)
      return raw
    })
    sheet.addRow(values)
  }

  // Header styling: bold, brand fill, contrasting text.
  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: `FF${headerFontColor}` } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${headerFill}` } }
  })

  // Per-column number formats and alignment, driven by what excelValue
  // actually returns for that column (date vs amount vs plain numeric),
  // decided once per column rather than re-checked per row.
  columns.forEach((col, index) => {
    const column = sheet.getColumn(index + 1)
    const sample = rows.find((row) => {
      const raw = col.excelValue ? col.excelValue(row) : null
      return raw instanceof Date || typeof raw === "number"
    })
    const sampleValue = sample
      ? col.excelValue!(sample)
      : null

    if (col.excelNumericSafe) {
      // A mixed column — some cells real numbers, some text — gets
      // Excel's default per-cell alignment (numbers right, text left)
      // unless told otherwise, which reads as ragged. This column is
      // fundamentally a text/reference field (Bill no. is not marked
      // `numeric` on screen either, section 17), so every cell is
      // forced left, consistently, regardless of which ones happen to
      // be safely numeric this export.
      column.alignment = { horizontal: "left" }
    } else if (sampleValue instanceof Date) {
      column.numFmt = EXCEL_DATE_FORMAT
      column.alignment = { horizontal: "right" }
    } else if (typeof sampleValue === "number" || col.numeric) {
      column.numFmt = EXCEL_AMOUNT_FORMAT
      column.alignment = { horizontal: "right" }
    }
  })

  // Autofilter across the header, spanning every column and every data row.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: columns.length },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = buildExportFilename(title, "xlsx")
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
