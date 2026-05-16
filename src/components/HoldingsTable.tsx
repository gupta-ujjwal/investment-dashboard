import type { AssetClass, BaseCurrency, Currency, Source } from '../storage/holdings'
import type { DerivedRow, Sort, SortKey } from '../lib/holdingsView'
import { formatDate, formatMoney, formatPercent, formatQuantity } from '../lib/format'

type Props = {
  rows: DerivedRow[]
  baseCurrency: BaseCurrency
  sort: Sort
  onSort: (key: SortKey) => void
}

const sourceLabels: Record<Source, string> = {
  vested: 'Vested',
  groww: 'Groww',
}
const marketLabels: Record<Currency, string> = {
  INR: 'IN',
  USD: 'US',
}
/** Market badges are intentionally neutral. Jade is reserved for gains and
 *  ember for losses; a market tag must not borrow either, or a green `IN`
 *  badge reads as a positive signal. The `IN`/`US` text and the market filter
 *  carry the distinction. */
const marketBadge = 'text-bone-300 border-bone-100/20 bg-bone-100/[0.06]'
const assetClassLabels: Record<AssetClass, string> = {
  equity: 'Equity',
  mf: 'MF',
  etf: 'ETF',
  invit: 'InvIT',
  other: 'Other',
}
const baseSymbol: Record<BaseCurrency, string> = { INR: '₹', USD: '$' }

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

type ProfitTone = 'gain' | 'loss' | 'flat'
const profitColor: Record<ProfitTone, string> = {
  gain: 'text-jade-400',
  loss: 'text-ember-400',
  flat: 'text-bone-400',
}

function profitTone(row: DerivedRow): ProfitTone {
  return toneOf(row.profitPct ?? row.profitAbsBase)
}

/** Money-or-dash. The `—` is the honest render for an uncomputable figure
 *  (missing snapshot price, or FX not stamped) — never a 0. */
function money(value: number | undefined, ccy: Currency | BaseCurrency): string {
  return value === undefined ? '—' : formatMoney(value, ccy)
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

function toneOf(value: number | undefined): ProfitTone {
  if (value === undefined) return 'flat'
  if (value > 0) return 'gain'
  if (value < 0) return 'loss'
  return 'flat'
}

export function HoldingsTable({ rows, baseCurrency, sort, onSort }: Props) {
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const h = row.holding
              const tone = profitTone(row)
              return (
                <tr
                  key={`${h.source}-${h.sourceSymbol}`}
                  className="group border-b border-bone-100/5 transition last:border-b-0 hover:bg-ink-850"
                >
                  <td className="px-4 py-4">
                    <div className="font-sans text-sm font-semibold tracking-tight text-bone-50">
                      {h.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-[11px] text-bone-400">
                        {h.sourceSymbol}
                      </span>
                      <span className="border border-bone-100/10 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-bone-400">
                        {assetClassLabels[h.assetClass]}
                      </span>
                      {row.isStale && <StaleMarker importedAt={h.importedAt} />}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${marketBadge}`}
                    >
                      {marketLabels[h.currency]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-100 tabular-nums">
                    {formatQuantity(h.quantity)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-200 tabular-nums">
                    {money(h.avgBuyPrice, h.currency)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-200 tabular-nums">
                    {money(h.currentPrice, h.currency)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-300 tabular-nums">
                    {money(row.investedBase, baseCurrency)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-sm text-bone-50 tabular-nums">
                    {money(row.currentValueBase, baseCurrency)}
                  </td>
                  <td
                    className={`px-4 py-4 text-right font-mono text-sm tabular-nums ${profitColor[tone]}`}
                  >
                    <div>{money(row.profitAbsBase, baseCurrency)}</div>
                    <div className="text-[11px]">
                      {row.profitPct === undefined ? '—' : formatPercent(row.profitPct)}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-sans text-xs text-bone-300">
                    {sourceLabels[h.source]}
                  </td>
                </tr>
              )
            })}
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
        {rows.map((row) => {
          const h = row.holding
          const tone = profitTone(row)
          return (
            <article key={`${h.source}-${h.sourceSymbol}`} className="bg-ink-900 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
                    <span
                      className={`inline-flex items-center border px-1.5 py-0.5 ${marketBadge}`}
                    >
                      {marketLabels[h.currency]}
                    </span>
                    <span>{assetClassLabels[h.assetClass]}</span>
                    {row.isStale && <StaleMarker importedAt={h.importedAt} />}
                  </div>
                  <h3 className="mt-2 truncate font-sans text-base font-semibold tracking-tight text-bone-50">
                    {h.name}
                  </h3>
                  <p className="mt-0.5 font-mono text-[11px] text-bone-400">{h.sourceSymbol}</p>
                </div>
                <span className="font-sans text-xs text-bone-300">{sourceLabels[h.source]}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-bone-100/10 pt-3">
                <Cell label="Qty" value={formatQuantity(h.quantity)} />
                <Cell label="Avg buy" value={money(h.avgBuyPrice, h.currency)} />
                <Cell label="Current" value={money(h.currentPrice, h.currency)} />
                <Cell
                  label={`Invested ${baseSymbol[baseCurrency]}`}
                  value={money(row.investedBase, baseCurrency)}
                />
                <Cell
                  label={`Value ${baseSymbol[baseCurrency]}`}
                  value={money(row.currentValueBase, baseCurrency)}
                  emphasis
                />
                <div>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-bone-400">
                    Profit
                  </dt>
                  <dd className={`mt-1 font-mono tabular-nums ${profitColor[tone]}`}>
                    <div className="text-sm">{money(row.profitAbsBase, baseCurrency)}</div>
                    <div className="text-[11px]">
                      {row.profitPct === undefined ? '—' : formatPercent(row.profitPct)}
                    </div>
                  </dd>
                </div>
              </dl>
            </article>
          )
        })}
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
          active ? 'text-tick-400' : 'text-bone-400 hover:text-bone-100'
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

function StaleMarker({ importedAt }: { importedAt: number }) {
  const detail = `Priced as of ${formatDate(importedAt)} — older than your latest import`
  return (
    // `aria-label` carries the full detail to screen readers (and keyboard
    // users), since the native `title` tooltip is mouse-hover-only.
    <span
      title={detail}
      aria-label={`Stale price. ${detail}`}
      className="border border-ember-400/25 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ember-400/70"
    >
      stale
    </span>
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
