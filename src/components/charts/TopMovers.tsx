import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DerivedRow } from '../../lib/holdingsView'
import { topMovers } from '../../lib/analytics'
import { formatPercent } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { axisTick, chartColor } from './chartTheme'

type Props = { rows: DerivedRow[] }

/** Up to five best and five worst — more than that and the bars get too thin
 *  to read on mobile. */
const SIDE = 5

type MoverBar = { key: string; label: string; full: string; pct: number }

function truncate(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name
}

/**
 * Best and worst positions by lifetime P&L %. Bars diverge from a centre zero
 * line — gainers extend right in jade, losers left in ember — so the portfolio
 * reads like a thermometer. P&L % is currency-neutral, so this chart needs no
 * FX and works on the very first import.
 */
export function TopMovers({ rows }: Props) {
  const movers = topMovers(rows)
  const shown =
    movers.length <= SIDE * 2
      ? movers
      : [...movers.slice(0, SIDE), ...movers.slice(-SIDE)]

  const data: MoverBar[] = shown.map((m) => ({
    key: m.holding.sourceSymbol,
    label: truncate(m.holding.name),
    full: m.holding.name,
    pct: m.profitPct,
  }))

  const height = Math.max(200, data.length * 30 + 16)

  return (
    <ChartCard title="Top movers" chip="bars">
      {data.length === 0 ? (
        <ChartEmpty message="Movers appear once your holdings carry a current price — P&L % is computed from buy vs. current price." />
      ) : (
        <ResponsiveContainer
          width="100%"
          height={height}
          initialDimension={{ width: 320, height }}
        >
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 52, bottom: 4, left: 4 }}
            barCategoryGap="22%"
          >
            <XAxis type="number" hide tickFormatter={(v: number) => formatPercent(v)} />
            <YAxis
              type="category"
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip content={<Tip />} cursor={{ fill: 'rgba(242,235,219,0.04)' }} />
            <ReferenceLine x={0} stroke={chartColor.axis} strokeWidth={1} />
            <Bar dataKey="pct" isAnimationActive={false} radius={1}>
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={d.pct >= 0 ? chartColor.gain : chartColor.loss}
                />
              ))}
              <LabelList dataKey="pct" content={<PctLabel />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

type LabelProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  value?: number
}

/** P&L % printed 6px right of the bar's rightmost edge, anchored left. For a
 *  gainer that is the bar tip; for a loser (bar extends left of zero) it lands
 *  in the empty space right of the zero line — which keeps a near-axis loser
 *  label from colliding with the Y-axis name. Coloured to its sign so a
 *  detached loser label still reads as a loss. Recharts hands a negative bar a
 *  viewBox `x` at the zero baseline with a signed `width`, so the bar edges
 *  are derived with min/max rather than trusting `x` to be the left side. */
function PctLabel({ x = 0, y = 0, width = 0, height = 0, value = 0 }: LabelProps) {
  const barRight = Math.max(x, x + width)
  return (
    <text
      x={barRight + 6}
      y={y + height / 2}
      dy={3.5}
      textAnchor="start"
      fill={value >= 0 ? 'var(--color-jade-400)' : 'var(--color-ember-400)'}
      fontFamily="var(--font-mono)"
      fontSize={10}
    >
      {formatPercent(value)}
    </text>
  )
}

type TipProps = { active?: boolean; payload?: { payload?: MoverBar }[] }

function Tip({ active, payload }: TipProps) {
  const bar = payload?.[0]?.payload
  if (!active || !bar) return null
  const tone = bar.pct >= 0 ? 'text-jade-400' : 'text-ember-400'
  return (
    <div className="border border-bone-100/15 bg-ink-800 px-3 py-2 shadow-lg">
      <p className="font-sans text-xs text-bone-100">{bar.full}</p>
      <p className={`mt-1 font-mono text-[11px] tabular-nums ${tone}`}>
        {formatPercent(bar.pct)}
      </p>
    </div>
  )
}
