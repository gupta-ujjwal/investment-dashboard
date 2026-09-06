import { useMemo } from 'react'
import type { ManualAsset } from '../storage/assets'
import type { BudgetMonth } from '../storage/budget'
import type { CanonicalHolding } from '../storage/holdings'
import type { Settings } from '../storage/settings'
import { buildActionRail } from '../lib/actionRail'
import { ActionCard } from './ActionCard'
import { ChartErrorBoundary } from './charts/ChartErrorBoundary'

type Props = {
  holdings: readonly CanonicalHolding[]
  assets: readonly ManualAsset[]
  budgetMonths: readonly BudgetMonth[]
  settings: Settings
  now: number
}

/**
 * The homepage action rail — up to 4 things worth a look, folded from
 * holdings/assets/budget/settings by `buildActionRail` (pure, no I/O). Three
 * states: cold-start (nothing imported yet — defensive; `OverviewRoute`
 * itself renders a full-page empty state before this ever mounts, but the
 * component doesn't assume a caller-enforced invariant), all-clear (rules
 * evaluated, nothing fired), and populated. Wrapped in `ChartErrorBoundary`
 * so a bad fold degrades to a placeholder instead of taking the homepage
 * down with it — the same per-widget bulkhead every other Overview card and
 * chart already gets.
 */
export function ActionRail({ holdings, assets, budgetMonths, settings, now }: Props) {
  const items = useMemo(
    () => buildActionRail({ holdings, assets, budgetMonths, settings, now }),
    [holdings, assets, budgetMonths, settings, now],
  )

  const coldStart = holdings.length === 0 && assets.length === 0

  return (
    <ChartErrorBoundary title="Action rail">
      {coldStart ? (
        <p className="rounded-2xl border border-dashed border-bone-100/15 bg-ink-900 px-5 py-4 font-sans text-xs text-bone-400">
          Add holdings or assets to get personalized guidance here.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-bone-100/10 bg-ink-900 px-5 py-4 font-sans text-xs text-bone-400">
          Nothing needs your attention right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <ActionCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </ChartErrorBoundary>
  )
}
