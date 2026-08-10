import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BaseCurrency } from '../../storage/holdings'
import type { ClassSeries } from '../../lib/analytics'
import { formatMoney } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { axisTick, chartColor, compactMoney, categoricalColor, formatDateKey } from './chartTheme'

type Props = {
  series: ClassSeries
  baseCurrency: BaseCurrency
}

type TipPayload = { dataKey?: string | number; value?: number; color?: string }
type TipProps = { active?: boolean; payload?: TipPayload[]; label?: string }

/** Stable colour per asset-class group — keyed by group name so a band keeps
 *  its colour when ordering changes. */
function groupColor(group: string): string {
  return categoricalColor(group)
}

/**
 * Historical progress across asset class: net worth over time, banded by
 * asset-class group (Equity / Crypto / Gold / …) as a stacked area. The X axis
 * is ordinal — one tick per snapshot day — so a sparse history is drawn
 * honestly rather than smoothed. Partial positions are already excluded from
 * each band by `classValueSeries`, so the stack is the *known* net worth by
 * class, never silently understated with a phantom zero.
 */
export function NetWorthHistoryArea({ series, baseCurrency }: Props) {
  const { groups, rows } = series
  const latest = rows[rows.length - 1]
  const cellValue = (g: string): number => {
    const v = latest?.[g]
    return typeof v === 'number' ? v : 0
  }
  const latestTotal =
    latest === undefined ? undefined : groups.reduce((sum, g) => sum + cellValue(g), 0)
  const figure = latestTotal === undefined ? '—' : formatMoney(latestTotal, baseCurrency)

  const summary =
    rows.length < 2
      ? 'Net-worth-by-asset-class history, awaiting a second snapshot.'
      : `Stacked area of net worth by asset class across ${rows.length} snapshots, ` +
        `${formatDateKey(rows[0].date)} to ${formatDateKey(rows[rows.length - 1].date)}, ` +
        `spanning ${groups.join(', ')}. Latest total ` +
        `${latestTotal === undefined ? 'unavailable' : formatMoney(latestTotal, baseCurrency)}.`

  function Tip({ active, payload, label }: TipProps) {
    if (!active || !payload || payload.length === 0) return null
    const total = payload.reduce((s, p) => s + (typeof p.value === 'number' ? p.value : 0), 0)
    return (
      <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
          {label ? formatDateKey(label) : ''}
        </p>
        <dl className="mt-1.5 space-y-0.5 font-mono text-[11px]">
          {/* Largest band first reads top-down like the stack. */}
          {[...payload]
            .filter((p) => typeof p.value === 'number' && p.value > 0)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .map((p) => (
              <div key={String(p.dataKey)} className="flex items-center justify-between gap-6">
                <dt className="flex items-center gap-1.5 text-bone-400">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2"
                    style={{ backgroundColor: p.color }}
                  />
                  {String(p.dataKey)}
                </dt>
                <dd className="tabular-nums text-bone-200">
                  {formatMoney(p.value ?? 0, baseCurrency)}
                </dd>
              </div>
            ))}
          <div className="mt-1 flex items-center justify-between gap-6 border-t border-bone-100/10 pt-1">
            <dt className="text-bone-300">Total</dt>
            <dd className="tabular-nums text-bone-200">{formatMoney(total, baseCurrency)}</dd>
          </div>
        </dl>
      </div>
    )
  }

  return (
    <ChartCard title="Net worth by asset class" chip="area" figure={figure}>
      {rows.length < 2 || groups.length === 0 ? (
        <ChartEmpty message="A net-worth-by-class trend appears once you have snapshots on at least two different days." />
      ) : (
        <div role="img" aria-label={summary}>
          <ResponsiveContainer
            width="100%"
            height={224}
            initialDimension={{ width: 320, height: 224 }}
          >
            <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                tickFormatter={(v: number) => compactMoney(v, baseCurrency)}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<Tip />} cursor={{ stroke: chartColor.grid }} />
              {groups.map((group) => (
                <Area
                  key={group}
                  type="monotone"
                  dataKey={group}
                  name={group}
                  stackId="networth"
                  stroke={groupColor(group)}
                  fill={groupColor(group)}
                  fillOpacity={0.25}
                  strokeWidth={1.2}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}
