import type { AssetClass, CanonicalHolding, Source } from '../../storage/holdings'
import { currencyGlyph, formatAmount, formatQuantity } from '../../lib/format'

type Props = {
  holdings: CanonicalHolding[]
}

const sourceInitial: Record<Source, string> = {
  vested: 'V',
  groww: 'G',
}
const sourceLabel: Record<Source, string> = {
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
  if (sorted.length === 0) return null

  return (
    <div className="tabular">
      <table className="w-full border-collapse text-base">
        <colgroup>
          <col style={{ width: '3rem' }} />
          <col />
          <col style={{ width: '8rem' }} />
          <col style={{ width: '6rem' }} />
          <col style={{ width: '6rem' }} />
          <col style={{ width: '1.5rem' }} />
          <col style={{ width: '8rem' }} />
          <col style={{ width: '4rem' }} />
        </colgroup>
        <thead>
          <tr className="border-y-[3px] border-double border-rule-strong text-ink-muted">
            <th scope="col" className="eyebrow px-2 py-3 text-left">
              Src
            </th>
            <th scope="col" className="eyebrow px-2 py-3 text-left">
              Holding
            </th>
            <th scope="col" className="eyebrow px-2 py-3 text-left">
              Symbol
            </th>
            <th scope="col" className="eyebrow px-2 py-3 text-right">
              Qty
            </th>
            <th scope="col" className="eyebrow hidden px-2 py-3 text-left sm:table-cell">
              Class
            </th>
            <th scope="col" className="eyebrow px-1 py-3 text-right" />
            <th scope="col" className="eyebrow px-2 py-3 text-right">
              Avg cost
            </th>
            <th scope="col" className="eyebrow hidden px-2 py-3 text-right sm:table-cell">
              Ccy
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h, i) => (
            <tr
              key={`${h.source}-${h.sourceSymbol}`}
              className="row-hover reveal border-b border-rule align-baseline transition-colors"
              style={{ '--i': i + 1 } as React.CSSProperties}
            >
              <td className="border-r border-rule px-2 py-4 text-center">
                <abbr
                  title={sourceLabel[h.source]}
                  className="font-display text-lg font-medium text-brass no-underline"
                >
                  {sourceInitial[h.source]}
                </abbr>
              </td>
              <td className="px-2 py-4 text-ink-muted">
                <span className="font-display text-xl leading-snug text-ink">{h.name}</span>
              </td>
              <td className="border-l border-rule px-2 py-4 font-mono text-xs text-ink-soft">
                {h.sourceSymbol}
              </td>
              <td className="border-l border-rule px-2 py-4 text-right font-mono text-sm text-ink-muted">
                {formatQuantity(h.quantity)}
              </td>
              <td className="hidden border-l border-rule px-2 py-4 sm:table-cell">
                <span className="eyebrow">{assetClassLabels[h.assetClass]}</span>
              </td>
              <td className="border-l border-rule px-1 py-4 text-right font-mono text-sm text-ink-soft">
                {currencyGlyph(h.currency)}
              </td>
              <td className="px-2 py-4 text-right font-mono text-sm text-ink">
                {formatAmount(h.avgBuyPrice, h.currency)}
              </td>
              <td className="hidden border-l border-rule px-2 py-4 text-right sm:table-cell">
                <span className="eyebrow">{h.currency}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
