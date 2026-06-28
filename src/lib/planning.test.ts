import { describe, expect, it } from 'vitest'
import type { ManualAsset } from '../storage/assets'
import type { CanonicalHolding } from '../storage/holdings'
import { bulkAllocation, emergencyFundStatus, riskAllocation } from './planning'

function asset(over: Partial<ManualAsset> = {}): ManualAsset {
  return {
    id: 'a',
    name: 'Asset',
    assetClass: 'gold',
    currency: 'INR',
    currentValue: 100000,
    currentValueBase: 100000,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

/** 1 unit @ base price 100 → currentValueBase 100, unless overridden. */
function holding(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Holding',
    source: 'vested',
    sourceSymbol: 'SYM',
    quantity: 1,
    avgBuyPrice: 100,
    currency: 'USD',
    assetClass: 'equity',
    importedAt: 1,
    avgBuyPriceBase: 100,
    currentPriceBase: 100,
    ...over,
  }
}

describe('emergencyFundStatus', () => {
  it('sums emergency-tagged assets and computes coverage + funded %', () => {
    const assets = [
      asset({ id: '1', emergencyFund: true, currentValueBase: 300000 }),
      asset({ id: '2', emergencyFund: true, currentValueBase: 150000 }),
      asset({ id: '3', emergencyFund: false, currentValueBase: 999999 }),
    ]
    const s = emergencyFundStatus(assets, 150000, 6)
    expect(s.current).toBe(450000)
    expect(s.target).toBe(900000)
    expect(s.coverageMonths).toBeCloseTo(3, 10)
    expect(s.fundedPct).toBeCloseTo(0.5, 10)
  })

  it('excludes emergency assets with no base value (partial-aware)', () => {
    const assets = [
      asset({ id: '1', emergencyFund: true, currentValueBase: 300000 }),
      asset({ id: '2', emergencyFund: true, currentValueBase: undefined }),
    ]
    const s = emergencyFundStatus(assets, 150000, 6)
    expect(s.current).toBe(300000)
    expect(s.excludedCount).toBe(1)
  })

  it('leaves target/coverage undefined when needs are unset', () => {
    const s = emergencyFundStatus([asset({ emergencyFund: true })], undefined, undefined)
    expect(s.target).toBeUndefined()
    expect(s.coverageMonths).toBeUndefined()
    expect(s.fundedPct).toBeUndefined()
  })
})

describe('riskAllocation', () => {
  it('buckets assets by band in safe→high→untagged order with target overlay', () => {
    const assets = [
      asset({ id: '1', riskBand: 'safe', currentValueBase: 500000 }),
      asset({ id: '2', riskBand: 'high', currentValueBase: 250000 }),
      asset({ id: '3', currentValueBase: 250000 }), // untagged
    ]
    const slices = riskAllocation([], assets, [{ riskBand: 'safe', pct: 60 }])
    expect(slices.map((s) => s.band)).toEqual(['safe', 'high', 'untagged'])
    expect(slices[0].pct).toBeCloseTo(0.5, 10)
    expect(slices[0].targetPct).toBeCloseTo(0.6, 10)
  })

  it('shows an unmet target band even with zero current value', () => {
    const slices = riskAllocation([], [], [{ riskBand: 'moderate', pct: 40 }])
    expect(slices).toHaveLength(1)
    expect(slices[0].band).toBe('moderate')
    expect(slices[0].valueBase).toBe(0)
  })

  // ── #2: Planning now sees imported holdings, not just manual assets ──────────
  it('folds imported holdings under their asset-class-derived band', () => {
    // equity→high, etf→moderate (derived, no override).
    const holdings = [
      holding({ sourceSymbol: 'AAPL', assetClass: 'equity', quantity: 3 }), // 300 → high
      holding({ sourceSymbol: 'QQQ', assetClass: 'etf', quantity: 7 }), // 700 → moderate
    ]
    const slices = riskAllocation(holdings, [])
    const byBand = Object.fromEntries(slices.map((s) => [s.band, s]))
    expect(byBand.high.valueBase).toBe(300)
    expect(byBand.moderate.valueBase).toBe(700)
    // No "untagged 100%" — the whole equity book is classified (the audit bug).
    expect(byBand.untagged).toBeUndefined()
  })

  it('lets a per-holding override win over the derived band', () => {
    const slices = riskAllocation(
      [holding({ assetClass: 'equity', quantity: 5, riskBand: 'safe' })], // override high→safe
      [],
    )
    expect(slices.map((s) => s.band)).toEqual(['safe'])
    expect(slices[0].valueBase).toBe(500)
  })

  it("buckets an unmapped class ('other', no override) as untagged — never dropped", () => {
    const slices = riskAllocation(
      [
        holding({ sourceSymbol: 'A', assetClass: 'equity', quantity: 6 }), // 600 high
        holding({ sourceSymbol: 'B', assetClass: 'other', quantity: 4 }), // 400 untagged
      ],
      [],
    )
    const total = slices.reduce((s, x) => s + x.valueBase, 0)
    expect(total).toBe(1000) // nothing dropped — slices reconcile to 100% of value
    expect(slices.find((s) => s.band === 'untagged')?.valueBase).toBe(400)
  })

  it('combines holdings and manual assets, and is partial/closed-aware', () => {
    const holdings = [
      holding({ sourceSymbol: 'EQ', assetClass: 'equity', quantity: 5 }), // 500 high
      holding({ sourceSymbol: 'CL', assetClass: 'equity', quantity: 9, status: 'closed' }), // excluded
      holding({ sourceSymbol: 'NP', assetClass: 'equity', currentPriceBase: undefined }), // unpriced → excluded
    ]
    const assets = [asset({ id: 's', riskBand: 'safe', currentValueBase: 500 })]
    const slices = riskAllocation(holdings, assets)
    const byBand = Object.fromEntries(slices.map((s) => [s.band, s]))
    expect(byBand.high.valueBase).toBe(500) // only the open, priced holding
    expect(byBand.safe.valueBase).toBe(500) // the asset
    expect(slices.reduce((s, x) => s + x.valueBase, 0)).toBe(1000)
  })
})

describe('bulkAllocation', () => {
  it('splits a lump sum by normalized target weights', () => {
    const rows = bulkAllocation(1000000, [
      { riskBand: 'safe', pct: 50 },
      { riskBand: 'high', pct: 50 },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].toInvest).toBe(500000)
    expect(rows[1].toInvest).toBe(500000)
  })

  it('normalizes weights that do not sum to 100', () => {
    const rows = bulkAllocation(900000, [
      { riskBand: 'safe', pct: 1 },
      { riskBand: 'high', pct: 2 },
    ])
    expect(rows[0].toInvest).toBeCloseTo(300000, 6)
    expect(rows[1].toInvest).toBeCloseTo(600000, 6)
  })

  it('returns [] for a non-positive lump sum or empty targets', () => {
    expect(bulkAllocation(0, [{ riskBand: 'safe', pct: 100 }])).toEqual([])
    expect(bulkAllocation(1000, [])).toEqual([])
  })
})
