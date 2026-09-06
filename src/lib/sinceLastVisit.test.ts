import { describe, expect, it } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'
import { changeSinceLastImport } from './sinceLastVisit'

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

function record(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    date: '2026-08-01',
    capturedAt: 1000,
    baseCurrency: 'INR',
    holdings: [holding()],
    assets: [],
    ...over,
  }
}

describe('changeSinceLastImport', () => {
  it('returns no delta and no sinceDate with zero snapshots (true cold start)', () => {
    const result = changeSinceLastImport([], undefined, 'INR')
    expect(result.delta).toBeUndefined()
    expect(result.deltaPct).toBeUndefined()
    expect(result.sinceDate).toBeUndefined()
    expect(result.importsSinceLastSeen).toBe(0)
    expect(result.unchanged).toBe(false)
  })

  it('reports unchanged (never ▲ ₹0) with exactly one snapshot', () => {
    const result = changeSinceLastImport([record({ date: '2026-08-03' })], undefined, 'INR')
    expect(result.delta).toBeUndefined()
    expect(result.deltaPct).toBeUndefined()
    expect(result.sinceDate).toBe('2026-08-03')
    expect(result.unchanged).toBe(true)
  })

  it('computes a real delta across two comparable snapshots with movement', () => {
    // Day 1: qty 10 @ currentPriceBase 120 → value 1200.
    const day1 = record({ date: '2026-08-01', holdings: [holding({ currentPriceBase: 120 })] })
    // Day 2: same holding, price moved to 150 → value 1500.
    const day2 = record({ date: '2026-08-08', holdings: [holding({ currentPriceBase: 150 })] })
    const result = changeSinceLastImport([day1, day2], undefined, 'INR')
    expect(result.delta).toBe(300)
    expect(result.deltaPct).toBeCloseTo(300 / 1200, 10)
    expect(result.sinceDate).toBe('2026-08-01')
    expect(result.unchanged).toBe(false)
  })

  it('reports unchanged when the computed delta is exactly zero', () => {
    const day1 = record({ date: '2026-08-01', holdings: [holding({ currentPriceBase: 120 })] })
    const day2 = record({ date: '2026-08-08', holdings: [holding({ currentPriceBase: 120 })] })
    const result = changeSinceLastImport([day1, day2], undefined, 'INR')
    expect(result.delta).toBe(0)
    expect(result.unchanged).toBe(true)
  })

  it('refuses to compare two snapshots stamped in different base currencies', () => {
    const day1 = record({ date: '2026-08-01', baseCurrency: 'USD' })
    const day2 = record({ date: '2026-08-08', baseCurrency: 'INR' })
    const result = changeSinceLastImport([day1, day2], undefined, 'INR')
    expect(result.delta).toBeUndefined()
    expect(result.deltaPct).toBeUndefined()
    expect(result.unchanged).toBe(false)
  })

  it('refuses to compare when either day has an unpriced position (R1 — never fabricate)', () => {
    const day1 = record({
      date: '2026-08-01',
      holdings: [holding({ currentPriceBase: undefined })],
    })
    const day2 = record({ date: '2026-08-08', holdings: [holding({ currentPriceBase: 150 })] })
    const result = changeSinceLastImport([day1, day2], undefined, 'INR')
    expect(result.delta).toBeUndefined()
    expect(result.unchanged).toBe(false)
  })

  it('counts snapshot-events strictly after lastSeenAt', () => {
    const day1 = record({ date: '2026-08-01', capturedAt: 1000 })
    const day2 = record({ date: '2026-08-08', capturedAt: 2000 })
    const day3 = record({ date: '2026-08-15', capturedAt: 3000 })
    const result = changeSinceLastImport([day1, day2, day3], 1500, 'INR')
    expect(result.importsSinceLastSeen).toBe(2)
  })

  it('counts zero imports since last seen when lastSeenAt is undefined', () => {
    const result = changeSinceLastImport([record()], undefined, 'INR')
    expect(result.importsSinceLastSeen).toBe(0)
  })

  it('only uses the two most recent snapshots, ignoring older history', () => {
    const oldest = record({ date: '2026-07-01', holdings: [holding({ currentPriceBase: 999 })] })
    const prior = record({ date: '2026-08-01', holdings: [holding({ currentPriceBase: 120 })] })
    const latest = record({ date: '2026-08-08', holdings: [holding({ currentPriceBase: 150 })] })
    const result = changeSinceLastImport([oldest, prior, latest], undefined, 'INR')
    expect(result.delta).toBe(300) // 150-120, not influenced by the 999 day
    expect(result.sinceDate).toBe('2026-08-01')
  })
})
