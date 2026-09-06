import { describe, expect, it } from 'vitest'
import type { ManualAsset } from '../storage/assets'
import type { CanonicalHolding } from '../storage/holdings'
import type { Settings } from '../storage/settings'
import { buildActionRail, type RailInput } from './actionRail'

const NOW = new Date('2026-09-15T12:00:00.000Z').getTime()
const DAY_MS = 24 * 60 * 60 * 1000

function baseSettings(over: Partial<Settings> = {}): Settings {
  return {
    name: '',
    baseCurrency: 'INR',
    numberLocale: 'en-IN',
    lastFxRate: 90,
    lastFxAsOf: NOW,
    ...over,
  }
}

function holding(over: Partial<CanonicalHolding> = {}): CanonicalHolding {
  return {
    name: 'Test Co',
    source: 'groww',
    sourceSymbol: 'INE0001',
    quantity: 10,
    avgBuyPrice: 100,
    currency: 'INR',
    assetClass: 'equity',
    importedAt: NOW,
    avgBuyPriceBase: 100,
    currentPrice: 120,
    currentPriceBase: 120,
    ...over,
  }
}

function asset(over: Partial<ManualAsset> = {}): ManualAsset {
  return {
    id: 'a1',
    name: 'Gold',
    assetClass: 'gold',
    currency: 'INR',
    currentValue: 100000,
    currentValueBase: 100000,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }
}

function input(over: Partial<RailInput> = {}): RailInput {
  return {
    holdings: [holding()],
    assets: [],
    budgetMonths: [],
    settings: baseSettings(),
    now: NOW,
    ...over,
  }
}

