import { describe, expect, it } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import {
  applyFilters,
  deriveRows,
  newestImport,
  sortRows,
  viewRows,
  type Sort,
} from './holdingsView'

function holding(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Test Co',
    source: 'groww',
    sourceSymbol: 'INE000000001',
    quantity: 10,
    avgBuyPrice: 100,
    currency: 'INR',
    assetClass: 'equity',
    importedAt: 1000,
    ...over,
  }
}

describe('deriveRows — derivation', () => {
  it('computes native + base figures for a fully-stamped holding', () => {
    const [row] = deriveRows([
      holding({
        quantity: 10,
        avgBuyPrice: 100,
        currentPrice: 150,
        avgBuyPriceBase: 100,
        currentPriceBase: 150,
      }),
    ])
    expect(row.investedNative).toBe(1000)
    expect(row.currentValueNative).toBe(1500)
    expect(row.investedBase).toBe(1000)
    expect(row.currentValueBase).toBe(1500)
    expect(row.profitAbsBase).toBe(500)
    expect(row.profitPct).toBeCloseTo(0.5)
  })

  it('leaves price-derived figures undefined when currentPrice is absent', () => {
    const [row] = deriveRows([
      holding({ currentPrice: undefined, avgBuyPriceBase: 100 }),
    ])
    expect(row.investedNative).toBe(1000)
    expect(row.investedBase).toBe(1000)
    expect(row.currentValueNative).toBeUndefined()
    expect(row.currentValueBase).toBeUndefined()
    expect(row.profitAbsBase).toBeUndefined()
    expect(row.profitPct).toBeUndefined()
  })

  it('leaves base figures undefined when FX is not stamped', () => {
    const [row] = deriveRows([
      holding({ currentPrice: 150, avgBuyPriceBase: undefined, currentPriceBase: undefined }),
    ])
    expect(row.investedBase).toBeUndefined()
    expect(row.currentValueBase).toBeUndefined()
    expect(row.profitAbsBase).toBeUndefined()
    // profitPct is currency-neutral — still computable from native prices.
    expect(row.profitPct).toBeCloseTo(0.5)
  })

  it('returns profitPct undefined (not Infinity) when avgBuyPrice is 0', () => {
    const [row] = deriveRows([holding({ avgBuyPrice: 0, currentPrice: 150 })])
    expect(row.profitPct).toBeUndefined()
    expect(Number.isFinite(row.profitPct ?? NaN)).toBe(false)
  })

  it('marks rows older than the newest import as stale', () => {
    const rows = deriveRows([
      holding({ sourceSymbol: 'OLD', importedAt: 1000 }),
      holding({ sourceSymbol: 'NEW', importedAt: 2000 }),
    ])
    const byKey = new Map(rows.map((r) => [r.holding.sourceSymbol, r]))
    expect(byKey.get('OLD')!.isStale).toBe(true)
    expect(byKey.get('NEW')!.isStale).toBe(false)
  })

  it('marks nothing stale when all imports share a timestamp', () => {
    const rows = deriveRows([
      holding({ sourceSymbol: 'A', importedAt: 1000 }),
      holding({ sourceSymbol: 'B', importedAt: 1000 }),
    ])
    expect(rows.every((r) => !r.isStale)).toBe(true)
  })
})

describe('newestImport', () => {
  it('returns the max importedAt', () => {
    expect(newestImport([holding({ importedAt: 1000 }), holding({ importedAt: 3000 })])).toBe(3000)
  })
  it('returns undefined for an empty set', () => {
    expect(newestImport([])).toBeUndefined()
  })
})

