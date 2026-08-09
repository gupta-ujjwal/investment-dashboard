import { lazy, Suspense } from 'react'
import { Link, useLoaderData } from 'react-router-dom'
import type { BaseCurrency, CanonicalHolding } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'
import type { ManualAsset } from '../storage/assets'
import type { BudgetMonth } from '../storage/budget'
import type { Settings } from '../storage/settings'
import { portfolioTotals } from '../lib/analytics'
import {
  buildPositions,
  netWorthAllocation,
  netWorthTotals,
  type NetWorthSlice,
  type NetWorthTotals,
} from '../lib/netWorth'
import { emergencyFundStatus, type EmergencyFundStatus } from '../lib/planning'
import { projectGoal, type GoalProjection } from '../lib/goals'
import { monthlyAverages, type MonthlyAverages } from '../lib/budget'
import {
  effectiveValue,
  liquidAssets,
  provenanceLabel,
  runwayMonths,
  type ValueSource,
} from '../lib/cashflow'
import { formatMoney, formatPercent } from '../lib/format'
import { RefreshBanner } from '../components/RefreshBanner'
import {
  FEATURE_BASE_CURRENCY,
  FEATURE_BUDGET,
  FEATURE_GOALS,
  FEATURE_HISTORY,
  FEATURE_PLANNING,
} from '../featureFlags'

/** Recharts is heavy (~100KB+); keep the Overview's cross-asset charts out of
 *  the initial bundle so the net-worth KPIs paint first. */
const OverviewCharts = lazy(() => import('../components/charts/OverviewCharts'))

type LoaderData = {
  holdings: CanonicalHolding[]
  settings: Settings
  history: HistoryRecord[]
  assets: ManualAsset[]
  budgetMonths: BudgetMonth[]
}

/**
 * The homepage — generic, cross-asset analytics only. Equity is just one asset
 * class here; the per-ticker table and equity-specific depth live on the Equity
 * tab. Surfaces: net worth + composition (allocation by asset class), emergency
 * fund status, goal projection, and the historical/by-class charts.
 */
