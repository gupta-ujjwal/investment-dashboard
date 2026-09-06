import {
  createBrowserRouter,
  redirect,
  RouterProvider,
  type ActionFunctionArgs,
} from 'react-router-dom'
import {
  deleteHolding,
  getAll,
  revertHoldingOverrides,
  setHoldingRiskBand,
  setHoldingStatus,
  upsertHolding,
  type BaseCurrency,
  type CanonicalHolding,
  type Currency,
  type HoldingKey,
  type HoldingStatus,
  type Source,
} from './storage/holdings'
import {
  deleteAsset,
  getAllAssets,
  getAsset,
  upsertAsset,
  type ManualAsset,
  type ManualAssetClass,
  type RiskBand,
} from './storage/assets'
import { getHistory, recordSnapshot } from './storage/history'
import {
  getSettings,
  saveSettings,
  type NumberLocale,
  type Settings,
} from './storage/settings'
import {
  FEATURE_ASSETS,
  FEATURE_BUDGET,
  FEATURE_BUDGET_TAGS,
  FEATURE_HISTORY,
  FEATURE_PLANNING,
} from './featureFlags'
import { applyManualRate, refreshFx, stampAsset, stampHolding } from './lib/refreshFx'
import { FxFetchError } from './lib/fx'
import {
  buildHoldingFromForm,
  validateHoldingForm,
  type HoldingFormInput,
} from './lib/holdingValidators'
import {
  buildAssetFromForm,
  validateAssetForm,
  type AssetFormInput,
} from './lib/assetValidators'
import type { HoldingActionResult } from './components/HoldingForm'
import type { AssetActionResult } from './components/AssetForm'
import { AppShell } from './routes/AppShell'
import { OverviewRoute } from './routes/OverviewRoute'
import { PortfolioRoute } from './routes/PortfolioRoute'
import { BudgetRoute } from './routes/BudgetRoute'
import { PlanningRoute } from './routes/PlanningRoute'
import { ImportRoute } from './routes/import/ImportRoute'
import { SettingsRoute } from './routes/SettingsRoute'
import type { SettingsActionResult } from './routes/SettingsForm'
import {
  getAllBudgetMonths,
  getBudgetMonth,
  upsertBudgetMonth,
  deleteBudgetMonth,
  type BudgetLine,
  type BudgetMonth,
} from './storage/budget'
import {
  deleteBudgetTag,
  getAllBudgetTags,
  tagDedupeKey,
  upsertBudgetTag,
  type BudgetTag,
  type BudgetTagKind,
} from './storage/budgetTags'
import type { BudgetActionResult } from './routes/BudgetRoute'

const dashboardLoader = async () => {
  const [holdings, settings, history, assets, budgetMonths] = await Promise.all([
    getAll(),
    getSettings(),
    FEATURE_HISTORY ? getHistory() : Promise.resolve([]),
    FEATURE_ASSETS ? getAllAssets() : Promise.resolve([]),
    // W2: Overview reads budget months to derive the cash-flow card + the
    // budget-fed emergency need / goal contribution. Empty when Budget unused.
    FEATURE_BUDGET ? getAllBudgetMonths() : Promise.resolve([] as BudgetMonth[]),
  ])
  return { holdings, settings, history, assets, budgetMonths }
}

const budgetLoader = async () => {
  const [months, settings, tags, history] = await Promise.all([
    getAllBudgetMonths(),
    getSettings(),
    FEATURE_BUDGET_TAGS ? getAllBudgetTags() : Promise.resolve([] as BudgetTag[]),
    // #4: an honest holdings cost-basis delta hint beside "invested this month".
    FEATURE_HISTORY ? getHistory() : Promise.resolve([]),
  ])
  return { months, settings, tags, history }
}

const planningLoader = async () => {
  // #2: Planning folds over the WHOLE portfolio — imported holdings (risk band
  // derived from asset class, overridable) AND manual assets — so fetch both.
  // W2: also read budget months so the emergency need can fall back to the
  // average monthly spend when it isn't set explicitly in Settings.
  // History powers the emergency-fund-coverage sparkline (same per-snapshot
  // fold pattern as Overview's hero KPIs).
  const [holdings, assets, settings, budgetMonths, history] = await Promise.all([
    getAll(),
    getAllAssets(),
    getSettings(),
    FEATURE_BUDGET ? getAllBudgetMonths() : Promise.resolve([] as BudgetMonth[]),
    FEATURE_HISTORY ? getHistory() : Promise.resolve([]),
  ])
  return { holdings, assets, settings, budgetMonths, history }
}

