/**
 * The one place a downloaded PDF report gets built. Every screen that
 * exports a table calls this — never a per-screen copy (AGENTS.md
 * section 1 rule 4).
 *
 * jsPDF has no GSUB/complex-script shaping engine, so Gujarati text (a
 * pre-base matra that has to render before its consonant, conjuncts that
 * fuse several codepoints into one ligature glyph) came out as garbage.
 * @react-pdf/renderer shapes text through fontkit, which handles this
 * correctly — verified against the exact strings that broke before
 * (`સિંચાઈ`, `ક્ષેત્ર`) with a standalone fontkit script before this file
 * was written.
 *
 * react-pdf cannot read CSS custom properties either: a PDF is not the
 * DOM, so `var(--primary)` means nothing to it. Section 1 rule 1 still
 * applies though ("never a hex code outside globals.css"), so this module
 * never writes a brand hex of its own. Instead `resolveBrandColors` reads
 * the COMPUTED values of the tokens already defined in `app/globals.css`
 * via `getComputedStyle(document.documentElement)` at call time, in the
 * browser, and hands react-pdf plain `rgb(r, g, b)` strings derived from
 * them. Change `--primary` in `globals.css` and the next export picks it
 * up with no edit here.
 */

import * as React from "react"

import { formatDate } from "@/lib/format"

export interface PdfColumn<T> {
  /** Column header text. */
  header: string
  /** How to read this column's text out of a row. */
  cell: (row: T) => string
  /** Right-aligns the column. Section 18: numbers and amounts align right. */
  numeric?: boolean
}

export interface PdfTotalRow {
  /** One string per column, in the same order as `columns`. */
  cells: string[]
}

export interface ExportPdfOptions<T> {
  /** The report heading, and the seed for the downloaded filename. */
  title: string
  columns: PdfColumn<T>[]
  rows: T[]
  /** Rendered bold, pinned to the end of the table. */
  totalRow?: PdfTotalRow
  /**
   * The active search / filter / sort, described in words — e.g.
   * `Search: "cement" · Sort: Date (newest first) · Filter: Site = Ranthambore`.
   * A printed report that does not say it was filtered is a lie by
   * omission, so this is shown under the heading whenever supplied.
   */
  context?: string
}

/** `rgb(r, g, b)` string, the shape react-pdf's colour props take. */
type RgbColor = string

const FALLBACK_PRIMARY: RgbColor = "rgb(23, 68, 67)" // #174443, only if the token cannot be read at all
const FALLBACK_TEXT: RgbColor = "rgb(23, 23, 23)" // #171717
const FALLBACK_BORDER: RgbColor = "rgb(212, 212, 212)" // #d4d4d4
const FALLBACK_MUTED: RgbColor = "rgb(115, 115, 115)" // #737373
const FALLBACK_PRIMARY_FOREGROUND: RgbColor = "rgb(255, 255, 255)"
const FALLBACK_BORDER_LIGHT: RgbColor = "rgb(229, 229, 229)"
const FALLBACK_SURFACE_SUNKEN: RgbColor = "rgb(250, 250, 250)"

/** Parses whatever `getComputedStyle` hands back for a colour token into an `rgb()` string. */
function parseCssColor(value: string): RgbColor | null {
  const text = value.trim()

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const digits = hex[1]
    const full =
      digits.length === 3
        ? digits.split("").map((c) => c + c).join("")
        : digits
    const num = parseInt(full, 16)
    return `rgb(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255})`
  }

  const rgb = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (rgb) {
    return `rgb(${Math.round(Number(rgb[1]))}, ${Math.round(Number(rgb[2]))}, ${Math.round(Number(rgb[3]))})`
  }

  return null
}

/** Reads a `--token` off `:root` and resolves it to `rgb()`, falling back if unreadable. */
function readToken(styles: CSSStyleDeclaration, token: string, fallback: RgbColor): RgbColor {
  const raw = styles.getPropertyValue(token)
  if (!raw) return fallback
  const parsed = parseCssColor(raw)
  return parsed ?? fallback
}

interface BrandColors {
  primary: RgbColor
  primaryForeground: RgbColor
  textPrimary: RgbColor
  textMuted: RgbColor
  border: RgbColor
  borderLight: RgbColor
  surfaceSunken: RgbColor
}

/**
 * Reads the brand colours off `document.documentElement` at export time.
 * Browser-only — `ExportPdfButton` is a client component and this only
 * ever runs from its click handler.
 */
