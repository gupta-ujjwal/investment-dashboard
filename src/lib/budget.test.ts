import { describe, expect, it } from 'vitest'
import type { BudgetMonth } from '../storage/budget'
import {
  allocationSlices,
  expenseBreakdown,
  monthlyAverages,
  monthOverMonth,
  summarizeAll,
  summarizeMonth,
} from './budget'

function month(over: Partial<BudgetMonth> = {}): BudgetMonth {
  return {
    month: '2026-06',
    income: [{ category: 'Salary', amount: 280000 }],
    expenses: [
      { category: 'Rent', amount: 43000 },
      { category: 'Family', amount: 80000 },
    ],
    invested: 50000,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }
}

describe('summarizeMonth', () => {
  it('computes totals and income shares', () => {
    const s = summarizeMonth(month())
    expect(s.totalIncome).toBe(280000)
    expect(s.totalExpenses).toBe(123000)
    expect(s.invested).toBe(50000)
    expect(s.remaining).toBe(280000 - 123000 - 50000)
    expect(s.spentPct).toBeCloseTo(123000 / 280000, 10)
    expect(s.investedPct).toBeCloseTo(50000 / 280000, 10)
  })

  it('returns undefined percentages when income is zero (no divide-by-zero sentinel)', () => {
    const s = summarizeMonth(
      month({ income: [], expenses: [{ category: 'Rent', amount: 1000 }], invested: 0 }),
    )
    expect(s.totalIncome).toBe(0)
    expect(s.spentPct).toBeUndefined()
    expect(s.investedPct).toBeUndefined()
    expect(s.remainingPct).toBeUndefined()
    // remaining is still a real (negative) number
    expect(s.remaining).toBe(-1000)
  })

  it('allows a negative remaining (overspent month)', () => {
    const s = summarizeMonth(month({ expenses: [{ category: 'Big', amount: 300000 }], invested: 0 }))
    expect(s.remaining).toBeLessThan(0)
  })
})

describe('summarizeAll', () => {
  it('rolls multiple months into combined totals', () => {
    const s = summarizeAll([month(), month({ month: '2026-05', invested: 0 })])
    expect(s.totalIncome).toBe(560000)
    expect(s.invested).toBe(50000)
  })
})

describe('monthlyAverages', () => {
  it('returns undefined under the 2-month minimum (no unstable single-point average)', () => {
    expect(monthlyAverages([])).toBeUndefined()
    expect(monthlyAverages([month()])).toBeUndefined()
  })

  it('averages income / expenses / invested and the savings rate over N months', () => {
    // Two months: income 280k+280k, expenses 123k+123k, invested 50k+0.
    const avg = monthlyAverages([month(), month({ month: '2026-05', invested: 0 })])
    expect(avg).toBeDefined()
    if (!avg) return
    expect(avg.months).toBe(2)
    expect(avg.avgIncome).toBe(280000)
    expect(avg.avgExpenses).toBe(123000)
    expect(avg.avgInvested).toBe(25000) // (50000 + 0) / 2
    expect(avg.avgNet).toBe(280000 - 123000 - 25000)
    // savings rate = (560000 - 246000) / 560000
    expect(avg.savingsRate).toBeCloseTo((560000 - 246000) / 560000, 10)
  })

  it('leaves savings rate undefined when total income is 0 (no divide-by-zero)', () => {
    const zero = month({ income: [], invested: 0, expenses: [{ category: 'Rent', amount: 1000 }] })
    const avg = monthlyAverages([zero, { ...zero, month: '2026-05' }])
    expect(avg?.savingsRate).toBeUndefined()
    expect(avg?.avgExpenses).toBe(1000) // still a real average
  })
})

describe('allocationSlices', () => {
  it('splits income into spent / invested / remaining wedges when in surplus', () => {
    const a = allocationSlices(summarizeMonth(month()))
    expect(a.overspentBy).toBeUndefined()
    expect(a.wedges.map((w) => w.key)).toEqual(['spent', 'invested', 'remaining'])
    const remaining = a.wedges.find((w) => w.key === 'remaining')
    expect(remaining?.value).toBe(280000 - 123000 - 50000)
  })

  it('drops the remaining wedge and reports overspentBy for an overspent month', () => {
    // expenses 300k + invested 0 > income 280k → remaining −20k
    const a = allocationSlices(
      summarizeMonth(month({ expenses: [{ category: 'Big', amount: 300000 }], invested: 0 })),
    )
    expect(a.wedges.map((w) => w.key)).toEqual(['spent']) // no invested, no remaining
    expect(a.overspentBy).toBe(20000)
  })

  it('returns no wedges for a blank month (nothing to draw)', () => {
    const a = allocationSlices(summarizeMonth(month({ income: [], expenses: [], invested: 0 })))
    expect(a.wedges).toEqual([])
    expect(a.overspentBy).toBeUndefined()
  })
})

describe('expenseBreakdown', () => {
  it('sums by category, sorts largest-first, and shares of total', () => {
    const slices = expenseBreakdown(month()) // Rent 43k, Family 80k
    expect(slices.map((s) => s.label)).toEqual(['Family', 'Rent'])
    expect(slices[0].amount).toBe(80000)
    expect(slices[0].pct).toBeCloseTo(80000 / 123000, 10)
  })

  it('merges duplicate category labels (trimmed) into one slice', () => {
    const slices = expenseBreakdown(
      month({
        expenses: [
          { category: 'Food', amount: 5000 },
          { category: ' Food ', amount: 3000 },
        ],
      }),
    )
    expect(slices).toHaveLength(1)
    expect(slices[0]).toMatchObject({ label: 'Food', amount: 8000 })
  })

  it('folds the tail beyond the cap into a single Other wedge', () => {
    const expenses = Array.from({ length: 8 }, (_, i) => ({
      category: `C${i}`,
      amount: (8 - i) * 1000, // 8000,7000,…,1000
    }))
    const slices = expenseBreakdown(month({ expenses }), 6)
    expect(slices).toHaveLength(6)
    const other = slices[5]
    expect(other.key).toBe('__other')
    expect(other.label).toBe('Other (3)') // C5,C6,C7 folded
    expect(other.amount).toBe(3000 + 2000 + 1000)
  })

  it('drops non-positive and blank-label lines and returns [] when empty', () => {
    expect(
      expenseBreakdown(
        month({
          expenses: [
            { category: 'Neg', amount: -10 },
            { category: '   ', amount: 100 },
            { category: 'Zero', amount: 0 },
          ],
        }),
      ),
    ).toEqual([])
    expect(expenseBreakdown(month({ expenses: [] }))).toEqual([])
  })
})

describe('monthOverMonth', () => {
  it('returns undefined when there is no previous month (first month)', () => {
    expect(monthOverMonth(summarizeMonth(month()), undefined)).toBeUndefined()
  })

  it('computes signed deltas of the headline figures', () => {
    const cur = summarizeMonth(month({ invested: 60000 })) // income 280k, exp 123k, inv 60k
    const prev = summarizeMonth(month({ month: '2026-05', invested: 50000 }))
    const d = monthOverMonth(cur, prev)
    expect(d).toBeDefined()
    if (!d) return
    expect(d.income).toBe(0)
    expect(d.expenses).toBe(0)
    expect(d.invested).toBe(10000)
    expect(d.remaining).toBe(-10000) // spent same, invested 10k more → 10k less remaining
  })
})