const settingsLoader = async () => {
  const [settings, holdings] = await Promise.all([getSettings(), getAll()])
  return { settings, holdings }
}

function isBaseCurrency(v: FormDataEntryValue | null): v is BaseCurrency {
  return v === 'INR' || v === 'USD'
}

function isNumberLocale(v: FormDataEntryValue | null): v is NumberLocale {
  return v === 'en-IN' || v === 'en-US'
}

function isBudgetTagKind(v: FormDataEntryValue | null): v is BudgetTagKind {
  return v === 'income' || v === 'expense'
}

/** Parse an optional numeric target field. Returns a sentinel:
 *  - `'keep'` when the field is absent from the form (don't touch current);
 *  - `undefined` when present-but-blank (the user cleared it);
 *  - a finite number when present and valid (invalid → `'keep'`). */
function readTarget(form: FormData, key: string): number | undefined | 'keep' {
  const raw = form.get(key)
  if (raw === null) return 'keep'
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 'keep'
}

function applyTarget(
  current: number | undefined,
  parsed: number | undefined | 'keep',
): number | undefined {
  return parsed === 'keep' ? current : parsed
}

function readAllocationTargets(
  form: FormData,
  current: Settings['allocationTargets'],
): Settings['allocationTargets'] {
  const bands = ['safe', 'moderate', 'high'] as const
  // If none of the three fields are present, the planning UI wasn't rendered —
  // preserve whatever is stored.
  if (bands.every((b) => form.get(`alloc_${b}`) === null)) return current
  const targets = bands
    .map((b) => ({ riskBand: b, pct: Number(form.get(`alloc_${b}`) ?? '') }))
    .filter((t) => Number.isFinite(t.pct) && t.pct > 0)
  return targets.length > 0 ? targets : undefined
}

async function readSettingsFromForm(form: FormData): Promise<Settings> {
  const current = await getSettings()
  const name = form.get('name')
  const base = form.get('baseCurrency')
  const locale = form.get('numberLocale')
  return {
    ...current,
    name: typeof name === 'string' ? name.trim() : current.name,
    baseCurrency: isBaseCurrency(base) ? base : current.baseCurrency,
    numberLocale: isNumberLocale(locale) ? locale : current.numberLocale,
    emergencyMonthlyNeed: applyTarget(
      current.emergencyMonthlyNeed,
      readTarget(form, 'emergencyMonthlyNeed'),
    ),
    emergencyMonths: applyTarget(current.emergencyMonths, readTarget(form, 'emergencyMonths')),
    goalCorpus: applyTarget(current.goalCorpus, readTarget(form, 'goalCorpus')),
    monthlyContribution: applyTarget(
      current.monthlyContribution,
      readTarget(form, 'monthlyContribution'),
    ),
    allocationTargets: readAllocationTargets(form, current.allocationTargets),
  }
}

