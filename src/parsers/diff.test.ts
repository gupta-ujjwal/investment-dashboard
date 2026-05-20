import { describe, expect, it } from 'vitest'
import type { CanonicalHolding, OverridableField } from '../storage/holdings'
import { diffHoldings, toDeleteKeys } from './diff'

function holding(
  source: 'vested' | 'groww',
  symbol: string,
  quantity: number,
  avgBuyPrice: number,
  over: Partial<CanonicalHolding> = {},
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
    ...over,
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

describe('diffHoldings — manual-overrides + closed-row semantics', () => {
  it('update path respects per-field sticky overrides (quantity)', () => {
    // User edited quantity inline weeks ago → manualOverrides=['quantity'].
    // Broker re-import delivers a different quantity + a higher current price.
    // Quantity is overridden; current price is not.
    const existing = [
      holding('vested', 'AAPL', 7, 150, {
        currentPrice: 180,
        manualOverrides: ['quantity'],
      }),
    ]
    const incoming = [
      holding('vested', 'AAPL', 99, 150, { currentPrice: 220, importedAt: 2000 }),
    ]
    const result = diffHoldings(existing, incoming, 'vested')
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].quantity).toBe(7) // user's value held
    expect(result.updates[0].currentPrice).toBe(220) // broker won (not in set)
    expect(result.updates[0].importedAt).toBe(2000) // import touched importedAt
    expect(result.updates[0].manualOverrides).toEqual(['quantity'])
  })

  it('update path with no overrides → incoming wins everything', () => {
    const existing = [holding('vested', 'AAPL', 5, 100, { manualOverrides: undefined })]
    const incoming = [holding('vested', 'AAPL', 20, 250)]
    const result = diffHoldings(existing, incoming, 'vested')
    expect(result.updates[0].quantity).toBe(20)
    expect(result.updates[0].avgBuyPrice).toBe(250)
  })

  it('closed rows are NOT surfaced as missing when absent from incoming', () => {
    // A closed row the broker no longer reports → the user already exited;
    // no decision to ask about, so it must not appear in `missing`.
    const existing = [
      holding('vested', 'AAPL', 1, 100, { status: 'closed' }),
      holding('vested', 'MSFT', 2, 200, { status: 'open' }),
    ]
    const incoming = [holding('vested', 'MSFT', 2, 200)]
    const result = diffHoldings(existing, incoming, 'vested')
    expect(result.missing).toHaveLength(0)
    expect(result.updates).toHaveLength(1)
  })

  it('closed → open flip on re-import (user re-bought a previously-exited position)', () => {
    const existing = [holding('vested', 'AAPL', 1, 100, { status: 'closed' })]
    const incoming = [holding('vested', 'AAPL', 5, 120, { importedAt: 2000 })]
    const result = diffHoldings(existing, incoming, 'vested')
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].status).toBe('open')
    expect(result.updates[0].quantity).toBe(5)
  })

  it('closed → open flip preserves an unrelated override (currentPrice)', () => {
    const existing = [
      holding('vested', 'AAPL', 1, 100, {
        status: 'closed',
        currentPrice: 175,
        manualOverrides: ['currentPrice'],
      }),
    ]
    const incoming = [holding('vested', 'AAPL', 5, 120, { currentPrice: 250 })]
    const result = diffHoldings(existing, incoming, 'vested')
    expect(result.updates[0].status).toBe('open')
    expect(result.updates[0].currentPrice).toBe(175) // override held
    expect(result.updates[0].quantity).toBe(5) // broker won
  })
})

describe('diffHoldings — three-hop integration (edit → re-import → override sticks)', () => {
  it('a row edited inline then re-imported preserves the edited field across the import cycle', () => {
    // Simulates the flow the pre-mortem names as highest-risk:
    //   1. User edits a `vested/AAPL` quantity from 10 → 7 inline.
    //      The save path writes the row with `manualOverrides: ['quantity']`.
    //   2. Six weeks pass.
    //   3. Broker re-import delivers AAPL with quantity 99.
    //   4. The diff's update path must keep quantity at 7.
    // If `mergeWithOverrides` regresses (e.g. wires up to the wrong row's
    // overrides), this test fails fast in CI before any user data corrupts.
    const editedField: OverridableField = 'quantity'
    const editedRow: CanonicalHolding = holding('vested', 'AAPL', 7, 150, {
      currentPrice: 180,
      currentPriceBase: 14400,
      avgBuyPriceBase: 12000,
      manualOverrides: [editedField],
      updatedAt: 1500,
      createdAt: 1000,
    })
    const brokerReimport: CanonicalHolding = holding('vested', 'AAPL', 99, 150, {
      currentPrice: 220,
      importedAt: 2500,
    })
    const result = diffHoldings([editedRow], [brokerReimport], 'vested')
    expect(result.updates).toHaveLength(1)
    const merged = result.updates[0]
    expect(merged.quantity).toBe(7) // load-bearing assertion
    expect(merged.currentPrice).toBe(220)
    expect(merged.manualOverrides).toEqual(['quantity'])
    expect(merged.createdAt).toBe(1000) // audit timestamp survives
  })
})
