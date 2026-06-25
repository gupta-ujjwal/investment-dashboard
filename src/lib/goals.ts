/**
 * Goal projection (Phase 4). Turns a corpus gap into a timeline under an
 * EXPLICIT, conservative model: flat monthly contribution, no assumed market
 * growth. Naming the model matters — "time to goal" is meaningless without
 * stating what return it assumes, and a hidden growth rate would flatter the
 * estimate. The flat-contribution model is a floor (reality with positive
 * returns arrives sooner), surfaced to the user via `assumptionNote`.
 */
export type GoalProjection = {
  current: number
  target: number
  /** `current / target`, clamped at 0 lower bound (can exceed 1 when over). */
  progressPct: number
  reached: boolean
  /** The monthly contribution used (0 when unset). */
  monthlyContribution: number
  /** Whole months to close the gap at the flat contribution. `undefined` when
   *  no contribution is set or the goal is already reached. */
  monthsToGoal: number | undefined
  /** `monthsToGoal` in years, one decimal. `undefined` mirrors `monthsToGoal`. */
  yearsToGoal: number | undefined
  /** Human-readable statement of the projection model. */
  assumptionNote: string
}

const ASSUMPTION_NOTE =
  'Flat-contribution model: assumes the monthly amount is added to today’s corpus with no market growth. A conservative floor, not a forecast.'

export function projectGoal(
  current: number,
  target: number | undefined,
  monthlyContribution: number | undefined,
): GoalProjection {
  const tgt = target !== undefined && target > 0 ? target : 0
  const monthly =
    monthlyContribution !== undefined && monthlyContribution > 0 ? monthlyContribution : 0
  const progressPct = tgt > 0 ? current / tgt : 0
  const reached = tgt > 0 && current >= tgt
  const remaining = Math.max(0, tgt - current)

  let monthsToGoal: number | undefined
  let yearsToGoal: number | undefined
  if (!reached && tgt > 0 && monthly > 0) {
    monthsToGoal = Math.ceil(remaining / monthly)
    yearsToGoal = Math.round((monthsToGoal / 12) * 10) / 10
  }

  return {
    current,
    target: tgt,
    progressPct,
    reached,
    monthlyContribution: monthly,
    monthsToGoal,
    yearsToGoal,
    assumptionNote: ASSUMPTION_NOTE,
  }
}
