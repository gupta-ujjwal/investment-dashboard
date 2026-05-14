import type { AssetClass, CanonicalHolding, Currency, Source } from '../storage/holdings'
import { formatMoney, formatQuantity } from '../lib/format'

type Props = {
  holdings: CanonicalHolding[]
}

const sourceLabels: Record<Source, string> = {
  vested: 'Vested',
  groww: 'Groww',
}
const marketLabels: Record<Currency, string> = {
  INR: 'IN',
  USD: 'US',
}
const marketAccent: Record<Currency, string> = {
  INR: 'text-jade-400 border-jade-400/40 bg-jade-900/40',
  USD: 'text-tick-400 border-tick-400/40 bg-tick-900/40',
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

  if (sorted.length === 0) {
    return (
      <div className="border border-dashed border-bone-100/15 bg-ink-900 p-12 text-center font-sans text-sm text-bone-400">
        No positions yet.
      </div>
    )
  }

  return (
    <>
      {/* Desktop / tablet — full ledger table */}
      <section className="hidden overflow-hidden border border-bone-100/10 bg-ink-900 md:block">
        <table className="min-w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-bone-100/10 text-left text-[10px] uppercase tracking-[0.18em] text-bone-400">
              <th scope="col" className="w-12 px-4 py-3 font-medium">№</th>
              <th scope="col" className="px-4 py-3 font-medium">Instrument</th>
              <th scope="col" className="px-4 py-3 font-medium">Mkt</th>
              <th scope="col" className="px-4 py-3 font-medium">Class</th>
              <th scope="col" className="px-4 py-3 font-medium">Broker</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Quantity</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Avg buy</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Cost basis</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h, i) => {
              const cost = h.quantity * h.avgBuyPrice
              return (
                <tr
                  key={`${h.source}-${h.sourceSymbol}`}
                  className="group border-b border-bone-100/5 transition last:border-b-0 hover:bg-ink-850"
                >
                  <td className="px-4 py-4 font-mono text-[11px] text-bone-400 tabular-nums">
                    {String(i + 1).padStart(3, '0')}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-sans text-sm font-semibold tracking-tight text-bone-50">
                      {h.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-bone-400">
                      {h.sourceSymbol}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center rounded-none border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${marketAccent[h.currency]}`}
                    >
                      {marketLabels[h.currency]}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-bone-300">
                    {assetClassLabels[h.assetClass]}
                  </td>
                  <td className="px-4 py-4 font-sans text-xs text-bone-300">
                    {sourceLabels[h.source]}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-100 tabular-nums">
                    {formatQuantity(h.quantity)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-200 tabular-nums">
                    {formatMoney(h.avgBuyPrice, h.currency)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-50 tabular-nums">
                    {formatMoney(cost, h.currency)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* Mobile — stacked cards */}
      <section className="grid grid-cols-1 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 md:hidden">
        {sorted.map((h, i) => {
          const cost = h.quantity * h.avgBuyPrice
          return (
            <article key={`${h.source}-${h.sourceSymbol}`} className="bg-ink-900 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
                    <span>№ {String(i + 1).padStart(3, '0')}</span>
                    <span
                      className={`inline-flex items-center rounded-none border px-1.5 py-0.5 ${marketAccent[h.currency]}`}
                    >
                      {marketLabels[h.currency]}
                    </span>
                    <span>{assetClassLabels[h.assetClass]}</span>
                  </div>
                  <h3 className="mt-2 truncate font-sans text-base font-semibold tracking-tight text-bone-50">
                    {h.name}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-bone-400">{h.sourceSymbol}</p>
                </div>
                <span className="font-sans text-xs text-bone-300">
                  {sourceLabels[h.source]}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-bone-100/10 pt-3">
                <Cell label="Qty" value={formatQuantity(h.quantity)} />
                <Cell label="Avg buy" value={formatMoney(h.avgBuyPrice, h.currency)} />
                <Cell label="Cost" value={formatMoney(cost, h.currency)} emphasis />
              </dl>
            </article>
          )
        })}
      </section>
    </>
  )
}

function Cell({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-bone-400">{label}</dt>
      <dd
        className={`mt-1 font-mono text-sm tabular-nums ${emphasis ? 'text-bone-50' : 'text-bone-200'}`}
      >
        {value}
      </dd>
    </div>
  )
}