export function OverviewRoute() {
  const { holdings, settings, history, assets, budgetMonths } = useLoaderData() as LoaderData
  const assetList = assets ?? []

  if (holdings.length === 0 && assetList.length === 0) {
    return <EmptyState />
  }

  const base = settings.baseCurrency
  const positions = buildPositions(holdings, assetList)
  const netWorth = netWorthTotals(positions)
  const allocation = netWorthAllocation(positions)
  // Net-worth-level "refresh needed" hint: any position lacking a base value.
  const totals = portfolioTotals(holdings)

  // W2 — budget-fed figures. `avg` is undefined under 2 logged months (no
  // unstable single-point average); the derived feeds then fall back to unset.
  const avg = FEATURE_BUDGET ? monthlyAverages(budgetMonths) : undefined
  // Settings value is the explicit override; budget-derived is the fallback.
  const emergencyNeed = effectiveValue(settings.emergencyMonthlyNeed, avg?.avgExpenses)
  const contribution = effectiveValue(settings.monthlyContribution, avg?.avgInvested)

  const goal: GoalProjection | undefined =
    FEATURE_GOALS && (settings.goalCorpus ?? 0) > 0
      ? projectGoal(netWorth.knownCurrentValue, settings.goalCorpus, contribution.value)
      : undefined
  const emergency: EmergencyFundStatus | undefined =
    FEATURE_PLANNING && assetList.length > 0
      ? emergencyFundStatus(assetList, emergencyNeed.value, settings.emergencyMonths)
      : undefined

  return (
    <div className="space-y-10">
      <PageHead title="Overview" caption="Your whole net worth, on-device" />

      {FEATURE_BASE_CURRENCY && totals.unstamped > 0 && (
        <RefreshBanner unstamped={totals.unstamped} baseCurrency={base} />
      )}

      <NetWorthSection netWorth={netWorth} allocation={allocation} base={base} />

      {avg && (
        <CashFlowCard avg={avg} runway={runwayMonths(liquidAssets(assetList), avg.avgExpenses)} base={base} />
      )}

      {emergency && <EmergencyCard status={emergency} base={base} source={emergencyNeed.source} avgMonths={avg?.months} />}

      {goal && <GoalCard goal={goal} base={base} source={contribution.source} avgMonths={avg?.months} />}

      {FEATURE_HISTORY && (
        <section aria-label="History">
          <div className="flex items-end justify-between">
            <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
              History
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
              {history.length} snapshot{history.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mt-4">
            <Suspense fallback={<ChartsFallback />}>
              <OverviewCharts history={history} baseCurrency={base} />
            </Suspense>
          </div>
        </section>
      )}
    </div>
  )
}

/** Net-worth summary: holdings + manual assets folded into one figure, with a
 *  partial badge when some position lacks a base value, and an allocation-by-
 *  class breakdown (the "overall portfolio composition"). */
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
      <SectionHeading to="/investments">Net worth</SectionHeading>
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

/** Allocation-by-asset-class as a labelled bar list — the chart-free
 *  "overall portfolio composition" that reads at a glance with no Recharts. */
function AllocationBars({ slices, base }: { slices: NetWorthSlice[]; base: BaseCurrency }) {
  return (
    <ul className="space-y-2 border border-bone-100/10 bg-ink-900 p-4">
      {slices.map((s) => (
        <li key={s.key} className="space-y-1">
          <div className="flex items-baseline justify-between font-mono text-[11px] text-bone-300">
            <span className="uppercase tracking-[0.14em]">{s.label}</span>
            <span className="tabular-nums whitespace-nowrap text-bone-400">
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

/** Emergency-fund status — a compact card on the homepage mirroring the Planning
 *  tab's fuller view (same `emergencyFundStatus` fold, one source of truth). */
function EmergencyCard({
  status,
  base,
  source,
  avgMonths,
}: {
  status: EmergencyFundStatus
  base: BaseCurrency
  source: ValueSource
  avgMonths: number | undefined
}) {
  const coverage = status.coverageMonths
  const funded = status.fundedPct
  const tone: KpiTone = funded === undefined ? 'mute' : funded >= 1 ? 'gain' : 'loss'
  const provenance = provenanceLabel(source, avgMonths)
  return (
    <section aria-label="Emergency fund" className="space-y-3">
      <div className="flex items-end justify-between">
        <SectionHeading to="/planning">Emergency fund</SectionHeading>
        {provenance && status.monthlyNeed !== undefined && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
            need · {provenance}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-3">
        <Kpi label={`Fund · ${base}`} value={formatMoney(status.current, base)} sub="tagged assets" tone="tick" />
        <Kpi
          label="Coverage"
          value={coverage === undefined ? '—' : `${coverage.toFixed(1)} mo`}
          sub={status.monthlyNeed === undefined ? 'set monthly need' : `at ${formatMoney(status.monthlyNeed, base)}/mo`}
          tone="mute"
        />
        <Kpi
          label="Funded"
          value={funded === undefined ? '—' : `${(funded * 100).toFixed(0)}%`}
          sub={status.target === undefined ? 'set a target in Settings' : `of ${formatMoney(status.target, base)}`}
          tone={tone}
        />
      </div>
      {status.excludedCount > 0 && (
        <p role="status" className="font-mono text-[11px] text-bone-400">
          {status.excludedCount} emergency-tagged asset{status.excludedCount === 1 ? '' : 's'} not
          valued (refresh FX) and excluded from the fund total.
        </p>
      )}
    </section>
  )
}

/** Goal projection card — corpus progress + time-to-goal under a stated model. */
function GoalCard({
  goal,
  base,
  source,
  avgMonths,
}: {
  goal: GoalProjection
  base: BaseCurrency
  source: ValueSource
  avgMonths: number | undefined
}) {
  const provenance = provenanceLabel(source, avgMonths)
  return (
    <section aria-label="Goal" className="space-y-3">
      <SectionHeading to="/planning">Goal</SectionHeading>
      <div className="space-y-4 border border-bone-100/10 bg-ink-900 p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-400">
            {formatMoney(goal.current, base)} of {formatMoney(goal.target, base)}
          </span>
          <span className="font-display text-2xl tabular-nums whitespace-nowrap text-tick-300">
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
              ? 'Set a monthly contribution in Settings — or log two budget months — to project a timeline.'
              : `~${goal.monthsToGoal} month${goal.monthsToGoal === 1 ? '' : 's'} to goal (${goal.yearsToGoal} yr) at ${formatMoney(goal.monthlyContribution, base)}/mo${provenance ? ` (${provenance})` : ''}.`}
          <span className="mt-1 block text-bone-500">{goal.assumptionNote}</span>
        </p>
      </div>
    </section>
  )
}

/** W2 cash-flow card — the budget-native surface on Overview. Savings rate leads
 *  (the metric nothing else shows); avg income/expenses/invested/leftover fill in;
 *  months-of-runway (total liquid ÷ avg expenses) is a supporting detail, framed
 *  distinctly from the emergency-fund coverage so the two don't read as one gauge. */
function CashFlowCard({
  avg,
  runway,
  base,
}: {
  avg: MonthlyAverages
  runway: number | undefined
  base: BaseCurrency
}) {
  const savingsTone: KpiTone =
    avg.savingsRate === undefined ? 'mute' : avg.savingsRate >= 0 ? 'gain' : 'loss'
  return (
    <section aria-label="Cash flow" className="space-y-3">
      <div className="flex items-end justify-between">
        <SectionHeading to="/budget">Cash flow</SectionHeading>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
          avg of {avg.months} month{avg.months === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-3">
        <Kpi
          label="Savings rate"
          value={avg.savingsRate === undefined ? '—' : formatPercent(avg.savingsRate)}
          sub="of income kept"
          tone={savingsTone}
        />
        <Kpi label={`Income · ${base}`} value={formatMoney(avg.avgIncome, base)} sub="avg / month" tone="mute" />
        <Kpi label={`Expenses · ${base}`} value={formatMoney(avg.avgExpenses, base)} sub="avg / month" tone="mute" />
        <Kpi label={`Invested · ${base}`} value={formatMoney(avg.avgInvested, base)} sub="avg / month" tone="mute" />
        <Kpi
          label={`Left over · ${base}`}
          value={formatMoney(avg.avgNet, base)}
          sub="avg / month"
          tone={avg.avgNet >= 0 ? 'mute' : 'loss'}
        />
        <Kpi
          label="Runway"
          value={runway === undefined ? '—' : `${runway.toFixed(1)} mo`}
          sub="liquid buffer ÷ expenses"
          tone="tick"
        />
      </div>
    </section>
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

const SECTION_HEADING = 'font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300'

/** A section heading that deep-links to the tab that owns it (#5) — Overview is
 *  the hub, so each card is a jumping-off point. `to` omitted → a plain heading. */
function SectionHeading({ children, to }: { children: React.ReactNode; to?: string }) {
  if (!to) return <h3 className={SECTION_HEADING}>{children}</h3>
  return (
    <h3 className={SECTION_HEADING}>
      <Link to={to} className="group inline-flex items-center gap-1.5 transition hover:text-tick-400">
        {children}
        <span aria-hidden="true" className="text-[10px] opacity-0 transition group-hover:opacity-100">
          →
        </span>
      </Link>
    </h3>
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
      <PageHead title="Overview" caption="Nothing on file yet" />
      <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
        <p className="font-sans text-base text-bone-200">
          Import your holdings or add an investment, and this page fills with your net worth and trends.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/import"
            className="inline-flex items-center gap-2 border border-tick-400 bg-tick-400 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200"
          >
            Go to Import →
          </Link>
          <Link
            to="/investments"
            className="inline-flex items-center gap-2 border border-bone-100/15 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-bone-200 transition hover:border-tick-400 hover:text-tick-400"
          >
            Add an investment →
          </Link>
        </div>
      </div>
    </div>
  )
}
