import type { ImportRow } from "@/lib/api"

/**
 * Reading and writing the people spreadsheet (CONTRACT §2: the browser
 * parses the .xlsx with exceljs and sends JSON rows; the server never
 * sees the file).
 *
 * exceljs is heavy, so both functions load it on demand, the same way
 * the list export does.
 */

/** The columns, in template order. `aliases` are also accepted as headers. */
const COLUMNS: Array<{
  key: keyof ImportRow
  header: string
  aliases: string[]
  required?: boolean
  example: string
  note: string
}> = [
  { key: "name", header: "Name", aliases: ["full name"], required: true, example: "Ramesh Patel", note: "Required." },
  { key: "phone", header: "Phone", aliases: ["phone number", "mobile"], required: true, example: "98765 43210", note: "Required. People are matched by phone, then email, never by name." },
  { key: "email", header: "Email", aliases: ["email address"], example: "ramesh@example.com", note: "Optional." },
  { key: "designation", header: "Designation", aliases: [], example: "Supervisor", note: "One of the designations in Settings, Designations." },
  { key: "locations", header: "Locations", aliases: ["location"], example: "Vesu, Adajan", note: "Separate several with commas. New names are created as locations." },
  { key: "reportsToPhone", header: "Reports to phone", aliases: ["reports to", "manager phone"], example: "98765 00000", note: "The phone of the person they report to, in the database or in this file." },
  { key: "canLogin", header: "Can sign in", aliases: ["can login", "signs in"], example: "Yes", note: "Yes or No. Without a password, No." },
  { key: "password", header: "Password", aliases: [], example: "", note: "At least 8 characters, for someone who signs in." },
]

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

export interface ParsedSheet {
  rows: ImportRow[]
  /** The spreadsheet row number of each entry in `rows`, for the report. */
  sourceRows: number[]
}

export class SheetError extends Error {}

/** A cell as the text a person typed, whatever exceljs made of it. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "object") {
    const v = value as {
      text?: unknown
      result?: unknown
      richText?: Array<{ text: string }>
      hyperlink?: string
    }
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim()
    if (v.text !== undefined) return cellText(v.text)
    if (v.result !== undefined) return cellText(v.result)
  }
  return String(value).trim()
}

function yesNo(text: string): boolean | undefined {
  const t = norm(text)
  if (t === "") return undefined
  if (["yes", "y", "true", "1"].includes(t)) return true
  if (["no", "n", "false", "0"].includes(t)) return false
  return undefined
}

export async function parsePeopleSheet(file: File): Promise<ParsedSheet> {
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(await file.arrayBuffer())
  } catch {
    throw new SheetError(
      `${file.name} could not be read as an Excel workbook. Save it as .xlsx and choose it again.`,
    )
  }
  const sheet = workbook.worksheets[0]
  if (!sheet || sheet.rowCount === 0) {
    throw new SheetError(`${file.name} has no rows. Fill in the template and choose it again.`)
  }

  // Row 1 names the columns.
  const header = sheet.getRow(1)
  const columnOf = new Map<keyof ImportRow, number>()
  header.eachCell((cell, col) => {
    const text = norm(cellText(cell.value))
    const match = COLUMNS.find((c) => norm(c.header) === text || c.aliases.includes(text))
    if (match && !columnOf.has(match.key)) columnOf.set(match.key, col)
  })
  const missing = COLUMNS.filter((c) => c.required && !columnOf.has(c.key)).map((c) => c.header)
  if (missing.length > 0) {
    throw new SheetError(
      `The first row must name the columns, and ${missing.join(" and ")} ${
        missing.length === 1 ? "is" : "are"
      } missing. Download the template to see the layout.`,
    )
  }

  const rows: ImportRow[] = []
  const sourceRows: number[] = []
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    const get = (key: keyof ImportRow) => {
      const col = columnOf.get(key)
      return col ? cellText(row.getCell(col).value) : ""
    }
    const values = COLUMNS.map((c) => get(c.key))
    if (values.every((v) => v === "")) continue // a blank line, not a person

    const item: ImportRow = { name: get("name"), phone: get("phone") }
    const email = get("email")
    if (email) item.email = email
    const designation = get("designation")
    if (designation) item.designation = designation
    const locations = get("locations")
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (locations.length) item.locations = locations
    const reportsTo = get("reportsToPhone")
    if (reportsTo) item.reportsToPhone = reportsTo
    const canLogin = yesNo(get("canLogin"))
    if (canLogin !== undefined) item.canLogin = canLogin
    const password = get("password")
    if (password) item.password = password

    rows.push(item)
    sourceRows.push(r)
  }
  if (rows.length === 0) {
    throw new SheetError(
      `${file.name} has column names but no people under them. Add one person per row and choose it again.`,
    )
  }
  return { rows, sourceRows }
}

/** The template: the header row, one example row, and a notes sheet. */
export async function downloadPeopleTemplate(): Promise<void> {
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("People")
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 4) }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: "frozen", ySplit: 1 }]
  sheet.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, c.example])))

  const notes = workbook.addWorksheet("How to fill it in")
  notes.columns = [
    { header: "Column", key: "column", width: 20 },
    { header: "What goes in it", key: "note", width: 90 },
  ]
  notes.getRow(1).font = { bold: true }
  for (const c of COLUMNS) notes.addRow({ column: c.header, note: c.note })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "people-import-template.xlsx"
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
