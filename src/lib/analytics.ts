import type { BaseCurrency, CanonicalHolding, Currency } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'
import { deriveRows, type DerivedRow } from './holdingsView'
import { buildPositions, type NetWorthPosition } from './netWorth'

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
 * The history log folded into a value/invested/profit time series. Records
 * stamped in a base currency other than the one in view are skipped — there is
 * no historical FX to honestly re-base them, so a stale-base point would
 * mislabel its axis. Points stay in oldest-first date order.
 *
 * One fold, two callers, via an optional position `filter`:
 *  - **Overview (net worth)** — no filter: every position (holdings + manual
 *    assets) counts.
 *  - **Equity tab** — `(p) => p.kind === 'holding'`: the broker/equity portfolio
 *    only, so the NIFTY/S&P benchmark overlay compares like-with-like instead of
 *    riding a net-worth line that includes cash/gold.
 * Positions come from `buildPositions`, which already excludes closed holdings
 * and folds value-only assets — so value sums every selected position's base
 * value (R1: `undefined` if any is missing) and invested sums only
 * basis-bearing positions (cash/savings have no basis and don't blank the cost
 * line).
 */
export function valueSeries(
  history: readonly HistoryRecord[],
  base: BaseCurrency,
  filter?: (position: NetWorthPosition) => boolean,
): ValuePoint[] {
  return history
    .filter((record) => record.baseCurrency === base)
    .map((record) => {
      // Older records predate assets and read as `[]`.
      const positions = buildPositions(record.holdings, record.assets ?? [])
      const selected = filter ? positions.filter(filter) : positions
      const value = sumDefined(selected.map((p) => p.currentValueBase))
      const invested = sumDefined(
        selected.filter((p) => p.hasBasis).map((p) => p.investedBase),
      )
      const profit =
        value === undefined || invested === undefined ? undefined : value - invested
      return { date: record.date, value, invested, profit }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Position selector for the Equity tab's value series + benchmark overlay —
 *  the broker/equity portfolio only, excluding manual value-only assets. */
export const isHoldingPosition = (p: NetWorthPosition): boolean => p.kind === 'holding'

// ── Net worth by asset class over time (Overview stacked area + sparklines) ──

/** One stacked-area data row: a `date` plus a base value per asset-class group.
 *  The index signature is `number | string` (not `number`) so the string `date`
 *  coexists with the numeric group columns Recharts reads by `dataKey`. */
export type ClassRow = { date: string; [group: string]: number | string }

export type ClassSeries = {
  /** Asset-class group keys present across the history, ordered by their value
   *  in the most recent snapshot (largest first) — a stable stacking order. */
  groups: string[]
  /** One row per snapshot date: `{ date, [group]: valueBase }`. A group with no
   *  computable value on a given date is `0` for that date (stacked-area
   *  friendly — partial values are excluded from the sum, never read as a
   *  negative or NaN). */
  rows: ClassRow[]
}

/** Read a numeric group cell from a `ClassRow`, coercing the `number | string`
 *  index type (the only string column is `date`, never read this way). */
function cell(row: ClassRow, group: string): number {
  const v = row[group]
  return typeof v === 'number' ? v : 0
}

/**
 * Fold the history log into net-worth-by-asset-class over time. Reconstructable
 * because each `HistoryRecord` embeds both holdings and assets; a position with
 * no computable base value is simply excluded from its group's sum for that
 * date (R1 — never read absent as 0-that-means-something or as NaN). Base-
 * currency-mismatched records are skipped, as in `valueSeries`.
 */
export function classValueSeries(
  history: readonly HistoryRecord[],
  base: BaseCurrency,
): ClassSeries {
  const inBase = history
    .filter((record) => record.baseCurrency === base)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  const groupsSeen = new Set<string>()
  const rows = inBase.map((record) => {
    const positions = buildPositions(record.holdings, record.assets ?? [])
    const byGroup = new Map<string, number>()
    for (const p of positions) {
      const v = p.currentValueBase
      if (v === undefined || !Number.isFinite(v)) continue
      groupsSeen.add(p.group)
      byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + v)
    }
    const row: ClassRow = { date: record.date }
    for (const [g, v] of byGroup) row[g] = v
    return row
  })

  // Order groups by their value in the latest row (largest band on the bottom of
  // the stack), falling back to alphabetical for groups absent from the latest.
  const latest = rows[rows.length - 1]
  const groups = [...groupsSeen].sort((a, b) => {
    const av = latest ? cell(latest, a) : 0
    const bv = latest ? cell(latest, b) : 0
    if (av !== bv) return bv - av
    return a.localeCompare(b)
  })

  // Backfill absent groups to 0 so every row carries every group key (stacked
  // areas need a value at each x for each series).
  for (const row of rows) {
    for (const g of groups) if (!(g in row)) row[g] = 0
  }

  return { groups, rows }
}

export type ClassChange = {
  group: string
  /** Per-snapshot base values, oldest-first — the sparkline path. */
  points: number[]
  /** Latest base value. */
  latest: number
  /** `(latest − first) / first` over the window; `undefined` when the first
   *  value is 0 (no honest base to compute a percentage from). */
  changePct: number | undefined
}

/**
 * Per-asset-class change summary derived from `classValueSeries` — one entry per
 * group with its sparkline points and window change %. Drives the Overview
 * "change graphs of each asset" small-multiples. Groups are returned in the
 * same stable order as the stacked area.
 */
export function assetClassChanges(series: ClassSeries): ClassChange[] {
  return series.groups.map((group) => {
    const points = series.rows.map((r) => cell(r, group))
    const first = points[0] ?? 0
    const latest = points[points.length - 1] ?? 0
    return {
      group,
      points,
      latest,
      changePct: first > 0 ? (latest - first) / first : undefined,
    }
  })
}

// ── Concentration (Risk KPI sub-row) ────────────────────────────────────────

/** US DOJ Horizontal Merger Guidelines band. Boundaries follow public
 *  convention with explicit half-open intervals so reviewers don't have to
 *  re-derive what happens at the seams:
 *    - `low`       : `hhi < 0.15` (unconcentrated)
 *    - `moderate`  : `0.15 ≤ hhi < 0.25` (moderately concentrated)
 *    - `high`      : `hhi ≥ 0.25` (highly concentrated)
 *  The high-side boundary at exactly `0.25` reads as `high` — the standard
 *  DOJ practice places the 2500 threshold itself in the highly-concentrated
 *  bucket, not in moderate. Adopting this convention avoids inventing
 *  thresholds. */
export type HhiBand = 'low' | 'moderate' | 'high'

export type Concentration = {
  /** Top-5 holdings as a share of total priced base-currency value, `0..1`.
   *  `undefined` when there is no priced value to divide by. */
  top5Pct: number | undefined
  /** Herfindahl-Hirschman Index over normalized weights, `0..1`. */
  hhi: number | undefined
  /** Band label for the HHI under the DOJ convention. `undefined` when `hhi`
   *  is `undefined` (no priced holdings). */
  hhiBand: HhiBand | undefined
  /** The largest single position when its weight strictly exceeds 10%.
   *  `undefined` when nothing crosses the threshold (or no priced holdings).
   *  Carries the holding so the UI can name it. */
  singleStockRisk: { holding: CanonicalHolding; weight: number } | undefined
}

const HHI_BAND_LOW_CEIL = 0.15
const HHI_BAND_HIGH_FLOOR = 0.25
const SINGLE_STOCK_THRESHOLD = 0.10

/**
 * Concentration metrics over priced holdings. Folds by current base-currency
 * value: top-5 weight (rank by value, sum top 5, divide by total), HHI (sum
 * of squared weights), and the largest single holding when its weight
 * strictly exceeds 10%. Every figure propagates `undefined` when nothing is
 * priced — never a sentinel `0` (R1).
 */
export function concentration(rows: DerivedRow[]): Concentration {
  const priced = rows.filter(
    (r): r is DerivedRow & { currentValueBase: number } =>
      r.currentValueBase !== undefined && r.currentValueBase > 0,
  )
  const total = priced.reduce((sum, r) => sum + r.currentValueBase, 0)
  if (priced.length === 0 || total <= 0) {
    return {
      top5Pct: undefined,
      hhi: undefined,
      hhiBand: undefined,
      singleStockRisk: undefined,
    }
  }
  const weights = priced
    .map((r) => ({ holding: r.holding, weight: r.currentValueBase / total }))
    .sort((a, b) => b.weight - a.weight)
  const top5Pct = weights.slice(0, 5).reduce((sum, w) => sum + w.weight, 0)
  const hhi = weights.reduce((sum, w) => sum + w.weight * w.weight, 0)
  const hhiBand: HhiBand =
    hhi < HHI_BAND_LOW_CEIL
      ? 'low'
      : hhi < HHI_BAND_HIGH_FLOOR
        ? 'moderate'
        : 'high'
  const top = weights[0]
  const singleStockRisk =
    top.weight > SINGLE_STOCK_THRESHOLD
      ? { holding: top.holding, weight: top.weight }
      : undefined
  return { top5Pct, hhi, hhiBand, singleStockRisk }
}

// ── Sector allocation (donut, PR B) ─────────────────────────────────────────

/** One entry in `src/data/sectors.json`. Keyed by `sourceSymbol` — ticker
 *  for Vested (USD), ISIN for Groww (INR). `name` is a maintainer-friendly
 *  hint only; the fold reads `sector` + `market`. */
export type SectorEntry = {
  sector: string
  market: Currency
  name?: string
}

/** The shape of `src/data/sectors.json` — a `Record<sourceSymbol, SectorEntry>`.
 *  Holdings whose `sourceSymbol` is not in the map fall into an explicit
 *  `Unknown` bucket; the donut still renders honestly. */
export type SectorMap = Record<string, SectorEntry>

export type SectorSlice = {
  /** Stable identity — the sector name, or `__unknown` for unmapped rows. */
  key: string
  label: string
  /** Current base-currency value summed across rows in this sector. */
  valueBase: number
  /** Share of the allocated total, 0..1. */
  pct: number
}

/** Slice key for holdings whose `sourceSymbol` has no sectors.json entry. */
export const UNKNOWN_SECTOR_KEY = '__unknown'

/**
 * Sector-bucketed allocation over priced holdings. The lookup is by
 * `sourceSymbol` so the same fold handles Vested (US ticker) and Groww
 * (Indian ISIN) keys without a unifying ontology. The slices respect the
 * sector taxonomy as authored — GICS labels for US holdings will appear
 * alongside NSE labels for Indian holdings, which is more honest than
 * forcing them into a shared bucket they don't share in reality.
 *
 * Only holdings with a computable `currentValueBase` are counted (R1 —
 * unpriced rows can't honestly claim a wedge). Returns slices sorted
 * largest-first; `[]` when nothing is allocatable.
 */
export function sectorAllocation(
  rows: DerivedRow[],
  sectors: SectorMap,
): SectorSlice[] {
  const buckets = new Map<string, { label: string; valueBase: number }>()
  for (const r of rows) {
    if (r.currentValueBase === undefined) continue
    const entry = sectors[r.holding.sourceSymbol]
    const key = entry ? entry.sector : UNKNOWN_SECTOR_KEY
    const label = entry ? entry.sector : 'Unknown'
    const bucket = buckets.get(key) ?? { label, valueBase: 0 }
    bucket.valueBase += r.currentValueBase
    buckets.set(key, bucket)
  }
  const total = [...buckets.values()].reduce((s, b) => s + b.valueBase, 0)
  if (total <= 0) return []
  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      label: b.label,
      valueBase: b.valueBase,
      pct: b.valueBase / total,
    }))
    .sort((a, b) => b.valueBase - a.valueBase)
}

