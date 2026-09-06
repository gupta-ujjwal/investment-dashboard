import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BaseCurrency } from '../../storage/holdings'
import type { ValuePoint } from '../../lib/analytics'
import { formatMoney } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { axisTick, chartColor, compactMoney, formatDateKey } from './chartTheme'

type Props = { series: ValuePoint[]; baseCurrency: BaseCurrency }

type TipProps = {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
}

/**
 * Absolute P&L over time. The visual pair to `ValueOverTime` — same ordinal
 * date axis — but isolates the gap between value and cost basis into its own
 * area. The Y axis floors at zero (an area reads as magnitude from a zero
 * baseline) but extends below if the portfolio is at a loss, and its top is
 * auto-bounded so the trend uses the full frame rather than padding to a
 * round number well above the data.
 */
export function PnlOverTime({ series, baseCurrency }: Props) {
  const latest = series[series.length - 1]
  const figure =
    latest?.profit === undefined ? '—' : formatMoney(latest.profit, baseCurrency)

  // Text alternative for screen readers — the SVG itself is opaque to them.
  const summary =
    series.length < 2
      ? 'Profit and loss chart, awaiting a second snapshot.'
      : `Area chart of portfolio profit and loss across ${series.length} ` +
        `snapshots, ${formatDateKey(series[0].date)} to ` +
        `${formatDateKey(series[series.length - 1].date)}. Latest ` +
        `${latest?.profit === undefined ? 'unavailable' : formatMoney(latest.profit, baseCurrency)}.`

  // Colored by the latest point's sign — same rule as the KPI headline above
  // and the `Tip` tooltip below: undefined (last point unpriced) reads as
  // gain-toned, matching Tip's own `profit < 0 ? ember : jade` fallback.
  const areaColor = latest?.profit !== undefined && latest.profit < 0 ? chartColor.loss : chartColor.gain

  function Tip({ active, payload, label }: TipProps) {
    if (!active || !payload || payload.length === 0) return null
    const profit = typeof payload[0]?.value === 'number' ? payload[0].value : undefined
    const tone = profit !== undefined && profit < 0 ? 'text-ember-400' : 'text-jade-400'
    return (
      <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
          {label ? formatDateKey(label) : ''}
        </p>
        <p className={`mt-1 font-mono text-[11px] tabular-nums ${tone}`}>
          {profit === undefined ? '—' : formatMoney(profit, baseCurrency)}
        </p>
      </div>
    )
  }

  return (
    <ChartCard title="P&amp;L over time" chip="area" figure={figure}>
      {series.length < 2 ? (
        <ChartEmpty message="Profit history builds up as snapshots accumulate — import on two or more days to see the trend." />
      ) : (
        <div role="img" aria-label={summary}>
          <ResponsiveContainer
            width="100%"
            height={224}
            initialDimension={{ width: 320, height: 224 }}
          >
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnl-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={areaColor} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={areaColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartColor.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateKey}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: chartColor.grid }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={[(min: number) => Math.min(0, min), 'auto']}
                tickFormatter={(v: number) => compactMoney(v, baseCurrency)}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<Tip />} cursor={{ stroke: chartColor.grid }} />
              <ReferenceLine y={0} stroke={chartColor.axis} strokeWidth={1} />
              <Area
                type="monotone"
                dataKey="profit"
                stroke={areaColor}
                strokeWidth={1.6}
                fill="url(#pnl-fill)"
                dot={{ r: 2, fill: areaColor, strokeWidth: 0 }}
                activeDot={{ r: 3.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}
