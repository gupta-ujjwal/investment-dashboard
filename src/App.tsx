import {
  createBrowserRouter,
  redirect,
  RouterProvider,
  type ActionFunctionArgs,
} from 'react-router-dom'
import { getAll, type BaseCurrency } from './storage/holdings'
import { getHistory } from './storage/history'
import {
  getSettings,
  saveSettings,
  type NumberLocale,
  type Settings,
} from './storage/settings'
import { FEATURE_HISTORY } from './featureFlags'
import { applyManualRate, refreshFx } from './lib/refreshFx'
import { FxFetchError } from './lib/fx'
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
        { path: 'holdings', Component: HoldingsRoute, loader: dashboardLoader },
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
