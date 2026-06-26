import { describe, it, expect } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import type { ManualAsset } from '../storage/assets'
import {
  buildInvestmentRows,
  deriveEquityRows,
  legacyEquityCount,
} from './investments'

function holding(overrides: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Apple',
    source: 'vested',
    sourceSymbol: 'AAPL',
    quantity: 10,
    avgBuyPrice: 100,
    currency: 'USD',
    assetClass: 'equity',
    importedAt: 1_717_200_000_000,
    avgBuyPriceBase: 8000, // base-currency per-unit cost
    currentPriceBase: 9000, // base-currency per-unit price
    ...overrides,
  }
}

function asset(overrides: Partial<ManualAsset> = {}): ManualAsset {
  return {
    id: 'a1',
    name: 'Gold',
    assetClass: 'gold',
    currency: 'INR',
    currentValue: 500_000,
    currentValueBase: 500_000,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('deriveEquityRows', () => {
  it('aggregates holdings into one row per market, India before US', () => {
    const rows = deriveEquityRows([
      holding({ sourceSymbol: 'AAPL', currency: 'USD' }),
      holding({ sourceSymbol: 'INFY', currency: 'INR', quantity: 5 }),
    ])
    expect(rows.map((r) => r.market)).toEqual(['INR', 'USD'])
    const us = rows.find((r) => r.market === 'USD')!
    expect(us.label).toBe('Equity · US')
    expect(us.currentValueBase).toBe(10 * 9000)
    expect(us.investedBase).toBe(10 * 8000)
    expect(us.positionsCount).toBe(1)
    expect(us.excludedCount).toBe(0)
  })

  it('excludes closed positions', () => {
    const rows = deriveEquityRows([
      holding({ currency: 'USD' }),
      holding({ sourceSymbol: 'CLOSED', currency: 'USD', status: 'closed' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].positionsCount).toBe(1)
  })

  it('is partial-aware: an unstamped holding is excluded, not read as 0', () => {
    const rows = deriveEquityRows([
      holding({ sourceSymbol: 'AAPL', currency: 'USD' }), // valued
      holding({ sourceSymbol: 'NVDA', currency: 'USD', currentPriceBase: undefined }), // unpriced
    ])
    const us = rows[0]
    expect(us.positionsCount).toBe(2)
    expect(us.excludedCount).toBe(1)
    expect(us.currentValueBase).toBe(10 * 9000) // only the valued one
  })

  it('returns undefined value when no holding in the market is computable', () => {
    const rows = deriveEquityRows([
      holding({ currency: 'USD', currentPriceBase: undefined, avgBuyPriceBase: undefined }),
    ])
    expect(rows[0].currentValueBase).toBeUndefined()
    expect(rows[0].investedBase).toBeUndefined()
    expect(rows[0].excludedCount).toBe(1)
  })

  it('treats a non-finite base figure as not-computable (defensive)', () => {
    const rows = deriveEquityRows([
      holding({ currency: 'USD', quantity: Number.NaN }),
    ])
    expect(rows[0].currentValueBase).toBeUndefined()
    expect(rows[0].excludedCount).toBe(1)
  })

  it('produces no row for a market with no open holdings', () => {
    expect(deriveEquityRows([holding({ currency: 'USD' })]).map((r) => r.market)).toEqual(['USD'])
  })
})

describe('buildInvestmentRows', () => {
  it('lists derived equity rows first, then manual assets by known value desc', () => {
    const rows = buildInvestmentRows(
      [holding({ currency: 'INR' })],
      [
        asset({ id: 'small', name: 'Cash', assetClass: 'cash', currentValueBase: 10_000 }),
        asset({ id: 'big', name: 'Gold', assetClass: 'gold', currentValueBase: 500_000 }),
      ],
    )
    expect(rows[0].kind).toBe('equityDerived')
    const assetRows = rows.filter((r) => r.kind === 'asset')
    expect(assetRows.map((r) => r.label)).toEqual(['Gold', 'Cash'])
  })

  it('flags legacy manual equity assets but keeps them in the list', () => {
    const rows = buildInvestmentRows(
      [],
      [asset({ id: 'leg', name: 'Old RSU lot', assetClass: 'equity' })],
    )
    const legacy = rows.find((r) => r.kind === 'asset' && r.label === 'Old RSU lot')
    expect(legacy?.kind).toBe('asset')
    if (legacy?.kind === 'asset') expect(legacy.isLegacyEquity).toBe(true)
    expect(legacyEquityCount(rows)).toBe(1)
  })
})