describe('buildActionRail', () => {
  it('returns no items when nothing is configured or wrong (empty result)', () => {
    // No allocation targets, no emergency targets, fresh prices, fully priced
    // holding, last month logged, no single position over 10% (only 1
    // holding, but concentration only fires above the threshold when there
    // ARE multiple positions diluting weight — a single 100%-weight holding
    // is a real >10% position, so exclude it here to keep this case genuinely
    // signal-free).
    const result = buildActionRail(
      input({
        holdings: [],
        budgetMonths: [{ month: previousMonth(), income: [], expenses: [], invested: 0, createdAt: NOW, updatedAt: NOW }],
      }),
    )
    expect(result).toEqual([])
  })

  // ── risk-drift ───────────────────────────────────────────────────────────
  it('fires risk-drift when actual allocation drifts >10% from target', () => {
    const result = buildActionRail(
      input({
        assets: [asset({ riskBand: 'high', currentValueBase: 100000 })],
        settings: baseSettings({ allocationTargets: [{ riskBand: 'high', pct: 0.1 }] }),
        holdings: [],
      }),
    )
    expect(result.some((i) => i.id === 'risk-drift-high')).toBe(true)
  })

  it('does NOT fire risk-drift when no target is set for that band (undefined target, not 0)', () => {
    const result = buildActionRail(
      input({
        assets: [asset({ riskBand: 'high', currentValueBase: 100000 })],
        settings: baseSettings({ allocationTargets: [] }),
        holdings: [],
      }),
    )
    expect(result.some((i) => i.id.startsWith('risk-drift'))).toBe(false)
  })

  // ── emergency-gap ────────────────────────────────────────────────────────
  it('fires emergency-gap when funded below target', () => {
    const result = buildActionRail(
      input({
        holdings: [],
        assets: [asset({ emergencyFund: true, currentValueBase: 50000 })],
        settings: baseSettings({ emergencyMonthlyNeed: 20000, emergencyMonths: 6 }),
      }),
    )
    expect(result.some((i) => i.id === 'emergency-gap')).toBe(true)
  })

  it('does NOT fire emergency-gap when no target is configured (undefined target)', () => {
    const result = buildActionRail(
      input({
        holdings: [],
        assets: [asset({ emergencyFund: true, currentValueBase: 50000 })],
        settings: baseSettings({ emergencyMonthlyNeed: undefined, emergencyMonths: undefined }),
      }),
    )
    expect(result.some((i) => i.id === 'emergency-gap')).toBe(false)
  })

  // ── stale-prices ─────────────────────────────────────────────────────────
  it('fires stale-prices when the newest import is more than 7 days old', () => {
    const result = buildActionRail(
      input({ holdings: [holding({ importedAt: NOW - 10 * DAY_MS })] }),
    )
    expect(result.some((i) => i.id === 'stale-prices')).toBe(true)
  })

  it('does NOT fire stale-prices with no holdings at all (unevaluable, not "0 days old")', () => {
    const result = buildActionRail(input({ holdings: [] }))
    expect(result.some((i) => i.id === 'stale-prices')).toBe(false)
  })

  // ── unstamped-fx ─────────────────────────────────────────────────────────
  it('fires unstamped-fx when a holding has no base-currency value', () => {
    const result = buildActionRail(
      input({ holdings: [holding({ avgBuyPriceBase: undefined, currentPriceBase: undefined })] }),
    )
    expect(result.some((i) => i.id === 'unstamped-fx')).toBe(true)
  })

  it('does NOT fire unstamped-fx when every holding has a base value', () => {
    const result = buildActionRail(input({ holdings: [holding()] }))
    expect(result.some((i) => i.id === 'unstamped-fx')).toBe(false)
  })

  // ── missing-month ────────────────────────────────────────────────────────
  it('fires missing-month when last calendar month has no budget record', () => {
    const result = buildActionRail(input({ holdings: [], budgetMonths: [] }))
    expect(result.some((i) => i.id === 'missing-month')).toBe(true)
  })

  it('does NOT fire missing-month when last calendar month is logged', () => {
    const result = buildActionRail(
      input({
        holdings: [],
        budgetMonths: [
          { month: previousMonth(), income: [], expenses: [], invested: 0, createdAt: NOW, updatedAt: NOW },
        ],
      }),
    )
    expect(result.some((i) => i.id === 'missing-month')).toBe(false)
  })

  // ── concentration ────────────────────────────────────────────────────────
  it('fires concentration when a single position exceeds 10% of priced value', () => {
    const result = buildActionRail(
      input({
        holdings: [
          holding({ sourceSymbol: 'A', quantity: 100, currentPriceBase: 100 }), // 10000
          holding({ sourceSymbol: 'B', quantity: 1, currentPriceBase: 100 }), // 100
        ],
      }),
    )
    expect(result.some((i) => i.id === 'concentration')).toBe(true)
  })

  it('does NOT fire concentration when nothing is priced (unevaluable, not "safe")', () => {
    const result = buildActionRail(
      input({ holdings: [holding({ currentPriceBase: undefined })] }),
    )
    expect(result.some((i) => i.id === 'concentration')).toBe(false)
  })

  // ── cap, ordering, empty ─────────────────────────────────────────────────
  it('caps at 4 items even when more rules fire', () => {
    // Fire all 6: risk-drift, emergency-gap, stale-prices, unstamped-fx,
    // missing-month, concentration.
    const result = buildActionRail(
      input({
        holdings: [
          holding({
            sourceSymbol: 'A',
            importedAt: NOW - 10 * DAY_MS,
            avgBuyPriceBase: undefined,
            currentPriceBase: undefined,
          }),
          holding({ sourceSymbol: 'B', quantity: 100, currentPriceBase: 500 }),
        ],
        assets: [asset({ riskBand: 'high', emergencyFund: true, currentValueBase: 50000 })],
        budgetMonths: [],
        settings: baseSettings({
          allocationTargets: [{ riskBand: 'high', pct: 0.05 }],
          emergencyMonthlyNeed: 20000,
          emergencyMonths: 6,
        }),
      }),
    )
    expect(result.length).toBeLessThanOrEqual(4)
  })

  it('orders crit before warn before info', () => {
    const result = buildActionRail(
      input({
        holdings: [holding({ importedAt: NOW - 10 * DAY_MS })], // info: stale-prices
        assets: [asset({ riskBand: 'high', currentValueBase: 100000 })], // crit: risk-drift
        budgetMonths: [], // warn: missing-month
        settings: baseSettings({ allocationTargets: [{ riskBand: 'high', pct: 0.05 }] }),
      }),
    )
    const severities = result.map((i) => i.severity)
    const firstInfo = severities.indexOf('info')
    const firstWarn = severities.indexOf('warn')
    const firstCrit = severities.indexOf('crit')
    if (firstCrit !== -1 && firstWarn !== -1) expect(firstCrit).toBeLessThan(firstWarn)
    if (firstWarn !== -1 && firstInfo !== -1) expect(firstWarn).toBeLessThan(firstInfo)
  })
})

function previousMonth(): string {
  const d = new Date(NOW)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
