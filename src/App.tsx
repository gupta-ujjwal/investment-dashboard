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
  setHoldingStatus,
  upsertHolding,
  type BaseCurrency,
  type CanonicalHolding,
  type HoldingKey,
  type HoldingStatus,
  type Source,
} from './storage/holdings'
import { getHistory } from './storage/history'
import {
  getSettings,
  saveSettings,
  type NumberLocale,
  type Settings,
} from './storage/settings'
import { FEATURE_HISTORY } from './featureFlags'
import { applyManualRate, refreshFx, stampHolding } from './lib/refreshFx'
import { FxFetchError } from './lib/fx'
import {
  buildHoldingFromForm,
  validateHoldingForm,
  type HoldingFormInput,
} from './lib/holdingValidators'
import type { HoldingActionResult } from './components/HoldingForm'
import { AppShell } from './routes/AppShell'
import { AnalyticsRoute } from './routes/AnalyticsRoute'
import { HoldingsRoute } from './routes/HoldingsRoute'
import { ImportRoute } from './routes/import/ImportRoute'
import { SettingsRoute } from './routes/SettingsRoute'
import type { SettingsActionResult } from './routes/SettingsForm'

const dashboardLoader = async () => {
  const [holdings, settings, history] = await Promise.all([
    getAll(),
    getSettings(),
    FEATURE_HISTORY ? getHistory() : Promise.resolve([]),
  ])
  return { holdings, settings, history }
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
      return { ok: true, mode: 'manual', rate: res.rate, fetchedAt: res.fetchedAt }
    }
    if (intent === 'refresh') {
      await saveSettings(desired)
      const res = await refreshFx(desired)
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

const holdingsAction = async ({ request }: ActionFunctionArgs): Promise<HoldingActionResult> => {
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
      return { ok: true, mode: 'updated' }
    }

    if (intent === 'delete') {
      const key = readKey(form)
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      await deleteHolding(key)
      return { ok: true, mode: 'deleted' }
    }

    if (intent === 'setStatus') {
      const key = readKey(form)
      const status = form.get('status')
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      if (!isHoldingStatus(status)) return { ok: false, error: `Invalid status: ${String(status)}` }
      await setHoldingStatus(key, status)
      return { ok: true, mode: 'status-set' }
    }

    if (intent === 'revertOverrides') {
      const key = readKey(form)
      if (!key) return { ok: false, error: 'Missing or invalid holding identity' }
      await revertHoldingOverrides(key)
      return { ok: true, mode: 'reverted' }
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
            throw redirect(holdings.length === 0 ? '/import' : '/analytics')
          },
        },
        { path: 'analytics', Component: AnalyticsRoute, loader: dashboardLoader },
        {
          path: 'holdings',
          Component: HoldingsRoute,
          loader: dashboardLoader,
          action: holdingsAction,
        },
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
