import { getDB, SETTINGS_STORE, type BaseCurrency } from './holdings'

export type NumberLocale = 'en-IN' | 'en-US'

export type Settings = {
  name: string
  baseCurrency: BaseCurrency
  numberLocale: NumberLocale
  lastFxRate: number | null
  lastFxAsOf: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  baseCurrency: 'INR',
  numberLocale: 'en-IN',
  lastFxRate: null,
  lastFxAsOf: null,
}

const SETTINGS_KEY = 'app'

export async function getSettings(): Promise<Settings> {
  const db = await getDB()
  const stored = (await db.get(SETTINGS_STORE, SETTINGS_KEY)) as Partial<Settings> | undefined
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function saveSettings(next: Settings): Promise<void> {
  const db = await getDB()
  await db.put(SETTINGS_STORE, next, SETTINGS_KEY)
}

export async function updateFxMeta(rate: number, asOf: number): Promise<void> {
  const current = await getSettings()
  await saveSettings({ ...current, lastFxRate: rate, lastFxAsOf: asOf })
}
