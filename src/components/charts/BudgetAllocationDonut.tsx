import { useMemo } from 'react'
import type { BaseCurrency } from '../../storage/holdings'
import { allocationSlices, type AllocationWedge, type BudgetSummary } from '../../lib/budget'
import { formatMoney } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { compactMoney } from './chartTheme'
import { DonutShell, type DonutDatum } from './DonutShell'

type Props = {
  summary: BudgetSummary
  baseCurrency: BaseCurrency
}

/** Semantic wedge colours — matched to the Budget stat tones (spent = ember,
 *  invested = jade, remaining = neutral bone) rather than the generic donut
 *  palette, so the allocation reads as the same three quantities the numbers do. */
const WEDGE_COLOR: Record<AllocationWedge['key'], string> = {
  spent: 'var(--color-ember-400)',
  invested: 'var(--color-jade-400)',
  remaining: 'var(--color-bone-400)',
}

/**
 * How a month's income split three ways — Spent / Invested / Remaining. The
 * honest headline of a budget: discipline at a glance. An overspent month (spend
 * + investment > income) has no positive "remaining" to draw, so the wedge is
 * dropped and an explicit "overspent by X" callout replaces it — never a phantom
 * negative slice (see `allocationSlices`).
 */
export function BudgetAllocationDonut({ summary, baseCurrency }: Props) {
  const { wedges, overspentBy } = useMemo(() => allocationSlices(summary), [summary])
  const income = summary.totalIncome

  const data: DonutDatum[] = wedges.map((w) => {
    const pct = income > 0 ? w.value / income : undefined
    return {
      key: w.key,
      label: w.label,
      color: WEDGE_COLOR[w.key],
      value: w.value,
      legendRight: pct === undefined ? '—' : `${Math.round(pct * 100)}%`,
      tooltipText: `${formatMoney(w.value, baseCurrency)}${
        pct === undefined ? '' : ` · ${Math.round(pct * 100)}%`
      }`,
    }
  })

  const ariaLabel =
    data.length === 0
      ? 'Income allocation chart, nothing to show for this month.'
      : `Donut of income allocation: ${data.map((d) => `${d.label} ${d.legendRight}`).join(', ')}.`

  return (
    <ChartCard title="Allocation" chip="donut" figure={income > 0 ? formatMoney(income, baseCurrency) : '—'}>
      {data.length === 0 ? (
        <ChartEmpty message="Add income, expenses, or an invested amount for this month to see how it splits." />
      ) : (
        <div className="space-y-4">
          <DonutShell
            data={data}
            ariaLabel={ariaLabel}
            centerTop="income"
            centerBottom={compactMoney(income, baseCurrency)}
          />
          {overspentBy !== undefined && (
            <p className="border border-ember-400/40 bg-ember-900/20 px-3 py-2 font-sans text-[11px] text-ember-300">
              Overspent by{' '}
              <span className="tabular-nums">{formatMoney(overspentBy, baseCurrency)}</span> —
              spending and investing exceeded income this month.
            </p>
          )}
        </div>
      )}
    </ChartCard>
  )
}
