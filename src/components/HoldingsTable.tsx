import type { BaseCurrency } from '../storage/holdings'
import type { DerivedRow, Sort, SortKey } from '../lib/holdingsView'
import { formatPercent } from '../lib/format'
import {
  baseSymbol,
  Cell,
  HoldingCard,
  HoldingRow,
  money,
  profitColor,
  toneOf,
  type RowActions,
} from './HoldingRow'

type Props = {
  rows: DerivedRow[]
  baseCurrency: BaseCurrency
  sort: Sort
  onSort: (key: SortKey) => void
  actions: RowActions
}

type Column = { key: SortKey; label: string; numeric: boolean }

function columns(base: BaseCurrency): Column[] {
  return [
    { key: 'name', label: 'Instrument', numeric: false },
    { key: 'market', label: 'Mkt', numeric: false },
    { key: 'quantity', label: 'Qty', numeric: true },
    { key: 'avgBuyPrice', label: 'Avg buy', numeric: true },
    { key: 'currentPrice', label: 'Current price', numeric: true },
    { key: 'invested', label: `Invested ${baseSymbol[base]}`, numeric: true },
    { key: 'currentValue', label: `Value ${baseSymbol[base]}`, numeric: true },
    { key: 'profit', label: 'Profit', numeric: true },
    { key: 'broker', label: 'Broker', numeric: false },
  ]
}

/** Sum a derived figure across rows. `undefined` if any row's figure is
 *  uncomputable — a partial total would silently misrepresent the portfolio. */
function sumField(
  rows: DerivedRow[],
  pick: (r: DerivedRow) => number | undefined,
): number | undefined {
  let total = 0
  for (const r of rows) {
    const v = pick(r)
    if (v === undefined) return undefined
    total += v
  }
  return total
}

export function HoldingsTable({ rows, baseCurrency, sort, onSort, actions }: Props) {
  const cols = columns(baseCurrency)

  // Totals reflect the rows actually shown — they re-sum when a filter narrows
  // the set, so the footer always matches what's on screen.
  const totalInvested = sumField(rows, (r) => r.investedBase)
  const totalValue = sumField(rows, (r) => r.currentValueBase)
  const totalProfit = sumField(rows, (r) => r.profitAbsBase)
  const totalProfitPct =
    totalProfit === undefined || totalInvested === undefined || totalInvested <= 0
      ? undefined
      : totalProfit / totalInvested
  const totalTone = toneOf(totalProfit)
  const positionLabel = `${rows.length} ${rows.length === 1 ? 'position' : 'positions'}`

  return (
    <>
      {/* Desktop / tablet — full ledger table */}
      <section className="hidden overflow-x-auto border border-bone-100/10 bg-ink-900 md:block">
        <table className="min-w-full font-sans text-sm">
          <thead>
            <tr className="border-b border-bone-100/10 text-[10px]">
              {cols.map((col) => (
                <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
              ))}
              <th
                scope="col"
                aria-label="Row actions"
                className="px-2 py-3 text-right font-mono text-bone-400"
              >
                <span aria-hidden="true">⋯</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <HoldingRow
                key={`${row.holding.source}-${row.holding.sourceSymbol}`}
                row={row}
                baseCurrency={baseCurrency}
                actions={actions}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-bone-100/15 bg-ink-850">
              <td className="px-4 py-3.5" colSpan={5}>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-300">
                  Total · {positionLabel}
                </span>
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-sm text-bone-200 tabular-nums">
                {money(totalInvested, baseCurrency)}
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-sm font-semibold text-bone-50 tabular-nums">
                {money(totalValue, baseCurrency)}
              </td>
              <td
                className={`px-4 py-3.5 text-right font-mono text-sm tabular-nums ${profitColor[totalTone]}`}
              >
                <div>{money(totalProfit, baseCurrency)}</div>
                <div className="text-[11px]">
                  {totalProfitPct === undefined ? '—' : formatPercent(totalProfitPct)}
                </div>
              </td>
              <td className="px-4 py-3.5" />
              <td className="px-2 py-3.5" />
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Mobile — stacked cards, totals first */}
      <section className="grid grid-cols-1 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 md:hidden">
        <article className="bg-ink-850 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-300">
            Total · {positionLabel}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <Cell
              label={`Invested ${baseSymbol[baseCurrency]}`}
              value={money(totalInvested, baseCurrency)}
            />
            <Cell
              label={`Value ${baseSymbol[baseCurrency]}`}
              value={money(totalValue, baseCurrency)}
              emphasis
            />
            <div>
              <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-bone-400">
                Profit
              </dt>
              <dd className={`mt-1 font-mono tabular-nums ${profitColor[totalTone]}`}>
                <div className="text-sm">{money(totalProfit, baseCurrency)}</div>
                <div className="text-[11px]">
                  {totalProfitPct === undefined ? '—' : formatPercent(totalProfitPct)}
                </div>
              </dd>
            </div>
          </dl>
        </article>
        {rows.map((row) => (
          <HoldingCard
            key={`${row.holding.source}-${row.holding.sourceSymbol}`}
            row={row}
            baseCurrency={baseCurrency}
            actions={actions}
          />
        ))}
      </section>
    </>
  )
}

function SortHeader({
  col,
  sort,
  onSort,
}: {
  col: Column
  sort: Sort
  onSort: (key: SortKey) => void
}) {
  const active = sort.key === col.key
  return (
    // `aria-sort` belongs on the column-header cell, not the button inside it
    // (WCAG / ARIA): screen readers query the `th` for sort state.
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 font-medium ${col.numeric ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(col.key)}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.18em] transition ${
          active ? 'text-act-400' : 'text-bone-400 hover:text-bone-100'
        }`}
      >
        {col.label}
        <span className={`text-[8px] ${active ? '' : 'text-bone-400/40'}`}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}
