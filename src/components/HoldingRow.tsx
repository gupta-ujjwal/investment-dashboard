import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router-dom'
import type {
  AssetClass,
  BaseCurrency,
  CanonicalHolding,
  Currency,
  Source,
} from '../storage/holdings'
import type { RiskBand } from '../storage/assets'
import type { DerivedRow } from '../lib/holdingsView'
import { formatDate, formatMoney, formatPercent, formatQuantity } from '../lib/format'
import type { HoldingActionResult } from './HoldingForm'
import { HoldingActionsMenu } from './HoldingActionsMenu'

/**
 * Per-row presentational primitives for the holdings table.
 *
 * Desktop `<tr>` (HoldingRow) flips into an inline-cell edit mode when the
 * user picks Edit from its overflow menu — name / quantity / avgBuyPrice /
 * currentPrice / assetClass cells turn into inputs, Save/Cancel replace the
 * ⋯ menu, and Save fires the same holdingsAction `update` intent the modal
 * uses. Mobile `<article>` (HoldingCard) keeps the modal-edit affordance —
 * inline-cell editing on a 375px card is more error-prone than ergonomic.
 *
 * Re-exports the formatter helpers HoldingsTable.tsx also needs — single
 * source of truth for `money`, `profitColor`, etc.
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
 *  badge reads as a positive signal. */
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

/**
 * #3: prices are dated broker-export snapshots, so a row imported before your
 * newest import genuinely carries an older price (dsl.md R8 — computation
 * unchanged). The old "STALE" badge read as "something is wrong" and, because
 * importing two markets on different days is the normal case, painted half the
 * portfolio red. Reframed to state the fact — the snapshot's as-of date — in a
 * muted tone: informative, still a visible affordance (it only renders past the
 * R8 newest-import threshold), but not alarming.
 */
export function AsOfMarker({ importedAt }: { importedAt: number }) {
  const detail = `Priced as of ${formatDate(importedAt)} — an older snapshot than your latest import`
  return (
    <span
      title={detail}
      aria-label={detail}
      className="border border-bone-100/15 px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-bone-400"
    >
      as of {formatDate(importedAt)}
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
  /** Mobile-only: open the modal in edit mode. Desktop's inline-edit lives
   *  inside HoldingRow itself, so the parent doesn't drive it. */
  onEditModal: (holding: CanonicalHolding) => void
  onMarkClosed: (holding: CanonicalHolding) => void
  onReopen: (holding: CanonicalHolding) => void
  onRevertOverrides: (holding: CanonicalHolding) => void
  /** Set the risk-band override (#2), or clear it (Auto → derived) with
   *  `undefined`. */
  onSetRiskBand: (holding: CanonicalHolding, band: RiskBand | undefined) => void
  onDelete: (holding: CanonicalHolding) => void
  /** Called after a successful inline-edit save with a snapshot of the
   *  pre-edit row, so the parent can pop an undo toast (Reliability Tenet 3
   *  applied to numeric edits — fat-finger protection). */
  onEditSaved: (snapshot: CanonicalHolding) => void
}

type RowProps = {
  row: DerivedRow
  baseCurrency: BaseCurrency
  actions: RowActions
}

/** Desktop `<tr>` for a single holding. Flips into inline-edit when the
 *  user clicks Edit from its overflow menu. */
export function HoldingRow({ row, baseCurrency, actions }: RowProps) {
  const h = row.holding
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <InlineEditRow
        holding={h}
        onExit={() => setEditing(false)}
        onSaved={actions.onEditSaved}
      />
    )
  }
  const tone = profitTone(row)
  const closed = h.status === 'closed'
  const edited = (h.manualOverrides?.length ?? 0) > 0
  return (
    <tr
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
          {row.isStale && <AsOfMarker importedAt={h.importedAt} />}
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
        <HoldingActionsMenu
          holding={h}
          onEdit={() => setEditing(true)}
          onMarkClosed={() => actions.onMarkClosed(h)}
          onReopen={() => actions.onReopen(h)}
          onRevertOverrides={() => actions.onRevertOverrides(h)}
          onSetRiskBand={(band) => actions.onSetRiskBand(h, band)}
          onDelete={() => actions.onDelete(h)}
        />
      </td>
    </tr>
  )
}

type InlineEditProps = {
  holding: CanonicalHolding
  onExit: () => void
  onSaved: (snapshot: CanonicalHolding) => void
}

/** Desktop inline-cell edit row. Renders inputs in place of the editable
 *  cells (name, quantity, avg buy, current price, asset class). market /
 *  currency / source / broker stay frozen — they're identity-shape and the
 *  modal-edit path is the same. Save fires the same `update` action intent
 *  the modal uses; on success, calls `onSaved` with the pre-edit snapshot
 *  so the parent can pop an undo toast. */
