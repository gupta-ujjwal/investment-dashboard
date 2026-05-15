import type { BaseCurrency, CanonicalHolding } from '../storage/holdings'
import { commitImport, getAll } from '../storage/holdings'
import { effectiveRate, fetchUsdInrRate, FxFetchError } from './fx'
import { saveSettings, type Settings } from '../storage/settings'

export type StampedHolding = CanonicalHolding & {
  fxRate: number
  fxAsOf: number
  avgBuyPriceBase: number
}

export function stampHolding(
  holding: CanonicalHolding,
  base: BaseCurrency,
  usdInrRate: number,
  fetchedAt: number,
): StampedHolding {
  const rate = effectiveRate(holding.currency, base, usdInrRate)
  return {
    ...holding,
    fxRate: rate,
    fxAsOf: fetchedAt,
    avgBuyPriceBase: holding.avgBuyPrice * rate,
  }
}

export function stampMany(
  rows: CanonicalHolding[],
  base: BaseCurrency,
  usdInrRate: number,
  fetchedAt: number,
): StampedHolding[] {
  return rows.map((h) => stampHolding(h, base, usdInrRate, fetchedAt))
}

export type RefreshResult = {
  rate: number
  fetchedAt: number
  updatedCount: number
}

export async function refreshFx(settings: Settings): Promise<RefreshResult> {
  const { rate, fetchedAt } = await fetchUsdInrRate()
  const holdings = await getAll()
  const stamped = stampMany(holdings, settings.baseCurrency, rate, fetchedAt)
  await commitImport({ inserts: [], updates: stamped, deletes: [] })
  await saveSettings({ ...settings, lastFxRate: rate, lastFxAsOf: fetchedAt })
  return { rate, fetchedAt, updatedCount: stamped.length }
}

export function applyManualRate(
  settings: Settings,
  manualUsdInrRate: number,
): Promise<RefreshResult> {
  if (!Number.isFinite(manualUsdInrRate) || manualUsdInrRate <= 1 || manualUsdInrRate >= 1000) {
    return Promise.reject(
      new FxFetchError(`Manual rate ${manualUsdInrRate} is outside sane range (1, 1000)`),
    )
  }
  const fetchedAt = Date.now()
  return (async () => {
    const holdings = await getAll()
    const stamped = stampMany(holdings, settings.baseCurrency, manualUsdInrRate, fetchedAt)
    await commitImport({ inserts: [], updates: stamped, deletes: [] })
    await saveSettings({
      ...settings,
      lastFxRate: manualUsdInrRate,
      lastFxAsOf: fetchedAt,
    })
    return { rate: manualUsdInrRate, fetchedAt, updatedCount: stamped.length }
  })()
}
