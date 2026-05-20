import type { AssetClass, CanonicalHolding, Currency, HoldingKey, Source } from '../storage/holdings'

/** Raw form input — every field a string the way HTML forms deliver them. */
export type HoldingFormInput = {
  name: string
  source: Source
  sourceSymbol: string
  market: Currency
  currency: Currency
  quantity: string
  avgBuyPrice: string
  currentPrice: string
  assetClass: AssetClass
}

/** Parsed + validated form output ready to hand to `upsertHolding`. */
export type ParsedHoldingForm = {
  name: string
  sourceSymbol: string
  currency: Currency
  quantity: number
  avgBuyPrice: number
  currentPrice: number | undefined
  assetClass: AssetClass
}

/** Field-keyed errors. Empty record = valid. */
export type HoldingFormErrors = Partial<
  Record<keyof HoldingFormInput, string> & { _form: string }
>

export type ValidationResult =
  | { ok: true; value: ParsedHoldingForm }
  | { ok: false; errors: HoldingFormErrors }

/**
 * Validate a manual-add or edit form. `existingKeys` lets the duplicate check
 * detect a `[manual, AAPL]` collision before the IDB write would throw a
 * `ConstraintError`. Pass `currentKey` when editing an existing row so the
 * row's own key doesn't false-positive.
 */
export function validateHoldingForm(
  input: HoldingFormInput,
  opts: { existingKeys: readonly HoldingKey[]; currentKey?: HoldingKey } = {
    existingKeys: [],
  },
): ValidationResult {
  const errors: HoldingFormErrors = {}

  const name = input.name.trim()
  if (!name) errors.name = 'Name is required'

  const sourceSymbol = input.sourceSymbol.trim().toUpperCase()
  if (!sourceSymbol) errors.sourceSymbol = 'Ticker is required'

  const quantity = parseFinite(input.quantity)
  if (quantity === undefined || quantity <= 0) {
    errors.quantity = 'Quantity must be a positive number'
  }

  const avgBuyPrice = parseFinite(input.avgBuyPrice)
  if (avgBuyPrice === undefined || avgBuyPrice <= 0) {
    errors.avgBuyPrice = 'Avg buy price must be a positive number'
  }

  // Current price is optional. Empty / whitespace = undefined (= no snapshot
  // price), which `holdingsView` renders as `—` per R1.
  let currentPrice: number | undefined = undefined
  const raw = input.currentPrice.trim()
  if (raw !== '') {
    const parsed = parseFinite(raw)
    if (parsed === undefined || parsed < 0) {
      errors.currentPrice = 'Current price must be a non-negative number'
    } else {
      currentPrice = parsed
    }
  }

  // Market and currency are coupled in Phase 1: INR market → INR currency,
  // USD market → USD currency. The form may surface them as one field or
  // two; either way the parsed output uses `currency` only.
  const currency = input.currency

  // Duplicate compound-key check — skip the row's own key when editing.
  const duplicate = opts.existingKeys.some(
    (k) =>
      k.source === input.source &&
      k.sourceSymbol === sourceSymbol &&
      !(
        opts.currentKey &&
        opts.currentKey.source === input.source &&
        opts.currentKey.sourceSymbol === sourceSymbol
      ),
  )
  if (duplicate && !errors.sourceSymbol) {
    errors.sourceSymbol = `${sourceSymbol} already exists — edit that row instead.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name,
      sourceSymbol,
      currency,
      quantity: quantity as number,
      avgBuyPrice: avgBuyPrice as number,
      currentPrice,
      assetClass: input.assetClass,
    },
  }
}

/** A row built from a validated form, ready to upsert. `createdAt` is the
 *  caller's responsibility (set to `existing.createdAt` on edit, `now` on
 *  add); same for `updatedAt`. `importedAt` mirrors `createdAt` for manual
 *  rows — see frame.md decision #4 (manual rows are not import-driven, so
 *  treating their createdAt as their importedAt makes R8 staleness behave
 *  correctly: a fresh manual add is "newest"). */
export function buildHoldingFromForm(
  parsed: ParsedHoldingForm,
  source: Source,
  meta: { createdAt: number; updatedAt: number; importedAt: number },
): CanonicalHolding {
  const row: CanonicalHolding = {
    name: parsed.name,
    source,
    sourceSymbol: parsed.sourceSymbol,
    quantity: parsed.quantity,
    avgBuyPrice: parsed.avgBuyPrice,
    currency: parsed.currency,
    assetClass: parsed.assetClass,
    importedAt: meta.importedAt,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  }
  if (parsed.currentPrice !== undefined) row.currentPrice = parsed.currentPrice
  return row
}

function parseFinite(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}
