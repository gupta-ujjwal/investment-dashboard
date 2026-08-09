import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Link, useFetcher, useLoaderData, useRevalidator } from 'react-router-dom'
import { upsertHolding, type BaseCurrency, type CanonicalHolding } from '../storage/holdings'
import type { RiskBand } from '../storage/assets'
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
  concentration,
  portfolioTotals,
  type Concentration,
  type HhiBand,
} from '../lib/analytics'
import { formatDate, formatMoney, formatPercent } from '../lib/format'
import { HoldingsTable } from '../components/HoldingsTable'
import { HoldingForm } from '../components/HoldingForm'
import type { RowActions } from '../components/HoldingRow'
import { RefreshBanner } from '../components/RefreshBanner'
import { useUndoableAction } from '../components/useUndoableAction'
import { UndoToast } from '../components/UndoToast'
import {
  FEATURE_ANALYTICS_DEPTH,
  FEATURE_BASE_CURRENCY,
  FEATURE_HISTORY,
} from '../featureFlags'

/** Equity charts (Recharts ~100KB+) stay lazy, exactly as on the old Analytics
 *  page — this panel is now equity-only (holdings folds + the index benchmark). */
const ChartsPanel = lazy(() => import('../components/charts/ChartsPanel'))

/** Columns whose natural first-click direction is ascending (text-like). */
const ASC_FIRST: ReadonlySet<SortKey> = new Set<SortKey>(['name', 'market', 'broker'])

function defaultDir(key: SortKey): Sort['dir'] {
  return ASC_FIRST.has(key) ? 'asc' : 'desc'
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

type LoaderData = {
  holdings: CanonicalHolding[]
  settings: Settings
  history: HistoryRecord[]
}

/**
 * The Equity tab — the per-ticker holdings portfolio plus all equity-specific
 * analytics (P&L KPIs, concentration/risk, allocation / sector / movers charts,
 * value-over-time with the index benchmark). Equity is one asset class on the
 * Overview; this is where you drill into it. Manual non-equity assets live on
 * the Investments tab, not here.
 */
export function EquityRoute() {
  const { holdings, settings, history } = useLoaderData() as LoaderData
  const base = settings.baseCurrency

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<CanonicalHolding | null>(null)

  const rows = useMemo(() => viewRows(holdings, filters, sort), [holdings, filters, sort])
  const existingKeys = useMemo(
    () => holdings.map((h) => ({ source: h.source, sourceSymbol: h.sourceSymbol })),
    [holdings],
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
      fetcher.submit(formData, { method: 'post', action: '/equity' })
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
  const onMarkClosed = useCallback((h: CanonicalHolding) => submitHolding('setStatus', h, { status: 'closed' }), [submitHolding])
  const onReopen = useCallback((h: CanonicalHolding) => submitHolding('setStatus', h, { status: 'open' }), [submitHolding])
  const onRevertOverrides = useCallback((h: CanonicalHolding) => submitHolding('revertOverrides', h), [submitHolding])
  // `band` undefined → Auto: send empty 'band' so the action clears the override (#2).
  const onSetRiskBand = useCallback(
    (h: CanonicalHolding, band: RiskBand | undefined) =>
      submitHolding('setRiskBand', h, { band: band ?? '' }),
    [submitHolding],
  )

  const actions: RowActions = useMemo(
    () => ({ onEditModal, onEditSaved, onDelete, onMarkClosed, onReopen, onRevertOverrides, onSetRiskBand }),
    [onEditModal, onEditSaved, onDelete, onMarkClosed, onReopen, onRevertOverrides, onSetRiskBand],
  )

  if (holdings.length === 0) {
    return (
      <div className="space-y-6">
        <PageHead title="Equity" caption="No equity positions yet" />
        <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
          <p className="font-sans text-base text-bone-200">
            Import a broker file to see your positions and equity analytics — or add one manually.
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
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 border border-bone-100/15 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-bone-200 transition hover:border-tick-400 hover:text-tick-400"
            >
              + Add manually
            </button>
          </div>
        </div>
        <HoldingForm open={addOpen} mode="add" existingKeys={existingKeys} onClose={() => setAddOpen(false)} />
      </div>
    )
  }

  const openHoldings = holdings.filter((h) => h.status !== 'closed')
  const inr = openHoldings.filter((h) => h.currency === 'INR').length
  const usd = openHoldings.filter((h) => h.currency === 'USD').length
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

  function onSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) },
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <PageHead
          title="Equity"
          caption={`${openHoldings.length} open · ${inr} INR · ${usd} USD${closedCount > 0 ? ` · ${closedCount} closed` : ''}`}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex w-fit items-center gap-2 border border-tick-400 bg-tick-400/10 px-3 py-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-tick-400 transition hover:bg-tick-400 hover:text-ink-950"
          >
            + Add holding
          </button>
          <Link
            to="/import"
            className="inline-flex w-fit items-center gap-2 border border-bone-100/15 px-3 py-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
          >
            + Import
          </Link>
        </div>
      </div>

      {FEATURE_BASE_CURRENCY && unstamped > 0 && (
        <RefreshBanner unstamped={unstamped} baseCurrency={base} />
      )}

      {/* Equity KPIs */}
      <section aria-label="Equity key figures">
        <div className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4">
          <Kpi
            label={`Value · ${base}`}
            value={money(totals.totalValueBase, base)}
            sub={totals.unstamped > 0 ? 'refresh needed' : 'current market value'}
            tone="tick"
          />
          <Kpi label={`Invested · ${base}`} value={money(totals.totalInvestedBase, base)} sub="cost basis" tone="mute" />
          <Kpi
            label={`P&L · ${base}`}
            value={money(totals.totalProfitBase, base)}
            sub={totals.totalProfitPct === undefined ? '—' : formatPercent(totals.totalProfitPct)}
            tone={pnlTone}
          />
          <Kpi label="Positions" value={String(totals.positions)} sub={`${inr} India · ${usd} US`} tone="mute" />
        </div>
      </section>

      {conc && <RiskRow concentration={conc} />}

      {/* Equity charts */}
      <section aria-label="Charts">
        <div className="flex items-end justify-between">
          <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
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

      {/* Holdings table */}
      <section aria-label="Holdings" className="space-y-4">
        <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
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

      <HoldingForm open={addOpen} mode="add" existingKeys={existingKeys} onClose={() => setAddOpen(false)} />
      <HoldingForm
        open={editing !== null}
        mode="edit"
        holding={editing ?? undefined}
        existingKeys={existingKeys}
        onClose={() => setEditing(null)}
      />

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
    <section className="flex flex-col gap-3 border border-bone-100/10 bg-ink-900 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div role="group" aria-label="Filter by market" className="inline-flex border border-bone-100/15">
        {marketOptions.map((opt) => {
          const active = filters.market === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onFilters({ ...filters, market: opt.value })}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
                active ? 'bg-tick-400 text-ink-950' : 'text-bone-400 hover:text-bone-100'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <label className="flex items-center gap-2 border border-bone-100/15 bg-ink-950 px-3 py-1.5 sm:w-72">
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
        <label className="flex cursor-pointer items-center gap-2 border border-bone-100/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-300 transition has-[:checked]:border-tick-400 has-[:checked]:text-tick-400">
          <input
            type="checkbox"
            checked={filters.showClosed === true}
            onChange={(e) => onFilters({ ...filters, showClosed: e.target.checked })}
            className="h-3 w-3 accent-tick-400"
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
          className="border border-bone-100/15 px-3 py-1.5 font-mono text-xs text-tick-400 transition hover:border-tick-400"
        >
          {sort.dir === 'asc' ? '▲' : '▼'}
        </button>
      </div>
    </section>
  )
}

function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-14 text-center">
      <p className="font-sans text-sm text-bone-300">No holdings match these filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex items-center gap-2 border border-bone-100/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
      >
        Clear filters
      </button>
    </div>
  )
}

