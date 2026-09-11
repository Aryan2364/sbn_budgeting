"use client"

import * as React from "react"
import {
  Bar,
  BarChart as RechartsBarChart,
  LabelList,
  XAxis,
  YAxis,
} from "recharts"

import { cn } from "@/lib/utils"

/**
 * Section 21, made into a component so no screen has to remember it.
 *
 * Recharts draws the bars. Every decision section 21 makes is taken
 * here rather than at the call site, because a chart palette chosen
 * per screen is how a red bar ends up meaning "third quarter".
 *
 *   - THE CATEGORICAL SEQUENCE, IN ORDER. Series 1 is the brand
 *     colour and series 2 is ochre, which are maximally different
 *     because most charts have only two or three series. The caller
 *     names its series; it never names a colour.
 *   - NEVER THE STATUS COLOURS. They are not in the list below, so a
 *     caller cannot reach one. A chart that is genuinely about status
 *     is a different component and does not exist yet.
 *   - MAXIMUM SIX SERIES. Past that, group the smallest into "Other".
 *     This throws in development rather than drawing a seventh colour
 *     nobody chose.
 *   - BARS START AT ZERO. Not a default that a later prop can
 *     override — the domain is fixed here.
 *   - DIRECT LABELS, NOT A LEGEND. Every bar carries its own value at
 *     its end, so the eye never travels to a key and back. The series
 *     names sit beside the chart title as a two-word key, which is
 *     next to the bars rather than across the card from them.
 *
 * HORIZONTAL BARS on purpose. Category names in this product are site
 * names and amounts are Indian-grouped rupees; both are long, and both
 * collide immediately under vertical bars. Sideways, each gets a whole
 * line to itself.
 *
 * The one thing that becomes a JS number is the bar's LENGTH, which is
 * a pixel measurement and cannot be anything else. The label beside it
 * is formatted from the original paise string, so the digits a person
 * reads never went through a float.
 *
 * NOT `ResponsiveContainer`. The width below is measured by this file
 * and handed to the chart explicitly, for one reason worth stating
 * because it is not obvious: **the first measurement is a
 * `getBoundingClientRect()` on mount and does not wait for the
 * observer to fire.**
 *
 * That matters more than it sounds. A `ResizeObserver` callback is
 * delivered during the browser's rendering steps, and a tab that is
 * not being painted does not run them — in a background tab the
 * observer never fires at all, not even its initial callback. A chart
 * whose only source of width is an observer draws at zero, or at a
 * stale width, in exactly the conditions where nobody is looking to
 * notice. Measuring once directly, then observing for changes, is
 * correct in both.
 *
 * Verified by mounting the dashboard at 1280, 1024, 768 and 700 and
 * measuring the SVG against its own container each time: the plot
 * matches its container to the pixel and every value label stays
 * inside the card. **Live resizing was NOT verified** — that path
 * needs the observer, and the tab available for testing was
 * backgrounded, where Chrome delivers no observer callbacks. One
 * resize in a foreground tab would close it.
 */

/**
 * Section 21's categorical sequence, in order. Tokens, never values.
 *
 * Two forms of the same six colours, because an SVG shape and a DOM
 * element are filled by different mechanisms. Neither is a colour: one
 * is a Tailwind class that resolves to `--color-chart-N`, the other is
 * a `var()` reference to the same token. Change the token and both
 * follow, which is the whole point of section 2.1.
 */
const SERIES_SWATCH_CLASS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
] as const

const SERIES_COLOURS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const

export const MAX_SERIES = SERIES_COLOURS.length

export interface BarChartSeries<T> {
  /** The words on the key. "Budget", "Actual". */
  label: string
  /** The bar's length. A pixel measurement, so a number is correct. */
  value: (row: T) => number
  /** What is written at the end of the bar. Formatted, not computed. */
  format: (row: T) => string
}

