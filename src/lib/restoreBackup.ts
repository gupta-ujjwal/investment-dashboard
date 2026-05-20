import {
  DB_VERSION,
  type AssetClass,
  type CanonicalHolding,
  type Currency,
  type Source,
} from '../storage/holdings'

export type ParsedBackup = {
  exportedAt: string
  schemaVersion: number
  holdings: CanonicalHolding[]
}

export type ParseBackupResult =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; error: string }

const VALID_SOURCES: ReadonlySet<Source> = new Set<Source>(['vested', 'groww'])
const VALID_CURRENCIES: ReadonlySet<Currency> = new Set<Currency>(['INR', 'USD'])
const VALID_ASSET_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'equity',
  'mf',
  'etf',
  'invit',
  'other',
])

/**
 * Validate and parse a backup JSON string. The shape must match what
 * `exportSnapshot()` writes: a top-level object with `exportedAt`,
 * `schemaVersion`, and `holdings`. `schemaVersion` must equal the current
 * `DB_VERSION` — restores across schema versions need a migration step
 * we haven't written yet, so they're rejected explicitly rather than
 * silently destroying user data.
 */
export function parseBackup(json: string): ParseBackupResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    return {
      ok: false,
      error: `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Backup must be a JSON object.' }
  }

  const schemaVersion = raw.schemaVersion
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return { ok: false, error: 'Missing or invalid `schemaVersion` field.' }
  }
  if (schemaVersion !== DB_VERSION) {
    return {
      ok: false,
      error: `Backup schemaVersion ${schemaVersion} does not match current ${DB_VERSION}. This backup needs a migration which is not yet implemented.`,
    }
  }

  const exportedAt = raw.exportedAt
  if (typeof exportedAt !== 'string') {
    return { ok: false, error: 'Missing or invalid `exportedAt` field.' }
  }

  const holdingsRaw = raw.holdings
  if (!Array.isArray(holdingsRaw)) {
    return { ok: false, error: 'Backup `holdings` is missing or not an array.' }
  }

  const holdings: CanonicalHolding[] = []
  for (let i = 0; i < holdingsRaw.length; i++) {
    const validated = validateHolding(holdingsRaw[i], i)
    if (!validated.ok) return { ok: false, error: validated.error }
    holdings.push(validated.holding)
  }

  return { ok: true, backup: { schemaVersion, exportedAt, holdings } }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function validateHolding(
  raw: unknown,
  index: number,
):
  | { ok: true; holding: CanonicalHolding }
  | { ok: false; error: string } {
  const prefix = `Holding at index ${index}`
  if (!isPlainObject(raw)) return { ok: false, error: `${prefix}: not an object.` }

  if (typeof raw.name !== 'string') {
    return { ok: false, error: `${prefix}: \`name\` must be a string.` }
  }
  if (typeof raw.source !== 'string' || !VALID_SOURCES.has(raw.source as Source)) {
    return { ok: false, error: `${prefix}: \`source\` must be one of vested|groww.` }
  }
  if (typeof raw.sourceSymbol !== 'string') {
    return { ok: false, error: `${prefix}: \`sourceSymbol\` must be a string.` }
  }
  if (!isFiniteNumber(raw.quantity)) {
    return { ok: false, error: `${prefix}: \`quantity\` must be a finite number.` }
  }
  if (!isFiniteNumber(raw.avgBuyPrice)) {
    return { ok: false, error: `${prefix}: \`avgBuyPrice\` must be a finite number.` }
  }
  if (typeof raw.currency !== 'string' || !VALID_CURRENCIES.has(raw.currency as Currency)) {
    return { ok: false, error: `${prefix}: \`currency\` must be one of INR|USD.` }
  }
  if (
    typeof raw.assetClass !== 'string' ||
    !VALID_ASSET_CLASSES.has(raw.assetClass as AssetClass)
  ) {
    return { ok: false, error: `${prefix}: \`assetClass\` is not a valid value.` }
  }
  if (!isFiniteNumber(raw.importedAt)) {
    return { ok: false, error: `${prefix}: \`importedAt\` must be a finite number.` }
  }

  for (const key of [
    'fxRate',
    'fxAsOf',
    'avgBuyPriceBase',
    'currentPrice',
    'currentPriceBase',
  ] as const) {
    const v = raw[key]
    if (v !== undefined && !isFiniteNumber(v)) {
      return { ok: false, error: `${prefix}: \`${key}\`, if present, must be a finite number.` }
    }
  }

  return { ok: true, holding: raw as CanonicalHolding }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
