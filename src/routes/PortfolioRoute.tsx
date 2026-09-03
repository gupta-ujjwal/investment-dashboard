import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Link, useFetcher, useLoaderData, useRevalidator } from 'react-router-dom'
import { upsertHolding, type BaseCurrency, type CanonicalHolding } from '../storage/holdings'
import type { ManualAsset, RiskBand } from '../storage/assets'
import type { HistoryRecord } from '../storage/history'
import type { Settings } from '../storage/settings'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  deriveRows,
  newestImport,
  viewRows,
  type Filters,
  type MarketFilter,
  type Sort,
  type SortKey,
} from '../lib/holdingsView'
import {
  buildInvestmentRows,
  legacyEquityCount,
  type AssetInvestmentRow,
} from '../lib/investments'
import { buildPositions, netWorthTotals } from '../lib/netWorth'
import {
  concentration,
  portfolioTotals,
  type Concentration,
  type HhiBand,
} from '../lib/analytics'
import { formatDate, formatMoney, formatPercent } from '../lib/format'
import { AnimatedMoney } from '../components/decor/AnimatedNumber'
import { HoldingsTable } from '../components/HoldingsTable'
import { HoldingForm } from '../components/HoldingForm'
import { AssetForm } from '../components/AssetForm'
import type { RowActions } from '../components/HoldingRow'
import { RefreshBanner } from '../components/RefreshBanner'
import { useUndoableAction } from '../components/useUndoableAction'
import { UndoToast } from '../components/UndoToast'
import {
  FEATURE_ANALYTICS_DEPTH,
  FEATURE_BASE_CURRENCY,
  FEATURE_HISTORY,
} from '../featureFlags'

const ChartsPanel = lazy(() => import('../components/charts/ChartsPanel'))

const ASC_FIRST: ReadonlySet<SortKey> = new Set<SortKey>(['name', 'market', 'broker'])

function defaultDir(key: SortKey): Sort['dir'] {
  return ASC_FIRST.has(key) ? 'asc' : 'desc'
}

type LoaderData = {
  holdings: CanonicalHolding[]
  settings: Settings
  history: HistoryRecord[]
  assets: ManualAsset[]
}

