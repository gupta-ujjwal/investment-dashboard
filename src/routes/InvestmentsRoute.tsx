import { useCallback, useMemo, useState } from 'react'
import { Link, useFetcher, useLoaderData } from 'react-router-dom'
import type { BaseCurrency, CanonicalHolding } from '../storage/holdings'
import type { ManualAsset } from '../storage/assets'
import type { Settings } from '../storage/settings'
import {
  buildInvestmentRows,
  legacyEquityCount,
  type HoldingsDerivedRow,
  type AssetInvestmentRow,
} from '../lib/investments'
import { buildPositions, netWorthTotals } from '../lib/netWorth'
import { formatMoney } from '../lib/format'
import { AssetForm } from '../components/AssetForm'

type LoaderData = {
  holdings: CanonicalHolding[]
  settings: Settings
  assets: ManualAsset[]
}

/**
 * The Investments tab — manage every asset class in one place. Equity (India /
 * US) is backfilled read-only from the holdings store (one source of truth; edit
 * it on the Equity tab / via Import). Every other class — crypto, gold, MF, NPS,
 * FD, cash — is an editable manual asset. All figures are shown in the base
 * currency so the list reads as one net-worth composition.
 */
export function InvestmentsRoute() {
  const { holdings, settings, assets } = useLoaderData() as LoaderData
  const base = settings.baseCurrency
  const fetcher = useFetcher()

  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<ManualAsset | null>(null)

  const rows = useMemo(() => buildInvestmentRows(holdings, assets), [holdings, assets])
  const legacyEquity = legacyEquityCount(rows)
  const netWorth = useMemo(
    () => netWorthTotals(buildPositions(holdings, assets)),
    [holdings, assets],
  )

  const onDelete = useCallback(
    (asset: ManualAsset) => {
      if (!window.confirm(`Delete asset "${asset.name}"? This cannot be undone.`)) return
      const formData = new FormData()
      formData.set('intent', 'deleteAsset')
      formData.set('id', asset.id)
      fetcher.submit(formData, { method: 'post', action: '/equity' })
    },
    [fetcher],
  )

  const holdingsRows = rows.filter((r): r is HoldingsDerivedRow => r.kind === 'holdingsDerived')
  const assetRows = rows.filter((r): r is AssetInvestmentRow => r.kind === 'asset')
  const holdingsPositions = holdingsRows.reduce((sum, r) => sum + r.positionsCount, 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <PageHead title="Investments" caption="Every asset class, in one place" />
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex w-fit items-center gap-2 border border-tick-400 bg-tick-400/10 px-3 py-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-tick-400 transition hover:bg-tick-400 hover:text-ink-950"
        >
          + Add asset
        </button>
      </div>

      <section aria-label="Net worth" className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-3">
        <Stat
          label={`Net worth · ${base}`}
          value={formatMoney(netWorth.knownCurrentValue, base)}
          sub={
            netWorth.excludedCount > 0
              ? `partial · ${netWorth.excludedCount} not valued`
              : `${netWorth.totalPositions} position${netWorth.totalPositions === 1 ? '' : 's'}`
          }
        />
        <Stat
          label="Holdings"
          value={`${holdingsPositions}`}
          sub={holdingsPositions === 1 ? 'imported position' : 'imported positions'}
        />
        <Stat label="Other assets" value={`${assetRows.length}`} sub="manual" />
      </section>

      {rows.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <div className="overflow-hidden border border-bone-100/10">
          {/* Desktop table */}
          <table className="hidden w-full border-collapse md:table">
            <thead>
              <tr className="border-b border-bone-100/10 bg-ink-850 text-left">
                <Th>Investment</Th>
                <Th>Class</Th>
                <Th className="text-right">Invested</Th>
                <Th className="text-right">Current value</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {holdingsRows.map((r) => (
                <HoldingsRowView key={r.key} row={r} base={base} />
              ))}
              {assetRows.map((r) => (
                <AssetRowView
                  key={r.key}
                  row={r}
                  base={base}
                  onEdit={() => setEditing(r.asset)}
                  onDelete={() => onDelete(r.asset)}
                />
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="divide-y divide-bone-100/5 md:hidden">
            {holdingsRows.map((r) => (
              <HoldingsCard key={r.key} row={r} base={base} />
            ))}
            {assetRows.map((r) => (
              <AssetCard
                key={r.key}
                row={r}
                base={base}
                onEdit={() => setEditing(r.asset)}
                onDelete={() => onDelete(r.asset)}
              />
            ))}
          </ul>
        </div>
      )}

      {legacyEquity > 0 && (
        <p
          role="status"
          className="border-l-2 border-bone-100/20 bg-ink-900 px-4 py-2 font-sans text-xs text-bone-400"
        >
          {legacyEquity} manually-added equity asset{legacyEquity === 1 ? '' : 's'} {legacyEquity === 1 ? 'is' : 'are'} shown
          below and still editable, but {legacyEquity === 1 ? 'is' : 'are'} counted separately from the holdings-derived
          equity rows above. New equity is tracked through Import / the Equity tab.
        </p>
      )}

      <AssetForm open={addOpen} mode="add" onClose={() => setAddOpen(false)} />
      <AssetForm
        open={editing !== null}
        mode="edit"
        asset={editing ?? undefined}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

function HoldingsRowView({ row, base }: { row: HoldingsDerivedRow; base: BaseCurrency }) {
  return (
    <tr className="border-b border-bone-100/5 last:border-0">
      <td className="px-4 py-3">
        <div className="font-sans text-sm text-bone-50">{row.label}</div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
          {row.positionsCount} position{row.positionsCount === 1 ? '' : 's'} · from holdings
          {row.excludedCount > 0 && (
            <span className="text-ember-400" title="Some positions have no base-currency value yet">
              {row.excludedCount} not valued
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 font-sans text-sm text-bone-300">{row.classLabel}</td>
      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums whitespace-nowrap text-bone-300">
        {money(row.investedBase, base)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums whitespace-nowrap text-bone-50">
        {money(row.currentValueBase, base)}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to="/equity"
          className="inline-flex items-center border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
        >
          View →
        </Link>
      </td>
    </tr>
  )
}

function AssetRowView({
  row,
  base,
  onEdit,
  onDelete,
}: {
  row: AssetInvestmentRow
  base: BaseCurrency
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <tr className="border-b border-bone-100/5 last:border-0">
      <td className="px-4 py-3">
        <div className="font-sans text-sm text-bone-50">{row.label}</div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
          {row.asset.currency}
          {row.asset.emergencyFund && <span className="text-tick-400">emergency</span>}
          {row.isLegacyEquity && <span className="text-bone-400">manual equity</span>}
        </div>
      </td>
      <td className="px-4 py-3 font-sans text-sm text-bone-300">{row.group}</td>
      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums whitespace-nowrap text-bone-300">
        {money(row.investedBase, base)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums whitespace-nowrap text-bone-50">
        {money(row.currentValueBase, base)}
      </td>
      <td className="px-4 py-3 text-right">
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  )
}

function HoldingsCard({ row, base }: { row: HoldingsDerivedRow; base: BaseCurrency }) {
  return (
    <li className="space-y-2 bg-ink-900 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-sans text-sm text-bone-50">{row.label}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
            {row.classLabel} · {row.positionsCount} position{row.positionsCount === 1 ? '' : 's'} · from holdings
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm tabular-nums whitespace-nowrap text-bone-50">{money(row.currentValueBase, base)}</div>
          <Link to="/equity" className="font-mono text-[10px] uppercase tracking-[0.14em] text-tick-400">
            View →
          </Link>
        </div>
      </div>
    </li>
  )
}

function AssetCard({
  row,
  base,
  onEdit,
  onDelete,
}: {
  row: AssetInvestmentRow
  base: BaseCurrency
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <li className="space-y-2 bg-ink-900 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-sans text-sm text-bone-50">{row.label}</div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
            {row.group} · {row.asset.currency}
            {row.asset.emergencyFund && <span className="text-tick-400">emergency</span>}
          </div>
        </div>
        <div className="font-mono text-sm tabular-nums whitespace-nowrap text-bone-50">{money(row.currentValueBase, base)}</div>
      </div>
      <RowActions onEdit={onEdit} onDelete={onDelete} />
    </li>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-ember-400 hover:text-ember-400"
      >
        Delete
      </button>
    </div>
  )
}

function money(value: number | undefined, currency: BaseCurrency): string {
  return value === undefined ? '—' : formatMoney(value, currency)
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
      <p className="font-sans text-base text-bone-200">
        No investments yet. Import equity holdings, or add a manual asset — crypto, gold, FD, NPS, cash.
      </p>
      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          to="/import"
          className="inline-flex items-center gap-2 border border-tick-400 bg-tick-400 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200"
        >
          Go to Import →
        </Link>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 border border-bone-100/15 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-bone-200 transition hover:border-tick-400 hover:text-tick-400"
        >
          + Add asset
        </button>
      </div>
    </div>
  )
}

function PageHead({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-sans text-2xl font-semibold tracking-tight text-bone-50 sm:text-3xl">
        {title}
      </h1>
      <p className="font-sans text-sm text-bone-400">{caption}</p>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-ink-900 px-5 py-5">
      <div className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.18em] text-bone-400">
        <span className="h-px w-3 bg-tick-400/60" />
        {label}
      </div>
      <div className="mt-3 whitespace-nowrap font-display text-2xl leading-none tabular-nums text-bone-50">{value}</div>
      <div className="mt-2 font-mono text-[11px] text-bone-400">{sub}</div>
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
