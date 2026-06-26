import {
  DB_VERSION,
  type AssetClass,
  type CanonicalHolding,
  type Currency,
  type Source,
} from '../storage/holdings'
import type {
  ManualAsset,
  ManualAssetClass,
  RiskBand,
} from '../storage/assets'
import type { BudgetLine, BudgetMonth } from '../storage/budget'
import type { BudgetTag, BudgetTagKind } from '../storage/budgetTags'
import type { AllocationTarget } from '../storage/settings'

/** The planning/goal target subset of `Settings` a backup carries — config,
 *  not the whole settings record (base currency / FX meta are device-local and
 *  must not be clobbered on restore). */
export type BackupSettingsTargets = {
  emergencyMonthlyNeed?: number
  emergencyMonths?: number
  goalCorpus?: number
  monthlyContribution?: number
  allocationTargets?: AllocationTarget[]
}

export type ParsedBackup = {
  exportedAt: string
  schemaVersion: number
  holdings: CanonicalHolding[]
  /** Always an array after parse — a pre-v4 (holdings-only) backup upconverts
   *  to `[]` rather than being rejected. */
  assets: ManualAsset[]
  budgetMonths: BudgetMonth[]
  /** Always an array after parse — a pre-v5 backup has no `budgetTags` key and
   *  upconverts to `[]` (default-to-empty), never a parse error. */
  budgetTags: BudgetTag[]
  settings?: BackupSettingsTargets
}

export type ParseBackupResult =
  | { ok: true; backup: ParsedBackup }
  | { ok: false; error: string }

