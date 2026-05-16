import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { BaseCurrency } from '../../storage/holdings'
import type { DerivedRow } from '../../lib/holdingsView'
import { allocation, type AllocationMode, type AllocationSlice } from '../../lib/analytics'
import { formatMoney, formatPercent } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { donutOther, donutPalette } from './chartTheme'

type Props = { rows: DerivedRow[]; baseCurrency: BaseCurrency }

/** Beyond this many slices the tail is folded into a single "Other" wedge —
 *  a donut with 20 thin slivers reads as noise. */
const MAX_SLICES = 6

function withOther(slices: AllocationSlice[]): AllocationSlice[] {
  if (slices.length <= MAX_SLICES) return slices
  const head = slices.slice(0, MAX_SLICES - 1)
  const tail = slices.slice(MAX_SLICES - 1)
  return [
    ...head,
    {
      key: '__other',
      label: `Other (${tail.length})`,
      valueBase: tail.reduce((sum, s) => sum + s.valueBase, 0),
      pct: tail.reduce((sum, s) => sum + s.pct, 0),
    },
  ]
}

function sliceColor(slice: AllocationSlice, index: number): string {
  return slice.key === '__other' ? donutOther : donutPalette[index % donutPalette.length]
}

/**
 * Current-value allocation as a donut, with a market ↔ holding toggle. The
 * hollow centre carries the total so the donut answers "how much, split how"
 * in one glance. Only priced holdings are allocated — an unstamped position
 * cannot honestly claim a wedge.
 */
export function AllocationDonut({ rows, baseCurrency }: Props) {
  const [mode, setMode] = useState<AllocationMode>('market')
  const slices = useMemo(() => withOther(allocation(rows, mode)), [rows, mode])

  const total = slices.reduce((sum, s) => sum + s.valueBase, 0)
  const figure = total > 0 ? formatMoney(total, baseCurrency) : '—'

  // Text alternative for the donut SVG. The legend below is real text and
  // stays outside the `role="img"` wrapper, so it is not double-announced.
  const summary =
    slices.length === 0
      ? 'Allocation chart, no priced holdings yet.'
      : `Donut chart of allocation by ${mode}: ` +
        slices
          .map((s) => `${s.label} ${formatPercent(s.pct).replace('+', '')}`)
          .join(', ') +
        '.'

  const toggle = (
    <div className="flex border border-bone-100/15">
      {(['market', 'holding'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
            mode === m
              ? 'bg-tick-400 text-ink-950'
              : 'text-bone-400 hover:text-bone-100'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )

  return (
    <ChartCard title="Allocation" chip="donut" figure={figure} action={toggle}>
      {slices.length === 0 ? (
        <ChartEmpty message="Allocation needs at least one holding with a current price in your base currency." />
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div role="img" aria-label={summary} className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 176, height: 176 }}
            >
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="valueBase"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="94%"
                  paddingAngle={1.5}
                  stroke="var(--color-ink-900)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                >
                  {slices.map((slice, index) => (
                    <Cell key={slice.key} fill={sliceColor(slice, index)} />
                  ))}
                </Pie>
                <Tooltip content={<Tip baseCurrency={baseCurrency} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-bone-400">
                {mode}
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-bone-300">
                {slices.length} {slices.length === 1 ? 'slice' : 'slices'}
              </span>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-1.5">
            {slices.map((slice, index) => (
              <li key={slice.key} className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0"
                  style={{ backgroundColor: sliceColor(slice, index) }}
                />
                <span className="min-w-0 flex-1 truncate font-sans text-xs text-bone-200">
                  {slice.label}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-bone-400">
                  {formatPercent(slice.pct).replace('+', '')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}

type TipProps = {
  active?: boolean
  payload?: { payload?: AllocationSlice }[]
  baseCurrency: BaseCurrency
}

function Tip({ active, payload, baseCurrency }: TipProps) {
  const slice = payload?.[0]?.payload
  if (!active || !slice) return null
  return (
    <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
      <p className="font-sans text-xs text-bone-100">{slice.label}</p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-bone-400">
        {formatMoney(slice.valueBase, baseCurrency)} · {formatPercent(slice.pct).replace('+', '')}
      </p>
    </div>
  )
}
