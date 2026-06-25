import type { BaseCurrency } from '../storage/holdings'
import type { ManualAsset } from '../storage/assets'
import { MANUAL_ASSET_CLASS_LABELS } from '../lib/netWorth'
import { formatMoney, formatPercent } from '../lib/format'

type Props = {
  assets: ManualAsset[]
  baseCurrency: BaseCurrency
  /** Newest FX rate timestamp; an older non-base stamp is flagged stale. */
  lastFxAsOf: number | null
  onEdit: (asset: ManualAsset) => void
  onDelete: (asset: ManualAsset) => void
}

function isStale(asset: ManualAsset, base: BaseCurrency, lastFxAsOf: number | null): boolean {
  if (asset.currency === base) return false
  if (asset.currentValueBase === undefined || asset.fxAsOf === undefined) return true
  return lastFxAsOf !== null && asset.fxAsOf < lastFxAsOf
}

function profitPct(asset: ManualAsset): number | undefined {
  if (asset.investedAmount === undefined || asset.investedAmount <= 0) return undefined
  return (asset.currentValue - asset.investedAmount) / asset.investedAmount
}

export function AssetsTable({ assets, baseCurrency, lastFxAsOf, onEdit, onDelete }: Props) {
  return (
    <div className="overflow-hidden border border-bone-100/10">
      {/* Desktop table */}
      <table className="hidden w-full border-collapse md:table">
        <thead>
          <tr className="border-b border-bone-100/10 bg-ink-850 text-left">
            <Th>Asset</Th>
            <Th>Class</Th>
            <Th className="text-right">Invested</Th>
            <Th className="text-right">Current value</Th>
            <Th className="text-right">Return</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => {
            const stale = isStale(a, baseCurrency, lastFxAsOf)
            const pct = profitPct(a)
            return (
              <tr key={a.id} className="border-b border-bone-100/5 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-sans text-sm text-bone-50">{a.name}</div>
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
                    {a.currency}
                    {a.emergencyFund && <span className="text-tick-400">emergency</span>}
                    {stale && (
                      <span className="text-ember-400" title="FX rate is stale — refresh in Settings">
                        stale fx
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-sans text-sm text-bone-300">
                  {MANUAL_ASSET_CLASS_LABELS[a.assetClass]}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-bone-300">
                  {a.investedAmount === undefined ? '—' : formatMoney(a.investedAmount, a.currency)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-bone-50">
                  {formatMoney(a.currentValue, a.currency)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono text-sm tabular-nums ${pctTone(pct)}`}
                >
                  {pct === undefined ? '—' : formatPercent(pct)}
                </td>
                <td className="px-4 py-3 text-right">
                  <RowActions asset={a} onEdit={onEdit} onDelete={onDelete} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul className="divide-y divide-bone-100/5 md:hidden">
        {assets.map((a) => {
          const stale = isStale(a, baseCurrency, lastFxAsOf)
          const pct = profitPct(a)
          return (
            <li key={a.id} className="space-y-2 bg-ink-900 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-sans text-sm text-bone-50">{a.name}</div>
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
                    {MANUAL_ASSET_CLASS_LABELS[a.assetClass]} · {a.currency}
                    {a.emergencyFund && <span className="text-tick-400">emergency</span>}
                    {stale && <span className="text-ember-400">stale fx</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums text-bone-50">
                    {formatMoney(a.currentValue, a.currency)}
                  </div>
                  <div className={`font-mono text-[11px] tabular-nums ${pctTone(pct)}`}>
                    {pct === undefined ? '—' : formatPercent(pct)}
                  </div>
                </div>
              </div>
              <RowActions asset={a} onEdit={onEdit} onDelete={onDelete} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function pctTone(pct: number | undefined): string {
  if (pct === undefined) return 'text-bone-500'
  return pct >= 0 ? 'text-jade-400' : 'text-ember-400'
}

function RowActions({
  asset,
  onEdit,
  onDelete,
}: {
  asset: ManualAsset
  onEdit: (a: ManualAsset) => void
  onDelete: (a: ManualAsset) => void
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onEdit(asset)}
        className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onDelete(asset)}
        className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-ember-400 hover:text-ember-400"
      >
        Delete
      </button>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-bone-400 ${className}`}
    >
      {children}
    </th>
  )
}
