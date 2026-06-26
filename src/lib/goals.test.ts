import { describe, expect, it } from 'vitest'
import { projectGoal } from './goals'

describe('projectGoal', () => {
  it('computes progress and months-to-goal under the flat-contribution model', () => {
    const g = projectGoal(3000000, 5000000, 50000)
    expect(g.progressPct).toBeCloseTo(0.6, 10)
    expect(g.reached).toBe(false)
    // remaining 2,000,000 / 50,000 = 40 months
    expect(g.monthsToGoal).toBe(40)
    expect(g.yearsToGoal).toBeCloseTo(3.3, 5)
  })

  it('marks reached when current >= target and omits a timeline', () => {
    const g = projectGoal(5000000, 5000000, 50000)
    expect(g.reached).toBe(true)
    expect(g.monthsToGoal).toBeUndefined()
  })

  it('leaves the timeline undefined when no contribution is set', () => {
    const g = projectGoal(1000000, 5000000, undefined)
    expect(g.monthsToGoal).toBeUndefined()
    expect(g.monthlyContribution).toBe(0)
  })

  it('treats a missing/zero target as no goal', () => {
    const g = projectGoal(1000000, undefined, 50000)
    expect(g.target).toBe(0)
    expect(g.progressPct).toBe(0)
    expect(g.reached).toBe(false)
  })

  it('always states its assumption model', () => {
    expect(projectGoal(1, 2, 1).assumptionNote).toMatch(/flat-contribution/i)
  })
})
