import type { CanonicalHolding, Currency } from '../storage/holdings'
import type { ManualAsset, ManualAssetClass } from '../storage/assets'
import { deriveRows, type DerivedRow } from './holdingsView'

/**
 * Net worth = equity holdings (positional, broker-imported) + manual value-only
 * assets, folded into one summable unit. `NetWorthPosition` is the confluence:
 * both a `DerivedRow` and a `ManualAsset` project into it, so totals,
 * allocation, and history all fold over a single shape rather than special-
 * casing two source types everywhere.
 *
 * Partial-value discipline (R1) is the load-bearing invariant here: holdings
 * can be unstamped (`currentValueBase === undefined`) and value-only assets can
 * lack a cost basis. The fold NEVER treats absent as `0`. Instead it exposes
 * BOTH a strict total (undefined if anything is missing) AND a known subtotal +
 * excluded count, so the UI can show a useful number with a "partial" badge
 * rather than collapsing the whole net worth to `—` because one holding lacks a
 * price. That dual return is the fix the plan review converged on.
 */
export type NetWorthSourceKind = 'holding' | 'asset'

export type NetWorthPosition = {
  /** Stable identity, namespaced by source so a holding and an asset can never
   *  collide. */
  key: string
  label: string
  kind: NetWorthSourceKind
  /** Coarse asset-class label for the allocation fold (e.g. "Equity",
   *  "Crypto", "Gold"). */
  group: string
  currency: Currency
  /** Base-currency cost basis. `undefined` when unstamped or (for value-only
   *  assets) when there is no basis. */
  investedBase: number | undefined
  /** Base-currency current value. `undefined` when unstamped. */
  currentValueBase: number | undefined
  /** `currentValueBase − investedBase`, or `undefined` if either is. */
  profitAbsBase: number | undefined
  /** Whether this position has a meaningful cost basis. Value-only assets
   *  (cash, savings) set `false` → counted in net worth, excluded from P&L%. */
  hasBasis: boolean
}

const HOLDING_GROUP: Record<CanonicalHolding['assetClass'], string> = {
  equity: 'Equity',
  mf: 'Mutual Funds',
  etf: 'ETF',
  invit: 'InvIT',
  other: 'Other',
}

const ASSET_GROUP: Record<ManualAssetClass, string> = {
  equity: 'Equity',
  mutualFund: 'Mutual Funds',
  crypto: 'Crypto',
  gold: 'Gold / Silver',
  nps: 'NPS / Retirement',
  fd: 'Fixed Deposit',
  savings: 'Savings',
  cash: 'Cash',
  other: 'Other',
}

export const MANUAL_ASSET_CLASS_LABELS = ASSET_GROUP

export function holdingPosition(row: DerivedRow): NetWorthPosition {
  return {
    key: `holding:${row.holding.source}:${row.holding.sourceSymbol}`,
    label: row.holding.name,
    kind: 'holding',
    group: HOLDING_GROUP[row.holding.assetClass],
    currency: row.holding.currency,
    investedBase: row.investedBase,
    currentValueBase: row.currentValueBase,
    profitAbsBase: row.profitAbsBase,
    hasBasis: true,
  }
}

export function assetPosition(asset: ManualAsset): NetWorthPosition {
  const hasBasis = asset.investedAmount !== undefined
  const investedBase = asset.investedAmountBase
  const currentValueBase = asset.currentValueBase
  const profitAbsBase =
    investedBase === undefined || currentValueBase === undefined
      ? undefined
      : currentValueBase - investedBase
  return {
    key: `asset:${asset.id}`,
    label: asset.name,
    kind: 'asset',
    group: ASSET_GROUP[asset.assetClass],
    currency: asset.currency,
    investedBase,
    currentValueBase,
    profitAbsBase,
    hasBasis,
  }
}

/**
 * Project holdings + assets into one position list. Closed holdings are
 * excluded — net worth is the current open portfolio (consistent with the
 * analytics default). Assets have no open/closed concept.
 */
export function buildPositions(
  holdings: CanonicalHolding[],
  assets: ManualAsset[],
): NetWorthPosition[] {
  const open = deriveRows(holdings).filter((r) => r.holding.status !== 'closed')
  return [...open.map(holdingPosition), ...assets.map(assetPosition)]
}

