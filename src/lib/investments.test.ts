import { describe, it, expect } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import type { ManualAsset } from '../storage/assets'
import {
  buildInvestmentRows,
  deriveHoldingsRows,
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

describe('deriveHoldingsRows', () => {
  it('groups by (asset class, market) — never collapses non-equity into "Equity"', () => {
    // The bug being fixed (#1): an ETF and an MF were both shown as "Equity".
    const rows = deriveHoldingsRows([
      holding({ sourceSymbol: 'AAPL', currency: 'USD', assetClass: 'equity' }),
      holding({ sourceSymbol: 'QQQ', currency: 'USD', assetClass: 'etf' }),
      holding({ sourceSymbol: 'PARAGMF', currency: 'INR', assetClass: 'mf' }),
      holding({ sourceSymbol: 'IRBINVIT', currency: 'INR', assetClass: 'invit' }),
    ])
    // Each (class, market) pair is its own row; class label reflects the true class.
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(byKey['holdings:equity:USD'].classLabel).toBe('Equity')
    expect(byKey['holdings:equity:USD'].label).toBe('Equity · US')
    expect(byKey['holdings:etf:USD'].classLabel).toBe('ETF')
    expect(byKey['holdings:etf:USD'].label).toBe('ETF · US')
    expect(byKey['holdings:mf:INR'].classLabel).toBe('Mutual Funds')
    expect(byKey['holdings:mf:INR'].label).toBe('Mutual Funds · India')
    expect(byKey['holdings:invit:INR'].classLabel).toBe('InvIT')
    // No row is mislabeled Equity unless it is genuinely equity.
    const equityLabeled = rows.filter((r) => r.classLabel === 'Equity')
    expect(equityLabeled).toHaveLength(1)
    expect(equityLabeled[0].assetClass).toBe('equity')
  })

  it('orders India before US, then by a fixed class order within a market', () => {
    const rows = deriveHoldingsRows([
      holding({ sourceSymbol: 'QQQ', currency: 'USD', assetClass: 'etf' }),
      holding({ sourceSymbol: 'AAPL', currency: 'USD', assetClass: 'equity' }),
      holding({ sourceSymbol: 'INFY', currency: 'INR', assetClass: 'equity', quantity: 5 }),
    ])
    expect(rows.map((r) => r.key)).toEqual([
      'holdings:equity:INR',
      'holdings:equity:USD',
      'holdings:etf:USD',
    ])
  })

  it('aggregates value within a (class, market) group', () => {
    const rows = deriveHoldingsRows([
      holding({ sourceSymbol: 'AAPL', currency: 'USD', assetClass: 'equity' }),
      holding({ sourceSymbol: 'MSFT', currency: 'USD', assetClass: 'equity', quantity: 2 }),
    ])
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.positionsCount).toBe(2)
    expect(r.currentValueBase).toBe(10 * 9000 + 2 * 9000)
    expect(r.investedBase).toBe(10 * 8000 + 2 * 8000)
    expect(r.excludedCount).toBe(0)
  })

  it('excludes closed positions', () => {
    const rows = deriveHoldingsRows([
      holding({ currency: 'USD' }),
      holding({ sourceSymbol: 'CLOSED', currency: 'USD', status: 'closed' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].positionsCount).toBe(1)
  })

  it('is partial-aware: an unstamped holding is excluded, not read as 0', () => {
    const rows = deriveHoldingsRows([
      holding({ sourceSymbol: 'AAPL', currency: 'USD' }), // valued
      holding({ sourceSymbol: 'NVDA', currency: 'USD', currentPriceBase: undefined }), // unpriced
    ])
    const us = rows[0]
    expect(us.positionsCount).toBe(2)
    expect(us.excludedCount).toBe(1)
    expect(us.currentValueBase).toBe(10 * 9000) // only the valued one
  })

  it('returns undefined value when no holding in the group is computable', () => {
    const rows = deriveHoldingsRows([
      holding({ currency: 'USD', currentPriceBase: undefined, avgBuyPriceBase: undefined }),
    ])
    expect(rows[0].currentValueBase).toBeUndefined()
    expect(rows[0].investedBase).toBeUndefined()
    expect(rows[0].excludedCount).toBe(1)
  })

  it('treats a non-finite base figure as not-computable (defensive)', () => {
    const rows = deriveHoldingsRows([
      holding({ currency: 'USD', quantity: Number.NaN }),
    ])
    expect(rows[0].currentValueBase).toBeUndefined()
    expect(rows[0].excludedCount).toBe(1)
  })
})

describe('buildInvestmentRows', () => {
  it('lists holdings-derived rows first, then manual assets by known value desc', () => {
    const rows = buildInvestmentRows(
      [holding({ currency: 'INR' })],
      [
        asset({ id: 'small', name: 'Cash', assetClass: 'cash', currentValueBase: 10_000 }),
        asset({ id: 'big', name: 'Gold', assetClass: 'gold', currentValueBase: 500_000 }),
      ],
    )
    expect(rows[0].kind).toBe('holdingsDerived')
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
