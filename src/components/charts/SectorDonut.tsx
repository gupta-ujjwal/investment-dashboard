import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { BaseCurrency } from '../../storage/holdings'
import type { DerivedRow } from '../../lib/holdingsView'
import {
  sectorAllocation,
  UNKNOWN_SECTOR_KEY,
  type SectorMap,
  type SectorSlice,
} from '../../lib/analytics'
import { formatMoney, formatPercent } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { donutOther, donutPalette } from './chartTheme'

type Props = {
  rows: DerivedRow[]
  baseCurrency: BaseCurrency
  sectors: SectorMap
}

/** Beyond this many slices the tail is folded into a single "Other" wedge —
 *  a donut with 20 thin slivers reads as noise. Mirrors `AllocationDonut`'s
 *  precedent so the three donuts (allocation, currency, sector) read as
 *  one family of charts. */
const MAX_SLICES = 6

function withOther(slices: SectorSlice[]): SectorSlice[] {
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

function sliceColor(slice: SectorSlice, index: number): string {
  if (slice.key === '__other') return donutOther
  if (slice.key === UNKNOWN_SECTOR_KEY) return donutOther
  return donutPalette[index % donutPalette.length]
}

/**
 * Sector-bucketed allocation donut (issue #24, PR B). Reads the
 * hand-curated `sectors.json` map and folds priced holdings by their
 * `sourceSymbol`'s sector. Holdings whose symbol is not in the map land
 * in an explicit "Unknown" wedge (rendered in the neutral `donutOther`
 * colour); extending coverage is a one-line PR against the JSON.
 *
 * No mode toggle and no unified ontology — GICS labels for USD-listed
 * holdings appear next to NSE-classification labels for INR-listed ones.
 * Forcing them into a single taxonomy would mis-classify; presenting
 * them honestly side-by-side is the plan-confirmed design choice.
 */
export function SectorDonut({ rows, baseCurrency, sectors }: Props) {
  const slices = useMemo(
    () => withOther(sectorAllocation(rows, sectors)),
    [rows, sectors],
  )

  const total = slices.reduce((sum, s) => sum + s.valueBase, 0)
  const figure = total > 0 ? formatMoney(total, baseCurrency) : '—'

  const summary =
    slices.length === 0
      ? 'Sector allocation chart, no priced holdings yet.'
      : `Donut chart of sector allocation: ` +
        slices
          .map((s) => `${s.label} ${formatPercent(s.pct).replace('+', '')}`)
          .join(', ') +
        '.'

  return (
    <ChartCard title="Sector" chip="donut" figure={figure}>
      {slices.length === 0 ? (
        <ChartEmpty message="Sector allocation needs at least one holding with a current price in your base currency." />
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
                sector
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
  payload?: { payload?: SectorSlice }[]
  baseCurrency: BaseCurrency
}

function Tip({ active, payload, baseCurrency }: TipProps) {
  const slice = payload?.[0]?.payload
  if (!active || !slice) return null
  return (
    <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
      <p className="font-sans text-xs text-bone-100">{slice.label}</p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-bone-400">
        {formatMoney(slice.valueBase, baseCurrency)} ·{' '}
        {formatPercent(slice.pct).replace('+', '')}
      </p>
    </div>
  )
}
