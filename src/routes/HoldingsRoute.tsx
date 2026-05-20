import { useCallback, useMemo, useState } from 'react'
import { Link, useFetcher, useLoaderData, useRevalidator } from 'react-router-dom'
import { upsertHolding, type CanonicalHolding } from '../storage/holdings'
import type { Settings } from '../storage/settings'
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  newestImport,
  viewRows,
  type Filters,
  type MarketFilter,
  type Sort,
  type SortKey,
} from '../lib/holdingsView'
import { formatDate } from '../lib/format'
import { HoldingsTable } from '../components/HoldingsTable'
import { HoldingForm } from '../components/HoldingForm'
import type { RowActions } from '../components/HoldingRow'
import { RefreshBanner } from '../components/RefreshBanner'
import { useUndoableAction } from '../components/useUndoableAction'
import { UndoToast } from '../components/UndoToast'
import { FEATURE_BASE_CURRENCY } from '../featureFlags'

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

export function HoldingsRoute() {
  const { holdings, settings } = useLoaderData() as {
    holdings: CanonicalHolding[]
    settings: Settings
  }

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<CanonicalHolding | null>(null)

  const rows = useMemo(() => viewRows(holdings, filters, sort), [holdings, filters, sort])
  const existingKeys = useMemo(
    () => holdings.map((h) => ({ source: h.source, sourceSymbol: h.sourceSymbol })),
    [holdings],
  )

  // Imperative fetcher for row-level actions (delete, setStatus, revert).
  // Edit goes through the modal's own fetcher; here we only fire-and-forget
  // for actions that don't need a form UI to surface field-level errors.
  const fetcher = useFetcher()
  const revalidator = useRevalidator()

  // Restore the deleted/pre-edit row via direct IDB write (bypasses the
  // action layer because the snapshot is by definition already-validated).
  // Pre-merge integration test in diff.test.ts covers the override-survives
  // scenario; this restore path mirrors that: upsert + revalidate.
  const undoableDelete = useUndoableAction<CanonicalHolding>({
    onUndo: async (snapshot) => {
      await upsertHolding(snapshot)
      revalidator.revalidate()
    },
  })

  const onEdit = useCallback((h: CanonicalHolding) => setEditing(h), [])

  const onDelete = useCallback(
    (h: CanonicalHolding) => {
      const formData = new FormData()
      formData.set('intent', 'delete')
      formData.set('source', h.source)
      formData.set('sourceSymbol', h.sourceSymbol)
      fetcher.submit(formData, { method: 'post', action: '/holdings' })
      undoableDelete.show(h, {
        message: `Deleted ${h.name}`,
        detail: `${h.sourceSymbol} · ${h.source}`,
      })
    },
    [fetcher, undoableDelete],
  )

  const onMarkClosed = useCallback(
    (h: CanonicalHolding) => {
      const formData = new FormData()
      formData.set('intent', 'setStatus')
      formData.set('source', h.source)
      formData.set('sourceSymbol', h.sourceSymbol)
      formData.set('status', 'closed')
      fetcher.submit(formData, { method: 'post', action: '/holdings' })
    },
    [fetcher],
  )

  const onReopen = useCallback(
    (h: CanonicalHolding) => {
      const formData = new FormData()
      formData.set('intent', 'setStatus')
      formData.set('source', h.source)
      formData.set('sourceSymbol', h.sourceSymbol)
      formData.set('status', 'open')
      fetcher.submit(formData, { method: 'post', action: '/holdings' })
    },
    [fetcher],
  )

  const onRevertOverrides = useCallback(
    (h: CanonicalHolding) => {
      const formData = new FormData()
      formData.set('intent', 'revertOverrides')
      formData.set('source', h.source)
      formData.set('sourceSymbol', h.sourceSymbol)
      fetcher.submit(formData, { method: 'post', action: '/holdings' })
    },
    [fetcher],
  )

  const actions: RowActions = useMemo(
    () => ({
      onEdit,
      onDelete,
      onMarkClosed,
      onReopen,
      onRevertOverrides,
    }),
    [onEdit, onDelete, onMarkClosed, onReopen, onRevertOverrides],
  )

  if (holdings.length === 0) {
    return (
      <div className="space-y-6">
        <PageHead title="Holdings" caption="Nothing imported yet" />
        <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
          <p className="font-sans text-base text-bone-200">
            Import a broker file to see your positions here — or add one manually below.
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
        <HoldingForm
          open={addOpen}
          mode="add"
          existingKeys={existingKeys}
          onClose={() => setAddOpen(false)}
        />
      </div>
    )
  }

  // Tallies use the *open* set so "5 positions · 3 INR · 2 USD" matches the
  // default view. Closed-position count is surfaced in the filter toggle
  // label and the page caption.
  const openHoldings = holdings.filter((h) => h.status !== 'closed')
  const inr = openHoldings.filter((h) => h.currency === 'INR').length
  const usd = openHoldings.filter((h) => h.currency === 'USD').length
  const closedCount = holdings.length - openHoldings.length
  const unstamped = holdings.filter(
    (h) => h.avgBuyPriceBase === undefined && h.status !== 'closed',
  ).length
  const pricedAt = newestImport(openHoldings)

  function onSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultDir(key) },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <PageHead
          title="Holdings"
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

      {pricedAt !== undefined && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
          Prices as of {formatDate(pricedAt)} · snapshot from last import
        </p>
      )}

      {FEATURE_BASE_CURRENCY && unstamped > 0 && (
        <RefreshBanner unstamped={unstamped} baseCurrency={settings.baseCurrency} />
      )}

      <HoldingsControls
        filters={filters}
        sort={sort}
        closedCount={closedCount}
        onFilters={setFilters}
        onSortKey={onSort}
        onToggleDir={() =>
          setSort((prev) => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))
        }
      />

      {rows.length === 0 ? (
        <FilteredEmpty onClear={() => setFilters(DEFAULT_FILTERS)} />
      ) : (
        <HoldingsTable
          rows={rows}
          baseCurrency={settings.baseCurrency}
          sort={sort}
          onSort={onSort}
          actions={actions}
        />
      )}

      <HoldingForm
        open={addOpen}
        mode="add"
        existingKeys={existingKeys}
        onClose={() => setAddOpen(false)}
      />
      <HoldingForm
        open={editing !== null}
        mode="edit"
        holding={editing ?? undefined}
        existingKeys={existingKeys}
        onClose={() => setEditing(null)}
      />
      <UndoToast
        toast={undoableDelete.active}
        onUndo={undoableDelete.undo}
        onDismiss={undoableDelete.dismiss}
      />
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
      {/* Market segmented control */}
      <div
        role="group"
        aria-label="Filter by market"
        className="inline-flex border border-bone-100/15"
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
                active
                  ? 'bg-tick-400 text-ink-950'
                  : 'text-bone-400 hover:text-bone-100'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Symbol / name search */}
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

      {/* Closed-positions toggle. Hidden when there are no closed rows to
          show — keeps the control surface honest with the data. */}
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

      {/* Mobile sort — desktop sorts via column headers */}
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
