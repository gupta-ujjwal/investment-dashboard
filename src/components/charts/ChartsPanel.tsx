import { useMemo } from 'react'
import type { BaseCurrency, CanonicalHolding } from '../../storage/holdings'
import type { HistoryRecord } from '../../storage/history'
import { deriveRows } from '../../lib/holdingsView'
import {
  benchmarkSeries,
  valueSeries,
  type BenchmarkData,
  type SectorMap,
} from '../../lib/analytics'
import {
  FEATURE_ANALYTICS_DEPTH,
  FEATURE_BENCHMARK_OVERLAY,
  FEATURE_HISTORY,
  FEATURE_SECTOR_DONUT,
} from '../../featureFlags'
import sectorsJson from '../../data/sectors.json'
import nifty50Json from '../../data/benchmarks/nifty50.json'
import sp500Json from '../../data/benchmarks/sp500.json'
import { ValueOverTime, type BenchmarkOverlay } from './ValueOverTime'
import { PnlOverTime } from './PnlOverTime'
import { AllocationDonut } from './AllocationDonut'
import { CurrencyExposureDonut } from './CurrencyExposureDonut'
import { SectorDonut } from './SectorDonut'
import { TopMovers } from './TopMovers'

type Props = {
  holdings: CanonicalHolding[]
  history: HistoryRecord[]
  baseCurrency: BaseCurrency
}

// Bundled data is JSON-imported and gets a defensive cast at the boundary —
// `scripts/validateData.mjs` (wired to `prebuild`) is what enforces the
// shape; the cast just teaches TypeScript the asserted type.
const sectors = sectorsJson as SectorMap
const nifty50 = nifty50Json as BenchmarkData
const sp500 = sp500Json as BenchmarkData

/**
 * The homepage charts, in a hairline-bordered grid. Default export so
 * `AnalyticsRoute` can `React.lazy()` it — this module pulls in Recharts
 * (~100KB+) plus the bundled benchmark JSON (~160KB combined) plus the
 * sector lookup, and keeping all of it out of the initial bundle means the
 * KPI row paints without waiting on the chart code.
 *
 * Feature gating respects the analytics-depth plan's per-widget rollback
 * bulkhead:
 *  - `FEATURE_HISTORY`           — time-series charts (issue #9)
 *  - `FEATURE_ANALYTICS_DEPTH`   — currency-exposure donut (PR A)
 *  - `FEATURE_SECTOR_DONUT`      — sector donut (PR B)
 *  - `FEATURE_BENCHMARK_OVERLAY` — benchmark line on `ValueOverTime` (PR B)
 * Allocation and movers fold over current holdings only and always render.
 */
export default function ChartsPanel({ holdings, history, baseCurrency }: Props) {
  const rows = deriveRows(holdings)
  const series = valueSeries(history, baseCurrency)

  // Mixed-currency portfolio detection — a single-index overlay against a
  // portfolio holding both INR-listed and USD-listed positions is
  // apples-to-oranges by construction. The plan's rule: hide the line,
  // surface a legend caveat (the chart UI knows; we just signal here).
  const mixedCurrency = useMemo(() => {
    let hasInr = false
    let hasUsd = false
    for (const h of holdings) {
      if (h.currency === 'INR') hasInr = true
      else if (h.currency === 'USD') hasUsd = true
      if (hasInr && hasUsd) return true
    }
    return false
  }, [holdings])

  const benchmarkData = baseCurrency === 'INR' ? nifty50 : sp500
  const benchmark: BenchmarkOverlay | undefined = useMemo(() => {
    if (!FEATURE_BENCHMARK_OVERLAY || !FEATURE_HISTORY) return undefined
    const overlaySeries = mixedCurrency
      ? []
      : benchmarkSeries(series, benchmarkData)
    const asOf =
      benchmarkData.series[benchmarkData.series.length - 1]?.date ?? ''
    return {
      series: overlaySeries,
      label: benchmarkData.rebaseLabel,
      asOf,
      mixedCurrency,
    }
  }, [series, benchmarkData, mixedCurrency])

  return (
    <div className="grid gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 lg:grid-cols-2">
      {FEATURE_HISTORY && (
        <>
          <ValueOverTime
            series={series}
            baseCurrency={baseCurrency}
            benchmark={benchmark}
          />
          <PnlOverTime series={series} baseCurrency={baseCurrency} />
        </>
      )}
      <AllocationDonut rows={rows} baseCurrency={baseCurrency} />
      {FEATURE_ANALYTICS_DEPTH && (
        <CurrencyExposureDonut rows={rows} baseCurrency={baseCurrency} />
      )}
      {FEATURE_SECTOR_DONUT && (
        <SectorDonut rows={rows} baseCurrency={baseCurrency} sectors={sectors} />
      )}
      <TopMovers rows={rows} />
    </div>
  )
}
