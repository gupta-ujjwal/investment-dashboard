import type { ManualAsset } from '../storage/assets'
import type { BudgetMonth } from '../storage/budget'
import type { CanonicalHolding } from '../storage/holdings'
import type { Settings } from '../storage/settings'
import { concentration, portfolioTotals } from './analytics'
import { formatMoney, formatPercent } from './format'
import { deriveRows } from './holdingsView'
import { emergencyFundStatus, riskAllocation } from './planning'

export type ActionSeverity = 'crit' | 'warn' | 'info'

export type ActionItem = {
  /** Stable, human-readable identity — `'risk-drift-high'`, `'emergency-gap'`,
   *  etc. Never derived from array position, so a card's identity survives
   *  reordering. */
  id: string
  severity: ActionSeverity
  headline: string
  /** The substring of `headline` to render in the severity color. */
  emphasis: string
  detail: string
  primary: { label: string; to: string }
  secondary?: { label: string; to: string }
}

export type RailInput = {
  holdings: readonly CanonicalHolding[]
  assets: readonly ManualAsset[]
  budgetMonths: readonly BudgetMonth[]
  settings: Settings
  /** Injected, never `Date.now()` internally — otherwise the stale-prices and
   *  missing-month rules are untestable without mocking the clock globally. */
  now: number
}

const SEVERITY_ORDER: Record<ActionSeverity, number> = { crit: 0, warn: 1, info: 2 }
const RAIL_CAP = 4
const STALE_PRICES_MS = 7 * 24 * 60 * 60 * 1000
const RISK_DRIFT_THRESHOLD = 0.1
const DAY_MS = 24 * 60 * 60 * 1000

function previousMonthKey(now: number): string {
  const d = new Date(now)
  d.setDate(1) // avoid day-of-month overflow when stepping back a month
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * The action-rail rule engine — a pure fold `PortfolioState -> ActionItem[]`,
 * no I/O, no new store. Every rule is partial-aware (R1): an undefined input
 * means the rule *cannot evaluate* and must not fire, never that the
 * underlying value is zero. Capped at 4 items (RAIL_CAP), ordered
 * crit -> warn -> info, then by magnitude within a severity — matching
 * implementation-docs/dashboard-ux-redesign.md's PR-2 commit-2 spec.
 */
export function buildActionRail(input: RailInput): ActionItem[] {
  const { holdings, assets, budgetMonths, settings, now } = input
  const base = settings.baseCurrency
  const items: ActionItem[] = []
  const magnitude = new Map<string, number>()

  // risk-drift-<band>: fires only when a target is actually set for that
  // band — an unset target means "not evaluable", not "0% target".
  for (const slice of riskAllocation(holdings, assets, settings.allocationTargets ?? [])) {
    if (slice.targetPct === undefined) continue
    const drift = Math.abs(slice.pct - slice.targetPct)
    if (drift > RISK_DRIFT_THRESHOLD) {
      const id = `risk-drift-${slice.band}`
      items.push({
        id,
        severity: 'crit',
        headline: `${slice.label} is ${formatPercent(slice.pct)} of your portfolio`,
        emphasis: formatPercent(slice.pct),
        detail: `Target is ${formatPercent(slice.targetPct)} — ${
          slice.pct > slice.targetPct ? 'over' : 'under'
        } by ${formatPercent(drift)}.`,
        primary: { label: 'Review allocation', to: '/planning' },
      })
      magnitude.set(id, drift)
    }
  }

  // emergency-gap: only fires when a target is actually configured
  // (monthlyNeed + months both set) AND fundedPct comes back defined.
  const emergency = emergencyFundStatus(
    assets,
    settings.emergencyMonthlyNeed,
    settings.emergencyMonths,
  )
  if (emergency.target !== undefined && emergency.fundedPct !== undefined && emergency.fundedPct < 1) {
    items.push({
      id: 'emergency-gap',
      severity: 'warn',
      headline: `Emergency fund is ${formatPercent(emergency.fundedPct)} funded`,
      emphasis: formatPercent(emergency.fundedPct),
      detail: `Target ${formatMoney(emergency.target, base)} — you have ${formatMoney(emergency.current, base)}.`,
      primary: { label: 'Review plan', to: '/planning' },
    })
    magnitude.set('emergency-gap', 1 - emergency.fundedPct)
  }

  // stale-prices: only evaluable with at least one holding — an empty
  // portfolio has no "newest import" to be stale relative to.
  if (holdings.length > 0) {
    const newestImportedAt = holdings.reduce((max, h) => Math.max(max, h.importedAt), 0)
    const ageMs = now - newestImportedAt
    if (ageMs > STALE_PRICES_MS) {
      const days = Math.floor(ageMs / DAY_MS)
      items.push({
        id: 'stale-prices',
        severity: 'info',
        headline: `Prices are ${days} day${days === 1 ? '' : 's'} old`,
        emphasis: `${days} day${days === 1 ? '' : 's'}`,
        detail: 'Import a fresh broker export to bring current prices up to date.',
        primary: { label: 'Import', to: '/import' },
      })
      magnitude.set('stale-prices', ageMs)
    }
  }

  // unstamped-fx: portfolioTotals().unstamped is always a concrete count
  // (never undefined), so this rule is always evaluable.
  const totals = portfolioTotals([...holdings])
  if (totals.unstamped > 0) {
    items.push({
      id: 'unstamped-fx',
      severity: 'info',
      headline: `${totals.unstamped} holding${totals.unstamped === 1 ? '' : 's'} missing a ${base} value`,
      emphasis: String(totals.unstamped),
      detail: 'Refresh FX in Settings to compute base-currency figures for these holdings.',
      primary: { label: 'Refresh FX', to: '/settings' },
    })
    magnitude.set('unstamped-fx', totals.unstamped)
  }

  // missing-month: fires when last calendar month has no budget record at
  // all — always evaluable (an empty budgetMonths list just means it fires).
  const prevKey = previousMonthKey(now)
  if (!budgetMonths.some((m) => m.month === prevKey)) {
    items.push({
      id: 'missing-month',
      severity: 'warn',
      headline: `${monthLabel(prevKey)} isn't logged yet`,
      emphasis: monthLabel(prevKey),
      detail: "Close out last month's cash flow to keep your averages accurate.",
      primary: { label: 'Log month', to: '/budget' },
    })
    magnitude.set('missing-month', 1)
  }

  // concentration: concentration() already returns singleStockRisk:undefined
  // both when nothing is priced and when the top holding is genuinely <=10%
  // — both cases correctly must-not-fire here.
  const conc = concentration(deriveRows([...holdings]))
  if (conc.singleStockRisk !== undefined) {
    items.push({
      id: 'concentration',
      severity: 'warn',
      headline: `${conc.singleStockRisk.holding.name} is ${formatPercent(conc.singleStockRisk.weight)} of your portfolio`,
      emphasis: formatPercent(conc.singleStockRisk.weight),
      detail: 'A single position over 10% concentrates risk in one company.',
      primary: { label: 'View portfolio', to: '/portfolio' },
    })
    magnitude.set('concentration', conc.singleStockRisk.weight)
  }

  items.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (bySeverity !== 0) return bySeverity
    return (magnitude.get(b.id) ?? 0) - (magnitude.get(a.id) ?? 0)
  })

  // Capped at 4, silently — no dismiss and no "N more" row in this narrower
  // cut of the original design (that overflow indicator is presentational
  // polish, not load-bearing for the honest-delta/action-rail core).
  return items.slice(0, RAIL_CAP)
}
