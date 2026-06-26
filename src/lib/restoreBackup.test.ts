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

  // ── Revamp: cross-version + multi-store coverage ──────────────────────────

  it('upconverts a pre-v4 (holdings-only) backup instead of rejecting it', () => {
    // A v3 backup predates the asset/budget stores; the fix accepts it and
    // defaults the missing sections to empty so existing backups stay
    // restorable across the v4 bump.
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: 3,
      holdings: [validHolding()],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.schemaVersion).toBe(3)
    expect(result.backup.holdings).toHaveLength(1)
    expect(result.backup.assets).toEqual([])
    expect(result.backup.budgetMonths).toEqual([])
    expect(result.backup.settings).toBeUndefined()
  })

  it('rejects a backup newer than this build', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION + 1,
      holdings: [],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/newer/i)
  })

  it('accepts and validates assets, budget months, and settings targets', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      assets: [
        {
          id: 'a1',
          name: 'Gold',
          assetClass: 'gold',
          currency: 'INR',
          currentValue: 500000,
          createdAt: 1717200000000,
          updatedAt: 1717200000000,
          emergencyFund: true,
          riskBand: 'safe',
        },
      ],
      budgetMonths: [
        {
          month: '2026-05',
          income: [{ category: 'Salary', amount: 280000 }],
          expenses: [{ category: 'Rent', amount: 43000 }],
          invested: 50000,
          createdAt: 1717200000000,
          updatedAt: 1717200000000,
        },
      ],
      settings: { goalCorpus: 5000000, monthlyContribution: 50000 },
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.assets).toHaveLength(1)
    expect(result.backup.assets[0].name).toBe('Gold')
    expect(result.backup.budgetMonths[0].income[0].amount).toBe(280000)
    expect(result.backup.settings?.goalCorpus).toBe(5000000)
  })

  it('rejects a malformed asset', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      assets: [{ id: 'a1', name: 'Gold', assetClass: 'gold', currency: 'INR' }],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/currentValue/)
  })

  it('accepts a manual holding (so hand-added rows round-trip)', () => {
    const result = parseBackup(validBackupJson([validHolding({ source: 'manual', sourceSymbol: 'MYGOLD' })]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.holdings[0].source).toBe('manual')
  })

  it('round-trips allocationTargets in settings', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      settings: {
        goalCorpus: 5000000,
        allocationTargets: [
          { riskBand: 'safe', pct: 50 },
          { riskBand: 'high', pct: 50 },
        ],
      },
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.settings?.allocationTargets).toHaveLength(2)
    expect(result.backup.settings?.allocationTargets?.[0]).toEqual({ riskBand: 'safe', pct: 50 })
  })

  it('rejects an allocationTarget with an invalid risk band', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      settings: { allocationTargets: [{ riskBand: 'spicy', pct: 50 }] },
    })
    expect(parseBackup(json).ok).toBe(false)
  })

  it('rejects a malformed budget month', () => {
    const json = JSON.stringify({
      exportedAt: '2026-05-20T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      budgetMonths: [{ month: 'May 2026', income: [], expenses: [], invested: 0, createdAt: 1, updatedAt: 1 }],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/YYYY-MM/)
  })

  // ── Budget tags (v5) — round-trip + default-to-empty on older backups ──────
  it('round-trips budget tags', () => {
    const json = JSON.stringify({
      exportedAt: '2026-06-26T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      budgetTags: [
        { id: 't1', label: 'Salary', kind: 'income', createdAt: 1717200000000 },
        { id: 't2', label: 'Rent', kind: 'expense', createdAt: 1717200000000 },
      ],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.budgetTags).toHaveLength(2)
    expect(result.backup.budgetTags[0]).toEqual({
      id: 't1',
      label: 'Salary',
      kind: 'income',
      createdAt: 1717200000000,
    })
  })

  it('defaults budgetTags to [] when absent (pre-v5 backup)', () => {
    // A v4 backup predates the tag store — its missing `budgetTags` must
    // upconvert to empty, never reject (the "restore an older backup" path).
    const result = parseBackup(validBackupJson())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.budgetTags).toEqual([])
  })

  it('rejects a budget tag with an invalid kind', () => {
    const json = JSON.stringify({
      exportedAt: '2026-06-26T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      budgetTags: [{ id: 't1', label: 'Salary', kind: 'revenue', createdAt: 1 }],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/income\|expense/)
  })

  it('rejects a budget tag missing its label', () => {
    const json = JSON.stringify({
      exportedAt: '2026-06-26T12:00:00.000Z',
      schemaVersion: DB_VERSION,
      holdings: [],
      budgetTags: [{ id: 't1', kind: 'income', createdAt: 1 }],
    })
    const result = parseBackup(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/label/)
  })
})
