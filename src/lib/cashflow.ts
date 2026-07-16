import type { ManualAsset } from '../storage/assets'

/**
 * The connective-tissue folds (W2): they let the Budget tab feed the Planning
 * emergency need, the goal contribution, and the Overview cash-flow card —
 * without any tab writing to another's store. All pure reads; partial-aware (R1).
 */

/** Where a planning figure came from — drives the visible "from Settings" vs
 *  "budget-derived" provenance label. With no runtime telemetry, an unexpected
 *  source label is the only anomaly signal the user can act on. */
export type ValueSource = 'settings' | 'budget' | 'none'

export type EffectiveValue = {
  value: number | undefined
  source: ValueSource
}

/**
 * Precedence: the Settings value is the explicit **override**; the budget-derived
 * figure is the **fallback** used only when Settings is unset. Tri-state, not
 * binary — `undefined` Settings means "unset" (use the derived value), whereas an
 * explicit `0` is a real user override and is honored (`source: 'settings'`),
 * never mistaken for absent. The cleared-vs-zero distinction is preserved upstream
 * by the Settings write path (a cleared field is stored `undefined`, not `0`).
 */
export function effectiveValue(
  settingsValue: number | undefined,
  derived: number | undefined,
): EffectiveValue {
  if (settingsValue !== undefined) return { value: settingsValue, source: 'settings' }
  if (derived !== undefined) return { value: derived, source: 'budget' }
  return { value: undefined, source: 'none' }
}

/**
 * Human-readable provenance of a derived planning figure — "from Settings" vs
 * "budget-derived · avg of N mo". Shared across every surface that shows a
 * derived need/contribution (Overview + Planning) so the blast radius of the
 * precedence feed stays behind ONE label, not a per-route re-implementation.
 * With no runtime telemetry this label is the user's only anomaly signal (T4),
 * so it lives beside `effectiveValue` and is unit-tested. `undefined` when
 * nothing feeds the value (`source: 'none'`).
 */
export function provenanceLabel(
  source: ValueSource,
  avgMonths: number | undefined,
): string | undefined {
  if (source === 'settings') return 'from Settings'
  if (source === 'budget') {
    return avgMonths ? `budget-derived · avg of ${avgMonths} mo` : 'budget-derived'
  }
  return undefined
}

/** Manual-asset classes that count as liquid runway. Cash / savings / FD only —
 *  equity and market holdings are volatile and tax-on-sale, so counting them as a
 *  runway buffer would overstate safety and teach a false lesson. */
const LIQUID_CLASSES: ReadonlySet<ManualAsset['assetClass']> = new Set([
  'cash',
  'savings',
  'fd',
])

/**
 * The runway numerator: base-currency value of liquid manual assets. Uses the
 * FX-stamped `currentValueBase` (so the ratio never mixes INR and USD); an asset
 * with no computable base value is skipped, never read as `0` (R1). `undefined`
 * when there are no valued liquid assets — the card then shows an empty state
 * rather than a misleading `0`.
 */
export function liquidAssets(assets: readonly ManualAsset[]): number | undefined {
  let total = 0
  let counted = 0
  for (const a of assets) {
    if (!LIQUID_CLASSES.has(a.assetClass)) continue
    const v = a.currentValueBase
    if (v === undefined || !Number.isFinite(v)) continue
    total += v
    counted++
  }
  return counted > 0 ? total : undefined
}

/**
 * Months of runway = liquid buffer ÷ average monthly expenses. `undefined` when
 * either input is absent or expenses are ≤ 0 — never `Infinity`/`NaN`. This is a
 * *total-liquidity* reading (all liquid assets vs total spend), deliberately
 * distinct from the emergency-fund coverage (earmarked assets vs emergency need).
 */
export function runwayMonths(
  liquid: number | undefined,
  avgMonthlyExpenses: number | undefined,
): number | undefined {
  if (liquid === undefined || avgMonthlyExpenses === undefined || avgMonthlyExpenses <= 0) {
    return undefined
  }
  return liquid / avgMonthlyExpenses
}
