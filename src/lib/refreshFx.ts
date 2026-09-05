import type { BaseCurrency, CanonicalHolding } from '../storage/holdings'
import { commitImport, getAll } from '../storage/holdings'
import { getAllAssets, upsertAsset, type ManualAsset } from '../storage/assets'
import { effectiveRate, fetchUsdInrRate, FxFetchError } from './fx'
import { saveSettings, type Settings } from '../storage/settings'
import { formatDate } from './format'

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
    // Stamp the current price to base only when the export carried one —
    // a missing price must stay `undefined`, never become a 0-valued total.
    ...(holding.currentPrice !== undefined && {
      currentPriceBase: holding.currentPrice * rate,
    }),
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

/**
 * Stamp a manual asset's base-currency figures, the asset analogue of
 * `stampHolding`. Assets have no broker re-import to re-stamp them, so the
 * triggers are: FX Refresh, base-currency change, and the asset add/edit action
 * (see `maybeStampAsset` at the App action layer). Identity stamp (rate 1) when
 * the asset's currency equals the base. `investedAmountBase` is only set when
 * the asset carries a cost basis — a value-only asset keeps it `undefined`
 * (R1: no sentinel `0`).
 */
export function stampAsset(
  asset: ManualAsset,
  base: BaseCurrency,
  usdInrRate: number,
  fetchedAt: number,
): ManualAsset {
  const rate = effectiveRate(asset.currency, base, usdInrRate)
  // Mirrors `stampHolding`: stamps FX fields only, never touches the audit
  // fields (`createdAt`/`updatedAt`) — the caller owns those.
  const stamped: ManualAsset = {
    ...asset,
    fxRate: rate,
    fxAsOf: fetchedAt,
    currentValueBase: asset.currentValue * rate,
  }
  if (asset.investedAmount !== undefined) {
    stamped.investedAmountBase = asset.investedAmount * rate
  } else {
    delete stamped.investedAmountBase
  }
  return stamped
}

/** Re-stamp every manual asset against a fresh rate, persisting each in its own
 *  atomic write. Returns the count re-stamped. Sequential by design — the asset
 *  set is small (manual entries), so a per-row tx keeps each write atomic (R3)
 *  without a cross-store transaction. */
async function restampAllAssets(
  base: BaseCurrency,
  usdInrRate: number,
  fetchedAt: number,
): Promise<number> {
  const assets = await getAllAssets()
  for (const a of assets) {
    await upsertAsset(stampAsset(a, base, usdInrRate, fetchedAt))
  }
  return assets.length
}

/**
 * Decide the user-visible warning (if any) for an import commit's FX
 * outcome. Pure and directly unit-testable — the commit flow it replaces
 * only `console.warn`'d, and only when there was no fallback rate at all,
 * so a stale-but-present rate produced zero signal. Returns `null` when the
 * live fetch succeeded (`liveFxFailure` is `null`); the fallback values are
 * irrelevant in that case since the live rate was what got used.
 */
export function deriveFxWarning(
  liveFxFailure: string | null,
  fallbackRate: number | null,
  fallbackFetchedAt: number | null,
): string | null {
  if (liveFxFailure === null) return null
  if (fallbackRate !== null && fallbackFetchedAt !== null) {
    return `Imported using your last saved FX rate (${fallbackRate}, ${formatDate(fallbackFetchedAt)}) — live refresh failed: ${liveFxFailure}`
  }
  return `Imported without a currency conversion — live FX refresh failed: ${liveFxFailure}. Refresh FX in Settings.`
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
  // Re-stamp manual assets against the same rate so net worth never mixes a
  // fresh-FX holding with a stale-FX asset (the single-rule fix from review).
  const assetCount = await restampAllAssets(settings.baseCurrency, rate, fetchedAt)
  await saveSettings({ ...settings, lastFxRate: rate, lastFxAsOf: fetchedAt })
  return { rate, fetchedAt, updatedCount: stamped.length + assetCount }
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
    const assetCount = await restampAllAssets(
      settings.baseCurrency,
      manualUsdInrRate,
      fetchedAt,
    )
    await saveSettings({
      ...settings,
      lastFxRate: manualUsdInrRate,
      lastFxAsOf: fetchedAt,
    })
    return { rate: manualUsdInrRate, fetchedAt, updatedCount: stamped.length + assetCount }
  })()
}
