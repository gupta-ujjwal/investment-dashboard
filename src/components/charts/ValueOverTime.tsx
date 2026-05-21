import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useMemo } from 'react'
import type { BaseCurrency } from '../../storage/holdings'
import type { BenchmarkOverlayPoint, ValuePoint } from '../../lib/analytics'
import { formatMoney } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { axisTick, chartColor, compactMoney, formatDateKey } from './chartTheme'

/** Optional benchmark overlay layered on top of the portfolio value line.
 *  Already rebased to portfolio start (`analytics.benchmarkSeries`). The
 *  caller is responsible for `mixedCurrency` detection — we don't second-
 *  guess the apples-to-oranges hide here. */
export type BenchmarkOverlay = {
  series: BenchmarkOverlayPoint[]
  /** What the legend renders ("NIFTY 50 (rebased)" / "S&P 500 (rebased)"). */
  label: string
  /** Last date in the bundled benchmark JSON. Drives the "as of" caption
   *  and the stale-banner threshold (legend dims the line beyond 30d). */
  asOf: string
  /** True for mixed-currency portfolios. The line is hidden and the legend
   *  shows a caveat explaining why — single-index comparison would be
   *  misleading (apples-to-oranges by construction). */
  mixedCurrency?: boolean
}

type Props = {
  series: ValuePoint[]
  baseCurrency: BaseCurrency
  benchmark?: BenchmarkOverlay
}

/** Beyond this many days "as of" a benchmark is considered stale —
 *  the legend gains an ember chip and the line dims. Threshold from the
 *  analytics-depth plan (review finding 4). */
const BENCHMARK_STALE_DAYS = 30

type ChartDatum = {
  date: string
  value: number | undefined
  invested: number | undefined
  benchmark: number | undefined
}

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
export function ValueOverTime({ series, baseCurrency, benchmark }: Props) {
  const latest = series[series.length - 1]
  const figure =
    latest?.value === undefined ? '—' : formatMoney(latest.value, baseCurrency)

  // Merge portfolio series + benchmark overlay into a single Recharts data
  // array, keyed by date. Recharts handles `undefined` cells as line gaps,
  // so portfolio dates outside the benchmark range render the value line
  // alone — no special-case needed.
  const chartData: ChartDatum[] = useMemo(() => {
    const benchByDate = new Map(
      (benchmark?.series ?? []).map((p) => [p.date, p.value]),
    )
    return series.map((s) => ({
      date: s.date,
      value: s.value,
      invested: s.invested,
      benchmark:
        benchmark && !benchmark.mixedCurrency
          ? benchByDate.get(s.date)
          : undefined,
    }))
  }, [series, benchmark])

  // A benchmark overlay older than BENCHMARK_STALE_DAYS dims its own line
  // and surfaces an ember "stale" chip in the legend. Refresh-script
  // failure / unmerged refresh PR is the typical cause — the UI signal
  // replaces the missing runtime telemetry (R10 forbids it).
  const benchmarkStale = useMemo(() => {
    if (!benchmark) return false
    const ageDays =
      (Date.now() - new Date(benchmark.asOf).getTime()) / (24 * 3600 * 1000)
    return ageDays > BENCHMARK_STALE_DAYS
  }, [benchmark])

  const showBenchmarkLine = Boolean(
    benchmark && !benchmark.mixedCurrency && (benchmark.series.length > 0),
  )

  // Text alternative for screen readers — the SVG itself is opaque to them.
  const summary =
    series.length < 2
      ? 'Portfolio value chart, awaiting a second snapshot.'
      : `Line chart of portfolio value versus invested cost across ${series.length} ` +
        `snapshots, ${formatDateKey(series[0].date)} to ` +
        `${formatDateKey(series[series.length - 1].date)}. Latest value ` +
        `${latest?.value === undefined ? 'unavailable' : formatMoney(latest.value, baseCurrency)}.` +
        (showBenchmarkLine
          ? ` ${benchmark!.label} overlay shown, as of ${formatDateKey(benchmark!.asOf)}` +
            (benchmarkStale ? ' (stale).' : '.')
          : benchmark?.mixedCurrency
            ? ' Benchmark hidden — portfolio is mixed-currency.'
            : '')

  function Tip({ active, payload, label }: TipProps) {
    if (!active || !payload || payload.length === 0) return null
    const value = tipValue(payload, 'value')
    const invested = tipValue(payload, 'invested')
    const benchmarkValue = tipValue(payload, 'benchmark')
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
          {showBenchmarkLine && benchmarkValue !== undefined && (
            <Row
              label={benchmark!.label}
              tone="text-bone-400"
              text={money(benchmarkValue, baseCurrency)}
            />
          )}
        </dl>
      </div>
    )
  }

  return (
    <ChartCard title="Value over time" chip="line" figure={figure}>
      {series.length < 2 ? (
        <ChartEmpty message="A value trend appears once you've imported holdings on at least two different days." />
      ) : (
        <div>
          {benchmark && (
            <BenchmarkLegend
              label={benchmark.label}
              asOf={benchmark.asOf}
              stale={benchmarkStale}
              mixedCurrency={benchmark.mixedCurrency}
              hasOverlay={showBenchmarkLine}
            />
          )}
          <div role="img" aria-label={summary}>
            <ResponsiveContainer
              width="100%"
              height={224}
              initialDimension={{ width: 320, height: 224 }}
            >
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                {showBenchmarkLine && (
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name={benchmark!.label}
                    // Stale overlays dim to 0.4 so the user sees an "old"
                    // reference line at a glance — chip + dimmed line are
                    // the two halves of the stale-data UX (no runtime
                    // telemetry by doctrine).
                    stroke={chartColor.benchmark}
                    strokeOpacity={benchmarkStale ? 0.4 : 0.85}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
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
        </div>
      )}
    </ChartCard>
  )
}

function BenchmarkLegend({
  label,
  asOf,
  stale,
  mixedCurrency,
  hasOverlay,
}: {
  label: string
  asOf: string
  stale: boolean
  mixedCurrency?: boolean
  hasOverlay: boolean
}) {
  if (mixedCurrency) {
    return (
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-400">
        Benchmark hidden — switch base to compare against a single index.
      </p>
    )
  }
  if (!hasOverlay) {
    // Benchmark provided but no overlay rendered (history outside bundled
    // range). Stay silent rather than show a misleading "as of" caption
    // for a line that isn't visible.
    return null
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-400">
      <span
        aria-hidden="true"
        className="inline-block h-px w-3 bg-bone-500"
        style={{ borderTop: '1px dashed currentColor' }}
      />
      <span>{label}</span>
      <span>· as of {formatDateKey(asOf)}</span>
      {stale && (
        <span className="border border-ember-400/40 bg-ember-400/10 px-1.5 py-px text-ember-400">
          stale
        </span>
      )}
    </div>
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