// ── Benchmark overlay (ValueOverTime, PR B) ─────────────────────────────────

/** One row in a bundled benchmark JSON (`src/data/benchmarks/*.json`).
 *  Refreshed weekly via `.github/workflows/refresh-benchmarks.yml`. */
export type BenchmarkPoint = {
  /** `YYYY-MM-DD`. */
  date: string
  /** Index close, native currency (INR for NIFTY, USD for S&P). */
  close: number
}

/** The shape of each bundled benchmark JSON. The `rebaseLabel` is what the
 *  chart legend renders (e.g. `NIFTY 50 (rebased)`) so the rebase semantics
 *  are visible to the reader, not hidden in code. */
export type BenchmarkData = {
  index: string
  rebaseLabel: string
  series: BenchmarkPoint[]
}

/** Rebased benchmark series aligned to portfolio snapshot dates — the shape
 *  consumed by `ValueOverTime`'s overlay `<Line>`. */
export type BenchmarkOverlayPoint = { date: string; value: number }

/**
 * Align and rebase a benchmark close series to a portfolio value series.
 * The benchmark is normalized so its first portfolio-aligned point equals
 * the portfolio's first value — both lines start at the same Y and diverge
 * thereafter by relative performance. This is the "did I beat the index"
 * framing every consumer broker (Robinhood, Groww, Zerodha Console)
 * defaults to.
 *
 * Date alignment:
 * - Clip benchmark to portfolio's date range (portfolio snapshots outside
 *   the bundled benchmark window are kept as portfolio-only points by the
 *   caller — the overlay just doesn't extend that far).
 * - Forward-fill the benchmark close on portfolio dates where the index
 *   itself doesn't have a close (weekend snapshots, India holidays, US
 *   holidays — the two markets close on different calendars so a strict
 *   zipper join would drop honest portfolio points).
 *
 * Returns `[]` when there is no usable overlap (portfolio has <2 points,
 * the bundled benchmark predates every portfolio snapshot, or the anchor
 * benchmark close is non-positive).
 */