export type NetWorthTotals = {
  /** Strict current value: `undefined` if ANY position lacks a base value
   *  (R1 — never silently understated). Drives the strict figure. */
  currentValueStrict: number | undefined
  /** Sum over only the positions that HAVE a base value — always a number,
   *  shown alongside `excludedCount` so a single unpriced holding doesn't blank
   *  the whole net worth. */
  knownCurrentValue: number
  /** Positions excluded from `knownCurrentValue` (no computable base value). */
  excludedCount: number
  totalPositions: number
  /** Strict invested over basis-bearing positions: `undefined` if any is
   *  unstamped. */
  investedStrict: number | undefined
  /** Known invested over basis-bearing positions with a value. */
  knownInvested: number
  /** P&L over positions that have BOTH a basis and a current value. */
  profitKnown: number
  /** `profitKnown / basisWithValue`, or `undefined` when no comparable basis. */
  profitPctKnown: number | undefined
}

export function netWorthTotals(positions: NetWorthPosition[]): NetWorthTotals {
  let knownCurrentValue = 0
  let excludedCount = 0
  let anyValueMissing = false

  let knownInvested = 0
  let anyBasisInvestedMissing = false

  // P&L is only honest over positions that have BOTH a basis and a value —
  // otherwise the ratio mixes a numerator and denominator from different sets.
  let basisWithValue = 0
  let profitKnown = 0

  for (const p of positions) {
    if (p.currentValueBase === undefined) {
      excludedCount++
      anyValueMissing = true
    } else {
      knownCurrentValue += p.currentValueBase
    }

    if (p.hasBasis) {
      if (p.investedBase === undefined) {
        anyBasisInvestedMissing = true
      } else {
        knownInvested += p.investedBase
        if (p.currentValueBase !== undefined) {
          basisWithValue += p.investedBase
          profitKnown += p.currentValueBase - p.investedBase
        }
      }
    }
  }

  return {
    currentValueStrict: anyValueMissing ? undefined : knownCurrentValue,
    knownCurrentValue,
    excludedCount,
    totalPositions: positions.length,
    investedStrict: anyBasisInvestedMissing ? undefined : knownInvested,
    knownInvested,
    profitKnown,
    profitPctKnown: basisWithValue > 0 ? profitKnown / basisWithValue : undefined,
  }
}

export type NetWorthSlice = {
  key: string
  label: string
  valueBase: number
  pct: number
}

/**
 * Allocation of net worth by asset-class group. Only positions with a
 * computable `currentValueBase` count — an unpriced position cannot honestly
 * claim a slice (mirrors `analytics.allocation`). Largest-first; `[]` when
 * nothing is allocatable.
 */
export function netWorthAllocation(positions: NetWorthPosition[]): NetWorthSlice[] {
  const buckets = new Map<string, number>()
  for (const p of positions) {
    if (p.currentValueBase === undefined) continue
    buckets.set(p.group, (buckets.get(p.group) ?? 0) + p.currentValueBase)
  }
  const total = [...buckets.values()].reduce((s, v) => s + v, 0)
  if (total <= 0) return []
  return [...buckets.entries()]
    .map(([group, valueBase]) => ({
      key: group,
      label: group,
      valueBase,
      pct: valueBase / total,
    }))
    .sort((a, b) => b.valueBase - a.valueBase)
}

/** Does any non-base-currency asset have a stale (or missing) FX stamp relative
 *  to the latest known rate timestamp? Drives the "values may be stale" signal
 *  on assets that were entered once and never re-stamped. `lastFxAsOf` is the
 *  newest rate the app holds; an asset stamped before it (or never) is stale. */
export function staleAssetCount(
  assets: ManualAsset[],
  base: Currency,
  lastFxAsOf: number | null,
): number {
  return assets.filter((a) => {
    if (a.currency === base) return false // identity — never needs a rate
    if (a.currentValueBase === undefined || a.fxAsOf === undefined) return true
    if (lastFxAsOf !== null && a.fxAsOf < lastFxAsOf) return true
    return false
  }).length
}
