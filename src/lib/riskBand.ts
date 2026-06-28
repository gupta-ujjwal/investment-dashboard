import type { AssetClass, CanonicalHolding } from '../storage/holdings'
import type { RiskBand } from '../storage/assets'

/**
 * Risk band for imported holdings (#2). Planning's risk allocation lives on
 * `ManualAsset.riskBand`; imported `CanonicalHolding`s had no band, so Planning
 * was blind to the equity book. We DERIVE a default band from the holding's
 * asset class and let the user OVERRIDE it per holding (`holding.riskBand`).
 *
 * Derive, don't store (reliability blast radius): the default is computed at read
 * time from this one map, never persisted — so editing the map can never leave a
 * stale band on a row. The ONLY thing stored is the user's explicit override.
 * This is the single source of truth for that map; it fans out to Planning today
 * (and insights/rebalancing later), so it is unit-tested in isolation.
 *
 * The map is deliberately COARSE: the holding asset-class enum has five values
 * and cannot tell a debt ETF from an equity ETF, so diversified classes default
 * to the conservative middle (`moderate`) and the per-holding override is the
 * documented correction mechanism. An unmappable class returns `undefined`,
 * which the allocation fold buckets explicitly as "untagged" — never dropped,
 * never coerced into a wrong band.
 */
const DERIVED_BAND: Record<AssetClass, RiskBand | undefined> = {
  equity: 'high', // direct single-stock risk
  etf: 'moderate', // diversified, but class can't tell equity vs debt vs gold
  mf: 'moderate', // diversified fund, composition unknown at holding level
  invit: 'moderate', // income / infrastructure, mid risk
  other: undefined, // unknown — bucket as "untagged", never guess
}

/** The auto-classified band for an asset class, before any user override.
 *  `undefined` when the class is unmappable (→ "untagged" in the fold). */
export function deriveBand(assetClass: AssetClass): RiskBand | undefined {
  return DERIVED_BAND[assetClass]
}

/** The band a holding actually counts under: the user's explicit override if set,
 *  otherwise the derived default. `undefined` only when neither applies (an
 *  unmapped class with no override) — the caller buckets that as "untagged". */
export function effectiveBand(holding: CanonicalHolding): RiskBand | undefined {
  return holding.riskBand ?? deriveBand(holding.assetClass)
}

/** Whether a holding's band is a user override (vs the derived default) — drives
 *  the "auto / overridden" affordance in the row menu. */
export function isBandOverridden(holding: CanonicalHolding): boolean {
  return holding.riskBand !== undefined
}