export function PortfolioRoute() {
  const { holdings, settings, history, assets } = useLoaderData() as LoaderData
  const base = settings.baseCurrency

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [addHoldingOpen, setAddHoldingOpen] = useState(false)
  const [addAssetOpen, setAddAssetOpen] = useState(false)
  const [editing, setEditing] = useState<CanonicalHolding | null>(null)

  const rows = useMemo(() => viewRows(holdings, filters, sort), [holdings, filters, sort])
  const existingKeys = useMemo(
    () => holdings.map((h) => ({ source: h.source, sourceSymbol: h.sourceSymbol })),
    [holdings],
  )

  const investmentRows = useMemo(() => buildInvestmentRows(holdings, assets), [holdings, assets])
  const manualAssetRows = investmentRows.filter(
    (r): r is AssetInvestmentRow => r.kind === 'asset',
  )
  const legacyEquity = legacyEquityCount(investmentRows)

  const netWorth = useMemo(
    () => netWorthTotals(buildPositions(holdings, assets)),
    [holdings, assets],
  )

  const fetcher = useFetcher()
  const revalidator = useRevalidator()

  const undoable = useUndoableAction<CanonicalHolding>({
    onUndo: async (snapshot) => {
      await upsertHolding(snapshot)
      revalidator.revalidate()
    },
  })

  const onEditModal = useCallback((h: CanonicalHolding) => setEditing(h), [])
  const onEditSaved = useCallback(
    (snapshot: CanonicalHolding) => {
      undoable.show(snapshot, {
        message: `Edited ${snapshot.name}`,
        detail: 'Undo to restore previous values',
      })
    },
    [undoable],
  )

  const submitHolding = useCallback(
    (intent: string, h: CanonicalHolding, extra?: Record<string, string>) => {
      const formData = new FormData()
      formData.set('intent', intent)
      formData.set('source', h.source)
      formData.set('sourceSymbol', h.sourceSymbol)
      for (const [k, v] of Object.entries(extra ?? {})) formData.set(k, v)
      fetcher.submit(formData, { method: 'post', action: '/portfolio' })
    },
    [fetcher],
  )

  const onDelete = useCallback(
    (h: CanonicalHolding) => {
      submitHolding('delete', h)
      undoable.show(h, { message: `Deleted ${h.name}`, detail: `${h.sourceSymbol} · ${h.source}` })
    },
    [submitHolding, undoable],
  )
  const onMarkClosed = useCallback(
    (h: CanonicalHolding) => submitHolding('setStatus', h, { status: 'closed' }),
    [submitHolding],
  )
  const onReopen = useCallback(
    (h: CanonicalHolding) => submitHolding('setStatus', h, { status: 'open' }),
    [submitHolding],
  )
  const onRevertOverrides = useCallback(
    (h: CanonicalHolding) => submitHolding('revertOverrides', h),
    [submitHolding],
  )
  const onSetRiskBand = useCallback(
    (h: CanonicalHolding, band: RiskBand | undefined) =>
      submitHolding('setRiskBand', h, { band: band ?? '' }),
    [submitHolding],
  )

  const actions: RowActions = useMemo(
    () => ({ onEditModal, onEditSaved, onDelete, onMarkClosed, onReopen, onRevertOverrides, onSetRiskBand }),
    [onEditModal, onEditSaved, onDelete, onMarkClosed, onReopen, onRevertOverrides, onSetRiskBand],
  )

  const onDeleteAsset = useCallback(
    (asset: ManualAsset) => {
      if (!window.confirm(`Delete asset "${asset.name}"? This cannot be undone.`)) return
      const formData = new FormData()
      formData.set('intent', 'deleteAsset')
      formData.set('id', asset.id)
      fetcher.submit(formData, { method: 'post', action: '/portfolio' })
    },
    [fetcher],
  )

  if (holdings.length === 0 && assets.length === 0) {
    return (
      <div className="space-y-6">
        <PageHead title="Portfolio" caption="No positions yet" />
        <div className="rounded-3xl border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
          <p className="font-sans text-base text-bone-200">
            Import a broker file to see your positions — or add one manually.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/import" className="btn-primary">
              Go to Import →
            </Link>
            <button type="button" onClick={() => setAddAssetOpen(true)} className="btn-secondary">
              + Add manually
            </button>
          </div>
        </div>
        <AssetForm open={addAssetOpen} mode="add" onClose={() => setAddAssetOpen(false)} />
      </div>
    )
  }

  const openHoldings = holdings.filter((h) => h.status !== 'closed')
  const closedCount = holdings.length - openHoldings.length
  const unstamped = holdings.filter(
    (h) => h.avgBuyPriceBase === undefined && h.status !== 'closed',
  ).length
  const pricedAt = newestImport(openHoldings)

  const totals = portfolioTotals(openHoldings)
  const pnlTone: KpiTone =
    totals.totalProfitBase === undefined ? 'mute' : totals.totalProfitBase >= 0 ? 'gain' : 'loss'
  const conc: Concentration | undefined = FEATURE_ANALYTICS_DEPTH
    ? concentration(deriveRows(openHoldings))
    : undefined

  const totalPositions = netWorth.totalPositions
  const manualCount = manualAssetRows.length

  function onSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) },
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <PageHead
          title="Portfolio"
          caption={`${totalPositions} position${totalPositions === 1 ? '' : 's'}${manualCount > 0 ? ` · ${manualCount} manual` : ''}${closedCount > 0 ? ` · ${closedCount} closed` : ''}`}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddHoldingOpen(true)}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-act-400 bg-act-400/10 px-3 py-1.5 font-sans text-[11px] font-medium  text-act-400 transition hover:bg-act-400 hover:text-ink-950"
          >
            + Add holding
          </button>
          <button
            type="button"
            onClick={() => setAddAssetOpen(true)}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-bone-100/15 px-3 py-1.5 font-sans text-[11px] font-medium  text-bone-300 transition hover:border-act-400 hover:text-act-400"
          >
            + Add asset
          </button>
        </div>
      </div>

      {FEATURE_BASE_CURRENCY && unstamped > 0 && (
        <RefreshBanner unstamped={unstamped} baseCurrency={base} />
      )}

      <section
        aria-label="Summary"
        className="flex flex-wrap gap-x-11 gap-y-3 rounded-2xl border border-bone-100/10 bg-ink-900 px-6 py-5"
      >
        <SummaryFigure
          label={`Value · ${base}`}
          value={<AnimatedMoney value={netWorth.knownCurrentValue} currency={base} />}
          tone="tick"
        />
        <SummaryFigure
          label="Invested"
          value={<AnimatedMoney value={netWorth.knownInvested} currency={base} />}
          tone="mute"
        />
        <SummaryFigure
          label="Profit"
          value={<AnimatedMoney value={netWorth.profitKnown} currency={base} />}
          sub={netWorth.profitPctKnown === undefined ? '—' : formatPercent(netWorth.profitPctKnown)}
          tone={pnlTone}
        />
        <SummaryFigure
          label={`Return · ${base}`}
          value={netWorth.profitPctKnown === undefined ? '—' : formatPercent(netWorth.profitPctKnown)}
          tone={pnlTone}
        />
      </section>

      {conc && <RiskRow concentration={conc} />}

      {FEATURE_ANALYTICS_DEPTH && (
        <section aria-label="Charts">
          <div className="flex items-end justify-between">
            <h3 className="font-sans text-sm font-medium text-bone-300">
              Charts
            </h3>
            {FEATURE_HISTORY && (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
                {history.length} snapshot{history.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="mt-4">
            <Suspense fallback={<ChartsFallback />}>
              <ChartsPanel holdings={holdings} history={history} baseCurrency={base} />
            </Suspense>
          </div>
        </section>
      )}

      <section aria-label="Holdings" className="space-y-4">
        <h3 className="font-sans text-sm font-medium text-bone-300">
          Holdings
        </h3>
        {pricedAt !== undefined && (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
            Prices as of {formatDate(pricedAt)} · snapshot from last import
          </p>
        )}

        <HoldingsControls
          filters={filters}
          sort={sort}
          closedCount={closedCount}
          onFilters={setFilters}
          onSortKey={onSort}
          onToggleDir={() => setSort((prev) => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))}
        />

        {rows.length === 0 ? (
          <FilteredEmpty onClear={() => setFilters(DEFAULT_FILTERS)} />
        ) : (
          <HoldingsTable rows={rows} baseCurrency={base} sort={sort} onSort={onSort} actions={actions} />
        )}
      </section>

      {manualAssetRows.length > 0 && (
        <section aria-label="Other assets" className="space-y-4">
          <h3 className="font-sans text-sm font-medium text-bone-300">
            Other assets
          </h3>
          <div className="overflow-hidden border border-bone-100/10">
            <table className="hidden w-full border-collapse md:table">
              <thead>
                <tr className="border-b border-bone-100/10 bg-ink-850 text-left">
                  <Th>Asset</Th>
                  <Th>Class</Th>
                  <Th className="text-right">Invested</Th>
                  <Th className="text-right">Current value</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {manualAssetRows.map((r) => (
                  <AssetRowView
                    key={r.key}
                    row={r}
                    base={base}
                    onEdit={() => {
                      const asset = assets.find((a) => a.id === r.asset.id)
                      if (asset) setAddAssetOpen(true)
                    }}
                    onDelete={() => onDeleteAsset(r.asset)}
                  />
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-bone-100/5 md:hidden">
              {manualAssetRows.map((r) => (
                <AssetCard
                  key={r.key}
                  row={r}
                  base={base}
                  onDelete={() => onDeleteAsset(r.asset)}
                />
              ))}
            </ul>
          </div>
          {legacyEquity > 0 && (
            <p className="font-sans text-xs text-bone-400">
              {legacyEquity} manually-added equity asset{legacyEquity === 1 ? '' : 's'} {legacyEquity === 1 ? 'is' : 'are'} shown
              above and included in the portfolio totals.
            </p>
          )}
        </section>
      )}

      <HoldingForm open={addHoldingOpen} mode="add" existingKeys={existingKeys} onClose={() => setAddHoldingOpen(false)} />
      <HoldingForm
        open={editing !== null}
        mode="edit"
        holding={editing ?? undefined}
        existingKeys={existingKeys}
        onClose={() => setEditing(null)}
      />
      <AssetForm open={addAssetOpen} mode="add" onClose={() => setAddAssetOpen(false)} />

      <UndoToast toast={undoable.active} onUndo={undoable.undo} onDismiss={undoable.dismiss} />
    </div>
  )
}

function HoldingsControls({
  filters,
  sort,
  closedCount,
  onFilters,
  onSortKey,
  onToggleDir,
}: {
  filters: Filters
  sort: Sort
  closedCount: number
  onFilters: (next: Filters) => void
  onSortKey: (key: SortKey) => void
  onToggleDir: () => void
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-bone-100/10 bg-ink-900 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div
        role="group"
        aria-label="Filter by market"
        className="inline-flex overflow-hidden rounded-full border border-bone-100/15"
      >
        {marketOptions.map((opt) => {
          const active = filters.market === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onFilters({ ...filters, market: opt.value })}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
                active ? 'bg-act-400 text-ink-950' : 'text-bone-400 hover:text-bone-100'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <label className="flex items-center gap-2 rounded-full border border-bone-100/15 bg-ink-950 px-3 py-1.5 sm:w-72">
        <span aria-hidden="true" className="font-mono text-xs text-bone-400">
          ⌕
        </span>
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onFilters({ ...filters, search: e.target.value })}
          placeholder="Search name or symbol"
          aria-label="Search holdings by name or symbol"
          className="w-full bg-transparent font-mono text-xs text-bone-100 placeholder:text-bone-400 focus:outline-none"
        />
      </label>

      {closedCount > 0 && (
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-bone-100/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-300 transition has-[:checked]:border-act-400 has-[:checked]:text-act-400">
          <input
            type="checkbox"
            checked={filters.showClosed === true}
            onChange={(e) => onFilters({ ...filters, showClosed: e.target.checked })}
            className="h-3 w-3 accent-act-400"
          />
          Show closed ({closedCount})
        </label>
      )}

      <div className="flex items-center gap-2 md:hidden">
        <select
          value={sort.key}
          onChange={(e) => onSortKey(e.target.value as SortKey)}
          aria-label="Sort holdings by"
          className="flex-1 border border-bone-100/15 bg-ink-950 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-100 focus:outline-none"
        >
          {sortOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onToggleDir}
          aria-label={`Sort direction: ${sort.dir === 'asc' ? 'ascending' : 'descending'}`}
          className="border border-bone-100/15 px-3 py-1.5 font-mono text-xs text-act-400 transition hover:border-act-400"
        >
          {sort.dir === 'asc' ? '▲' : '▼'}
        </button>
      </div>
    </section>
  )
}

const marketOptions: { value: MarketFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'INR', label: 'India' },
  { value: 'USD', label: 'US' },
]

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'market', label: 'Market' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'avgBuyPrice', label: 'Avg buy' },
  { key: 'currentPrice', label: 'Current price' },
  { key: 'invested', label: 'Invested' },
  { key: 'currentValue', label: 'Current value' },
  { key: 'profit', label: 'Profit %' },
  { key: 'broker', label: 'Broker' },
]

function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-bone-100/15 bg-ink-900 px-8 py-14 text-center">
      <p className="font-sans text-sm text-bone-300">No holdings match these filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-bone-100/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-300 transition hover:border-act-400 hover:text-act-400"
      >
        Clear filters
      </button>
    </div>
  )
}

