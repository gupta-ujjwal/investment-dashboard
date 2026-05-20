import { describe, expect, it } from 'vitest'
import type { HoldingKey } from '../storage/holdings'
import {
  buildHoldingFromForm,
  validateHoldingForm,
  type HoldingFormInput,
} from './holdingValidators'

function input(over: Partial<HoldingFormInput> = {}): HoldingFormInput {
  return {
    name: 'Reliance Industries',
    source: 'manual',
    sourceSymbol: 'RELIANCE',
    market: 'INR',
    currency: 'INR',
    quantity: '12',
    avgBuyPrice: '2410',
    currentPrice: '2550',
    assetClass: 'equity',
    ...over,
  }
}

describe('validateHoldingForm', () => {
  it('accepts a well-formed input', () => {
    const res = validateHoldingForm(input(), { existingKeys: [] })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.sourceSymbol).toBe('RELIANCE')
      expect(res.value.quantity).toBe(12)
      expect(res.value.currentPrice).toBe(2550)
    }
  })

  it('uppercases the ticker on submit', () => {
    const res = validateHoldingForm(input({ sourceSymbol: 'aapl' }), { existingKeys: [] })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.sourceSymbol).toBe('AAPL')
  })

  it('rejects empty name', () => {
    const res = validateHoldingForm(input({ name: '   ' }), { existingKeys: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.name).toBeTruthy()
  })

  it('rejects empty ticker', () => {
    const res = validateHoldingForm(input({ sourceSymbol: '' }), { existingKeys: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.sourceSymbol).toBeTruthy()
  })

  it('rejects zero quantity', () => {
    const res = validateHoldingForm(input({ quantity: '0' }), { existingKeys: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.quantity).toBeTruthy()
  })

  it('rejects negative avg buy price', () => {
    const res = validateHoldingForm(input({ avgBuyPrice: '-50' }), { existingKeys: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.avgBuyPrice).toBeTruthy()
  })

  it('rejects non-numeric quantity', () => {
    const res = validateHoldingForm(input({ quantity: 'abc' }), { existingKeys: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.quantity).toBeTruthy()
  })

  it('allows blank currentPrice (optional)', () => {
    const res = validateHoldingForm(input({ currentPrice: '   ' }), { existingKeys: [] })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.currentPrice).toBeUndefined()
  })

  it('rejects negative currentPrice', () => {
    const res = validateHoldingForm(input({ currentPrice: '-1' }), { existingKeys: [] })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.currentPrice).toBeTruthy()
  })

  it('detects a duplicate compound key', () => {
    const existingKeys: HoldingKey[] = [{ source: 'manual', sourceSymbol: 'RELIANCE' }]
    const res = validateHoldingForm(input(), { existingKeys })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.sourceSymbol).toMatch(/already exists/)
  })

  it('treats the row being edited as not-a-duplicate', () => {
    const existingKeys: HoldingKey[] = [{ source: 'manual', sourceSymbol: 'RELIANCE' }]
    const res = validateHoldingForm(input(), {
      existingKeys,
      currentKey: { source: 'manual', sourceSymbol: 'RELIANCE' },
    })
    expect(res.ok).toBe(true)
  })

  it('does not flag a manual + broker same-ticker as duplicate', () => {
    // manual/AAPL and vested/AAPL are different compound keys — both allowed.
    const existingKeys: HoldingKey[] = [{ source: 'vested', sourceSymbol: 'AAPL' }]
    const res = validateHoldingForm(input({ sourceSymbol: 'AAPL', source: 'manual' }), {
      existingKeys,
    })
    expect(res.ok).toBe(true)
  })
})

describe('buildHoldingFromForm', () => {
  it('emits a CanonicalHolding with required + audit fields populated', () => {
    const parsed = {
      name: 'Reliance Industries',
      sourceSymbol: 'RELIANCE',
      currency: 'INR' as const,
      quantity: 12,
      avgBuyPrice: 2410,
      currentPrice: 2550,
      assetClass: 'equity' as const,
    }
    const row = buildHoldingFromForm(parsed, 'manual', {
      createdAt: 1700,
      updatedAt: 1700,
      importedAt: 1700,
    })
    expect(row.source).toBe('manual')
    expect(row.sourceSymbol).toBe('RELIANCE')
    expect(row.quantity).toBe(12)
    expect(row.createdAt).toBe(1700)
    expect(row.updatedAt).toBe(1700)
    expect(row.importedAt).toBe(1700)
    expect(row.currentPrice).toBe(2550)
  })

  it('omits currentPrice when undefined (no sentinel 0)', () => {
    const parsed = {
      name: 'X',
      sourceSymbol: 'X',
      currency: 'USD' as const,
      quantity: 1,
      avgBuyPrice: 1,
      currentPrice: undefined,
      assetClass: 'equity' as const,
    }
    const row = buildHoldingFromForm(parsed, 'manual', {
      createdAt: 1,
      updatedAt: 1,
      importedAt: 1,
    })
    expect(row.currentPrice).toBeUndefined()
    expect('currentPrice' in row).toBe(false)
  })
})
