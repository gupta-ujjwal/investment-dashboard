import { describe, expect, it } from 'vitest'
import type { ManualAsset } from '../storage/assets'
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
  it('buckets by band in safe→high→untagged order with target overlay', () => {
    const assets = [
      asset({ id: '1', riskBand: 'safe', currentValueBase: 500000 }),
      asset({ id: '2', riskBand: 'high', currentValueBase: 250000 }),
      asset({ id: '3', currentValueBase: 250000 }), // untagged
    ]
    const slices = riskAllocation(assets, [{ riskBand: 'safe', pct: 60 }])
    expect(slices.map((s) => s.band)).toEqual(['safe', 'high', 'untagged'])
    expect(slices[0].pct).toBeCloseTo(0.5, 10)
    expect(slices[0].targetPct).toBeCloseTo(0.6, 10)
  })

  it('shows an unmet target band even with zero current value', () => {
    const slices = riskAllocation([], [{ riskBand: 'moderate', pct: 40 }])
    expect(slices).toHaveLength(1)
    expect(slices[0].band).toBe('moderate')
    expect(slices[0].valueBase).toBe(0)
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
