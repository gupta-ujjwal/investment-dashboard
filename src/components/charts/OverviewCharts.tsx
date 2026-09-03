import { useMemo } from 'react'
import type { BaseCurrency } from '../../storage/holdings'
import type { HistoryRecord } from '../../storage/history'
import { assetClassChanges, classValueSeries } from '../../lib/analytics'
import { NetWorthHistoryArea } from './NetWorthHistoryArea'
import { AssetClassSparklines } from './AssetClassSparklines'

type Props = {
  history: HistoryRecord[]
  baseCurrency: BaseCurrency
}

/**
 * The Overview (homepage) chart panel — generic, cross-asset surfaces only:
 * net-worth-by-asset-class history (stacked area) and per-class change graphs
 * (sparklines). Default export so `OverviewRoute` can `React.lazy()` it, keeping
 * Recharts out of the initial bundle exactly like the equity `ChartsPanel`. Both
 * charts fold the same `classValueSeries`, so the work is shared.
 */
export default function OverviewCharts({ history, baseCurrency }: Props) {
  const series = useMemo(() => classValueSeries(history, baseCurrency), [history, baseCurrency])
  const changes = useMemo(() => assetClassChanges(series), [series])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <NetWorthHistoryArea series={series} baseCurrency={baseCurrency} />
      <AssetClassSparklines changes={changes} baseCurrency={baseCurrency} />
    </div>
  )
}
