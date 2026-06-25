import { lazy, Suspense } from 'react'
import { Link, useLoaderData } from 'react-router-dom'
import type { BaseCurrency, CanonicalHolding } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'
import type { ManualAsset } from '../storage/assets'
import type { Settings } from '../storage/settings'
import {
  concentration,
  portfolioTotals,
  type Concentration,
  type HhiBand,
} from '../lib/analytics'
import {
  buildPositions,
  netWorthAllocation,
  netWorthTotals,
  type NetWorthSlice,
  type NetWorthTotals,
} from '../lib/netWorth'
import { projectGoal, type GoalProjection } from '../lib/goals'
import { deriveRows } from '../lib/holdingsView'
import { formatMoney, formatPercent } from '../lib/format'
import { RefreshBanner } from '../components/RefreshBanner'
import {
  FEATURE_ANALYTICS_DEPTH,
  FEATURE_ASSETS,
  FEATURE_BASE_CURRENCY,
  FEATURE_GOALS,
  FEATURE_HISTORY,
} from '../featureFlags'

/** Recharts is heavy (~100KB+); keep it out of the initial bundle so the KPI
 *  row paints first. The Suspense fallback covers the chunk load. */
const ChartsPanel = lazy(() => import('../components/charts/ChartsPanel'))

type LoaderData = {
  holdings: CanonicalHolding[]
  settings: Settings
  history: HistoryRecord[]
  assets: ManualAsset[]
}

export function AnalyticsRoute() {
  const { holdings, settings, history, assets } = useLoaderData() as LoaderData
  const assetList = assets ?? []

  // Empty only when there is nothing at all — assets alone are enough to show
  // a net worth, so a holdings-empty / assets-present user still gets a page.
  if (holdings.length === 0 && assetList.length === 0) {
    return <EmptyState />
  }

  const base = settings.baseCurrency
  const showNetWorth = FEATURE_ASSETS && assetList.length > 0
  const positions = buildPositions(holdings, assetList)
  const netWorth = netWorthTotals(positions)
  const allocation = netWorthAllocation(positions)
  const goal: GoalProjection | undefined =
    FEATURE_GOALS && (settings.goalCorpus ?? 0) > 0
      ? projectGoal(netWorth.knownCurrentValue, settings.goalCorpus, settings.monthlyContribution)
      : undefined
  const totals = portfolioTotals(holdings)
  const inrCount = holdings.filter((h) => h.currency === 'INR').length
  const usdCount = holdings.length - inrCount
  const pnlTone: KpiTone =
    totals.totalProfitBase === undefined
      ? 'mute'
      : totals.totalProfitBase >= 0
        ? 'gain'
        : 'loss'
  const conc: Concentration | undefined = FEATURE_ANALYTICS_DEPTH
    ? concentration(deriveRows(holdings))
    : undefined

  return (
    <div className="space-y-10">
      <PageHead title="Analytics" caption="Portfolio snapshot, on-device" />

      {FEATURE_BASE_CURRENCY && totals.unstamped > 0 && (
        <RefreshBanner unstamped={totals.unstamped} baseCurrency={base} />
      )}

      {showNetWorth && (
        <NetWorthSection netWorth={netWorth} allocation={allocation} base={base} />
      )}

      {goal && <GoalCard goal={goal} base={base} />}

      {holdings.length > 0 && (
        <>
          <section aria-label="Equity holdings key figures" className="space-y-3">
            {showNetWorth && (
              <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
                Equity holdings
              </h3>
            )}
            <div className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4">
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
            </div>
          </section>

          {conc && <RiskRow concentration={conc} />}

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
        </>
      )}
    </div>
  )
}

/** Net-worth summary: holdings + manual assets folded into one figure, with a
 *  partial badge when some position lacks a base value (never a silently
 *  understated total), and an allocation-by-class breakdown. */