/** Risk sub-row — concentration metrics derived from priced holdings. */
function RiskRow({ concentration: c }: { concentration: Concentration }) {
  const hhiBandLabel: Record<HhiBand, string> = { low: 'Low', moderate: 'Moderate', high: 'High' }
  return (
    <section
      aria-label="Risk"
      className="grid grid-cols-1 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-3"
    >
      <Kpi
        label="Top-5 weight"
        value={c.top5Pct === undefined ? '—' : pctNoSign(c.top5Pct)}
        sub={c.top5Pct === undefined ? 'no priced holdings' : 'of portfolio value'}
        tone="mute"
      />
      <Kpi
        label="Concentration"
        value={c.hhiBand === undefined ? '—' : hhiBandLabel[c.hhiBand]}
        sub={c.hhi === undefined ? 'HHI unavailable' : `HHI ${c.hhi.toFixed(2)}`}
        tone={c.hhiBand === 'high' ? 'loss' : 'mute'}
      />
      <Kpi
        label="Single-stock risk"
        value={c.singleStockRisk === undefined ? '—' : c.singleStockRisk.holding.name}
        sub={c.singleStockRisk === undefined ? 'no position >10%' : `${pctNoSign(c.singleStockRisk.weight)} of portfolio`}
        tone={c.singleStockRisk === undefined ? 'mute' : 'loss'}
      />
    </section>
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

type KpiTone = 'tick' | 'mute' | 'gain' | 'loss'
const kpiRail: Record<KpiTone, string> = {
  tick: 'bg-tick-400/60',
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

function Kpi({ label, value, sub, tone = 'tick' }: { label: string; value: string; sub: string; tone?: KpiTone }) {
  return (
    <div className="bg-ink-900 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.18em] text-bone-400">
        <span className={`h-px w-3 ${kpiRail[tone]}`} />
        {label}
      </div>
      <div
        className={`mt-3 whitespace-nowrap font-display text-xl leading-tight tracking-tight tabular-nums lg:text-3xl xl:text-4xl ${kpiValueColor[tone]}`}
      >
        {value}
      </div>
      <div className="mt-2 font-mono text-[11px] text-bone-400">{sub}</div>
    </div>
  )
}

function ChartsFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center border border-bone-100/10 bg-ink-900">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-4 w-4 spin-slow border border-bone-100/15 border-t-tick-400" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          Loading charts
        </span>
      </div>
    </div>
  )
}
