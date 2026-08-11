import { useMemo } from 'react'
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
import type { BudgetMonth } from '../../storage/budget'
import { OTHER_TAG_KEY, tagTimeSeries, type TagTrend } from '../../lib/budget'
import { formatMoney } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { axisTick, chartColor, compactMoney, donutOther, donutPalette, formatMonthKey } from './chartTheme'

type Props = {
  months: BudgetMonth[]
  baseCurrency: BaseCurrency
}

/**
 * Per-tag trends across months — one multi-line chart for income categories, one
 * for expenses. Each line tracks a single category's amount month to month, so
 * the user can watch "Rent" or "Salary" move over time. Default export so
 * `BudgetRoute` can `React.lazy()` it, keeping Recharts out of the initial bundle
 * exactly like `BudgetCharts` (productContext/dsl.md § dsl-decision-guide).
 */
export default function TagTrends({ months, baseCurrency }: Props) {
  return (
    <section aria-label="Tag trends across months" className="space-y-3">
      <h3 className="font-sans text-sm font-medium  text-bone-300">
        By tag · across months
      </h3>
      <div className="grid gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 lg:grid-cols-2">
        <TagTrendChart months={months} kind="income" baseCurrency={baseCurrency} />
        <TagTrendChart months={months} kind="expense" baseCurrency={baseCurrency} />
      </div>
    </section>
  )
}

function displayLabel(key: string): string {
  return key === OTHER_TAG_KEY ? 'Other' : key
}

function seriesColor(key: string, index: number): string {
  return key === OTHER_TAG_KEY ? donutOther : donutPalette[index % donutPalette.length]
}

function TagTrendChart({
  months,
  kind,
  baseCurrency,
}: {
  months: BudgetMonth[]
  kind: 'income' | 'expense'
  baseCurrency: BaseCurrency
}) {
  const trend: TagTrend = useMemo(() => tagTimeSeries(months, kind), [months, kind])
  const title = kind === 'income' ? 'Income by tag' : 'Expenses by tag'

  const colorOf = useMemo(() => {
    const map = new Map<string, string>()
    trend.labels.forEach((key, i) => map.set(key, seriesColor(key, i)))
    return map
  }, [trend.labels])

  const summary =
    trend.labels.length === 0
      ? `${title} trend, no ${kind} recorded yet.`
      : `Line chart tracking ${trend.labels.length} ${kind} ${
          trend.labels.length === 1 ? 'tag' : 'tags'
        } across ${trend.rows.length} months: ${trend.labels.map(displayLabel).join(', ')}.`

  return (
    <ChartCard title={title} chip="line">
      {trend.labels.length === 0 ? (
        <ChartEmpty
          message={`Log ${kind} lines across a couple of months to see each tag's trend.`}
        />
      ) : (
        <div>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {trend.labels.map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0"
                  style={{ backgroundColor: colorOf.get(key) }}
                />
                <span className="font-sans text-xs text-bone-200">{displayLabel(key)}</span>
              </li>
            ))}
          </ul>
          <div role="img" aria-label={summary}>
            <ResponsiveContainer width="100%" height={224} initialDimension={{ width: 320, height: 224 }}>
              <LineChart data={trend.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={chartColor.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthKey}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={{ stroke: chartColor.grid }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 'auto']}
                  tickFormatter={(v: number) => compactMoney(v, baseCurrency)}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip content={<Tip baseCurrency={baseCurrency} />} cursor={{ stroke: chartColor.grid }} />
                {trend.labels.map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={(row) => (row as Record<string, number>)[key] ?? 0}
                    name={displayLabel(key)}
                    stroke={colorOf.get(key)}
                    strokeWidth={1.5}
                    dot={{ r: 2, fill: colorOf.get(key), strokeWidth: 0 }}
                    activeDot={{ r: 3.5 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartCard>
  )
}

type TipEntry = { name?: string; value?: number; color?: string }
type TipProps = { active?: boolean; payload?: TipEntry[]; label?: string; baseCurrency: BaseCurrency }

function Tip({ active, payload, label, baseCurrency }: TipProps) {
  if (!active || !payload || payload.length === 0) return null
  // Highest value first, and drop series that are 0 this month — a tooltip listing
  // ten "₹0" rows is noise, not signal.
  const rows = payload
    .filter((e) => typeof e.value === 'number' && e.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return (
    <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
        {label ? formatMonthKey(label) : ''}
      </p>
      {rows.length === 0 ? (
        <p className="mt-1 font-mono text-[11px] text-bone-400">—</p>
      ) : (
        <dl className="mt-1.5 space-y-0.5 font-mono text-[11px]">
          {rows.map((e) => (
            <div key={e.name} className="flex items-center justify-between gap-6">
              <dt className="flex items-center gap-1.5 text-bone-300">
                <span aria-hidden="true" className="h-2 w-2 shrink-0" style={{ backgroundColor: e.color }} />
                {e.name}
              </dt>
              <dd className="tabular-nums text-bone-100">{formatMoney(e.value ?? 0, baseCurrency)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