const settingsAction = async ({ request }: ActionFunctionArgs): Promise<SettingsActionResult> => {
  const form = await request.formData()
  const intent = form.get('intent')
  const desired = await readSettingsFromForm(form)
  try {
    if (intent === 'save') {
      await saveSettings(desired)
      return { ok: true, mode: 'saved' }
    }
    if (intent === 'manual') {
      const raw = form.get('manualRate')
      const parsed = typeof raw === 'string' ? Number(raw) : Number.NaN
      await saveSettings(desired)
      const res = await applyManualRate(desired, parsed)
      await snapshotAfterNetWorthChange(desired.baseCurrency)
      return { ok: true, mode: 'manual', rate: res.rate, fetchedAt: res.fetchedAt }
    }
    if (intent === 'refresh') {
      await saveSettings(desired)
      const res = await refreshFx(desired)
      await snapshotAfterNetWorthChange(desired.baseCurrency)
      return { ok: true, mode: 'refreshed', rate: res.rate, fetchedAt: res.fetchedAt }
    }
    return { ok: false, error: `Unknown intent: ${String(intent)}` }
  } catch (err) {
    if (err instanceof FxFetchError) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Window during which a freshly-stamped FX rate is considered "good enough"
 *  to stamp a manual-add or edit without re-fetching from Frankfurter. The
 *  RefreshBanner already prompts the user when any row is unstamped, so a
 *  conservative 24h is fine — even a 2x overestimate of the rate is closer
 *  to truth than `undefined` (which renders as `—`). */
const FRESH_FX_WINDOW_MS = 24 * 60 * 60 * 1000

function isSource(v: FormDataEntryValue | null): v is Source {
  return v === 'vested' || v === 'groww' || v === 'manual'
}

function isRiskBand(v: FormDataEntryValue | null): v is RiskBand {
  return v === 'safe' || v === 'moderate' || v === 'high'
}

function isHoldingStatus(v: FormDataEntryValue | null): v is HoldingStatus {
  return v === 'open' || v === 'closed'
}

function readKey(form: FormData): HoldingKey | null {
  const source = form.get('source')
  const sourceSymbol = form.get('sourceSymbol')
  if (!isSource(source)) return null
  if (typeof sourceSymbol !== 'string' || sourceSymbol.trim() === '') return null
  return { source, sourceSymbol }
}

function readFormInput(form: FormData, source: Source): HoldingFormInput {
  // FormData values default to `''` for missing entries — keeps validators
  // simple (no `null` cases). Currency / assetClass are constrained by the
  // form's radio set; if the user tampers, the validator's checks reject.
  const get = (k: keyof HoldingFormInput) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : ''
  }
  return {
    name: get('name'),
    source,
    sourceSymbol: get('sourceSymbol'),
    market: (get('market') as HoldingFormInput['market']) || 'INR',
    currency: (get('currency') as HoldingFormInput['currency']) || 'INR',
    quantity: get('quantity'),
    avgBuyPrice: get('avgBuyPrice'),
    currentPrice: get('currentPrice'),
    assetClass: (get('assetClass') as HoldingFormInput['assetClass']) || 'equity',
  }
}

function maybeStampFx(
  row: CanonicalHolding,
  settings: Settings,
  now: number,
): CanonicalHolding {
  if (settings.lastFxRate === null || settings.lastFxAsOf === null) return row
  if (now - settings.lastFxAsOf > FRESH_FX_WINDOW_MS) return row
  return stampHolding(row, settings.baseCurrency, settings.lastFxRate, settings.lastFxAsOf)
}

/** Asset analogue of `maybeStampFx` — stamp a manual asset's base figures with
 *  the last known FX rate if it is fresh enough, so a non-base asset added
 *  between refreshes isn't left unstamped. Identity stamp when the asset's
 *  currency equals base. */
function maybeStampAsset(asset: ManualAsset, settings: Settings, now: number): ManualAsset {
  if (settings.lastFxRate === null || settings.lastFxAsOf === null) return asset
  if (now - settings.lastFxAsOf > FRESH_FX_WINDOW_MS) return asset
  return stampAsset(asset, settings.baseCurrency, settings.lastFxRate, settings.lastFxAsOf)
}

function readAssetForm(form: FormData): AssetFormInput {
  const get = (k: string) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : ''
  }
  return {
    name: get('name'),
    assetClass: get('assetClass') as ManualAssetClass,
    currency: (get('currency') as Currency) || 'INR',
    investedAmount: get('investedAmount'),
    currentValue: get('currentValue'),
    riskBand: get('riskBand'),
    emergencyFund: form.get('emergencyFund') === 'true',
  }
}

/** Capture a history snapshot after a net-worth-moving asset change. Best-effort
 *  per R3 — a snapshot failure must never fail the asset write that already
 *  committed. Budget writes deliberately do NOT call this (they don't move net
 *  worth). */
async function snapshotAfterNetWorthChange(base: BaseCurrency): Promise<void> {
  if (!FEATURE_HISTORY) return
  try {
    await recordSnapshot(base)
  } catch (err) {
    console.warn('History snapshot after asset change failed (non-fatal):', err)
  }
}