function NetWorthSection({
  netWorth,
  allocation,
  base,
}: {
  netWorth: NetWorthTotals
  allocation: NetWorthSlice[]
  base: BaseCurrency
}) {
  const partial = netWorth.excludedCount > 0
  return (
    <section aria-label="Net worth" className="space-y-4">
      <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
        Net worth
      </h3>
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-3">
        <Kpi
          label={`Net worth · ${base}`}
          value={formatMoney(netWorth.knownCurrentValue, base)}
          sub={
            partial
              ? `partial · ${netWorth.excludedCount} not valued`
              : `${netWorth.totalPositions} position${netWorth.totalPositions === 1 ? '' : 's'}`
          }
          tone={partial ? 'loss' : 'tick'}
        />
        <Kpi
          label={`Invested · ${base}`}
          value={formatMoney(netWorth.knownInvested, base)}
          sub="cost basis (where known)"
          tone="mute"
        />
        <Kpi
          label={`P&L · ${base}`}
          value={formatMoney(netWorth.profitKnown, base)}
          sub={
            netWorth.profitPctKnown === undefined
              ? 'no comparable basis'
              : formatPercent(netWorth.profitPctKnown)
          }
          tone={netWorth.profitKnown >= 0 ? 'gain' : 'loss'}
        />
      </div>

      {partial && (
        <p
          role="status"
          className="border-l-2 border-ember-400/60 bg-ember-900/15 px-4 py-2 font-sans text-xs text-ember-300"
        >
          {netWorth.excludedCount} of {netWorth.totalPositions} positions have no
          base-currency value yet (unpriced holding or stale FX) and are excluded
          from the total above. Refresh FX or add a price to complete it.
        </p>
      )}

      {allocation.length > 0 && <AllocationBars slices={allocation} base={base} />}
    </section>
  )
}

/** Allocation-by-asset-class as a labelled bar list — a lightweight, chart-free
 *  breakdown that reads at a glance and needs no Recharts chunk. */
function AllocationBars({ slices, base }: { slices: NetWorthSlice[]; base: BaseCurrency }) {
  return (
    <ul className="space-y-2 border border-bone-100/10 bg-ink-900 p-4">
      {slices.map((s) => (
        <li key={s.key} className="space-y-1">
          <div className="flex items-baseline justify-between font-mono text-[11px] text-bone-300">
            <span className="uppercase tracking-[0.14em]">{s.label}</span>
            <span className="tabular-nums text-bone-400">
              {formatMoney(s.valueBase, base)} · {(s.pct * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden bg-bone-100/10">
            <div
              className="h-full bg-tick-400/70"
              style={{ width: `${Math.max(2, s.pct * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Goal projection card (Phase 4) — corpus progress + time-to-goal under a
 *  stated, visible projection model. */
function GoalCard({ goal, base }: { goal: GoalProjection; base: BaseCurrency }) {
  return (
    <section aria-label="Goal" className="space-y-3">
      <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
        Goal
      </h3>
      <div className="space-y-4 border border-bone-100/10 bg-ink-900 p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-400">
            {formatMoney(goal.current, base)} of {formatMoney(goal.target, base)}
          </span>
          <span className="font-display text-2xl tabular-nums text-tick-300">
            {(goal.progressPct * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden bg-bone-100/10">
          <div
            className="h-full bg-tick-400"
            style={{ width: `${Math.min(100, goal.progressPct * 100)}%` }}
          />
        </div>
        <p className="font-sans text-xs text-bone-400">
          {goal.reached
            ? 'Goal reached 🎉'
            : goal.monthsToGoal === undefined
              ? 'Set a monthly contribution in Settings to project a timeline.'
              : `~${goal.monthsToGoal} month${goal.monthsToGoal === 1 ? '' : 's'} to goal (${goal.yearsToGoal} yr) at ${formatMoney(goal.monthlyContribution, base)}/mo.`}
          <span className="mt-1 block text-bone-500">{goal.assumptionNote}</span>
        </p>
      </div>
    </section>
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
          to="/import"
          className="mt-6 inline-flex items-center gap-2 border border-tick-400 bg-tick-400 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200"
        >
          Go to Import →
        </Link>
      </div>
    </div>
  )
}

/** Risk sub-row beneath the main KPIs — concentration metrics derived from
 *  the priced holdings. Only the `high` HHI band and a firing single-stock
 *  flag get an ember tone; everything else stays mute so the row reads as
 *  context rather than alarm. */
function RiskRow({ concentration: c }: { concentration: Concentration }) {
  const hhiBandLabel: Record<HhiBand, string> = {
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
  }
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
        sub={
          c.singleStockRisk === undefined
            ? 'no position >10%'
            : `${pctNoSign(c.singleStockRisk.weight)} of portfolio`
        }
        tone={c.singleStockRisk === undefined ? 'mute' : 'loss'}
      />
    </section>
  )
}

/** `formatPercent` includes a leading `+` for positive values; the Risk row
 *  reads weights as magnitudes, not directional changes, so the sign is noise. */
function pctNoSign(value: number): string {
  return formatPercent(value).replace('+', '')
}
