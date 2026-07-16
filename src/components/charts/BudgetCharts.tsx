import type { BaseCurrency } from '../../storage/holdings'
import type { BudgetMonth } from '../../storage/budget'
import type { BudgetSummary } from '../../lib/budget'
import { BudgetAllocationDonut } from './BudgetAllocationDonut'
import { BudgetExpenseDonut } from './BudgetExpenseDonut'

type Props = {
  month: BudgetMonth
  summary: BudgetSummary
  baseCurrency: BaseCurrency
}

/**
 * The focused month's two donuts — income allocation + expense breakdown. Default
 * export so `BudgetRoute` can `React.lazy()` it, keeping Recharts out of the
 * initial bundle exactly like `OverviewCharts` and the equity `ChartsPanel`
 * (productContext/dsl.md § dsl-decision-guide). The month strip stays eager — it
 * is plain markup with no Recharts dependency.
 */
export default function BudgetCharts({ month, summary, baseCurrency }: Props) {
  return (
    <div className="grid gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 lg:grid-cols-2">
      <BudgetAllocationDonut summary={summary} baseCurrency={baseCurrency} />
      <BudgetExpenseDonut month={month} baseCurrency={baseCurrency} />
    </div>
  )
}
