import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { BaseCurrency } from '../../storage/holdings'
import type { DerivedRow } from '../../lib/holdingsView'
import { allocation, type AllocationSlice } from '../../lib/analytics'
import { formatMoney, formatPercent } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { donutPalette } from './chartTheme'

type Props = { rows: DerivedRow[]; baseCurrency: BaseCurrency }

/**
 * Currency-exposure donut — what fraction of the portfolio's priced value
 * sits in INR-listed vs USD-listed positions. Folded over `currentValueBase`
 * the same way `AllocationDonut` does in market mode, but presented without
 * a toggle so the currency split stays a primary signal rather than hidden
 * behind a click. There is no separate `currencyExposure` fold in
 * `lib/analytics.ts` — `allocation(rows, 'market')` already returns the
 * exact shape needed (INR/USD bucketed, largest-first), and a renaming
 * wrapper would just duplicate the same code path.
 */
export function CurrencyExposureDonut({ rows, baseCurrency }: Props) {
  const slices = useMemo(() => allocation(rows, 'market'), [rows])

  const total = slices.reduce((sum, s) => sum + s.valueBase, 0)
  const figure = total > 0 ? formatMoney(total, baseCurrency) : '—'

  const summary =
    slices.length === 0
      ? 'Currency exposure chart, no priced holdings yet.'
      : `Donut chart of currency exposure: ` +
        slices
          .map((s) => `${s.label} ${formatPercent(s.pct).replace('+', '')}`)
          .join(', ') +
        '.'

  return (
    <ChartCard title="Currency exposure" chip="donut" figure={figure}>
      {slices.length === 0 ? (
        <ChartEmpty message="Currency exposure needs at least one holding with a current price in your base currency." />
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
                    <Cell
                      key={slice.key}
                      fill={donutPalette[index % donutPalette.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<Tip baseCurrency={baseCurrency} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-bone-400">
                currency
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-bone-300">
                {slices.length} {slices.length === 1 ? 'market' : 'markets'}
              </span>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-1.5">
            {slices.map((slice, index) => (
              <li key={slice.key} className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0"
                  style={{ backgroundColor: donutPalette[index % donutPalette.length] }}
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
        {formatMoney(slice.valueBase, baseCurrency)} ·{' '}
        {formatPercent(slice.pct).replace('+', '')}
      </p>
    </div>
  )
}
