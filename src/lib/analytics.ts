import type { BaseCurrency, CanonicalHolding, Currency } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'
import { deriveRows, type DerivedRow } from './holdingsView'

/**
 * Pure aggregation for the homepage analytics page. Every function here is a
 * fold over `deriveRows()` output (or over the history log) with no I/O — the
 * Recharts components stay dumb projections of these results. Absent figures
 * stay `undefined` (never a sentinel `0`), matching `holdingsView.ts`.
 */

/** Sum that propagates absence: `undefined` if any input is `undefined`. */
function sumDefined(values: readonly (number | undefined)[]): number | undefined {
  let total = 0
  for (const v of values) {
    if (v === undefined) return undefined
    total += v
  }
  return total
}

// ── Portfolio totals (KPI row) ──────────────────────────────────────────────

export type PortfolioTotals = {
  /** Base-currency cost basis. `undefined` if any holding is unstamped. */
  totalInvestedBase: number | undefined
  /** Base-currency current value. `undefined` if any holding lacks a price. */
  totalValueBase: number | undefined
  /** Base-currency absolute P&L. `undefined` if either total above is. */
  totalProfitBase: number | undefined
  /** Portfolio-level P&L ratio (0.15 = +15%). `undefined` if not computable
   *  or cost basis is zero. */
  totalProfitPct: number | undefined
  /** Position count. */
  positions: number
  /** Holdings whose base-currency figures could not be computed — drives the
   *  "refresh needed" hint. */
  unstamped: number
}

export function portfolioTotals(holdings: CanonicalHolding[]): PortfolioTotals {
  const rows = deriveRows(holdings)
  const totalInvestedBase = sumDefined(rows.map((r) => r.investedBase))
  const totalValueBase = sumDefined(rows.map((r) => r.currentValueBase))
  const totalProfitBase =
    totalInvestedBase === undefined || totalValueBase === undefined
      ? undefined
      : totalValueBase - totalInvestedBase
  const totalProfitPct =
    totalProfitBase === undefined ||
    totalInvestedBase === undefined ||
    totalInvestedBase <= 0
      ? undefined
      : totalProfitBase / totalInvestedBase
  const unstamped = rows.filter((r) => r.investedBase === undefined).length
  return {
    totalInvestedBase,
    totalValueBase,
    totalProfitBase,
    totalProfitPct,
    positions: holdings.length,
    unstamped,
  }
}

// ── Allocation (donut) ──────────────────────────────────────────────────────

export type AllocationMode = 'market' | 'holding'

export type AllocationSlice = {
  /** Stable identity — `INR`/`USD` for market mode, `sourceSymbol` otherwise. */
  key: string
  label: string
  /** Current value in base currency. */
  valueBase: number
  /** Share of the allocated total, 0..1. */
  pct: number
}

const marketLabel: Record<Currency, string> = { INR: 'India', USD: 'US' }

/**
 * Allocation of current value, base currency. Only holdings with a computable
 * `currentValueBase` count — an unpriced or unstamped holding cannot honestly
 * claim a slice. Slices are returned largest-first; `[]` when nothing is
 * allocatable.
 */
export function allocation(
  rows: DerivedRow[],
  mode: AllocationMode,
): AllocationSlice[] {
  const buckets = new Map<string, { label: string; valueBase: number }>()
  for (const r of rows) {
    if (r.currentValueBase === undefined) continue
    const key = mode === 'market' ? r.holding.currency : r.holding.sourceSymbol
    const label =
      mode === 'market' ? marketLabel[r.holding.currency] : r.holding.name
    const bucket = buckets.get(key) ?? { label, valueBase: 0 }
    bucket.valueBase += r.currentValueBase
    buckets.set(key, bucket)
  }
  const total = [...buckets.values()].reduce((s, b) => s + b.valueBase, 0)
  if (total <= 0) return []
  return [...buckets.entries()]
    .map(([key, b]) => ({ key, label: b.label, valueBase: b.valueBase, pct: b.valueBase / total }))
    .sort((a, b) => b.valueBase - a.valueBase)
}

// ── Top movers (bars) ───────────────────────────────────────────────────────

export type Mover = {
  holding: CanonicalHolding
  /** Lifetime P&L ratio (0.15 = +15%). Always defined for a returned mover. */
  profitPct: number
}

/**
 * Holdings ranked by lifetime P&L %, best first. Only holdings with a
 * computable `profitPct` appear — the chart slices head (gainers) and tail
 * (losers) off this list.
 */
export function topMovers(rows: DerivedRow[]): Mover[] {
  return rows
    .filter((r): r is DerivedRow & { profitPct: number } => r.profitPct !== undefined)
    .map((r) => ({ holding: r.holding, profitPct: r.profitPct }))
    .sort((a, b) => b.profitPct - a.profitPct)
}

// ── Value over time (line / area) ───────────────────────────────────────────

export type ValuePoint = {
  /** `YYYY-MM-DD`. */
  date: string
  /** Total current value, base currency. `undefined` if not computable. */
  value: number | undefined
  /** Total cost basis, base currency. `undefined` if not computable. */
  invested: number | undefined
  /** Absolute P&L, base currency. `undefined` if not computable. */
  profit: number | undefined
}

/**
 * The history log folded into a time series. Records stamped in a base
 * currency other than the one in view are skipped — there is no historical FX
 * to honestly re-base them, so a stale-base point would mislabel its axis.
 * Points stay in oldest-first date order.
 */
export function valueSeries(
  history: readonly HistoryRecord[],
  base: BaseCurrency,
): ValuePoint[] {
  return history
    .filter((record) => record.baseCurrency === base)
    .map((record) => {
      const rows = deriveRows(record.holdings)
      const value = sumDefined(rows.map((r) => r.currentValueBase))
      const invested = sumDefined(rows.map((r) => r.investedBase))
      const profit =
        value === undefined || invested === undefined ? undefined : value - invested
      return { date: record.date, value, invested, profit }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
