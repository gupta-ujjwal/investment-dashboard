import {
  CartesianGrid,
  Line,
  LineChart,
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

type TipPayload = { dataKey?: string | number; value?: number }
type TipProps = { active?: boolean; payload?: TipPayload[]; label?: string }

function tipValue(payload: TipPayload[], key: string): number | undefined {
  const hit = payload.find((p) => p.dataKey === key)
  return typeof hit?.value === 'number' ? hit.value : undefined
}

/**
 * Portfolio value vs. cost basis over time. The two lines are designed as one
 * reading: the amber value line above, the dashed bone cost-basis line below,
 * and the gap between them is the unrealised P&L. The X axis is ordinal — one
 * tick per snapshot day, never a continuous time scale — so a sparse history
 * (imports weeks apart) is drawn honestly, not smoothed over missing days. The
 * Y axis is auto-bounded (no forced zero) so the lines use the full frame —
 * a personal portfolio chart is read for change, not for an absolute floor.
 */
export function ValueOverTime({ series, baseCurrency }: Props) {
  const latest = series[series.length - 1]
  const figure =
    latest?.value === undefined ? '—' : formatMoney(latest.value, baseCurrency)

  // Text alternative for screen readers — the SVG itself is opaque to them.
  const summary =
    series.length < 2
      ? 'Portfolio value chart, awaiting a second snapshot.'
      : `Line chart of portfolio value versus invested cost across ${series.length} ` +
        `snapshots, ${formatDateKey(series[0].date)} to ` +
        `${formatDateKey(series[series.length - 1].date)}. Latest value ` +
        `${latest?.value === undefined ? 'unavailable' : formatMoney(latest.value, baseCurrency)}.`

  function Tip({ active, payload, label }: TipProps) {
    if (!active || !payload || payload.length === 0) return null
    const value = tipValue(payload, 'value')
    const invested = tipValue(payload, 'invested')
    const profit =
      value === undefined || invested === undefined ? undefined : value - invested
    return (
      <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
          {label ? formatDateKey(label) : ''}
        </p>
        <dl className="mt-1.5 space-y-0.5 font-mono text-[11px]">
          <Row label="Value" tone="text-tick-400" text={money(value, baseCurrency)} />
          <Row label="Invested" tone="text-bone-300" text={money(invested, baseCurrency)} />
          <Row
            label="P&L"
            tone={profit !== undefined && profit < 0 ? 'text-ember-400' : 'text-jade-400'}
            text={money(profit, baseCurrency)}
          />
        </dl>
      </div>
    )
  }

  return (
    <ChartCard title="Value over time" chip="line" figure={figure}>
      {series.length < 2 ? (
        <ChartEmpty message="A value trend appears once you've imported holdings on at least two different days." />
      ) : (
        <div role="img" aria-label={summary}>
          <ResponsiveContainer
            width="100%"
            height={224}
            initialDimension={{ width: 320, height: 224 }}
          >
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => compactMoney(v, baseCurrency)}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<Tip />} cursor={{ stroke: chartColor.grid }} />
              <Line
                type="monotone"
                dataKey="invested"
                name="Invested"
                stroke={chartColor.invested}
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="value"
                name="Value"
                stroke={chartColor.value}
                strokeWidth={1.6}
                dot={{ r: 2, fill: chartColor.value, strokeWidth: 0 }}
                activeDot={{ r: 3.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}

function money(value: number | undefined, currency: BaseCurrency): string {
  return value === undefined ? '—' : formatMoney(value, currency)
}

function Row({ label, tone, text }: { label: string; tone: string; text: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="text-bone-400">{label}</dt>
      <dd className={`tabular-nums ${tone}`}>{text}</dd>
    </div>
  )
}
