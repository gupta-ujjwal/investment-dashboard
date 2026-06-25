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
