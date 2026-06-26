import type { BaseCurrency } from '../../storage/holdings'
import type { ClassChange } from '../../lib/analytics'
import { formatMoney, formatPercent } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { compactMoney } from './chartTheme'

type Props = {
  changes: ClassChange[]
  baseCurrency: BaseCurrency
}

const SPARK_W = 120
const SPARK_H = 30

/** Build an SVG polyline `points` string for a sparkline, normalised into the
 *  fixed viewbox. A flat series (min === max) draws a centred mid-line rather
 *  than dividing by zero. */
function sparkPoints(values: number[]): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const step = SPARK_W / (values.length - 1)
  return values
    .map((v, i) => {
      const x = i * step
      const y = span === 0 ? SPARK_H / 2 : SPARK_H - ((v - min) / span) * SPARK_H
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/**
 * Change graphs of each asset class — small multiples, one mini card per
 * asset-class group with its window value trend (a hand-rolled SVG sparkline,
 * cheaper than N Recharts containers) and the window change %. Rising classes
 * read jade, falling ember, flat/uncomputable mute. Groups arrive in the same
 * stable order as the stacked area so the two surfaces line up.
 */
export function AssetClassSparklines({ changes, baseCurrency }: Props) {
  const hasData = changes.some((c) => c.points.length >= 2)

  return (
    <ChartCard title="Change by asset class" chip="trend">
      {!hasData ? (
        <ChartEmpty message="Per-class change appears once you have snapshots on at least two different days." />
      ) : (
        <ul className="grid grid-cols-1 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-2">
          {changes.map((c) => {
            const up = c.changePct !== undefined && c.changePct >= 0
            const tone =
              c.changePct === undefined
                ? 'text-bone-400'
                : up
                  ? 'text-jade-300'
                  : 'text-ember-300'
            const stroke =
              c.changePct === undefined
                ? 'var(--color-bone-500)'
                : up
                  ? 'var(--color-jade-400)'
                  : 'var(--color-ember-400)'
            return (
              <li key={c.group} className="bg-ink-900 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-sans text-[12px] text-bone-200">{c.group}</span>
                  <span className={`shrink-0 font-mono text-[11px] tabular-nums ${tone}`}>
                    {c.changePct === undefined
                      ? '—'
                      : `${up ? '↗' : '↘'} ${formatPercent(c.changePct)}`}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="font-mono text-[10px] text-bone-400 tabular-nums">
                    {formatMoney(c.latest, baseCurrency)}
                  </span>
                  <svg
                    width={SPARK_W}
                    height={SPARK_H}
                    viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                    className="shrink-0"
                    role="img"
                    aria-label={`${c.group} trend, latest ${compactMoney(c.latest, baseCurrency)}, ${
                      c.changePct === undefined
                        ? 'change not computable'
                        : `${up ? 'up' : 'down'} ${formatPercent(c.changePct)}`
                    }`}
                  >
                    <polyline
                      points={sparkPoints(c.points)}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={1.4}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ChartCard>
  )
}
