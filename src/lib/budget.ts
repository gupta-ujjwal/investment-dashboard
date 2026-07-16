import type { BudgetLine, BudgetMonth } from '../storage/budget'

/**
 * Pure folds over a month's cash flow — the `% of income spent / invested /
 * remaining` figures from the reference spreadsheet. Single-currency (base):
 * the budget is tracked in the reporting currency, so there is no FX here.
 * Percentages are `undefined` when income is zero (R1 — never divide by zero
 * into a sentinel).
 *
 * The lower half of this module (below `summarizeAll`) holds the derived shapes
 * the focused-month view renders — allocation wedges, expense breakdown, and the
 * month-over-month delta. Each is pure and *total*: defined for every input,
 * including the degenerate ones (0 months, first month, income 0, all-zero
 * expenses, overspent month). None ever emits `NaN`/`Infinity` into a chart —
 * the honest "no opinion" is `undefined` or an empty list (R1), so the view can
 * branch to an explicit empty/overspent state instead of drawing a garbage
 * slice.
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

// ── Focused-month derived shapes (allocation donut, expense donut, delta) ──

/** One wedge of the allocation donut — how a month's income split three ways. */
export type AllocationWedge = {
  key: 'spent' | 'invested' | 'remaining'
  label: string
  value: number
}

export type MonthAllocation = {
  /** Wedges with a strictly positive value, in spent→invested→remaining order.
   *  Empty when the month has no spend, no investment, and no positive leftover
   *  (a blank month) — the donut renders its empty state instead of an empty pie. */
  wedges: AllocationWedge[]
  /** Amount by which spend + investment exceeded income (`-remaining`), or
   *  `undefined` when the month balances or has a surplus. A donut cannot draw a
   *  negative slice, so an overspent month drops the `remaining` wedge and the
   *  view shows an explicit "overspent by X" callout keyed off this field. */
  overspentBy: number | undefined
}

/**
 * Allocation-donut data from a month summary. The `remaining` wedge appears only
 * when `remaining ≥ 0`; when the month is overspent the wedge is dropped and
 * `overspentBy` carries the shortfall so the view can annotate honestly rather
 * than render a phantom negative slice. Zero-valued wedges are filtered out (an
 * invisible slice is noise), so a blank month yields an empty `wedges` list.
 */
export function allocationSlices(summary: BudgetSummary): MonthAllocation {
  const { totalExpenses, invested, remaining } = summary
  const wedges: AllocationWedge[] = (
    [
      { key: 'spent', label: 'Spent', value: totalExpenses },
      { key: 'invested', label: 'Invested', value: invested },
      { key: 'remaining', label: 'Remaining', value: Math.max(remaining, 0) },
    ] as AllocationWedge[]
  ).filter((w) => w.value > 0)
  return { wedges, overspentBy: remaining < 0 ? -remaining : undefined }
}

/** One category wedge of the expense-breakdown donut. */
export type ExpenseSlice = {
  /** Stable key — the category label, or `__other` for the folded tail. */
  key: string
  label: string
  amount: number
  /** Share of the month's total expenses, `undefined` when expenses are 0
   *  (R1 — no divide-by-zero sentinel). */
  pct: number | undefined
}

/** Beyond this many categories the tail folds into one "Other" wedge — mirrors
 *  `SectorDonut`'s `MAX_SLICES` so the budget donut reads as one of the family. */
export const MAX_EXPENSE_SLICES = 6

/**
 * Expense lines rolled up into donut slices: summed by (trimmed) category,
 * sorted largest-first, with the tail beyond `MAX_EXPENSE_SLICES` folded into a
 * single "Other (n)" wedge. Non-positive and blank-label lines are dropped.
 * Returns `[]` when a month has no positive expense — the donut renders its
 * empty state. Operates on the existing category-total lines only; no
 * transaction detail is synthesised (productContext/dsl.md § R11).
 */
export function expenseBreakdown(
  month: BudgetMonth,
  max: number = MAX_EXPENSE_SLICES,
): ExpenseSlice[] {
  const byCategory = new Map<string, number>()
  for (const line of month.expenses) {
    const label = line.category.trim()
    if (label === '' || !(line.amount > 0)) continue
    byCategory.set(label, (byCategory.get(label) ?? 0) + line.amount)
  }
  const sorted = [...byCategory.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)

  const total = sorted.reduce((s, e) => s + e.amount, 0)
  const pctOf = (amount: number): number | undefined => (total > 0 ? amount / total : undefined)

  const folded: Array<{ label: string; amount: number; other?: true }> =
    sorted.length > max
      ? [
          ...sorted.slice(0, max - 1),
          {
            label: `Other (${sorted.length - (max - 1)})`,
            amount: sorted.slice(max - 1).reduce((s, e) => s + e.amount, 0),
            other: true,
          },
        ]
      : sorted

  return folded.map((e) => ({
    key: e.other ? '__other' : e.label,
    label: e.label,
    amount: e.amount,
    pct: pctOf(e.amount),
  }))
}

