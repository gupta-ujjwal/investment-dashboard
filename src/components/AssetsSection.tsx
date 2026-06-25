import { useCallback, useState } from 'react'
import { useFetcher } from 'react-router-dom'
import type { BaseCurrency } from '../storage/holdings'
import type { ManualAsset } from '../storage/assets'
import { netWorthTotals, buildPositions, staleAssetCount } from '../lib/netWorth'
import { formatMoney } from '../lib/format'
import { AssetsTable } from './AssetsTable'
import { AssetForm } from './AssetForm'

type Props = {
  assets: ManualAsset[]
  baseCurrency: BaseCurrency
  lastFxAsOf: number | null
}

/**
 * The manual-assets management surface on the Holdings page: a header with the
 * assets' total value, an add button, the table, and the add/edit modals.
 * Delete posts to `holdingsAction` (intent `deleteAsset`) via a fetcher; the
 * route loader revalidates automatically. Kept as its own component so the
 * Holdings route doesn't balloon.
 */
export function AssetsSection({ assets, baseCurrency, lastFxAsOf }: Props) {
  const fetcher = useFetcher()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<ManualAsset | null>(null)

  const onDelete = useCallback(
    (asset: ManualAsset) => {
      // Native confirm keeps the blast-radius guard simple for a manual,
      // low-frequency action — assets are few and re-addable.
      if (!window.confirm(`Delete asset "${asset.name}"? This cannot be undone.`)) return
      const formData = new FormData()
      formData.set('intent', 'deleteAsset')
      formData.set('id', asset.id)
      fetcher.submit(formData, { method: 'post', action: '/holdings' })
    },
    [fetcher],
  )

  // Assets-only total (base currency), partial-aware: show the known subtotal
  // and flag when some asset value couldn't be based.
  const totals = netWorthTotals(buildPositions([], assets))
  const staleCount = staleAssetCount(assets, baseCurrency, lastFxAsOf)

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 border-t border-bone-100/10 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-sans text-xl font-semibold tracking-tight text-bone-50">
            Other assets
          </h2>
          <p className="font-sans text-sm text-bone-400">
            {assets.length === 0
              ? 'Crypto, gold, FDs, NPS, cash — tracked by value'
              : assetsCaption(totals.knownCurrentValue, totals.excludedCount, baseCurrency, staleCount)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex w-fit items-center gap-2 border border-tick-400 bg-tick-400/10 px-3 py-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-tick-400 transition hover:bg-tick-400 hover:text-ink-950"
        >
          + Add asset
        </button>
      </div>

      {assets.length === 0 ? (
        <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-10 text-center">
          <p className="font-sans text-sm text-bone-300">
            No manual assets yet. Add crypto, gold, fixed deposits, NPS, or cash to
            see your full net worth.
          </p>
        </div>
      ) : (
        <AssetsTable
          assets={assets}
          baseCurrency={baseCurrency}
          lastFxAsOf={lastFxAsOf}
          onEdit={(a) => setEditing(a)}
          onDelete={onDelete}
        />
      )}

      <AssetForm open={addOpen} mode="add" onClose={() => setAddOpen(false)} />
      <AssetForm
        open={editing !== null}
        mode="edit"
        asset={editing ?? undefined}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}

function assetsCaption(
  known: number,
  excluded: number,
  base: BaseCurrency,
  stale: number,
): string {
  const parts = [`${formatMoney(known, base)} total`]
  if (excluded > 0) parts.push(`${excluded} not valued`)
  if (stale > 0) parts.push(`${stale} stale FX`)
  return parts.join(' · ')
}
