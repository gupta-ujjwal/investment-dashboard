import { describe, expect, it } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import { diffHoldings, toDeleteKeys } from './diff'

function holding(
  source: 'vested' | 'groww',
  symbol: string,
  quantity: number,
  avgBuyPrice: number,
): CanonicalHolding {
  return {
    name: `${symbol} stock`,
    source,
    sourceSymbol: symbol,
    quantity,
    avgBuyPrice,
    currency: source === 'vested' ? 'USD' : 'INR',
    assetClass: 'equity',
    importedAt: 0,
  }
}

describe('diffHoldings', () => {
  it('returns all inserts when existing is empty', () => {
    const incoming = [holding('vested', 'AAPL', 1, 100), holding('vested', 'MSFT', 2, 200)]
    const result = diffHoldings([], incoming, 'vested')
    expect(result.inserts).toHaveLength(2)
    expect(result.updates).toHaveLength(0)
    expect(result.missing).toHaveLength(0)
  })

  it('returns all updates when incoming exactly matches existing keys', () => {
    const existing = [holding('vested', 'AAPL', 1, 100)]
    const incoming = [holding('vested', 'AAPL', 5, 150)]
    const result = diffHoldings(existing, incoming, 'vested')
    expect(result.inserts).toHaveLength(0)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].quantity).toBe(5)
    expect(result.updates[0].avgBuyPrice).toBe(150)
    expect(result.missing).toHaveLength(0)
  })

  it('surfaces existing rows missing from incoming', () => {
    const existing = [holding('vested', 'AAPL', 1, 100), holding('vested', 'MSFT', 2, 200)]
    const incoming = [holding('vested', 'AAPL', 1, 100)]
    const result = diffHoldings(existing, incoming, 'vested')
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].sourceSymbol).toBe('MSFT')
  })

  it('handles a mixed insert/update/missing case', () => {
    const existing = [holding('groww', 'INE021A01026', 22, 2410), holding('groww', 'INE176A01028', 20, 1412)]
    const incoming = [
      holding('groww', 'INE021A01026', 25, 2500),
      holding('groww', 'INE758T01015', 208, 195),
    ]
    const result = diffHoldings(existing, incoming, 'groww')
    expect(result.inserts).toHaveLength(1)
    expect(result.inserts[0].sourceSymbol).toBe('INE758T01015')
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].sourceSymbol).toBe('INE021A01026')
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0].sourceSymbol).toBe('INE176A01028')
  })

  it('enforces source containment on existing rows', () => {
    const existing = [holding('vested', 'AAPL', 1, 100)]
    const incoming = [holding('groww', 'INE021A01026', 22, 2410)]
    expect(() => diffHoldings(existing, incoming, 'groww')).toThrow(/existing row has source/)
  })

  it('enforces source containment on incoming rows', () => {
    const existing = [holding('groww', 'INE021A01026', 22, 2410)]
    const incoming = [holding('vested', 'AAPL', 1, 100)]
    expect(() => diffHoldings(existing, incoming, 'groww')).toThrow(/incoming row has source/)
  })

  it('handles empty incoming as all-missing', () => {
    const existing = [holding('vested', 'AAPL', 1, 100), holding('vested', 'MSFT', 2, 200)]
    const result = diffHoldings(existing, [], 'vested')
    expect(result.inserts).toHaveLength(0)
    expect(result.updates).toHaveLength(0)
    expect(result.missing).toHaveLength(2)
  })
})

describe('toDeleteKeys', () => {
  it('extracts (source, sourceSymbol) pairs', () => {
    const rows = [holding('vested', 'AAPL', 1, 100), holding('vested', 'MSFT', 2, 200)]
    expect(toDeleteKeys(rows)).toEqual([
      { source: 'vested', sourceSymbol: 'AAPL' },
      { source: 'vested', sourceSymbol: 'MSFT' },
    ])
  })
})
