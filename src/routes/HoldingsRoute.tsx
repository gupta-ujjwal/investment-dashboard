import { useMemo, useState } from 'react'
import { Link, useLoaderData } from 'react-router-dom'
import type { CanonicalHolding } from '../storage/holdings'
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
import { RefreshBanner } from '../components/RefreshBanner'
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

  const rows = useMemo(() => viewRows(holdings, filters, sort), [holdings, filters, sort])

  if (holdings.length === 0) {
    return (
      <div className="space-y-6">
        <PageHead title="Holdings" caption="Nothing imported yet" />
        <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
          <p className="font-sans text-base text-bone-200">
            Import a broker file to see your positions here.
          </p>
          <Link
            to="/import"
            className="mt-6 inline-flex items-center gap-2 border border-tick-400 bg-tick-400 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200"
          >
            Go to Import →
          </Link>
        </div>
      </div>
    )
  }

  const inr = holdings.filter((h) => h.currency === 'INR').length
  const usd = holdings.filter((h) => h.currency === 'USD').length
  const unstamped = holdings.filter((h) => h.avgBuyPriceBase === undefined).length
  const pricedAt = newestImport(holdings)

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
          caption={`${holdings.length} positions · ${inr} INR · ${usd} USD`}
        />
        <Link
          to="/import"
          className="inline-flex w-fit items-center gap-2 border border-bone-100/15 px-3 py-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
        >
          + Import
        </Link>
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
        />
      )}
    </div>
  )
}

function HoldingsControls({
  filters,
  sort,
  onFilters,
  onSortKey,
  onToggleDir,
}: {
  filters: Filters
  sort: Sort
  onFilters: (next: Filters) => void
  onSortKey: (key: SortKey) => void
  onToggleDir: () => void
}) {
  return (
    <section className="flex flex-col gap-3 border border-bone-100/10 bg-ink-900 p-3 sm:flex-row sm:items-center sm:justify-between">
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
