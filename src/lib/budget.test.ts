import { describe, expect, it } from 'vitest'
import type { BudgetMonth } from '../storage/budget'
import { monthlyAverages, summarizeAll, summarizeMonth } from './budget'

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