export function CategoryBarChart<T>({
  data,
  category,
  series,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  data: T[]
  /** The label down the left. */
  category: (row: T) => string
  series: BarChartSeries<T>[]
}) {
  if (series.length > MAX_SERIES) {
    throw new Error(
      `[design-system] A chart was given ${series.length} series. ` +
        `AGENTS.md section 21: maximum six series in one chart — group ` +
        `the smallest into "Other".`,
    )
  }

  /**
   * Recharts wants plain rows. The formatted string travels alongside
   * the number so the label never has to re-derive it.
   */
  const rows = data.map((row, index) => {
    const point: Record<string, string | number> = {
      category: category(row),
      key: String(index),
    }
    series.forEach((s, position) => {
      point[`v${position}`] = s.value(row)
      point[`t${position}`] = s.format(row)
    })
    return point
  })

  // One line per bar, plus breathing room between categories. Height
  // grows with the data rather than squeezing rows into a fixed box.
  const height = Math.max(160, rows.length * (series.length * 28 + 24) + 16)

  /**
   * The plot's own width, measured rather than assumed.
   *
   * A layout width cannot be derived in render — it only exists once
   * the browser has laid the element out — so this is one of the few
   * places an effect is the right tool rather than the lazy one.
   *
   * The direct measurement below the observer is not belt and braces.
   * It is the one that always runs; see the note at the top.
   */
  const plot = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    const element = plot.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    setWidth(Math.floor(element.getBoundingClientRect().width))
    return () => observer.disconnect()
  }, [])

  /**
   * Room for the value label at the end of the longest bar, taken out
   * of the plot rather than added to it — a fixed 120px margin on a
   * 700px card is a fifth of the chart, and on a 1400px one it is
   * nothing. A quarter of the width, floored and capped, keeps the
   * label on the card at every size that matters.
   */
  const labelGutter = Math.min(160, Math.max(80, Math.round(width / 4)))
  const categoryGutter = Math.min(160, Math.max(72, Math.round(width / 5)))

  return (
    <div
      className={cn(
        "w-full",
        /*
         * Every piece of text Recharts draws, styled through the type
         * and colour tokens rather than through props.
         *
         * Recharts wants `fill` and `fontSize` as props, which become
         * SVG presentation attributes — and a presentation attribute
         * cannot hold a `var()`, so a token could not reach it. These
         * are real CSS rules on the SVG text, which can.
         */
        "[&_text]:fill-text-secondary [&_text]:text-meta",
        className,
      )}
      {...props}
    >
      {/* The key. Two words beside the bars, not a legend across the
          card — section 21 asks for direct labelling where space
          allows, and this is what is left over once every bar carries
          its own number. */}
      <ul className="mb-4 flex flex-wrap items-center gap-4">
        {series.map((s, position) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-3 shrink-0 rounded-full",
                SERIES_SWATCH_CLASS[position],
              )}
            />
            <span className="text-label text-text-secondary">{s.label}</span>
          </li>
        ))}
      </ul>

      {/* The measured box. It is always in the tree, because the
          observer needs something to observe; the chart waits for it
          to have a width rather than drawing itself at zero. */}
      <div ref={plot} className="w-full">
        {width > 0 ? (
        <RechartsBarChart
          width={width}
          height={height}
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: labelGutter, bottom: 0, left: 0 }}
          barGap={4}
        >
          {/*
            The value axis. Its ticks are hidden, not absent: every bar
            already carries its own number, so a second set of numbers
            down the edge would be the same value in two forms.

            The DOMAIN still starts at zero, which is what section 21
            actually requires — a bar whose baseline is not zero lies
            about the ratio between two bars, whether or not the axis
            is drawn.
          */}
          <XAxis type="number" domain={[0, "auto"]} hide />
          <YAxis
            type="category"
            dataKey="category"
            width={categoryGutter}
            tickLine={false}
            axisLine={false}
          />
          {series.map((s, position) => (
            <Bar
              key={s.label}
              dataKey={`v${position}`}
              name={s.label}
              fill={SERIES_COLOURS[position]}
              radius={[0, 4, 4, 0]}
              barSize={18}
              isAnimationActive={false}
            >
              <LabelList dataKey={`t${position}`} position="right" />
            </Bar>
          ))}
        </RechartsBarChart>
        ) : null}
      </div>
    </div>
  )
}