// ── Per-tag trend across months (income / expense line charts) ──

/** The folded-tail series key — categories beyond the top N collapse into it. */
export const OTHER_TAG_KEY = '__other'

/** One point of the per-tag trend: a month plus an amount column per series key.
 *  The index signature lets the string `month` coexist with the numeric series
 *  columns Recharts reads by key (mirrors analytics `ClassRow`). */
export type TagTrendPoint = { month: string } & Record<string, number | string>

export type TagTrend = {
  /** Series keys, ordered by total across months (largest first); includes
   *  `OTHER_TAG_KEY` last when the tail was folded. Empty when no data. */
  labels: string[]
  /** One row per month, oldest→newest. A label absent in a month is `0` — you
   *  earned/spent nothing on it that month, which is the honest value for a
   *  trend line (matches the stacked-area `ClassRow` convention), not a gap. */
  rows: TagTrendPoint[]
}

/**
 * Per-category amount over time for one line list (income or expense) — the data
 * behind the "track a tag across months" line chart. Categories are summed by
 * trimmed label within each month, ranked by total across all months, and the
 * tail beyond `max` is folded into a single `OTHER_TAG_KEY` series so the chart
 * never becomes spaghetti. Non-positive / blank lines are dropped. Pure and
 * total: `{ labels: [], rows: [] }` when there is no positive data. Categories
 * are `BudgetLine.category` labels (which is what a tag writes) — no tag-id
 * lookup, and free-text categories that were never saved as tags are included
 * too, so the trend is honest about every line the user entered (R11 — over
 * existing lines, nothing synthesised).
 */
export function tagTimeSeries(
  months: readonly BudgetMonth[],
  kind: 'income' | 'expense',
  max: number = MAX_EXPENSE_SLICES,
): TagTrend {
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month))
  const linesFor = (m: BudgetMonth): readonly BudgetLine[] =>
    kind === 'income' ? m.income : m.expenses

  // Per-month category sums, and the running grand total per category.
  const perMonth = ordered.map((m) => {
    const byCat = new Map<string, number>()
    for (const line of linesFor(m)) {
      const label = line.category.trim()
      if (label === '' || !(line.amount > 0)) continue
      byCat.set(label, (byCat.get(label) ?? 0) + line.amount)
    }
    return { month: m.month, byCat }
  })

  const totals = new Map<string, number>()
  for (const { byCat } of perMonth) {
    for (const [label, amount] of byCat) totals.set(label, (totals.get(label) ?? 0) + amount)
  }
  if (totals.size === 0) return { labels: [], rows: [] }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label)
  const folded = ranked.length > max
  const headLabels = folded ? ranked.slice(0, max - 1) : ranked
  const tail = new Set(folded ? ranked.slice(max - 1) : [])
  const labels = folded ? [...headLabels, OTHER_TAG_KEY] : headLabels

  const rows: TagTrendPoint[] = perMonth.map(({ month, byCat }) => {
    const row: TagTrendPoint = { month }
    for (const label of headLabels) row[label] = byCat.get(label) ?? 0
    if (folded) {
      let other = 0
      for (const [label, amount] of byCat) if (tail.has(label)) other += amount
      row[OTHER_TAG_KEY] = other
    }
    return row
  })

  return { labels, rows }
}

/** Signed month-over-month movement of the headline figures. Positive means the
 *  current month is larger than the prior one on that axis. */
export type MonthDelta = {
  income: number
  expenses: number
  invested: number
  remaining: number
}

/**
 * The current month's figures minus the previous month's. Returns `undefined`
 * when there is no previous month (the first logged month has nothing to compare
 * against) — an honest "no comparison", never a fabricated zero delta (R1). Both
 * summaries are single-currency base, so the subtraction is currency-safe.
 */
export function monthOverMonth(
  current: BudgetSummary,
  previous: BudgetSummary | undefined,
): MonthDelta | undefined {
  if (!previous) return undefined
  return {
    income: current.totalIncome - previous.totalIncome,
    expenses: current.totalExpenses - previous.totalExpenses,
    invested: current.invested - previous.invested,
    remaining: current.remaining - previous.remaining,
  }
}
