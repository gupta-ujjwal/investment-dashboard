import { describe, expect, it } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import type { ManualAsset } from '../storage/assets'
import {
  assetPosition,
  buildPositions,
  netWorthAllocation,
  netWorthTotals,
  staleAssetCount,
} from './netWorth'

function holding(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Test Co',
    source: 'groww',
    sourceSymbol: 'INE0001',
    quantity: 10,
    avgBuyPrice: 100,
    currency: 'INR',
    assetClass: 'equity',
    importedAt: 1000,
    avgBuyPriceBase: 100,
    currentPrice: 120,
    currentPriceBase: 120,
    ...over,
  }
}

function asset(over: Partial<ManualAsset> = {}): ManualAsset {
  return {
    id: 'a1',
    name: 'Gold',
    assetClass: 'gold',
    currency: 'INR',
    investedAmount: 400000,
    currentValue: 500000,
    investedAmountBase: 400000,
    currentValueBase: 500000,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('assetPosition', () => {
  it('marks a value-only asset (no invested amount) as hasBasis=false', () => {
    const p = assetPosition(asset({ investedAmount: undefined, investedAmountBase: undefined }))
    expect(p.hasBasis).toBe(false)
    expect(p.investedBase).toBeUndefined()
    expect(p.profitAbsBase).toBeUndefined()
    expect(p.currentValueBase).toBe(500000)
  })

  it('computes profit when both basis and value are present', () => {
    const p = assetPosition(asset())
    expect(p.hasBasis).toBe(true)
    expect(p.profitAbsBase).toBe(100000)
  })
})

describe('netWorthTotals — partial-value discipline', () => {
  it('sums holdings + assets when everything is stamped', () => {
    const positions = buildPositions([holding()], [asset()])
    const t = netWorthTotals(positions)
    // holding current value 10*120 = 1200; asset 500000
    expect(t.currentValueStrict).toBe(501200)
    expect(t.knownCurrentValue).toBe(501200)
    expect(t.excludedCount).toBe(0)
  })

  it('does NOT collapse the whole total to undefined when one holding is unstamped — exposes a known subtotal + excluded count', () => {
    const unstamped = holding({
      sourceSymbol: 'INE0002',
      currentPriceBase: undefined,
      avgBuyPriceBase: undefined,
    })
    const positions = buildPositions([holding(), unstamped], [asset()])
    const t = netWorthTotals(positions)
    // strict total is undefined (R1) ...
    expect(t.currentValueStrict).toBeUndefined()
    // ... but the known subtotal still surfaces the value we DO know:
    // holding#1 1200 + asset 500000 = 501200, with one position excluded.
    expect(t.knownCurrentValue).toBe(501200)
    expect(t.excludedCount).toBe(1)
    expect(t.totalPositions).toBe(3)
  })

  it('never treats a missing value as 0 in the known subtotal', () => {
    const onlyUnstamped = holding({ currentPriceBase: undefined })
    const t = netWorthTotals(buildPositions([onlyUnstamped], []))
    expect(t.knownCurrentValue).toBe(0) // nothing known, not a fabricated value
    expect(t.excludedCount).toBe(1)
    expect(t.currentValueStrict).toBeUndefined()
  })

  it('excludes value-only assets from P&L% but includes them in net worth', () => {
    const valueOnly = asset({
      id: 'cash',
      assetClass: 'cash',
      investedAmount: undefined,
      investedAmountBase: undefined,
      currentValue: 200000,
      currentValueBase: 200000,
    })
    const positions = buildPositions([holding()], [asset(), valueOnly])
    const t = netWorthTotals(positions)
    // net worth includes the cash
    expect(t.knownCurrentValue).toBe(1200 + 500000 + 200000)
    // P&L basis only over holding (10*100=1000) + gold (400000) = 401000;
    // profit = (1200-1000) + (500000-400000) = 100200
    expect(t.profitKnown).toBe(100200)
    expect(t.profitPctKnown).toBeCloseTo(100200 / 401000, 10)
  })

  it('reports investedStrict undefined when a basis-bearing position is unstamped', () => {
    const positions = buildPositions(
      [holding({ avgBuyPriceBase: undefined })],
      [asset()],
    )
    const t = netWorthTotals(positions)
    expect(t.investedStrict).toBeUndefined()
  })

  it('excludes closed holdings from net worth', () => {
    const positions = buildPositions(
      [holding(), holding({ sourceSymbol: 'INE0003', status: 'closed' })],
      [],
    )
    expect(positions).toHaveLength(1)
  })
})

describe('netWorthAllocation', () => {
  it('buckets by asset-class group, largest first, only priced positions', () => {
    const positions = buildPositions(
      [holding()],
      [asset(), asset({ id: 'btc', assetClass: 'crypto', currentValueBase: 300000 })],
    )
    const slices = netWorthAllocation(positions)
    expect(slices[0].label).toBe('Gold / Silver')
    expect(slices.map((s) => s.label)).toContain('Crypto')
    expect(slices.map((s) => s.label)).toContain('Equity')
    const sum = slices.reduce((s, x) => s + x.pct, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('returns [] when nothing is priced', () => {
    const positions = buildPositions([holding({ currentPriceBase: undefined })], [])
    expect(netWorthAllocation(positions)).toEqual([])
  })
})

describe('staleAssetCount', () => {
  it('flags a non-base asset stamped before the latest rate', () => {
    const a = asset({ currency: 'USD', fxAsOf: 1000, currentValueBase: 41000 })
    expect(staleAssetCount([a], 'INR', 2000)).toBe(1)
  })

  it('does not flag a base-currency asset (identity, no rate needed)', () => {
    const a = asset({ currency: 'INR', fxAsOf: undefined })
    expect(staleAssetCount([a], 'INR', 2000)).toBe(0)
  })

  it('flags a non-base asset that was never stamped', () => {
    const a = asset({ currency: 'USD', fxAsOf: undefined, currentValueBase: undefined })
    expect(staleAssetCount([a], 'INR', null)).toBe(1)
  })
})
