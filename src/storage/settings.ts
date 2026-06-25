import { getDB, SETTINGS_STORE, type BaseCurrency } from './holdings'
import type { RiskBand } from './assets'

export type NumberLocale = 'en-IN' | 'en-US'

/** A target weight for one risk band, used by the Planning allocation view to
 *  compare desired vs actual mix. Bands without a target are simply unplanned. */
export type AllocationTarget = { riskBand: RiskBand; pct: number }

export type Settings = {
  name: string
  baseCurrency: BaseCurrency
  numberLocale: NumberLocale
  lastFxRate: number | null
  lastFxAsOf: number | null
  // ── Planning targets (Phase 3) — all optional, single-user config; absent
  //    means "not set up yet". Optional fields on the settings singleton, so
  //    no DB version bump (dsl.md § dsl-decision-guide). ────────────────────
  /** Monthly spend the emergency fund must cover, base currency. */
  emergencyMonthlyNeed?: number
  /** How many months of cover the target fund represents (typically 6 or 12). */
  emergencyMonths?: number
  /** Desired allocation by risk band; compared against the actual asset mix. */
  allocationTargets?: AllocationTarget[]
  // ── Goal (Phase 4) ──────────────────────────────────────────────────────
  /** Target net-worth corpus, base currency. */
  goalCorpus?: number
  /** Planned monthly contribution toward the goal, base currency. Drives the
   *  flat-contribution time-to-goal projection. */
  monthlyContribution?: number
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