function resolveBrandColors(): BrandColors {
  const styles = getComputedStyle(document.documentElement)
  return {
    primary: readToken(styles, "--primary", FALLBACK_PRIMARY),
    primaryForeground: readToken(styles, "--primary-foreground", FALLBACK_PRIMARY_FOREGROUND),
    textPrimary: readToken(styles, "--text-primary", FALLBACK_TEXT),
    textMuted: readToken(styles, "--text-muted", FALLBACK_MUTED),
    border: readToken(styles, "--border", FALLBACK_BORDER),
    borderLight: readToken(styles, "--border-light", FALLBACK_BORDER_LIGHT),
    surfaceSunken: readToken(styles, "--surface-sunken", FALLBACK_SURFACE_SUNKEN),
  }
}

/** `Expenses-2026-09-22.pdf` — no spaces, nothing Windows rejects. */
function buildFilename(title: string): string {
  const iso = new Date()
  const isoDate = `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, "0")}-${String(
    iso.getDate(),
  ).padStart(2, "0")}`
  const safeTitle = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
  return `${safeTitle}-${isoDate}.pdf`
}

/**
 * A static, single-weight Noto Sans Gujarati (not the ~660KB variable
 * font) covers Gujarati, basic Latin (column headers, English cost-head
 * names) AND the rupee sign U+20B9 that `formatAmount` emits — verified
 * with fontkit against the shipped files before this was written.
 *
 * Noto Sans Gujarati does NOT cover Devanagari (Hindi) — verified with
 * fontkit: U+0939 (ह), U+0928 (न) and U+0940 (ी) all resolve to glyph 0
 * (.notdef) in that font. A second static family, Noto Sans Devanagari,
 * is registered to cover it, carrying its own GSUB/GPOS/GDEF tables for
 * the pre-base matra reordering and conjunct shaping Devanagari needs,
 * same as Gujarati.
 *
 * `FONT_STACK` below is handed to react-pdf as the `fontFamily`, which
 * `@react-pdf/layout` (lib/index.js, `typeof fontFamily === "string" ?
 * [fontFamily] : [...fontFamily]`) turns into an ordered array of
 * resolved Font objects, and `@react-pdf/textkit`'s `fontSubstitution`
 * (`pickFontFromFontStack`) then walks that array PER CODE POINT and
 * uses the first font that has a glyph for it. So Gujarati stays on
 * NotoSansGujarati and Hindi falls through to NotoSansDevanagari
 * automatically, per character, with no manual script splitting.
 *
 * Both families register normal and bold weights so the fallback still
 * resolves correctly on the bold header row and the bold total row.
 *
 * Registered lazily, once, the first time a PDF is built.
 */
const FONT_STACK = ["NotoSansGujarati", "NotoSansDevanagari"]

