import { describe, expect, it } from 'vitest'
import type { ManualAsset } from '../storage/assets'
import type { BudgetMonth } from '../storage/budget'
import { monthlyAverages } from './budget'
import { effectiveValue, liquidAssets, provenanceLabel, runwayMonths } from './cashflow'

function asset(over: Partial<ManualAsset> = {}): ManualAsset {
  return {
    id: 'a',
    name: 'Asset',
    assetClass: 'cash',
    currency: 'INR',
    currentValue: 100000,
    currentValueBase: 100000,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('effectiveValue (tri-state precedence)', () => {
  it('uses the Settings value as an override when set', () => {
    expect(effectiveValue(150000, 90000)).toEqual({ value: 150000, source: 'settings' })
  })

  it('falls back to the budget-derived value when Settings is unset (undefined)', () => {
    expect(effectiveValue(undefined, 90000)).toEqual({ value: 90000, source: 'budget' })
  })

  it('honors an explicit Settings 0 as a real override, not "unset"', () => {
    // The load-bearing tri-state case: 0 must NOT be swallowed by the fallback.
    expect(effectiveValue(0, 90000)).toEqual({ value: 0, source: 'settings' })
  })

  it("is 'none' when neither Settings nor a derived value exists", () => {
    expect(effectiveValue(undefined, undefined)).toEqual({ value: undefined, source: 'none' })
  })
})

describe('liquidAssets', () => {
  it('sums cash / savings / FD manual assets in base currency', () => {
    const total = liquidAssets([
      asset({ id: '1', assetClass: 'cash', currentValueBase: 100000 }),
      asset({ id: '2', assetClass: 'savings', currentValueBase: 300000 }),
      asset({ id: '3', assetClass: 'fd', currentValueBase: 200000 }),
    ])
    expect(total).toBe(600000)
  })

  it('excludes equity / non-liquid classes — a portfolio is not runway', () => {
    const total = liquidAssets([
      asset({ id: 'eq', assetClass: 'equity', currentValueBase: 5_000_000 }),
      asset({ id: 'gold', assetClass: 'gold', currentValueBase: 800000 }),
      asset({ id: 'cash', assetClass: 'cash', currentValueBase: 100000 }),
    ])
    expect(total).toBe(100000) // only the cash asset
  })

  it('skips an unvalued liquid asset (partial-aware), never reads it as 0', () => {
    const total = liquidAssets([
      asset({ id: '1', assetClass: 'savings', currentValueBase: 300000 }),
      asset({ id: '2', assetClass: 'cash', currentValueBase: undefined }),
    ])
    expect(total).toBe(300000)
  })

  it('is undefined when there are no valued liquid assets', () => {
    expect(liquidAssets([asset({ assetClass: 'equity', currentValueBase: 100 })])).toBeUndefined()
    expect(liquidAssets([])).toBeUndefined()
  })
})

describe('runwayMonths', () => {
  it('divides liquid buffer by average monthly expenses', () => {
    expect(runwayMonths(600000, 100000)).toBe(6)
  })

  it('is undefined (never Infinity) when expenses are zero or absent', () => {
    expect(runwayMonths(600000, 0)).toBeUndefined()
    expect(runwayMonths(600000, undefined)).toBeUndefined()
    expect(runwayMonths(undefined, 100000)).toBeUndefined()
  })
})

describe('provenanceLabel', () => {
  it('labels a Settings override', () => {
    expect(provenanceLabel('settings', 3)).toBe('from Settings')
    expect(provenanceLabel('settings', undefined)).toBe('from Settings')
  })

  it('labels a budget-derived value with the averaging window', () => {
    expect(provenanceLabel('budget', 3)).toBe('budget-derived · avg of 3 mo')
  })

  it('falls back to a plain budget label when the month count is unknown', () => {
    expect(provenanceLabel('budget', undefined)).toBe('budget-derived')
  })

  it('is undefined when nothing feeds the value', () => {
    expect(provenanceLabel('none', 3)).toBeUndefined()
  })
})

describe('cold-start composition (empty / sparse Budget)', () => {
  // The pre-mortem's most-likely failure: a fresh or single-month Budget must
  // degrade every derived feed to "unset" — no unstable average, no NaN, no
  // garbage fallback firing through the `??` chain.
  const oneMonth: BudgetMonth = {
    month: '2026-06',
    income: [{ category: 'Salary', amount: 280000 }],
    expenses: [{ category: 'Rent', amount: 120000 }],
    invested: 50000,
    createdAt: 1,
    updatedAt: 1,
  }

  it('empty Budget → no average → derived need/contribution fall back to unset', () => {
    const avg = monthlyAverages([])
    expect(avg).toBeUndefined()
    // With Settings also unset, the effective value is "none" (empty card state).
    expect(effectiveValue(undefined, avg?.avgExpenses)).toEqual({ value: undefined, source: 'none' })
    expect(effectiveValue(undefined, avg?.avgInvested)).toEqual({ value: undefined, source: 'none' })
    // Runway has no denominator → undefined, never Infinity.
    expect(runwayMonths(liquidAssets([]), avg?.avgExpenses)).toBeUndefined()
  })

  it('single month → still no average (2-month minimum), still degrades to unset', () => {
    const avg = monthlyAverages([oneMonth])
    expect(avg).toBeUndefined()
    expect(effectiveValue(undefined, avg?.avgExpenses).source).toBe('none')
  })

  it('an explicit Settings value still shows through on a cold-start Budget', () => {
    const avg = monthlyAverages([]) // undefined
    expect(effectiveValue(150000, avg?.avgExpenses)).toEqual({ value: 150000, source: 'settings' })
  })
})