export function benchmarkSeries(
  portfolioSeries: readonly ValuePoint[],
  benchmark: BenchmarkData,
): BenchmarkOverlayPoint[] {
  if (portfolioSeries.length < 2) return []
  const benchPoints = benchmark.series
  if (benchPoints.length === 0) return []

  const firstBenchDate = benchPoints[0].date
  const lastBenchDate = benchPoints[benchPoints.length - 1].date

  // Anchor: first portfolio point inside the benchmark window with a
  // defined `value`. The rebase factor is `portfolio.value / benchmark.close`
  // at this anchor.
  let anchorIdx = -1
  for (let i = 0; i < portfolioSeries.length; i++) {
    const p = portfolioSeries[i]
    if (p.value === undefined) continue
    if (p.date < firstBenchDate) continue
    if (p.date > lastBenchDate) break
    anchorIdx = i
    break
  }
  if (anchorIdx === -1) return []

  const anchorPortfolioValue = portfolioSeries[anchorIdx].value as number
  const anchorBenchClose = lookupBenchmarkClose(
    benchPoints,
    portfolioSeries[anchorIdx].date,
  )
  // `<= 0` covers zero (would zero-divide) and negative (impossible for a
  // close price); `!Number.isFinite` is defence-in-depth — `validateData`
  // catches NaN/Infinity at build time, but trusting only the validator
  // means a malformed JSON that slipped past `prebuild` would propagate
  // NaN through the multiplication. Guarding here keeps the render path
  // honest even if the validator regresses.
  if (
    anchorBenchClose === undefined ||
    !Number.isFinite(anchorBenchClose) ||
    anchorBenchClose <= 0
  ) {
    return []
  }
  const rebaseFactor = anchorPortfolioValue / anchorBenchClose
  if (!Number.isFinite(rebaseFactor)) return []

  const out: BenchmarkOverlayPoint[] = []
  for (let i = anchorIdx; i < portfolioSeries.length; i++) {
    const p = portfolioSeries[i]
    if (p.date > lastBenchDate) break
    const close = lookupBenchmarkClose(benchPoints, p.date)
    if (close === undefined || !Number.isFinite(close)) continue
    out.push({ date: p.date, value: close * rebaseFactor })
  }
  return out
}

/** Last benchmark close on or before `date`. Binary search — the series is
 *  date-sorted ascending by `refresh-benchmarks.mjs` and asserted by
 *  `scripts/validateData.mjs` in `prebuild`. Returns `undefined` when
 *  `date` precedes every series entry. */
function lookupBenchmarkClose(
  series: readonly BenchmarkPoint[],
  date: string,
): number | undefined {
  let lo = 0
  let hi = series.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (series[mid].date <= date) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best === -1 ? undefined : series[best].close
}
