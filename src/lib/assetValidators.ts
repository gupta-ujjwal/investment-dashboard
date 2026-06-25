import type { Currency } from '../storage/holdings'
import type { ManualAsset, ManualAssetClass, RiskBand } from '../storage/assets'

/** Raw form strings for a manual asset, before parse/validate. Mirrors the
 *  holding-form pattern: all values arrive as strings and are validated here so
 *  the action layer stays thin. */
export type AssetFormInput = {
  id?: string
  name: string
  assetClass: ManualAssetClass
  currency: Currency
  /** Raw — `''` means "value-only, no cost basis". */
  investedAmount: string
  currentValue: string
  /** Raw — `''` means "untagged". */
  riskBand: string
  emergencyFund: boolean
}

export type AssetFormErrors = Partial<
  Record<'name' | 'currentValue' | 'investedAmount', string>
>

export type AssetFormValue = {
  name: string
  assetClass: ManualAssetClass
  currency: Currency
  investedAmount: number | undefined
  currentValue: number
  riskBand: RiskBand | undefined
  emergencyFund: boolean
}

export type AssetValidationResult =
  | { ok: true; value: AssetFormValue }
  | { ok: false; errors: AssetFormErrors }

const VALID_CLASSES: ReadonlySet<ManualAssetClass> = new Set<ManualAssetClass>([
  'equity',
  'mutualFund',
  'crypto',
  'gold',
  'nps',
  'fd',
  'savings',
  'cash',
  'other',
])
const VALID_RISK: ReadonlySet<RiskBand> = new Set<RiskBand>(['safe', 'moderate', 'high'])

/** Parse a raw decimal string. `''`/whitespace → `undefined` (not an error);
 *  a non-numeric or non-finite string → `null` (an error). */
function parseOptionalNumber(raw: string): number | undefined | null {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function validateAssetForm(input: AssetFormInput): AssetValidationResult {
  const errors: AssetFormErrors = {}

  const name = input.name.trim()
  if (name === '') errors.name = 'Name is required'

  const assetClass: ManualAssetClass = VALID_CLASSES.has(input.assetClass)
    ? input.assetClass
    : 'other'
  const currency: Currency = input.currency === 'USD' ? 'USD' : 'INR'

  const current = parseOptionalNumber(input.currentValue)
  let currentValue = 0
  if (current === undefined) {
    errors.currentValue = 'Current value is required'
  } else if (current === null) {
    errors.currentValue = 'Current value must be a number'
  } else if (current <= 0) {
    errors.currentValue = 'Current value must be greater than 0'
  } else {
    currentValue = current
  }

  const invested = parseOptionalNumber(input.investedAmount)
  let investedAmount: number | undefined
  if (invested === null) {
    errors.investedAmount = 'Invested amount must be a number'
  } else if (invested !== undefined && invested < 0) {
    errors.investedAmount = 'Invested amount cannot be negative'
  } else {
    investedAmount = invested
  }

  const riskBand: RiskBand | undefined = VALID_RISK.has(input.riskBand as RiskBand)
    ? (input.riskBand as RiskBand)
    : undefined

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name,
      assetClass,
      currency,
      investedAmount,
      currentValue,
      riskBand,
      emergencyFund: input.emergencyFund,
    },
  }
}

/** Build a `ManualAsset` from a validated form value. FX base figures are NOT
 *  set here — they are stamped separately (R2) by the action via `stampAsset`. */
export function buildAssetFromForm(
  value: AssetFormValue,
  audit: { id: string; createdAt: number; updatedAt: number },
): ManualAsset {
  const asset: ManualAsset = {
    id: audit.id,
    name: value.name,
    assetClass: value.assetClass,
    currency: value.currency,
    currentValue: value.currentValue,
    emergencyFund: value.emergencyFund,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  }
  if (value.investedAmount !== undefined) asset.investedAmount = value.investedAmount
  if (value.riskBand !== undefined) asset.riskBand = value.riskBand
  return asset
}
