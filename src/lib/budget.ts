import type { BudgetLine, BudgetMonth } from '../storage/budget'

/**
 * Pure folds over a month's cash flow — the `% of income spent / invested /
 * remaining` figures from the reference spreadsheet. Single-currency (base):
 * the budget is tracked in the reporting currency, so there is no FX here.
 * Percentages are `undefined` when income is zero (R1 — never divide by zero
 * into a sentinel).
 */
export type BudgetSummary = {
  totalIncome: number
  totalExpenses: number
  invested: number
  /** Income − expenses − invested. Can be negative (overspent). */
  remaining: number
  /** Shares of income, `undefined` when income is 0. */
  spentPct: number | undefined
  investedPct: number | undefined
  remainingPct: number | undefined
}

function sumLines(lines: readonly BudgetLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0)
}

export function summarizeMonth(month: BudgetMonth): BudgetSummary {
  const totalIncome = sumLines(month.income)
  const totalExpenses = sumLines(month.expenses)
  const invested = month.invested
  const remaining = totalIncome - totalExpenses - invested
  const share = (n: number): number | undefined =>
    totalIncome > 0 ? n / totalIncome : undefined
  return {
    totalIncome,
    totalExpenses,
    invested,
    remaining,
    spentPct: share(totalExpenses),
    investedPct: share(invested),
    remainingPct: share(remaining),
  }
}

/**
 * Per-month averages over the logged months — the budget-native feed for the
 * flywheel (W2): avg expenses seeds a derived emergency need, avg invested seeds
 * a derived goal contribution, and the savings rate is the Overview cash-flow
 * card's hero. Deliberately returns `undefined` for the whole struct when fewer
 * than `MIN_MONTHS` are logged: one or two data points make an average violently
 * unstable, and a confident-but-meaningless figure would then propagate onto
 * three surfaces at once. `undefined` (not `0`) is the honest "no opinion" (R1),
 * so the `??` precedence fallbacks never fire on garbage.
 */
export const MIN_MONTHS_FOR_AVERAGE = 2

export type MonthlyAverages = {
  /** How many months the averages were taken over — drives the "avg of N months" label. */
  months: number
  avgIncome: number
  avgExpenses: number
  avgInvested: number
  /** Unallocated leftover per month: avgIncome − avgExpenses − avgInvested. */
  avgNet: number
  /** Personal savings rate over the combined totals: (income − expenses) / income,
   *  `undefined` when total income is 0 (never divide into a sentinel). */
  savingsRate: number | undefined
}

export function monthlyAverages(months: readonly BudgetMonth[]): MonthlyAverages | undefined {
  const n = months.length
  if (n < MIN_MONTHS_FOR_AVERAGE) return undefined
  const all = summarizeAll(months)
  return {
    months: n,
    avgIncome: all.totalIncome / n,
    avgExpenses: all.totalExpenses / n,
    avgInvested: all.invested / n,
    avgNet: (all.totalIncome - all.totalExpenses - all.invested) / n,
    savingsRate:
      all.totalIncome > 0 ? (all.totalIncome - all.totalExpenses) / all.totalIncome : undefined,
  }
}

/** Roll several months into running totals — used for an at-a-glance "across N
 *  months" figure. Pure sum; percentages recomputed over the combined income. */
export function summarizeAll(months: readonly BudgetMonth[]): BudgetSummary {
  const totalIncome = months.reduce((s, m) => s + sumLines(m.income), 0)
  const totalExpenses = months.reduce((s, m) => s + sumLines(m.expenses), 0)
  const invested = months.reduce((s, m) => s + m.invested, 0)
  const remaining = totalIncome - totalExpenses - invested
  const share = (n: number): number | undefined =>
    totalIncome > 0 ? n / totalIncome : undefined
  return {
    totalIncome,
    totalExpenses,
    invested,
    remaining,
    spentPct: share(totalExpenses),
    investedPct: share(invested),
    remainingPct: share(remaining),
  }
}