// Includes `'manual'`: `exportBackup` writes every holding via `getAll()`, so a
// backup can contain hand-added rows. Rejecting them here would make a user who
// added any holding manually unable to restore their own backup — the exact
// recovery-path failure Phase 0 exists to prevent.
const VALID_SOURCES: ReadonlySet<Source> = new Set<Source>(['vested', 'groww', 'manual'])
const VALID_CURRENCIES: ReadonlySet<Currency> = new Set<Currency>(['INR', 'USD'])
const VALID_ASSET_CLASSES: ReadonlySet<AssetClass> = new Set<AssetClass>([
  'equity',
  'mf',
  'etf',
  'invit',
  'other',
])
const VALID_MANUAL_ASSET_CLASSES: ReadonlySet<ManualAssetClass> =
  new Set<ManualAssetClass>([
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
const VALID_RISK_BANDS: ReadonlySet<RiskBand> = new Set<RiskBand>([
  'safe',
  'moderate',
  'high',
])
const VALID_BUDGET_TAG_KINDS: ReadonlySet<BudgetTagKind> = new Set<BudgetTagKind>([
  'income',
  'expense',
])

/**
 * Validate and parse a backup JSON string. The shape must match what
 * `exportBackup()` writes: a top-level object with `exportedAt`,
 * `schemaVersion`, `holdings`, and (from v4) `assets`, `budgetMonths`,
 * `settings`.
 *
 * **Version policy (revamp fix):** an *older or equal* `schemaVersion` is
 * accepted and upconverted — a v3 backup predates the asset/budget stores, so
 * its missing sections default to empty rather than being rejected. This keeps
 * every backup a user already holds restorable across the v4 upgrade. A
 * *newer* `schemaVersion` than this build understands is still rejected: we
 * cannot safely restore a shape from the future. (Previously any mismatch was
 * rejected, which would have orphaned every pre-existing backup on the v4
 * bump.)
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
  if (schemaVersion > DB_VERSION) {
    return {
      ok: false,
      error: `Backup schemaVersion ${schemaVersion} is newer than this app supports (${DB_VERSION}). Update the app, then restore.`,
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

  // `assets` / `budgetMonths` are absent in pre-v4 backups — default to empty
  // (upconvert) rather than reject. When present they must be well-formed.
  const assets: ManualAsset[] = []
  if (raw.assets !== undefined) {
    if (!Array.isArray(raw.assets)) {
      return { ok: false, error: 'Backup `assets`, if present, must be an array.' }
    }
    for (let i = 0; i < raw.assets.length; i++) {
      const validated = validateAsset(raw.assets[i], i)
      if (!validated.ok) return { ok: false, error: validated.error }
      assets.push(validated.asset)
    }
  }

  const budgetMonths: BudgetMonth[] = []
  if (raw.budgetMonths !== undefined) {
    if (!Array.isArray(raw.budgetMonths)) {
      return { ok: false, error: 'Backup `budgetMonths`, if present, must be an array.' }
    }
    for (let i = 0; i < raw.budgetMonths.length; i++) {
      const validated = validateBudgetMonth(raw.budgetMonths[i], i)
      if (!validated.ok) return { ok: false, error: validated.error }
      budgetMonths.push(validated.record)
    }
  }

  // `budgetTags` is absent in pre-v5 backups — default to empty (upconvert)
  // rather than reject. When present every entry must be well-formed.
  const budgetTags: BudgetTag[] = []
  if (raw.budgetTags !== undefined) {
    if (!Array.isArray(raw.budgetTags)) {
      return { ok: false, error: 'Backup `budgetTags`, if present, must be an array.' }
    }
    for (let i = 0; i < raw.budgetTags.length; i++) {
      const validated = validateBudgetTag(raw.budgetTags[i], i)
      if (!validated.ok) return { ok: false, error: validated.error }
      budgetTags.push(validated.tag)
    }
  }

  let settings: BackupSettingsTargets | undefined
  if (raw.settings !== undefined) {
    const validated = validateSettingsTargets(raw.settings)
    if (!validated.ok) return { ok: false, error: validated.error }
    settings = validated.settings
  }

  return {
    ok: true,
    backup: { schemaVersion, exportedAt, holdings, assets, budgetMonths, budgetTags, settings },
  }
}

function validateBudgetTag(
  raw: unknown,
  index: number,
): { ok: true; tag: BudgetTag } | { ok: false; error: string } {
  const prefix = `Budget tag at index ${index}`
  if (!isPlainObject(raw)) return { ok: false, error: `${prefix}: not an object.` }
  if (typeof raw.id !== 'string' || raw.id === '') {
    return { ok: false, error: `${prefix}: \`id\` must be a non-empty string.` }
  }
  if (typeof raw.label !== 'string' || raw.label === '') {
    return { ok: false, error: `${prefix}: \`label\` must be a non-empty string.` }
  }
  if (typeof raw.kind !== 'string' || !VALID_BUDGET_TAG_KINDS.has(raw.kind as BudgetTagKind)) {
    return { ok: false, error: `${prefix}: \`kind\` must be income|expense.` }
  }
  if (!isFiniteNumber(raw.createdAt)) {
    return { ok: false, error: `${prefix}: \`createdAt\` must be a finite number.` }
  }
  return { ok: true, tag: raw as BudgetTag }
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
    return { ok: false, error: `${prefix}: \`source\` must be one of vested|groww|manual.` }
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

function validateAsset(
  raw: unknown,
  index: number,
): { ok: true; asset: ManualAsset } | { ok: false; error: string } {
  const prefix = `Asset at index ${index}`
  if (!isPlainObject(raw)) return { ok: false, error: `${prefix}: not an object.` }

  if (typeof raw.id !== 'string' || raw.id === '') {
    return { ok: false, error: `${prefix}: \`id\` must be a non-empty string.` }
  }
  if (typeof raw.name !== 'string') {
    return { ok: false, error: `${prefix}: \`name\` must be a string.` }
  }
  if (
    typeof raw.assetClass !== 'string' ||
    !VALID_MANUAL_ASSET_CLASSES.has(raw.assetClass as ManualAssetClass)
  ) {
    return { ok: false, error: `${prefix}: \`assetClass\` is not a valid value.` }
  }
  if (typeof raw.currency !== 'string' || !VALID_CURRENCIES.has(raw.currency as Currency)) {
    return { ok: false, error: `${prefix}: \`currency\` must be one of INR|USD.` }
  }
  if (!isFiniteNumber(raw.currentValue)) {
    return { ok: false, error: `${prefix}: \`currentValue\` must be a finite number.` }
  }
  if (!isFiniteNumber(raw.createdAt) || !isFiniteNumber(raw.updatedAt)) {
    return { ok: false, error: `${prefix}: \`createdAt\`/\`updatedAt\` must be finite numbers.` }
  }
  for (const key of [
    'investedAmount',
    'fxRate',
    'fxAsOf',
    'investedAmountBase',
    'currentValueBase',
  ] as const) {
    const v = raw[key]
    if (v !== undefined && !isFiniteNumber(v)) {
      return { ok: false, error: `${prefix}: \`${key}\`, if present, must be a finite number.` }
    }
  }
  if (raw.riskBand !== undefined && !VALID_RISK_BANDS.has(raw.riskBand as RiskBand)) {
    return { ok: false, error: `${prefix}: \`riskBand\` is not a valid value.` }
  }
  if (raw.emergencyFund !== undefined && typeof raw.emergencyFund !== 'boolean') {
    return { ok: false, error: `${prefix}: \`emergencyFund\`, if present, must be a boolean.` }
  }

  return { ok: true, asset: raw as ManualAsset }
}

function validateBudgetMonth(
  raw: unknown,
  index: number,
): { ok: true; record: BudgetMonth } | { ok: false; error: string } {
  const prefix = `Budget month at index ${index}`
  if (!isPlainObject(raw)) return { ok: false, error: `${prefix}: not an object.` }

  if (typeof raw.month !== 'string' || !/^\d{4}-\d{2}$/.test(raw.month)) {
    return { ok: false, error: `${prefix}: \`month\` must be a YYYY-MM string.` }
  }
  const income = validateBudgetLines(raw.income, `${prefix} income`)
  if (!income.ok) return { ok: false, error: income.error }
  const expenses = validateBudgetLines(raw.expenses, `${prefix} expenses`)
  if (!expenses.ok) return { ok: false, error: expenses.error }
  if (!isFiniteNumber(raw.invested)) {
    return { ok: false, error: `${prefix}: \`invested\` must be a finite number.` }
  }
  if (!isFiniteNumber(raw.createdAt) || !isFiniteNumber(raw.updatedAt)) {
    return { ok: false, error: `${prefix}: \`createdAt\`/\`updatedAt\` must be finite numbers.` }
  }

  return { ok: true, record: raw as BudgetMonth }
}

function validateBudgetLines(
  raw: unknown,
  prefix: string,
): { ok: true; lines: BudgetLine[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: `${prefix}: must be an array.` }
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
    if (!isPlainObject(line)) return { ok: false, error: `${prefix}[${i}]: not an object.` }
    if (typeof line.category !== 'string') {
      return { ok: false, error: `${prefix}[${i}]: \`category\` must be a string.` }
    }
    if (!isFiniteNumber(line.amount)) {
      return { ok: false, error: `${prefix}[${i}]: \`amount\` must be a finite number.` }
    }
  }
  return { ok: true, lines: raw as BudgetLine[] }
}

function validateSettingsTargets(
  raw: unknown,
): { ok: true; settings: BackupSettingsTargets } | { ok: false; error: string } {
  if (!isPlainObject(raw)) return { ok: false, error: 'Backup `settings` must be an object.' }
  for (const key of [
    'emergencyMonthlyNeed',
    'emergencyMonths',
    'goalCorpus',
    'monthlyContribution',
  ] as const) {
    const v = raw[key]
    if (v !== undefined && !isFiniteNumber(v)) {
      return { ok: false, error: `Backup settings \`${key}\`, if present, must be a finite number.` }
    }
  }
  const allocationTargets = validateAllocationTargets(raw.allocationTargets)
  if (!allocationTargets.ok) return { ok: false, error: allocationTargets.error }
  return {
    ok: true,
    settings: {
      emergencyMonthlyNeed: numberOrUndefined(raw.emergencyMonthlyNeed),
      emergencyMonths: numberOrUndefined(raw.emergencyMonths),
      goalCorpus: numberOrUndefined(raw.goalCorpus),
      monthlyContribution: numberOrUndefined(raw.monthlyContribution),
      allocationTargets: allocationTargets.value,
    },
  }
}

function validateAllocationTargets(
  raw: unknown,
): { ok: true; value: AllocationTarget[] | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Backup settings `allocationTargets`, if present, must be an array.' }
  }
  const out: AllocationTarget[] = []
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]
    if (t === null || typeof t !== 'object') {
      return { ok: false, error: `allocationTargets[${i}]: not an object.` }
    }
    const band = (t as { riskBand?: unknown }).riskBand
    const pct = (t as { pct?: unknown }).pct
    if (!VALID_RISK_BANDS.has(band as RiskBand)) {
      return { ok: false, error: `allocationTargets[${i}]: invalid \`riskBand\`.` }
    }
    if (!isFiniteNumber(pct)) {
      return { ok: false, error: `allocationTargets[${i}]: \`pct\` must be a finite number.` }
    }
    out.push({ riskBand: band as RiskBand, pct })
  }
  return { ok: true, value: out }
}

function numberOrUndefined(v: unknown): number | undefined {
  return isFiniteNumber(v) ? v : undefined
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
