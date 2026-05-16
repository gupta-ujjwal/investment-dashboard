import { describe, expect, it } from 'vitest'
import type { CanonicalHolding } from './holdings'
import { buildRecord, toDateKey } from './history'

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

describe('toDateKey', () => {
  it('formats a timestamp as YYYY-MM-DD with zero-padding', () => {
    // 2026-03-09T08:30:00 local — single-digit month and day must pad.
    const ts = new Date(2026, 2, 9, 8, 30, 0).getTime()
    expect(toDateKey(ts)).toBe('2026-03-09')
  })

  it('is stable across times within the same calendar day', () => {
    const morning = new Date(2026, 4, 16, 1, 0, 0).getTime()
    const night = new Date(2026, 4, 16, 23, 59, 0).getTime()
    expect(toDateKey(morning)).toBe(toDateKey(night))
  })
})

describe('buildRecord', () => {
  it('stamps the record with date, capturedAt, base currency and holdings', () => {
    const capturedAt = new Date(2026, 4, 16, 12, 0, 0).getTime()
    const holdings = [holding(), holding({ sourceSymbol: 'INE000000002' })]
    const record = buildRecord(holdings, 'USD', capturedAt)
    expect(record.date).toBe('2026-05-16')
    expect(record.capturedAt).toBe(capturedAt)
    expect(record.baseCurrency).toBe('USD')
    expect(record.holdings).toHaveLength(2)
  })

  it('keys two same-day snapshots identically — a re-import overwrites', () => {
    const first = buildRecord([holding()], 'INR', new Date(2026, 4, 16, 9).getTime())
    const second = buildRecord(
      [holding(), holding({ sourceSymbol: 'INE000000002' })],
      'INR',
      new Date(2026, 4, 16, 17).getTime(),
    )
    // Same primary key → IndexedDB `put` replaces rather than appends.
    expect(first.date).toBe(second.date)
  })

  it('keys snapshots on different days distinctly', () => {
    const day1 = buildRecord([holding()], 'INR', new Date(2026, 4, 16).getTime())
    const day2 = buildRecord([holding()], 'INR', new Date(2026, 4, 17).getTime())
    expect(day1.date).not.toBe(day2.date)
  })

  it('captures an empty portfolio (a commit that deleted everything)', () => {
    const record = buildRecord([], 'INR', Date.now())
    expect(record.holdings).toEqual([])
  })
})
