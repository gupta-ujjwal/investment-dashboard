import type { ReactNode } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

/**
 * One donut slice, fully resolved by the caller: arc size (`value`), colour, and
 * the two bits of text the shell shows (compact `legendRight` beside the label,
 * fuller `tooltipText` on hover). Keeping colour + text resolution in the caller
 * is deliberate — see `DonutShell` below.
 */
export type DonutDatum = {
  key: string
  label: string
  color: string
  /** Arc size. Must be ≥ 0; the shell assumes the caller has already dropped
   *  non-positive slices (a donut cannot draw a negative arc). */
  value: number
  /** Right-aligned text in the legend row (e.g. a percentage). */
  legendRight: string
  /** Body text shown under the label in the hover tooltip (e.g. `₹80,000 · 65%`). */
  tooltipText: string
}

type Props = {
  data: DonutDatum[]
  /** Sentence describing the chart for screen readers (the ring is `role="img"`). */
  ariaLabel: string
  /** Two-line label centred in the ring — a tiny mono caption over a value. */
  centerTop: string
  centerBottom: string
}

/**
 * The *non-varying* presentational shell shared by the budget donuts — the ring
 * geometry, the responsive container, the legend list, the hover tooltip, and
 * the centred caption. It is intentionally NOT a configurable "any donut": slice
 * colour, value formatting, Other-folding, and empty-state copy all differ across
 * the app's donuts, so those stay in each caller; this shell only owns the parts
 * that are identical. The three shipped donuts (allocation/currency/sector) are
 * left untouched — generalising them onto one primitive is a separate follow-up.
 *
 * Geometry mirrors `SectorDonut` (inner 62% / outer 94%, no animation, ring left
 * / legend right) so the budget donuts read as one of the same family.
 */
export function DonutShell({ data, ariaLabel, centerTop, centerBottom }: Props) {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div role="img" aria-label={ariaLabel} className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 176, height: 176 }}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="94%"
              paddingAngle={1.5}
              stroke="var(--color-ink-900)"
              strokeWidth={1.5}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-bone-400">
            {centerTop}
          </span>
          <span className="mt-0.5 font-mono text-[10px] text-bone-300">{centerBottom}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="min-w-0 flex-1 truncate font-sans text-xs text-bone-200">
              {d.label}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-bone-400">
              {d.legendRight}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type TipProps = {
  active?: boolean
  payload?: { payload?: DonutDatum }[]
}

function DonutTip({ active, payload }: TipProps): ReactNode {
  const d = payload?.[0]?.payload
  if (!active || !d) return null
  return (
    <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
      <p className="font-sans text-xs text-bone-100">{d.label}</p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-bone-400">{d.tooltipText}</p>
    </div>
  )
}
