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
      <table className="w-full border-collapse text-[0.95rem]">
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
          <tr className="border-y-[3px] border-double border-ink text-ink">
            <th scope="col" className="px-2 py-3 text-left smallcaps text-[0.65rem]">
              Src
            </th>
            <th scope="col" className="px-2 py-3 text-left smallcaps text-[0.65rem]">
              Holding
            </th>
            <th scope="col" className="px-2 py-3 text-left smallcaps text-[0.65rem]">
              Symbol
            </th>
            <th scope="col" className="px-2 py-3 text-right smallcaps text-[0.65rem]">
              Qty
            </th>
            <th
              scope="col"
              className="hidden px-2 py-3 text-left smallcaps text-[0.65rem] sm:table-cell"
            >
              Class
            </th>
            <th scope="col" className="px-1 py-3 text-right smallcaps text-[0.65rem]" />
            <th scope="col" className="px-2 py-3 text-right smallcaps text-[0.65rem]">
              Avg cost
            </th>
            <th
              scope="col"
              className="hidden px-2 py-3 text-right smallcaps text-[0.65rem] sm:table-cell"
            >
              Ccy
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h, i) => (
            <tr
              key={`${h.source}-${h.sourceSymbol}`}
              className="row-hover reveal border-b border-rule align-baseline"
              style={{ '--i': i + 1 } as React.CSSProperties}
            >
              <td className="border-r border-rule px-2 py-3 text-center">
                <abbr
                  title={sourceLabel[h.source]}
                  className="font-display text-base font-medium text-oxblood no-underline"
                >
                  {sourceInitial[h.source]}
                </abbr>
              </td>
              <td className="px-2 py-3 font-medium text-ink">
                <span className="font-display text-[1.05rem] leading-snug">{h.name}</span>
              </td>
              <td className="border-l border-rule px-2 py-3 font-mono text-xs text-ink-muted">
                {h.sourceSymbol}
              </td>
              <td className="border-l border-rule px-2 py-3 text-right font-mono text-sm text-ink">
                {formatQuantity(h.quantity)}
              </td>
              <td className="hidden border-l border-rule px-2 py-3 text-ink-muted text-xs sm:table-cell">
                <span className="smallcaps text-[0.65rem]">
                  {assetClassLabels[h.assetClass]}
                </span>
              </td>
              <td className="border-l border-rule px-1 py-3 text-right font-mono text-sm text-ink-muted">
                {currencyGlyph(h.currency)}
              </td>
              <td className="px-2 py-3 text-right font-mono text-sm text-ink">
                {formatAmount(h.avgBuyPrice, h.currency)}
              </td>
              <td className="hidden border-l border-rule px-2 py-3 text-right text-ink-muted sm:table-cell">
                <span className="smallcaps text-[0.65rem]">{h.currency}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
