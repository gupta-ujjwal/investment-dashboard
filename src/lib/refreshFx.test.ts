import { describe, expect, it } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import { deriveFxWarning, stampHolding, stampMany } from './refreshFx'

function inrHolding(): CanonicalHolding {
  return {
    name: 'ASIAN PAINTS',
    source: 'groww',
    sourceSymbol: 'INE021A01026',
    quantity: 10,
    avgBuyPrice: 2400,
    currency: 'INR',
    assetClass: 'equity',
    importedAt: 1700000000000,
  }
}

function usdHolding(): CanonicalHolding {
  return {
    name: 'APPLE INC',
    source: 'vested',
    sourceSymbol: 'AAPL',
    quantity: 5,
    avgBuyPrice: 150,
    currency: 'USD',
    assetClass: 'equity',
    importedAt: 1700000000000,
  }
}

describe('stampHolding', () => {
  it('stamps an INR holding with rate 1 when base is INR', () => {
    const stamped = stampHolding(inrHolding(), 'INR', 95.77, 1234567890)
    expect(stamped.fxRate).toBe(1)
    expect(stamped.fxAsOf).toBe(1234567890)
    expect(stamped.avgBuyPriceBase).toBe(2400)
  })

  it('stamps a USD holding with the rate when base is INR', () => {
    const stamped = stampHolding(usdHolding(), 'INR', 95.77, 1234567890)
    expect(stamped.fxRate).toBe(95.77)
    expect(stamped.avgBuyPriceBase).toBeCloseTo(150 * 95.77, 6)
  })

  it('stamps an INR holding with inverse rate when base is USD', () => {
    const stamped = stampHolding(inrHolding(), 'USD', 95.77, 1234567890)
    expect(stamped.fxRate).toBeCloseTo(1 / 95.77, 10)
    expect(stamped.avgBuyPriceBase).toBeCloseTo(2400 / 95.77, 6)
  })

  it('preserves all original fields', () => {
    const original = usdHolding()
    const stamped = stampHolding(original, 'INR', 95.77, 1234567890)
    expect(stamped.name).toBe(original.name)
    expect(stamped.source).toBe(original.source)
    expect(stamped.sourceSymbol).toBe(original.sourceSymbol)
    expect(stamped.quantity).toBe(original.quantity)
    expect(stamped.avgBuyPrice).toBe(original.avgBuyPrice)
    expect(stamped.currency).toBe(original.currency)
    expect(stamped.assetClass).toBe(original.assetClass)
    expect(stamped.importedAt).toBe(original.importedAt)
  })
})

describe('stampMany', () => {
  it('stamps every holding with the same fxAsOf', () => {
    const rows = [inrHolding(), usdHolding()]
    const stamped = stampMany(rows, 'INR', 95.77, 1234567890)
    expect(stamped).toHaveLength(2)
    expect(stamped.every((s) => s.fxAsOf === 1234567890)).toBe(true)
  })

  it('returns a new array (no mutation of inputs)', () => {
    const original = usdHolding()
    const rows = [original]
    const stamped = stampMany(rows, 'INR', 95.77, 1234567890)
    expect(stamped[0]).not.toBe(original)
    expect(original.fxRate).toBeUndefined()
  })
})

describe('deriveFxWarning', () => {
  it('returns null when the live fetch succeeded (no failure)', () => {
    expect(deriveFxWarning(null, 83.5, 1700000000000)).toBeNull()
    // Even with no fallback rate on record — a null failure means the
    // fallback values are irrelevant, since the live rate was used.
    expect(deriveFxWarning(null, null, null)).toBeNull()
  })

  it('names the stale saved rate and date when live fails but a fallback exists', () => {
    const warning = deriveFxWarning('Frankfurter timed out after 3000ms', 83.5, 1715126400000)
    expect(warning).not.toBeNull()
    expect(warning).toContain('83.5')
    expect(warning).toContain('live')
    expect(warning).toContain('Frankfurter timed out after 3000ms')
  })

  it('gives a distinct message when live fails and there is no fallback rate at all', () => {
    const warning = deriveFxWarning('Network error fetching FX rate', null, null)
    expect(warning).not.toBeNull()
    expect(warning).toContain('Network error fetching FX rate')
    expect(warning).not.toContain('83.5')
  })
})
