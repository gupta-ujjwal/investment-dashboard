import { describe, expect, it } from 'vitest'
import type { CanonicalHolding } from '../storage/holdings'
import { deriveBand, effectiveBand, isBandOverridden } from './riskBand'

function holding(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'H',
    source: 'vested',
    sourceSymbol: 'SYM',
    quantity: 1,
    avgBuyPrice: 1,
    currency: 'USD',
    assetClass: 'equity',
    importedAt: 1,
    ...over,
  }
}

describe('deriveBand', () => {
  // The full map is the trust surface of #2 — pin every value so a change is
  // deliberate and reviewed, not silent.
  it('maps each asset class to its conservative default band', () => {
    expect(deriveBand('equity')).toBe('high')
    expect(deriveBand('etf')).toBe('moderate')
    expect(deriveBand('mf')).toBe('moderate')
    expect(deriveBand('invit')).toBe('moderate')
    expect(deriveBand('other')).toBeUndefined() // → "untagged" in the fold, never guessed
  })
})

describe('effectiveBand', () => {
  it('returns the derived band when there is no override', () => {
    expect(effectiveBand(holding({ assetClass: 'equity' }))).toBe('high')
    expect(effectiveBand(holding({ assetClass: 'etf' }))).toBe('moderate')
  })

  it('lets the per-holding override win over the derived band', () => {
    expect(effectiveBand(holding({ assetClass: 'equity', riskBand: 'safe' }))).toBe('safe')
  })

  it('is undefined for an unmapped class with no override', () => {
    expect(effectiveBand(holding({ assetClass: 'other' }))).toBeUndefined()
  })

  it('honors an override even on an unmapped class', () => {
    expect(effectiveBand(holding({ assetClass: 'other', riskBand: 'moderate' }))).toBe('moderate')
  })
})

describe('isBandOverridden', () => {
  it('is true only when a riskBand override is set', () => {
    expect(isBandOverridden(holding())).toBe(false)
    expect(isBandOverridden(holding({ riskBand: 'high' }))).toBe(true)
  })
})
