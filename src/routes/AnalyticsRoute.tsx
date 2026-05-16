import { lazy, Suspense } from 'react'
import { Link, useLoaderData } from 'react-router-dom'
import type { BaseCurrency, CanonicalHolding } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'
import type { Settings } from '../storage/settings'
import { portfolioTotals } from '../lib/analytics'
import { formatMoney, formatPercent } from '../lib/format'
import { RefreshBanner } from '../components/RefreshBanner'
import { FEATURE_BASE_CURRENCY, FEATURE_HISTORY } from '../featureFlags'

/** Recharts is heavy (~100KB+); keep it out of the initial bundle so the KPI
 *  row paints first. The Suspense fallback covers the chunk load. */
const ChartsPanel = lazy(() => import('../components/charts/ChartsPanel'))

type LoaderData = {
  holdings: CanonicalHolding[]
  settings: Settings
  history: HistoryRecord[]
}

export function AnalyticsRoute() {
  const { holdings, settings, history } = useLoaderData() as LoaderData

  if (holdings.length === 0) {
    return <EmptyState />
  }

  const base = settings.baseCurrency
  const totals = portfolioTotals(holdings)
  const inrCount = holdings.filter((h) => h.currency === 'INR').length
  const usdCount = holdings.length - inrCount
  const pnlTone: KpiTone =
    totals.totalProfitBase === undefined
      ? 'mute'
      : totals.totalProfitBase >= 0
        ? 'gain'
        : 'loss'

  return (
    <div className="space-y-10">
      <PageHead title="Analytics" caption="Portfolio snapshot, on-device" />

      {FEATURE_BASE_CURRENCY && totals.unstamped > 0 && (
        <RefreshBanner unstamped={totals.unstamped} baseCurrency={base} />
      )}

      <section
        aria-label="Key figures"
        className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4"
      >
        <Kpi
          label={`Value · ${base}`}
          value={money(totals.totalValueBase, base)}
          sub={totals.unstamped > 0 ? 'refresh needed' : 'current market value'}
          tone="tick"
        />
        <Kpi
          label={`Invested · ${base}`}
          value={money(totals.totalInvestedBase, base)}
          sub="cost basis"
          tone="mute"
        />
        <Kpi
          label={`P&L · ${base}`}
          value={money(totals.totalProfitBase, base)}
          sub={
            totals.totalProfitPct === undefined
              ? '—'
              : formatPercent(totals.totalProfitPct)
          }
          tone={pnlTone}
        />
        <Kpi
          label="Positions"
          value={String(totals.positions)}
          sub={`${inrCount} India · ${usdCount} US`}
          tone="mute"
        />
      </section>

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
    </div>
  )
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

function Kpi({
  label,
  value,
  sub,
  tone = 'tick',
}: {
  label: string
  value: string
  sub: string
  tone?: KpiTone
}) {
  return (
    <div className="bg-ink-900 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.18em] text-bone-400">
        <span className={`h-px w-3 ${kpiRail[tone]}`} />
        {label}
      </div>
      <div
        className={`mt-3 break-words font-display text-xl leading-tight tracking-tight tabular-nums lg:text-3xl xl:text-4xl ${kpiValueColor[tone]}`}
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
        <span
          aria-hidden="true"
          className="h-4 w-4 spin-slow border border-bone-100/15 border-t-tick-400"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          Loading charts
        </span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="space-y-6">
      <PageHead title="Analytics" caption="No holdings on file yet" />
      <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
        <p className="font-sans text-base text-bone-200">
          Once you import your first file, this page will fill with charts and totals.
        </p>
        <Link
          to="/settings"
          className="mt-6 inline-flex items-center gap-2 border border-tick-400 bg-tick-400 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200"
        >
          Go to Settings →
        </Link>
      </div>
    </div>
  )
}
