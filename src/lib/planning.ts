import type { ManualAsset, RiskBand } from '../storage/assets'
import type { AllocationTarget } from '../storage/settings'

/**
 * Planning folds (Phase 3) — emergency-fund status and risk allocation, derived
 * from the risk/emergency tags on assets so there is one source of truth (no
 * re-typing asset values in a separate planner). All value math uses the
 * stamped `currentValueBase` and stays partial-aware (R1): an asset with no
 * base value is excluded and counted, never read as 0.
 */
export type EmergencyFundStatus = {
  /** Sum of base value across emergency-tagged assets that have a base value. */
  current: number
  /** Emergency assets excluded for want of a base value (unstamped / stale FX). */
  excludedCount: number
  /** `monthlyNeed × months`, or `undefined` when targets are unset. */
  target: number | undefined
  monthlyNeed: number | undefined
  months: number | undefined
  /** `current / monthlyNeed` — how many months of cover the fund buys.
   *  `undefined` when `monthlyNeed` is unset or 0. */
  coverageMonths: number | undefined
  /** `current / target`, `undefined` when target is unset or 0. */
  fundedPct: number | undefined
}

export function emergencyFundStatus(
  assets: readonly ManualAsset[],
  monthlyNeed: number | undefined,
  months: number | undefined,
): EmergencyFundStatus {
  let current = 0
  let excludedCount = 0
  for (const a of assets) {
    if (!a.emergencyFund) continue
    if (a.currentValueBase === undefined) excludedCount++
    else current += a.currentValueBase
  }
  const need = monthlyNeed !== undefined && monthlyNeed > 0 ? monthlyNeed : undefined
  const mo = months !== undefined && months > 0 ? months : undefined
  const target = need !== undefined && mo !== undefined ? need * mo : undefined
  return {
    current,
    excludedCount,
    target,
    monthlyNeed: need,
    months: mo,
    coverageMonths: need !== undefined ? current / need : undefined,
    fundedPct: target !== undefined && target > 0 ? current / target : undefined,
  }
}

export type RiskBandKey = RiskBand | 'untagged'

export type RiskSlice = {
  band: RiskBandKey
  label: string
  valueBase: number
  /** Share of the allocated total, 0..1. */
  pct: number
  /** Desired share from `allocationTargets`, 0..1, when one is set. */
  targetPct: number | undefined
}

const RISK_LABEL: Record<RiskBandKey, string> = {
  safe: 'Safe',
  moderate: 'Moderate',
  high: 'High',
  untagged: 'Untagged',
}

const RISK_ORDER: RiskBandKey[] = ['safe', 'moderate', 'high', 'untagged']

/**
 * Current allocation by risk band over priced assets, with an optional target
 * overlay. Bands with zero value are omitted unless they carry a target (so an
 * unmet target still shows). Returns bands in a stable safe→high→untagged
 * order rather than by size — the risk ladder reads more naturally fixed.
 */
export function riskAllocation(
  assets: readonly ManualAsset[],
  targets: readonly AllocationTarget[] = [],
): RiskSlice[] {
  const byBand = new Map<RiskBandKey, number>()
  for (const a of assets) {
    if (a.currentValueBase === undefined) continue
    const band: RiskBandKey = a.riskBand ?? 'untagged'
    byBand.set(band, (byBand.get(band) ?? 0) + a.currentValueBase)
  }
  const total = [...byBand.values()].reduce((s, v) => s + v, 0)
  const targetMap = new Map<RiskBand, number>(targets.map((t) => [t.riskBand, t.pct]))

  const slices: RiskSlice[] = []
  for (const band of RISK_ORDER) {
    const valueBase = byBand.get(band) ?? 0
    const targetPct =
      band === 'untagged' ? undefined : targetMap.has(band) ? targetMap.get(band)! / 100 : undefined
    if (valueBase === 0 && targetPct === undefined) continue
    slices.push({
      band,
      label: RISK_LABEL[band],
      valueBase,
      pct: total > 0 ? valueBase / total : 0,
      targetPct,
    })
  }
  return slices
}

export type BulkAllocationRow = {
  band: RiskBand
  label: string
  targetPct: number
  /** Lump sum × target weight — how much of the new money goes to this band. */
  toInvest: number
}

/**
 * Split a lump sum across risk bands by their target weights — the "bulk
 * invest" what-if from the sheet. Pure and scratch: it computes a suggested
 * split, it does not write anything back to assets. Targets are normalized by
 * their own sum so a target set that doesn't add to 100 still produces a
 * proportional split rather than leaving money unallocated.
 */
export function bulkAllocation(
  lumpSum: number,
  targets: readonly AllocationTarget[],
): BulkAllocationRow[] {
  const positive = targets.filter((t) => t.pct > 0)
  const weightSum = positive.reduce((s, t) => s + t.pct, 0)
  if (lumpSum <= 0 || weightSum <= 0) return []
  return positive.map((t) => ({
    band: t.riskBand,
    label: RISK_LABEL[t.riskBand],
    targetPct: t.pct,
    toInvest: lumpSum * (t.pct / weightSum),
  }))
}
