import type {
  AssetClass,
  BaseCurrency,
  CanonicalHolding,
  Currency,
  Source,
} from '../storage/holdings'
import type { DerivedRow } from '../lib/holdingsView'
import { formatDate, formatMoney, formatPercent, formatQuantity } from '../lib/format'
import { HoldingActionsMenu } from './HoldingActionsMenu'

/**
 * Per-row presentational primitives for the holdings table. Lives in its own
 * module so HoldingsTable.tsx can stay a thin shell (header + body map +
 * totals) and the heavy per-row JSX stays separable. Both desktop `<tr>` and
 * mobile `<article>` shapes ship from here.
 *
 * Re-uses (and re-exports) formatter helpers the totals row in
 * HoldingsTable.tsx also needs — keeps a single source of truth for `money`,
 * `profitColor`, etc.
 */

export const sourceLabels: Record<Source, string> = {
  vested: 'Vested',
  groww: 'Groww',
  manual: 'Manual',
}
export const marketLabels: Record<Currency, string> = {
  INR: 'IN',
  USD: 'US',
}
/** Market badges are intentionally neutral. Jade is reserved for gains and
 *  ember for losses; a market tag must not borrow either, or a green `IN`
 *  badge reads as a positive signal. The `IN`/`US` text and the market filter
 *  carry the distinction. */
export const marketBadge = 'text-bone-300 border-bone-100/20 bg-bone-100/[0.06]'
export const assetClassLabels: Record<AssetClass, string> = {
  equity: 'Equity',
  mf: 'MF',
  etf: 'ETF',
  invit: 'InvIT',
  other: 'Other',
}
export const baseSymbol: Record<BaseCurrency, string> = { INR: '₹', USD: '$' }

export type ProfitTone = 'gain' | 'loss' | 'flat'
export const profitColor: Record<ProfitTone, string> = {
  gain: 'text-jade-400',
  loss: 'text-ember-400',
  flat: 'text-bone-400',
}

export function toneOf(value: number | undefined): ProfitTone {
  if (value === undefined) return 'flat'
  if (value > 0) return 'gain'
  if (value < 0) return 'loss'
  return 'flat'
}

export function profitTone(row: DerivedRow): ProfitTone {
  return toneOf(row.profitPct ?? row.profitAbsBase)
}

/** Money-or-dash. The `—` is the honest render for an uncomputable figure
 *  (missing snapshot price, or FX not stamped) — never a 0. */
export function money(value: number | undefined, ccy: Currency | BaseCurrency): string {
  return value === undefined ? '—' : formatMoney(value, ccy)
}

export function Cell({
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

export function StaleMarker({ importedAt }: { importedAt: number }) {
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

function EditedMarker() {
  return (
    <span
      title="You've edited fields on this row. Future broker imports will keep your edits for those fields."
      aria-label="Edited — future broker imports preserve your edits on the changed fields"
      className="border border-tick-400/35 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-tick-400/80"
    >
      ✎ edited
    </span>
  )
}

function ClosedMarker() {
  return (
    <span
      aria-label="Closed position"
      className="border border-bone-100/20 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-bone-300"
    >
      closed
    </span>
  )
}

export type RowActions = {
  onEdit: (holding: CanonicalHolding) => void
  onMarkClosed: (holding: CanonicalHolding) => void
  onReopen: (holding: CanonicalHolding) => void
  onRevertOverrides: (holding: CanonicalHolding) => void
  onDelete: (holding: CanonicalHolding) => void
}

type RowProps = {
  row: DerivedRow
  baseCurrency: BaseCurrency
  actions: RowActions
}

function bindActions(holding: CanonicalHolding, actions: RowActions) {
  return {
    holding,
    onEdit: () => actions.onEdit(holding),
    onMarkClosed: () => actions.onMarkClosed(holding),
    onReopen: () => actions.onReopen(holding),
    onRevertOverrides: () => actions.onRevertOverrides(holding),
    onDelete: () => actions.onDelete(holding),
  }
}

/** Desktop `<tr>` for a single holding. Renders the same 9 data columns
 *  plus a 10th Actions column. */
export function HoldingRow({ row, baseCurrency, actions }: RowProps) {
  const h = row.holding
  const tone = profitTone(row)
  const closed = h.status === 'closed'
  const edited = (h.manualOverrides?.length ?? 0) > 0
  const menuProps = bindActions(h, actions)
  return (
    <tr
      key={`${h.source}-${h.sourceSymbol}`}
      className={`group border-b border-bone-100/5 transition last:border-b-0 hover:bg-ink-850 ${closed ? 'opacity-70' : ''}`}
    >
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="font-sans text-sm font-semibold tracking-tight text-bone-50">
            {h.name}
          </span>
          {edited && <EditedMarker />}
          {closed && <ClosedMarker />}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-[11px] text-bone-400">{h.sourceSymbol}</span>
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
      <td className={`px-4 py-4 text-right font-mono text-sm tabular-nums ${profitColor[tone]}`}>
        <div>{money(row.profitAbsBase, baseCurrency)}</div>
        <div className="text-[11px]">
          {row.profitPct === undefined ? '—' : formatPercent(row.profitPct)}
        </div>
      </td>
      <td className="px-4 py-4 font-sans text-xs text-bone-300">{sourceLabels[h.source]}</td>
      <td className="px-2 py-4 text-right">
        <HoldingActionsMenu {...menuProps} />
      </td>
    </tr>
  )
}

/** Mobile `<article>` card for a single holding. Stacks the same fields as
 *  the desktop row plus the source label, optimised for narrow viewports.
 *  The overflow menu sits in the top-right alongside the source label. */
export function HoldingCard({ row, baseCurrency, actions }: RowProps) {
  const h = row.holding
  const tone = profitTone(row)
  const closed = h.status === 'closed'
  const edited = (h.manualOverrides?.length ?? 0) > 0
  const menuProps = bindActions(h, actions)
  return (
    <article
      key={`${h.source}-${h.sourceSymbol}`}
      className={`bg-ink-900 px-5 py-5 ${closed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            <span className={`inline-flex items-center border px-1.5 py-0.5 ${marketBadge}`}>
              {marketLabels[h.currency]}
            </span>
            <span>{assetClassLabels[h.assetClass]}</span>
            {row.isStale && <StaleMarker importedAt={h.importedAt} />}
            {edited && <EditedMarker />}
            {closed && <ClosedMarker />}
          </div>
          <h3 className="mt-2 truncate font-sans text-base font-semibold tracking-tight text-bone-50">
            {h.name}
          </h3>
          <p className="mt-0.5 font-mono text-[11px] text-bone-400">{h.sourceSymbol}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-sans text-xs text-bone-300">{sourceLabels[h.source]}</span>
          <HoldingActionsMenu {...menuProps} />
        </div>
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
          <dt className="font-mono text-[9px] uppercase tracking-[0.18em] text-bone-400">Profit</dt>
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
}
