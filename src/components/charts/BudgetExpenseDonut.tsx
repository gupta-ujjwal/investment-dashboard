import { useMemo } from 'react'
import type { BaseCurrency } from '../../storage/holdings'
import type { BudgetMonth } from '../../storage/budget'
import { expenseBreakdown, type ExpenseSlice } from '../../lib/budget'
import { formatMoney } from '../../lib/format'
import { ChartCard, ChartEmpty } from './ChartCard'
import { compactMoney, donutOther, donutPalette } from './chartTheme'
import { DonutShell, type DonutDatum } from './DonutShell'

type Props = {
  month: BudgetMonth
  baseCurrency: BaseCurrency
}

function sliceColor(slice: ExpenseSlice, index: number): string {
  return slice.key === '__other' ? donutOther : donutPalette[index % donutPalette.length]
}

/**
 * Where a month's spending went — one wedge per expense category, largest first,
 * with the tail folded into a neutral "Other" wedge (see `expenseBreakdown`).
 * Uses the shared donut palette (not the semantic allocation tones) so it reads
 * as a categorical breakdown, the sibling of the sector/currency donuts.
 */
export function BudgetExpenseDonut({ month, baseCurrency }: Props) {
  const slices = useMemo(() => expenseBreakdown(month), [month])
  const total = slices.reduce((sum, s) => sum + s.amount, 0)

  const data: DonutDatum[] = slices.map((s, index) => ({
    key: s.key,
    label: s.label,
    color: sliceColor(s, index),
    value: s.amount,
    legendRight: s.pct === undefined ? '—' : `${Math.round(s.pct * 100)}%`,
    tooltipText: `${formatMoney(s.amount, baseCurrency)}${
      s.pct === undefined ? '' : ` · ${Math.round(s.pct * 100)}%`
    }`,
  }))

  const ariaLabel =
    data.length === 0
      ? 'Expense breakdown chart, no expenses recorded for this month.'
      : `Donut of expenses by category: ${data.map((d) => `${d.label} ${d.legendRight}`).join(', ')}.`

  return (
    <ChartCard title="Expenses" chip="donut" figure={total > 0 ? formatMoney(total, baseCurrency) : '—'}>
      {data.length === 0 ? (
        <ChartEmpty message="Add expense lines for this month to see where your spending goes." />
      ) : (
        <DonutShell
          data={data}
          ariaLabel={ariaLabel}
          centerTop="spent"
          centerBottom={compactMoney(total, baseCurrency)}
        />
      )}
    </ChartCard>
  )
}
