import { describe, expect, it } from 'vitest'
import type { BudgetMonth } from '../storage/budget'
import { summarizeAll, summarizeMonth } from './budget'

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