const holdingsAction = async ({
  request,
}: ActionFunctionArgs): Promise<HoldingActionResult | AssetActionResult> => {
  const form = await request.formData()
  const intent = form.get('intent')

  try {
    if (intent === 'add') {
      const [settings, all] = await Promise.all([getSettings(), getAll()])
      const existingKeys = all.map((h) => ({ source: h.source, sourceSymbol: h.sourceSymbol }))
      const input = readFormInput(form, 'manual')
      const validation = validateHoldingForm(input, { existingKeys })
      if (!validation.ok) {
        return { ok: false, error: 'Validation failed', fieldErrors: validation.errors }
      }
      const now = Date.now()
      // Manual rows have no broker import — treat createdAt as importedAt so
      // R8 staleness behaves correctly: a fresh manual add is the "newest"
      // import and won't show stale. See holdingValidators.buildHoldingFromForm.
      const row = buildHoldingFromForm(validation.value, 'manual', {
        createdAt: now,
        updatedAt: now,
        importedAt: now,
      })
      await upsertHolding(maybeStampFx(row, settings, now))
      await snapshotAfterNetWorthChange(settings.baseCurrency)
      return { ok: true, mode: 'added' }
    }

    if (intent === 'update') {
      const key = readKey(form)
      const originalSourceSymbol = form.get('originalSourceSymbol')
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      const originalKey: HoldingKey =
        typeof originalSourceSymbol === 'string' && originalSourceSymbol !== ''
          ? { source: key.source, sourceSymbol: originalSourceSymbol }
          : key
      const [settings, all] = await Promise.all([getSettings(), getAll()])
      const existing = all.find(
        (h) => h.source === originalKey.source && h.sourceSymbol === originalKey.sourceSymbol,
      )
      if (!existing) return { ok: false, error: 'Holding no longer exists' }
      const input = readFormInput(form, key.source)
      const validation = validateHoldingForm(input, {
        existingKeys: all.map((h) => ({ source: h.source, sourceSymbol: h.sourceSymbol })),
        currentKey: originalKey,
      })
      if (!validation.ok) {
        return { ok: false, error: 'Validation failed', fieldErrors: validation.errors }
      }
      const now = Date.now()
      // Compute the user-edited diff to extend manualOverrides for any
      // changed field. Broker rows accumulate sticky overrides; manual rows
      // also carry the set for forward-compat (a future feature that pulls
      // live prices for manual rows would need to respect them too).
      const addOverrides = diffOverrides(existing, validation.value)
      // Preserve identity + audit + FX fields; replace mutable fields.
      const merged: CanonicalHolding = {
        ...existing,
        name: validation.value.name,
        quantity: validation.value.quantity,
        avgBuyPrice: validation.value.avgBuyPrice,
        currency: existing.currency, // identity-shape; can't change on edit
        assetClass: validation.value.assetClass,
        updatedAt: now,
      }
      if (validation.value.currentPrice === undefined) {
        delete merged.currentPrice
      } else {
        merged.currentPrice = validation.value.currentPrice
      }
      const stamped = maybeStampFx(merged, settings, now)
      await upsertHolding(stamped, { addOverrides })
      await snapshotAfterNetWorthChange(settings.baseCurrency)
      return { ok: true, mode: 'updated' }
    }

    if (intent === 'delete') {
      const key = readKey(form)
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      const settings = await getSettings()
      await deleteHolding(key)
      await snapshotAfterNetWorthChange(settings.baseCurrency)
      return { ok: true, mode: 'deleted' }
    }

    if (intent === 'setStatus') {
      const key = readKey(form)
      const status = form.get('status')
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      if (!isHoldingStatus(status)) return { ok: false, error: `Invalid status: ${String(status)}` }
      const settings = await getSettings()
      await setHoldingStatus(key, status)
      await snapshotAfterNetWorthChange(settings.baseCurrency)
      return { ok: true, mode: 'status-set' }
    }

    if (intent === 'revertOverrides') {
      const key = readKey(form)
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      await revertHoldingOverrides(key)
      return { ok: true, mode: 'reverted' }
    }

    if (intent === 'setRiskBand') {
      const key = readKey(form)
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      // 'auto' (or an absent/blank band) clears the override → derived band (#2).
      const raw = form.get('band')
      const band = isRiskBand(raw) ? raw : undefined
      await setHoldingRiskBand(key, band)
      return { ok: true, mode: 'risk-band-set' }
    }

    // ── Manual asset intents (Phase 1) ──────────────────────────────────────
    if (intent === 'addAsset') {
      const validation = validateAssetForm(readAssetForm(form))
      if (!validation.ok) {
        return { ok: false, error: 'Validation failed', fieldErrors: validation.errors }
      }
      const settings = await getSettings()
      const now = Date.now()
      const asset = buildAssetFromForm(validation.value, {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      })
      await upsertAsset(maybeStampAsset(asset, settings, now))
      await snapshotAfterNetWorthChange(settings.baseCurrency)
      return { ok: true, mode: 'asset-added' }
    }

    if (intent === 'updateAsset') {
      const id = form.get('id')
      if (typeof id !== 'string' || id === '') {
        return { ok: false, error: 'Missing asset id' }
      }
      const existing = await getAsset(id)
      if (!existing) return { ok: false, error: 'Asset no longer exists' }
      const validation = validateAssetForm(readAssetForm(form))
      if (!validation.ok) {
        return { ok: false, error: 'Validation failed', fieldErrors: validation.errors }
      }
      const settings = await getSettings()
      const now = Date.now()
      const asset = buildAssetFromForm(validation.value, {
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      })
      await upsertAsset(maybeStampAsset(asset, settings, now))
      await snapshotAfterNetWorthChange(settings.baseCurrency)
      return { ok: true, mode: 'asset-updated' }
    }

    if (intent === 'deleteAsset') {
      const id = form.get('id')
      if (typeof id !== 'string' || id === '') {
        return { ok: false, error: 'Missing asset id' }
      }
      await deleteAsset(id)
      const settings = await getSettings()
      await snapshotAfterNetWorthChange(settings.baseCurrency)
      return { ok: true, mode: 'asset-deleted' }
    }

    return { ok: false, error: `Unknown intent: ${String(intent)}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Which overridable fields changed between `existing` and the user's parsed
 *  edit? These become the new entries in `manualOverrides`. The caller
 *  unions them with the existing set in `upsertHolding`'s atomic txn. */
function diffOverrides(
  existing: CanonicalHolding,
  edited: {
    name: string
    quantity: number
    avgBuyPrice: number
    currentPrice: number | undefined
    assetClass: CanonicalHolding['assetClass']
  },
): import('./storage/holdings').OverridableField[] {
  const changed: import('./storage/holdings').OverridableField[] = []
  if (existing.quantity !== edited.quantity) changed.push('quantity')
  if (existing.avgBuyPrice !== edited.avgBuyPrice) changed.push('avgBuyPrice')
  if (existing.currentPrice !== edited.currentPrice) changed.push('currentPrice')
  if (existing.name !== edited.name) changed.push('name')
  if (existing.assetClass !== edited.assetClass) changed.push('assetClass')
  return changed
}

/** Parse the JSON-encoded budget line list a `BudgetRoute` form submits. Lines
 *  with a non-finite amount or non-string category are dropped (defensive — the
 *  UI shouldn't produce them). */
function parseBudgetLines(raw: FormDataEntryValue | null): BudgetLine[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const lines: BudgetLine[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object') continue
    const category = (item as { category?: unknown }).category
    const amount = Number((item as { amount?: unknown }).amount)
    if (typeof category !== 'string') continue
    if (!Number.isFinite(amount)) continue
    lines.push({ category, amount })
  }
  return lines
}

const budgetAction = async ({ request }: ActionFunctionArgs): Promise<BudgetActionResult> => {
  const form = await request.formData()
  const intent = form.get('intent')
  try {
    if (intent === 'saveMonth') {
      const month = form.get('month')
      if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
        return { ok: false, error: 'Pick a valid month.' }
      }
      const investedRaw = form.get('invested')
      const invested =
        typeof investedRaw === 'string' && investedRaw.trim() !== ''
          ? Number(investedRaw)
          : 0
      if (!Number.isFinite(invested) || invested < 0) {
        return { ok: false, error: 'Invested must be a non-negative number.' }
      }
      const existing = await getBudgetMonth(month)
      const now = Date.now()
      const record: BudgetMonth = {
        month,
        income: parseBudgetLines(form.get('incomeJson')),
        expenses: parseBudgetLines(form.get('expensesJson')),
        invested,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      await upsertBudgetMonth(record)
      return { ok: true, mode: 'saved' }
    }
    if (intent === 'deleteMonth') {
      const month = form.get('month')
      if (typeof month !== 'string') return { ok: false, error: 'Invalid month' }
      await deleteBudgetMonth(month)
      return { ok: true, mode: 'deleted' }
    }
    // ── Budget tag intents (v5) ─────────────────────────────────────────────
    if (intent === 'createTag') {
      if (!FEATURE_BUDGET_TAGS) return { ok: false, error: 'Budget tags are disabled.' }
      const labelRaw = form.get('label')
      const kind = form.get('kind')
      const label = typeof labelRaw === 'string' ? labelRaw.trim() : ''
      if (label === '') return { ok: false, error: 'Tag label is required.' }
      if (!isBudgetTagKind(kind)) return { ok: false, error: 'Tag kind must be income or expense.' }
      // Idempotent create: if a tag with the same label (case/space-insensitive)
      // already exists in this kind, return it rather than making a duplicate —
      // a user "creating" Rent twice should converge on one tag.
      const existing = await getAllBudgetTags()
      const key = tagDedupeKey(label, kind)
      const dupe = existing.find((t) => tagDedupeKey(t.label, t.kind) === key)
      if (dupe) return { ok: true, mode: 'tag-created', tag: dupe }
      const tag: BudgetTag = {
        id: crypto.randomUUID(),
        label,
        kind,
        createdAt: Date.now(),
      }
      await upsertBudgetTag(tag)
      return { ok: true, mode: 'tag-created', tag }
    }
    if (intent === 'deleteTag') {
      if (!FEATURE_BUDGET_TAGS) return { ok: false, error: 'Budget tags are disabled.' }
      const id = form.get('id')
      if (typeof id !== 'string' || id === '') return { ok: false, error: 'Missing tag id' }
      // Deleting a tag only removes it from the picker — past months' lines keep
      // the label they were saved with (tag = managed label, not a foreign key).
      await deleteBudgetTag(id)
      return { ok: true, mode: 'tag-deleted' }
    }
    return { ok: false, error: `Unknown intent: ${String(intent)}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: AppShell,
      children: [
        {
          index: true,
          loader: async () => {
            const holdings = await getAll()
            // First run lands on Import — the one thing a new user must do.
            throw redirect(holdings.length === 0 ? '/import' : '/overview')
          },
        },
        // Net-worth-centric IA: Overview (generic, cross-asset) → Investments
        // (all asset classes; equity backfilled read-only from holdings) →
        // Equity (the per-ticker table + equity analytics). `holdingsAction`
        // (holding + manual-asset intents) is mounted on `/equity`; the asset
        // forms on Investments post to it and react-router revalidates the
        // Investments loader.
        { path: 'overview', Component: OverviewRoute, loader: dashboardLoader },
        { path: 'portfolio', Component: PortfolioRoute, loader: dashboardLoader, action: holdingsAction },
        {
          path: 'equity',
          loader: () => redirect('/portfolio'),
        },
        { path: 'investments', loader: () => redirect('/portfolio') },
        // Redirects preserve old bookmarks / external links after the rename.
        { path: 'analytics', loader: () => redirect('/overview') },
        { path: 'holdings', loader: () => redirect('/equity') },
        // Budget / Planning routes are gated on their phase flags so a flag-off
        // build has neither the tab (AppShell) nor the route — no dead links.
        ...(FEATURE_BUDGET
          ? [{ path: 'budget', Component: BudgetRoute, loader: budgetLoader, action: budgetAction }]
          : []),
        ...(FEATURE_PLANNING
          ? [{ path: 'planning', Component: PlanningRoute, loader: planningLoader }]
          : []),
        { path: 'import', Component: ImportRoute },
        {
          path: 'settings',
          Component: SettingsRoute,
          loader: settingsLoader,
          action: settingsAction,
        },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)

export default function App() {
  return <RouterProvider router={router} />
}
