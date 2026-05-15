import type { CanonicalHolding } from '../storage/holdings'

/** Sortable columns. One key per user-clickable column header. */
export type SortKey =
  | 'name'
  | 'market'
  | 'quantity'
  | 'avgBuyPrice'
  | 'currentPrice'
  | 'invested'
  | 'currentValue'
  | 'profit'
  | 'broker'

export type SortDir = 'asc' | 'desc'
export type MarketFilter = 'all' | 'INR' | 'USD'

export type Sort = { key: SortKey; dir: SortDir }
export type Filters = { market: MarketFilter; search: string }

/** Default landing sort: largest current position first. */
export const DEFAULT_SORT: Sort = { key: 'currentValue', dir: 'desc' }
export const DEFAULT_FILTERS: Filters = { market: 'all', search: '' }

/**
 * A holding with its derived per-row figures. Every derived field is a partial
 * value: `undefined` means "not computable" (missing current price, or FX not
 * stamped), never a sentinel `0`. The renderer shows `—` for `undefined`.
 */
export type DerivedRow = {
  holding: CanonicalHolding
  /** Native-currency cost basis: quantity × avgBuyPrice. Always defined. */
  investedNative: number
  /** Native-currency current value: quantity × currentPrice. */
  currentValueNative: number | undefined
  /** Base-currency cost basis: quantity × avgBuyPriceBase. */
  investedBase: number | undefined
  /** Base-currency current value: quantity × currentPriceBase. */
  currentValueBase: number | undefined
  /** Base-currency absolute profit: currentValueBase − investedBase. */
  profitAbsBase: number | undefined
  /** Profit ratio (0.15 = +15%). Currency-neutral, so it needs no FX —
   *  only a current price and a non-zero buy price. */
  profitPct: number | undefined
  /** True when this row was imported before the newest import in the set —
   *  its snapshot price is older than another broker's. */
  isStale: boolean
}

function deriveRow(holding: CanonicalHolding, newestImportedAt: number): DerivedRow {
  const { quantity, avgBuyPrice, currentPrice, avgBuyPriceBase, currentPriceBase } = holding

  const investedNative = quantity * avgBuyPrice
  const currentValueNative =
    currentPrice === undefined ? undefined : quantity * currentPrice

  const investedBase =
    avgBuyPriceBase === undefined ? undefined : quantity * avgBuyPriceBase
  const currentValueBase =
    currentPriceBase === undefined ? undefined : quantity * currentPriceBase
  const profitAbsBase =
    investedBase === undefined || currentValueBase === undefined
      ? undefined
      : currentValueBase - investedBase

  // Profit % is (current − bought) / bought — the FX rate cancels, so it is
  // computable from native prices alone. Guard avgBuyPrice 0 → undefined,
  // not Infinity.
  const profitPct =
    currentPrice === undefined || avgBuyPrice <= 0
      ? undefined
      : (currentPrice - avgBuyPrice) / avgBuyPrice

  return {
    holding,
    investedNative,
    currentValueNative,
    investedBase,
    currentValueBase,
    profitAbsBase,
    profitPct,
    isStale: holding.importedAt < newestImportedAt,
  }
}

/** Project raw holdings into derived rows. Staleness is relative to the
 *  newest `importedAt` across the whole set. */
export function deriveRows(holdings: CanonicalHolding[]): DerivedRow[] {
  const newestImportedAt = holdings.reduce((max, h) => Math.max(max, h.importedAt), 0)
  return holdings.map((h) => deriveRow(h, newestImportedAt))
}

/** Newest import timestamp across the set, or `undefined` when empty. */
export function newestImport(holdings: CanonicalHolding[]): number | undefined {
  if (holdings.length === 0) return undefined
  return holdings.reduce((max, h) => Math.max(max, h.importedAt), 0)
}

export function applyFilters(rows: DerivedRow[], filters: Filters): DerivedRow[] {
  const q = filters.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (filters.market !== 'all' && r.holding.currency !== filters.market) return false
    if (q) {
      const name = r.holding.name.toLowerCase()
      const symbol = r.holding.sourceSymbol.toLowerCase()
      if (!name.includes(q) && !symbol.includes(q)) return false
    }
    return true
  })
}

/** The value a row sorts by for a given column. `undefined` for a row whose
 *  figure is not computable — those always sink to the bottom. */
function sortValue(r: DerivedRow, key: SortKey): number | string | undefined {
  switch (key) {
    case 'name':
      return r.holding.name.toLowerCase()
    case 'market':
      return r.holding.currency
    case 'broker':
      return r.holding.source
    case 'quantity':
      return r.holding.quantity
    case 'avgBuyPrice':
      return r.holding.avgBuyPrice
    case 'currentPrice':
      return r.holding.currentPrice
    case 'invested':
      return r.investedBase
    case 'currentValue':
      return r.currentValueBase
    case 'profit':
      return r.profitPct
  }
}

export function sortRows(rows: DerivedRow[], sort: Sort): DerivedRow[] {
  const factor = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.key)
    const bv = sortValue(b, sort.key)
    // Undefined sinks to the bottom regardless of direction — a row with no
    // computable figure should never outrank one that has a value.
    if (av === undefined && bv === undefined) return 0
    if (av === undefined) return 1
    if (bv === undefined) return -1
    const cmp =
      typeof av === 'string' && typeof bv === 'string'
        ? av.localeCompare(bv)
        : (av as number) - (bv as number)
    return cmp * factor
  })
}

/** Filter then sort — the full holdings → view pipeline. */
export function viewRows(
  holdings: CanonicalHolding[],
  filters: Filters,
  sort: Sort,
): DerivedRow[] {
  return sortRows(applyFilters(deriveRows(holdings), filters), sort)
}
