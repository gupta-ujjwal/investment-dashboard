import type { AssetClass, CanonicalHolding, Currency } from '../storage/holdings'
import type { ManualAsset } from '../storage/assets'
import { deriveRows } from './holdingsView'
import { assetPosition, HOLDING_GROUP, MANUAL_ASSET_CLASS_LABELS } from './netWorth'

/**
 * The Investments tab's unified row model. Equity is a *derived, read-only*
 * branch — aggregated live from the holdings store by market (India = INR
 * holdings, US = USD holdings) — so there is one source of truth for equity
 * value (the holdings store; never duplicated into the assets store, R11). All
 * other asset classes are *editable* manual-asset rows.
 *
 * Partial-value discipline (R1): base-currency figures can be missing (unpriced
 * holding, stale/absent FX stamp). The fold NEVER reads absent as 0 — it sums
 * only the positions that have a base value and reports an `excludedCount`, so
 * a single unstamped holding never silently understates an equity row.
 *
 * Defensive by construction (reliability): this fold sits on a core tab's
 * render path, so a malformed/legacy holding (NaN figure, etc.) must not throw
 * or poison a total — non-finite base values are treated as "not computable"
 * (undefined), exactly like an absent one.
 */
export type HoldingsDerivedRow = {
  kind: 'holdingsDerived'
  /** `holdings:<assetClass>:<market>` — e.g. `holdings:etf:USD`. Unique per
   *  (class, market) group; consumed only as a React list key. */
  key: string
  /** Display label, `<classLabel> · <India|US>` — e.g. "ETF · US". */
  label: string
  /** The holdings' asset class for this group (#1: rows are grouped by real
   *  asset class, never collapsed to "Equity"). */
  assetClass: AssetClass
  /** Coarse class label from the shared `HOLDING_GROUP` map — the Class cell. */
  classLabel: string
  market: Currency
  /** Known base-currency current value (sum over priced holdings), or
   *  `undefined` when no holding in this group has a computable value. */
  currentValueBase: number | undefined
  /** Known base-currency cost basis (sum over stamped holdings), or
   *  `undefined` when none is computable. */
  investedBase: number | undefined
  /** Open positions aggregated into this row. */
  positionsCount: number
  /** Positions with no computable base value, excluded from the sums above. */
  excludedCount: number
}

export type AssetInvestmentRow = {
  kind: 'asset'
  key: string
  label: string
  /** Asset-class group label (e.g. "Crypto", "Gold / Silver"). */
  group: string
  asset: ManualAsset
  currentValueBase: number | undefined
  investedBase: number | undefined
  /** A pre-existing manual asset whose class is `equity`. New ones can no longer
   *  be created (equity comes from holdings), but legacy ones stay editable and
   *  are flagged so the UI can note they count separately from the derived
   *  equity rows above. */
  isLegacyEquity: boolean
}

export type InvestmentRow = HoldingsDerivedRow | AssetInvestmentRow

/** Market suffix for a holdings-row label. */
const MARKET_LABEL: Record<Currency, string> = {
  INR: 'India',
  USD: 'US',
}

/** Stable display order: India before US, and a fixed class ladder within each
 *  market so the row list never reshuffles between renders. */
const MARKET_ORDER: Currency[] = ['INR', 'USD']
const CLASS_ORDER: AssetClass[] = ['equity', 'etf', 'mf', 'invit', 'other']

/** Finite-number guard: a non-finite figure (NaN/±Infinity from malformed data)
 *  is treated as "not computable", never propagated into a total. */
function finite(v: number | undefined): number | undefined {
  return v !== undefined && Number.isFinite(v) ? v : undefined
}

/**
 * Aggregate open holdings into one derived row per (asset class, market) group.
 * #1 fix: rows are grouped by the holding's real `assetClass` (equity / etf / mf
 * / invit / other), never collapsed into a single "Equity" bucket — so an ETF or
 * InvIT reads as ETF / InvIT, matching the class split Overview already shows.
 * Closed positions are excluded (consistent with net worth / the analytics
 * default). Groups with no open holdings produce no row. Order is India-before-US
 * then a fixed class ladder, so the list is stable across renders.
 */
export function deriveHoldingsRows(holdings: CanonicalHolding[]): HoldingsDerivedRow[] {
  const rows = deriveRows(holdings).filter((r) => r.holding.status !== 'closed')
  const out: HoldingsDerivedRow[] = []
  for (const market of MARKET_ORDER) {
    for (const assetClass of CLASS_ORDER) {
      const inGroup = rows.filter(
        (r) => r.holding.currency === market && r.holding.assetClass === assetClass,
      )
      if (inGroup.length === 0) continue

      let currentKnown = 0
      let valuedCount = 0
      let investedKnown = 0
      let investedCount = 0
      for (const r of inGroup) {
        const cv = finite(r.currentValueBase)
        if (cv !== undefined) {
          currentKnown += cv
          valuedCount++
        }
        const iv = finite(r.investedBase)
        if (iv !== undefined) {
          investedKnown += iv
          investedCount++
        }
      }
      const classLabel = HOLDING_GROUP[assetClass]
      out.push({
        kind: 'holdingsDerived',
        key: `holdings:${assetClass}:${market}`,
        label: `${classLabel} · ${MARKET_LABEL[market]}`,
        assetClass,
        classLabel,
        market,
        currentValueBase: valuedCount > 0 ? currentKnown : undefined,
        investedBase: investedCount > 0 ? investedKnown : undefined,
        positionsCount: inGroup.length,
        excludedCount: inGroup.length - valuedCount,
      })
    }
  }
  return out
}

/** Project a manual asset into an editable Investments row. */
export function assetInvestmentRow(asset: ManualAsset): AssetInvestmentRow {
  const pos = assetPosition(asset)
  return {
    kind: 'asset',
    key: `asset:${asset.id}`,
    label: asset.name,
    group: MANUAL_ASSET_CLASS_LABELS[asset.assetClass] ?? 'Other',
    asset,
    currentValueBase: finite(pos.currentValueBase),
    investedBase: finite(pos.investedBase),
    isLegacyEquity: asset.assetClass === 'equity',
  }
}

/**
 * The full Investments row list: holdings-derived rows first (read-only, by
 * class × market), then every manual asset row (editable), assets ordered
 * largest known value first so the meaningful holdings sort to the top. Legacy
 * manual `equity` assets are retained (still editable) rather than hidden —
 * hiding them would orphan data the user can no longer reach; they are flagged.
 */
export function buildInvestmentRows(
  holdings: CanonicalHolding[],
  assets: ManualAsset[],
): InvestmentRow[] {
  const derived = deriveHoldingsRows(holdings)
  const assetRows = assets
    .map(assetInvestmentRow)
    .sort((a, b) => (b.currentValueBase ?? -Infinity) - (a.currentValueBase ?? -Infinity))
  return [...derived, ...assetRows]
}

/** Count of legacy manual `equity` assets in the list — drives the
 *  "counted separately from holdings" note in the Investments view. */
export function legacyEquityCount(rows: InvestmentRow[]): number {
  return rows.filter((r) => r.kind === 'asset' && r.isLegacyEquity).length
}
