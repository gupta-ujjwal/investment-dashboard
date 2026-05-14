import type { AssetClass, CanonicalHolding, Source } from '../../storage/holdings'
import { formatMoney, formatQuantity } from '../../lib/format'

type Props = {
  holdings: CanonicalHolding[]
}

const sourceClasses: Record<Source, string> = {
  vested: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  groww: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
}
const sourceLabels: Record<Source, string> = {
  vested: 'Vested',
  groww: 'Groww',
}

const assetClassLabels: Record<AssetClass, string> = {
  equity: 'Equity',
  mf: 'MF',
  etf: 'ETF',
  invit: 'InvIT',
  other: 'Other',
}

export function HoldingsTable({ holdings }: Props) {
  const sorted = [...holdings].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Name</th>
            <th scope="col" className="px-4 py-3">Source</th>
            <th scope="col" className="px-4 py-3">Symbol</th>
            <th scope="col" className="px-4 py-3 text-right">Quantity</th>
            <th scope="col" className="px-4 py-3 text-right">Avg buy price</th>
            <th scope="col" className="px-4 py-3">Asset class</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((h) => (
            <tr key={`${h.source}-${h.sourceSymbol}`} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{h.name}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${sourceClasses[h.source]}`}
                >
                  {sourceLabels[h.source]}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{h.sourceSymbol}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(h.quantity)}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(h.avgBuyPrice, h.currency)}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {assetClassLabels[h.assetClass]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