function RiskRow({ concentration: c }: { concentration: Concentration }) {
  const verdicts: { label: string; verdict: string; metric?: string; tone: KpiTone }[] = []

  if (c.top5Pct !== undefined) {
    verdicts.push({
      label: 'Top-5 weight',
      verdict: `${pctNoSign(c.top5Pct)} of portfolio`,
      metric: `Top 5 holdings = ${pctNoSign(c.top5Pct)}`,
      tone: c.top5Pct > 0.5 ? 'loss' : 'mute',
    })
  } else {
    verdicts.push({
      label: 'Top-5 weight',
      verdict: 'No priced holdings',
      tone: 'mute',
    })
  }

  if (c.singleStockRisk !== undefined) {
    verdicts.push({
      label: 'Largest position',
      verdict: `${c.singleStockRisk.holding.name} is ${pctNoSign(c.singleStockRisk.weight)} of your portfolio`,
      metric: `Single-stock risk: ${pctNoSign(c.singleStockRisk.weight)}`,
      tone: c.singleStockRisk.weight > 0.15 ? 'loss' : 'mute',
    })
  } else {
    verdicts.push({
      label: 'Largest position',
      verdict: 'No single position is more than 10% of your portfolio',
      metric: c.hhi !== undefined ? `HHI ${c.hhi.toFixed(2)}` : undefined,
      tone: 'mute',
    })
  }

  if (c.hhiBand !== undefined) {
    const bandLabels: Record<HhiBand, string> = { low: 'low', moderate: 'moderate', high: 'high' }
    verdicts.push({
      label: 'Concentration',
      verdict: `Concentration is ${bandLabels[c.hhiBand]}`,
      metric: c.hhi !== undefined ? `HHI ${c.hhi.toFixed(2)} · Top-5 ${c.top5Pct !== undefined ? pctNoSign(c.top5Pct) : 'n/a'}` : undefined,
      tone: c.hhiBand === 'high' ? 'loss' : 'mute',
    })
  } else {
    verdicts.push({
      label: 'Concentration',
      verdict: 'Not enough priced holdings to measure',
      tone: 'mute',
    })
  }

  return (
    <section
      aria-label="Risk"
      className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-bone-100/10 bg-bone-100/10 sm:grid-cols-3"
    >
      {verdicts.map((v) => (
        <Kpi
          key={v.label}
          label={v.label}
          value={v.verdict}
          sub={v.metric ?? ''}
          tone={v.tone}
        />
      ))}
    </section>
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
          {row.asset.emergencyFund && <span className="text-act-400">emergency</span>}
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
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-act-400 hover:text-act-400"
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
      </td>
    </tr>
  )
}

