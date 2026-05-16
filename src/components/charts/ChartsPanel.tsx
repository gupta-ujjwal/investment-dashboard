import type { BaseCurrency, CanonicalHolding } from '../../storage/holdings'
import type { HistoryRecord } from '../../storage/history'
import { deriveRows } from '../../lib/holdingsView'
import { valueSeries } from '../../lib/analytics'
import { FEATURE_HISTORY } from '../../featureFlags'
import { ValueOverTime } from './ValueOverTime'
import { PnlOverTime } from './PnlOverTime'
import { AllocationDonut } from './AllocationDonut'
import { TopMovers } from './TopMovers'

type Props = {
  holdings: CanonicalHolding[]
  history: HistoryRecord[]
  baseCurrency: BaseCurrency
}

/**
 * The four homepage charts, in a hairline-bordered grid. Default export so
 * `AnalyticsRoute` can `React.lazy()` it — this module pulls in Recharts
 * (~100KB+), and keeping it out of the initial bundle means the KPI row paints
 * without waiting on the chart code.
 *
 * The two time-series charts are gated on `FEATURE_HISTORY`: they read the v3
 * `historySnapshots` store, so flipping the flag off (the rollback switch)
 * cleanly removes the schema-dependent surface. Allocation and movers fold
 * over current holdings only and always render.
 */
export default function ChartsPanel({ holdings, history, baseCurrency }: Props) {
  const rows = deriveRows(holdings)
  const series = valueSeries(history, baseCurrency)

  return (
    <div className="grid gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 lg:grid-cols-2">
      {FEATURE_HISTORY && (
        <>
          <ValueOverTime series={series} baseCurrency={baseCurrency} />
          <PnlOverTime series={series} baseCurrency={baseCurrency} />
        </>
      )}
      <AllocationDonut rows={rows} baseCurrency={baseCurrency} />
      <TopMovers rows={rows} />
    </div>
  )
}
