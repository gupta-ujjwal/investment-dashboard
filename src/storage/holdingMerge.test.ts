import { describe, expect, it } from 'vitest'
import type { CanonicalHolding, OverridableField } from './holdings'
import { mergeWithOverrides } from './holdingMerge'

function row(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Apple Inc',
    source: 'vested',
    sourceSymbol: 'AAPL',
    quantity: 10,
    avgBuyPrice: 150,
    currency: 'USD',
    assetClass: 'equity',
    importedAt: 1000,
    currentPrice: 200,
    ...over,
  }
}

describe('mergeWithOverrides', () => {
  it('no overrides set → incoming wins for all fields', () => {
    const existing = row({ quantity: 5, avgBuyPrice: 100, name: 'old name' })
    const incoming = row({ quantity: 20, avgBuyPrice: 220, name: 'new name', importedAt: 2000 })
    const merged = mergeWithOverrides(existing, incoming)
    expect(merged.quantity).toBe(20)
    expect(merged.avgBuyPrice).toBe(220)
    expect(merged.name).toBe('new name')
    expect(merged.importedAt).toBe(2000)
    expect(merged.manualOverrides).toBeUndefined()
  })

  it('empty overrides array behaves like no overrides', () => {
    // Defensive: a stale `[]` shouldn't survive R1, but if it sneaks in we
    // still want sane behavior — fall through to "broker wins".
    const existing = row({ quantity: 5, manualOverrides: [] })
    const incoming = row({ quantity: 20 })
    const merged = mergeWithOverrides(existing, incoming)
    expect(merged.quantity).toBe(20)
  })

  it('overrides on quantity → existing wins for quantity, broker for the rest', () => {
    const existing = row({
      quantity: 7,
      avgBuyPrice: 100,
      manualOverrides: ['quantity'],
    })
    const incoming = row({ quantity: 99, avgBuyPrice: 999, currentPrice: 250 })
    const merged = mergeWithOverrides(existing, incoming)
    expect(merged.quantity).toBe(7) // user's value kept
    expect(merged.avgBuyPrice).toBe(999) // broker wins
    expect(merged.currentPrice).toBe(250) // broker wins
    expect(merged.manualOverrides).toEqual(['quantity'])
  })

  it('overrides on multiple fields are all preserved', () => {
    const existing = row({
      quantity: 7,
      avgBuyPrice: 100,
      currentPrice: 175,
      name: 'My Apple',
      assetClass: 'etf',
      manualOverrides: ['quantity', 'currentPrice', 'name', 'assetClass'],
    })
    const incoming = row({
      quantity: 99,
      avgBuyPrice: 999,
      currentPrice: 999,
      name: 'Apple Inc',
      assetClass: 'equity',
    })
    const merged = mergeWithOverrides(existing, incoming)
    expect(merged.quantity).toBe(7)
    expect(merged.avgBuyPrice).toBe(999) // not in overrides → broker
    expect(merged.currentPrice).toBe(175)
    expect(merged.name).toBe('My Apple')
    expect(merged.assetClass).toBe('etf')
  })

  it('currentPrice override of undefined wins over broker-supplied price', () => {
    // User says "no current price"; broker delivers one. The override means
    // the user's "no price" answer is what the dashboard should show.
    const existing = row({
      currentPrice: undefined,
      manualOverrides: ['currentPrice'],
    })
    const incoming = row({ currentPrice: 250 })
    const merged = mergeWithOverrides(existing, incoming)
    expect(merged.currentPrice).toBeUndefined()
  })

  it('preserves existing status and createdAt across a merge', () => {
    const existing = row({
      status: 'closed',
      createdAt: 500,
      manualOverrides: ['quantity'],
      quantity: 7,
    })
    const incoming = row({ quantity: 99, importedAt: 2000 })
    const merged = mergeWithOverrides(existing, incoming)
    expect(merged.status).toBe('closed')
    expect(merged.createdAt).toBe(500)
    expect(merged.quantity).toBe(7)
    expect(merged.importedAt).toBe(2000) // import always touches importedAt
  })

  it('returned manualOverrides is a new array — caller mutation is safe', () => {
    const overrides: OverridableField[] = ['quantity']
    const existing = row({ manualOverrides: overrides })
    const merged = mergeWithOverrides(existing, row({ quantity: 99 }))
    expect(merged.manualOverrides).toEqual(['quantity'])
    expect(merged.manualOverrides).not.toBe(overrides)
  })
})