function AssetCard({
  row,
  base,
  onDelete,
}: {
  row: AssetInvestmentRow
  base: BaseCurrency
  onDelete: () => void
}) {
  return (
    <li className="space-y-2 bg-ink-900 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-sans text-sm text-bone-50">{row.label}</div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
            {row.group} · {row.asset.currency}
            {row.asset.emergencyFund && <span className="text-act-400">emergency</span>}
          </div>
        </div>
        <div className="font-mono text-sm tabular-nums whitespace-nowrap text-bone-50">{money(row.currentValueBase, base)}</div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-ember-400 hover:text-ember-400"
      >
        Delete
      </button>
    </li>
  )
}

type KpiTone = 'tick' | 'mute' | 'gain' | 'loss'
const kpiRail: Record<KpiTone, string> = {
  tick: 'bg-bone-200/60',
  mute: 'bg-bone-300/40',
  gain: 'bg-jade-400/70',
  loss: 'bg-ember-400/70',
}
const kpiValueColor: Record<KpiTone, string> = {
  tick: 'text-bone-50',
  mute: 'text-bone-50',
  gain: 'text-jade-300',
  loss: 'text-ember-300',
}

function SummaryFigure({
  label,
  value,
  sub,
  tone = 'mute',
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: KpiTone
}) {
  return (
    <div>
      <div className="flex items-center gap-2 font-sans text-[10px]  text-bone-500">
        <span className={`h-px w-3 ${kpiRail[tone]}`} />
        {label}
      </div>
      <div className={`mt-1 whitespace-nowrap font-display text-xl font-semibold tracking-tight tabular-nums lg:text-2xl ${kpiValueColor[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-bone-400">{sub}</div>}
    </div>
  )
}

function Kpi({ label, value, sub, tone = 'mute' }: { label: string; value: string; sub: string; tone?: KpiTone }) {
  return (
    <div className="bg-ink-900 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-2 font-sans text-[10px]  text-bone-400">
        <span className={`h-px w-3 ${kpiRail[tone]}`} />
        {label}
      </div>
      <div
        className={`mt-3 whitespace-nowrap font-display text-sm leading-tight tracking-tight tabular-nums lg:text-base xl:text-lg ${kpiValueColor[tone]}`}
        title={sub || undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-2 font-mono text-[10px] text-bone-500">{sub}</div>}
    </div>
  )
}

function ChartsFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center border border-bone-100/10 bg-ink-900">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-4 w-4 spin-slow border border-bone-100/15 border-t-act-400" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          Loading charts
        </span>
      </div>
    </div>
  )
}

function pctNoSign(value: number): string {
  return formatPercent(value).replace('+', '')
}

function money(value: number | undefined, currency: BaseCurrency): string {
  return value === undefined ? '—' : formatMoney(value, currency)
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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-bone-400 ${className}`}
    >
      {children}
    </th>
  )
}
