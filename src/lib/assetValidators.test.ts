import { describe, expect, it } from 'vitest'
import { buildAssetFromForm, validateAssetForm, type AssetFormInput } from './assetValidators'

function input(over: Partial<AssetFormInput> = {}): AssetFormInput {
  return {
    name: 'Gold',
    assetClass: 'gold',
    currency: 'INR',
    investedAmount: '400000',
    currentValue: '500000',
    riskBand: '',
    emergencyFund: false,
    ...over,
  }
}

describe('validateAssetForm', () => {
  it('accepts a well-formed asset', () => {
    const r = validateAssetForm(input())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.currentValue).toBe(500000)
    expect(r.value.investedAmount).toBe(400000)
  })

  it('treats a blank invested amount as value-only (undefined, not 0)', () => {
    const r = validateAssetForm(input({ investedAmount: '' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.investedAmount).toBeUndefined()
  })

  it('requires a name', () => {
    const r = validateAssetForm(input({ name: '  ' }))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors.name).toBeDefined()
  })

  it('rejects a non-positive or non-numeric current value', () => {
    expect(validateAssetForm(input({ currentValue: '0' })).ok).toBe(false)
    expect(validateAssetForm(input({ currentValue: 'abc' })).ok).toBe(false)
    expect(validateAssetForm(input({ currentValue: '' })).ok).toBe(false)
  })

  it('rejects a negative invested amount', () => {
    const r = validateAssetForm(input({ investedAmount: '-5' }))
    expect(r.ok).toBe(false)
  })

  it('keeps a valid risk band and drops an invalid one', () => {
    const good = validateAssetForm(input({ riskBand: 'safe' }))
    expect(good.ok && good.value.riskBand).toBe('safe')
    const bad = validateAssetForm(input({ riskBand: 'spicy' }))
    expect(bad.ok && bad.value.riskBand).toBeUndefined()
  })
})

describe('buildAssetFromForm', () => {
  it('omits investedAmount and riskBand when absent (no sentinels)', () => {
    const r = validateAssetForm(input({ investedAmount: '', riskBand: '' }))
    if (!r.ok) throw new Error('expected ok')
    const asset = buildAssetFromForm(r.value, { id: 'x', createdAt: 1, updatedAt: 2 })
    expect('investedAmount' in asset).toBe(false)
    expect('riskBand' in asset).toBe(false)
    expect(asset.currentValue).toBe(500000)
    expect(asset.id).toBe('x')
  })
})