describe('applyFilters', () => {
  const rows = deriveRows([
    holding({ name: 'Reliance', sourceSymbol: 'INE002A01018', currency: 'INR' }),
    holding({ name: 'Apple Inc', sourceSymbol: 'AAPL', currency: 'USD', source: 'vested' }),
  ])

  it('filters by market', () => {
    expect(applyFilters(rows, { market: 'USD', search: '' })).toHaveLength(1)
    expect(applyFilters(rows, { market: 'USD', search: '' })[0].holding.name).toBe('Apple Inc')
    expect(applyFilters(rows, { market: 'all', search: '' })).toHaveLength(2)
  })

  it('searches name case-insensitively', () => {
    expect(applyFilters(rows, { market: 'all', search: 'apple' })).toHaveLength(1)
    expect(applyFilters(rows, { market: 'all', search: 'RELIANCE' })).toHaveLength(1)
  })

  it('searches the source symbol too', () => {
    expect(applyFilters(rows, { market: 'all', search: 'aapl' })).toHaveLength(1)
    expect(applyFilters(rows, { market: 'all', search: 'INE002A' })).toHaveLength(1)
  })

  it('combines market and search', () => {
    expect(applyFilters(rows, { market: 'INR', search: 'apple' })).toHaveLength(0)
  })
})

describe('sortRows', () => {
  const rows = deriveRows([
    holding({
      name: 'Charlie',
      currentPrice: 150,
      avgBuyPrice: 100,
      avgBuyPriceBase: 100,
      currentPriceBase: 150,
    }),
    holding({
      name: 'Alpha',
      currentPrice: 90,
      avgBuyPrice: 100,
      avgBuyPriceBase: 100,
      currentPriceBase: 90,
    }),
    holding({ name: 'Bravo', currentPrice: undefined, currentPriceBase: undefined }),
  ])

  it('sorts by name ascending and descending', () => {
    expect(sortRows(rows, { key: 'name', dir: 'asc' }).map((r) => r.holding.name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
    expect(sortRows(rows, { key: 'name', dir: 'desc' }).map((r) => r.holding.name)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ])
  })

  it('sinks undefined values to the bottom for ascending sort', () => {
    const sorted = sortRows(rows, { key: 'currentValue', dir: 'asc' })
    expect(sorted[sorted.length - 1].holding.name).toBe('Bravo')
  })

  it('sinks undefined values to the bottom for descending sort too', () => {
    const sorted = sortRows(rows, { key: 'currentValue', dir: 'desc' })
    expect(sorted[sorted.length - 1].holding.name).toBe('Bravo')
  })

  it('sorts by absolute base-currency profit', () => {
    const sorted = sortRows(rows, { key: 'profit', dir: 'desc' })
    // Charlie +500, Alpha −100, Bravo undefined (bottom)
    expect(sorted.map((r) => r.holding.name)).toEqual(['Charlie', 'Alpha', 'Bravo'])
  })

  it('sorts profit by the ₹ amount shown, not the percent', () => {
    // Small holding with a huge percent gain vs. a large holding with a
    // modest percent gain. The Profit cell shows the ₹ amount large, so the
    // sort must follow the ₹ amount: Big (+₹4000) outranks Tiny (+₹100).
    const mixed = deriveRows([
      holding({
        name: 'Tiny',
        quantity: 1,
        currentPrice: 200,
        avgBuyPrice: 100,
        avgBuyPriceBase: 100,
        currentPriceBase: 200,
      }),
      holding({
        name: 'Big',
        quantity: 100,
        currentPrice: 140,
        avgBuyPrice: 100,
        avgBuyPriceBase: 100,
        currentPriceBase: 140,
      }),
    ])
    expect(sortRows(mixed, { key: 'profit', dir: 'desc' }).map((r) => r.holding.name)).toEqual([
      'Big',
      'Tiny',
    ])
  })

  it('does not mutate the input array', () => {
    const before = rows.map((r) => r.holding.name)
    sortRows(rows, { key: 'name', dir: 'desc' })
    expect(rows.map((r) => r.holding.name)).toEqual(before)
  })
})

describe('viewRows — full pipeline', () => {
  it('filters then sorts', () => {
    const holdings = [
      holding({ name: 'Reliance', currency: 'INR', currentPrice: 150, currentPriceBase: 150 }),
      holding({ name: 'Apple', currency: 'USD', currentPrice: 200, currentPriceBase: 16000 }),
      holding({ name: 'Microsoft', currency: 'USD', currentPrice: 100, currentPriceBase: 8000 }),
    ]
    const sort: Sort = { key: 'currentValue', dir: 'desc' }
    const out = viewRows(holdings, { market: 'USD', search: '', }, sort)
    expect(out.map((r) => r.holding.name)).toEqual(['Apple', 'Microsoft'])
  })
})
