import { describe, it, expect } from 'vitest'
import { parseBackup } from './restoreBackup'
import { DB_VERSION, type CanonicalHolding } from '../storage/holdings'

function validHolding(overrides: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Apple',
    source: 'vested',
    sourceSymbol: 'AAPL',
    quantity: 10,
    avgBuyPrice: 150,
    currency: 'USD',
    assetClass: 'equity',
    importedAt: 1717200000000,
    ...overrides,
  }
}

function validBackupJson(holdings: unknown[] = [validHolding()]) {
  return JSON.stringify({
    exportedAt: '2026-05-20T12:00:00.000Z',
    schemaVersion: DB_VERSION,
    holdings,
  })
}

describe('parseBackup', () => {
  it('accepts a well-formed backup', () => {
    const result = parseBackup(validBackupJson())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.holdings).toHaveLength(1)
    expect(result.backup.holdings[0].sourceSymbol).toBe('AAPL')
    expect(result.backup.schemaVersion).toBe(DB_VERSION)
  })

  it('accepts an empty holdings array (intentional wipe)', () => {
    const result = parseBackup(validBackupJson([]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.holdings).toHaveLength(0)
  })

  it('preserves optional FX fields', () => {
    const result = parseBackup(
      validBackupJson([
        validHolding({
          fxRate: 84.5,
          fxAsOf: 1717200000000,
          avgBuyPriceBase: 12675,
          currentPrice: 170,
          currentPriceBase: 14365,
        }),
      ]),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.holdings[0].fxRate).toBe(84.5)
    expect(result.backup.holdings[0].currentPriceBase).toBe(14365)
  })

  it('rejects invalid JSON', () => {
    const result = parseBackup('{not json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/JSON/i)
  })

  it('rejects a non-object top-level payload', () => {
    expect(parseBackup('[1,2,3]').ok).toBe(false)
    expect(parseBackup('"hello"').ok).toBe(false)
    expect(parseBackup('null').ok).toBe(false)
  })

  it('rejects schemaVersion mismatch', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION + 99,
      holdings: [],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/schemaVersion/)
    expect(result.error).toMatch(String(DB_VERSION + 99))
  })

  it('rejects missing schemaVersion', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      holdings: [],
    })
    expect(parseBackup(json).ok).toBe(false)
  })

  it('rejects missing exportedAt', () => {
    const json = JSON.stringify({
      schemaVersion: DB_VERSION,
      holdings: [],
    })
    expect(parseBackup(json).ok).toBe(false)
  })

  it('rejects holdings that are not an array', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: { not: 'an array' },
    })
    expect(parseBackup(json).ok).toBe(false)
  })

  it('rejects a holding missing required fields', () => {
    const result = parseBackup(validBackupJson([{ name: 'Broken' }]))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/index 0/)
  })

  it('rejects a holding with invalid source', () => {
    const result = parseBackup(
      validBackupJson([{ ...validHolding(), source: 'fidelity' }]),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/source/)
  })

  it('rejects a holding with non-finite quantity', () => {
    // JSON doesn't have NaN/Infinity literals, but a downstream tool could
    // produce a payload that parses to one — guard anyway.
    const result = parseBackup(
      validBackupJson([{ ...validHolding(), quantity: 'not a number' }]),
    )
    expect(result.ok).toBe(false)
  })

  it('rejects a holding with an invalid optional FX field', () => {
    const result = parseBackup(
      validBackupJson([{ ...validHolding(), fxRate: 'eighty' }]),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/fxRate/)
  })

  it('reports the first failing index when multiple holdings are invalid', () => {
    const result = parseBackup(
      validBackupJson([
        validHolding(),
        { ...validHolding(), source: 'fidelity' },
        { ...validHolding(), currency: 'EUR' },
      ]),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/index 1/)
  })
})