let fontsRegistered = false
function registerFonts(Font: typeof import("@react-pdf/renderer").Font): void {
  if (fontsRegistered) return
  Font.register({
    family: "NotoSansGujarati",
    fonts: [
      { src: "/fonts/NotoSansGujarati-Regular.ttf", fontWeight: "normal" },
      { src: "/fonts/NotoSansGujarati-Bold.ttf", fontWeight: "bold" },
    ],
  })
  Font.register({
    family: "NotoSansDevanagari",
    fonts: [
      { src: "/fonts/NotoSansDevanagari-Regular.ttf", fontWeight: "normal" },
      { src: "/fonts/NotoSansDevanagari-Bold.ttf", fontWeight: "bold" },
    ],
  })
  // react-pdf hyphenates by default, which breaks Gujarati/Devanagari
  // conjuncts apart mid-word when a cell wraps. Turn it off; wrapping
  // still works.
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

/**
 * Builds and downloads a PDF report table. Landscape, repeating header,
 * page numbers, wrapped text (never clipped or overlapping — section 1
 * rule 6), and a bold total row when supplied.
 *
 * `@react-pdf/renderer` is heavy and pulls in the Gujarati font, so it is
 * imported dynamically inside the click handler rather than at module
 * scope — neither the library nor the font ever enters the bundle for a
 * page that only shows the export button, and the font is fetched by URL
 * only when an export actually runs.
 */
export async function exportPdfTable<T>(options: ExportPdfOptions<T>): Promise<void> {
  const { title, columns, rows, totalRow, context } = options

  const { Document, Page, Text, View, Font, StyleSheet, pdf } = await import(
    "@react-pdf/renderer"
  )
  registerFonts(Font)

  const colors = resolveBrandColors()

  const styles = StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingBottom: 32,
      paddingHorizontal: 32,
      fontFamily: FONT_STACK,
      fontSize: 9,
      color: colors.textPrimary,
    },
    heading: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 4,
    },
    metaLine: {
      fontSize: 9,
      color: colors.textMuted,
      marginBottom: 2,
    },
    table: {
      marginTop: 12,
      borderTopWidth: 0.5,
      borderLeftWidth: 0.5,
      borderColor: colors.border,
    },
    headerRow: {
      flexDirection: "row",
      backgroundColor: colors.primary,
    },
    row: {
      flexDirection: "row",
    },
    rowAlt: {
      flexDirection: "row",
      backgroundColor: colors.surfaceSunken,
    },
    totalRow: {
      flexDirection: "row",
      backgroundColor: colors.borderLight,
    },
    headerCell: {
      flex: 1,
      padding: 6,
      fontSize: 9,
      fontWeight: "bold",
      color: colors.primaryForeground,
      borderRightWidth: 0.5,
      borderBottomWidth: 0.5,
      borderColor: colors.border,
    },
    cell: {
      flex: 1,
      padding: 6,
      fontSize: 9,
      borderRightWidth: 0.5,
      borderBottomWidth: 0.5,
      borderColor: colors.border,
    },
    cellRight: {
      textAlign: "right",
    },
    totalCell: {
      fontWeight: "bold",
    },
    footer: {
      position: "absolute",
      bottom: 12,
      right: 32,
      fontSize: 8,
      color: colors.textMuted,
    },
  })

  const cellStyle = (numeric?: boolean) => (numeric ? [styles.cell, styles.cellRight] : styles.cell)
  const totalCellStyle = (numeric?: boolean) =>
    numeric ? [styles.cell, styles.cellRight, styles.totalCell] : [styles.cell, styles.totalCell]

  /**
   * A total row's label often sits alone in one narrow column (e.g. "Total
   * for all matching expenses" in a table whose other leading columns are
   * blank on the total row), and at that column's own width — the same as
   * every other data column — the label wraps to two lines. It never needs
   * to: every column before the first NUMERIC one is blank except for the
   * label, so those columns are merged into one wide cell spanning their
   * combined width (their `flex` values summed), leaving the numeric
   * columns exactly as wide as they were and the amount aligned exactly
   * where it always was under the Amount header.
   *
   * A total row like "Total | 1,200 | 950 | ..." (one word per leading
   * column, one number per numeric column) merges into a single-column
   * group of span 1, which renders identically to before this change.
   */
  const totalGroups = totalRow
    ? (() => {
        const groups: { span: number; text: string; numeric: boolean }[] = []
        let i = 0
        while (i < totalRow.cells.length) {
          if (columns[i]?.numeric) {
            groups.push({ span: 1, text: totalRow.cells[i], numeric: true })
            i += 1
            continue
          }
          let span = 0
          let text = ""
          while (i < totalRow.cells.length && !columns[i]?.numeric) {
            if (totalRow.cells[i]) text = totalRow.cells[i]
            span += 1
            i += 1
          }
          groups.push({ span, text, numeric: false })
        }
        return groups
      })()
    : []

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.metaLine}>Generated {formatDate(new Date())}</Text>
        {context ? <Text style={styles.metaLine}>{context}</Text> : null}

        <View style={styles.table}>
          {/* `fixed` repeats this row on every page react-pdf lays the table out over. */}
          <View style={styles.headerRow} fixed>
            {columns.map((col, index) => (
              <Text key={index} style={styles.headerCell}>
                {col.header}
              </Text>
            ))}
          </View>

          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={rowIndex % 2 === 1 ? styles.rowAlt : styles.row} wrap={false}>
              {columns.map((col, colIndex) => (
                <Text key={colIndex} style={cellStyle(col.numeric)}>
                  {col.cell(row)}
                </Text>
              ))}
            </View>
          ))}

          {totalRow ? (
            <View style={styles.totalRow} wrap={false}>
              {totalGroups.map((group, index) => (
                <Text
                  key={index}
                  style={[...totalCellStyle(group.numeric), { flex: group.span }]}
                >
                  {group.text}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = buildFilename(title)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