function InlineEditRow({ holding, onExit, onSaved }: InlineEditProps) {
  const fetcher = useFetcher<HoldingActionResult>()
  const submitting = fetcher.state !== 'idle'
  const errors = fetcher.data && !fetcher.data.ok ? fetcher.data.fieldErrors ?? {} : {}

  // Close + raise the undo toast once the action lands.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok === true) {
      onSaved(holding)
      onExit()
    }
  }, [fetcher.state, fetcher.data, holding, onSaved, onExit])

  return (
    <tr className="border-b border-tick-400/40 bg-tick-400/[0.04]">
      <td colSpan={10} className="px-3 py-3">
        <fetcher.Form
          method="post"
          action="/equity"
          className="grid items-center gap-2 sm:grid-cols-[2.2fr_0.6fr_0.9fr_1fr_1fr_1.1fr_auto]"
        >
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="source" value={holding.source} />
          <input type="hidden" name="sourceSymbol" value={holding.sourceSymbol} />
          <input type="hidden" name="originalSourceSymbol" value={holding.sourceSymbol} />
          <input type="hidden" name="currency" value={holding.currency} />
          <input type="hidden" name="market" value={holding.currency} />

          <NumberOrTextField
            type="text"
            name="name"
            defaultValue={holding.name}
            error={errors.name}
            label="Name"
            autoFocus
          />
          <InlineLabel value={marketLabels[holding.currency]} sub="Market" />
          <NumberOrTextField
            type="text"
            inputMode="decimal"
            name="quantity"
            defaultValue={String(holding.quantity)}
            error={errors.quantity}
            label="Qty"
            align="right"
          />
          <NumberOrTextField
            type="text"
            inputMode="decimal"
            name="avgBuyPrice"
            defaultValue={String(holding.avgBuyPrice)}
            error={errors.avgBuyPrice}
            label="Avg buy"
            align="right"
          />
          <NumberOrTextField
            type="text"
            inputMode="decimal"
            name="currentPrice"
            defaultValue={holding.currentPrice !== undefined ? String(holding.currentPrice) : ''}
            error={errors.currentPrice}
            label={`Current (${baseSymbol[holding.currency]})`}
            align="right"
            optional
          />
          <AssetClassField defaultValue={holding.assetClass} />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onExit}
              disabled={submitting}
              className="border border-bone-100/15 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-bone-100/40 hover:text-bone-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="border border-tick-400 bg-tick-400 px-4 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>

          {fetcher.data && !fetcher.data.ok && !fetcher.data.fieldErrors && (
            <div role="alert" className="col-span-full border border-ember-400/40 bg-ember-900/30 p-2 font-sans text-xs text-ember-300">
              {fetcher.data.error}
            </div>
          )}
        </fetcher.Form>
      </td>
    </tr>
  )
}

function NumberOrTextField({
  type,
  name,
  defaultValue,
  error,
  label,
  align = 'left',
  autoFocus,
  inputMode,
  optional,
}: {
  type: 'text'
  name: string
  defaultValue: string
  error: string | undefined
  label: string
  align?: 'left' | 'right'
  autoFocus?: boolean
  inputMode?: 'decimal'
  optional?: boolean
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-bone-400">
        {label}
        {optional && <span className="ml-1 text-bone-500">(opt)</span>}
      </span>
      <input
        type={type}
        name={name}
        inputMode={inputMode}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        className={`w-full border bg-ink-950 px-2 py-1 font-mono text-sm tabular-nums text-bone-100 focus:outline-none ${
          error ? 'border-ember-400/60 focus:border-ember-400' : 'border-bone-100/15 focus:border-tick-400'
        } ${align === 'right' ? 'text-right' : 'text-left'}`}
      />
      {error && <span role="alert" className="font-sans text-[11px] text-ember-400">{error}</span>}
    </label>
  )
}

function InlineLabel({ value, sub }: { value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-bone-500">{sub}</span>
      <span className="font-mono text-sm text-bone-300">{value}</span>
    </div>
  )
}

function AssetClassField({ defaultValue }: { defaultValue: AssetClass }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-bone-400">Asset</span>
      <select
        name="assetClass"
        defaultValue={defaultValue}
        className="w-full border border-bone-100/15 bg-ink-950 px-2 py-1 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
      >
        {(Object.keys(assetClassLabels) as AssetClass[]).map((k) => (
          <option key={k} value={k}>
            {assetClassLabels[k]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Mobile `<article>` card. Edit opens the parent's modal (no inline-edit
 *  on cards — see file-level docstring). */
export function HoldingCard({ row, baseCurrency, actions }: RowProps) {
  const h = row.holding
  const tone = profitTone(row)
  const closed = h.status === 'closed'
  const edited = (h.manualOverrides?.length ?? 0) > 0
  return (
    <article
      className={`bg-ink-900 px-5 py-5 ${closed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            <span className={`inline-flex items-center border px-1.5 py-0.5 ${marketBadge}`}>
              {marketLabels[h.currency]}
            </span>
            <span>{assetClassLabels[h.assetClass]}</span>
            {row.isStale && <AsOfMarker importedAt={h.importedAt} />}
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
          <HoldingActionsMenu
            holding={h}
            onEdit={() => actions.onEditModal(h)}
            onMarkClosed={() => actions.onMarkClosed(h)}
            onReopen={() => actions.onReopen(h)}
            onRevertOverrides={() => actions.onRevertOverrides(h)}
            onSetRiskBand={(band) => actions.onSetRiskBand(h, band)}
            onDelete={() => actions.onDelete(h)}
          />
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
