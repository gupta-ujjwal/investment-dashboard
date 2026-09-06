import { buildPositions, netWorthTotals } from './netWorth'
import type { BaseCurrency } from '../storage/holdings'
import type { HistoryRecord } from '../storage/history'

export type ChangeSinceImport = {
  /** Base-currency change vs. the prior snapshot. `undefined` when there
   *  aren't two comparable snapshots yet, the two most recent snapshots were
   *  stamped in different base currencies, or either day has any unpriced
   *  position — R1: never a fabricated number computed from partial data. */
  delta: number | undefined
  deltaPct: number | undefined
  /** The prior snapshot's date (the one the delta is measured *since*), or
   *  the only snapshot's date when there's just one. `undefined` when there's
   *  no snapshot at all yet — the true cold-start case. */
  sinceDate: string | undefined
  /** Count of snapshot-events (any net-worth-moving action, not only broker
   *  imports — see `storage/history.ts`'s `recordSnapshot` docstring) strictly
   *  after `lastSeenAt`. Always 0 when `lastSeenAt` is `undefined` (never
   *  looked before) or `history` is empty. */
  importsSinceLastSeen: number
  /** `true` when there's exactly one snapshot (nothing to compare against
   *  yet) or a real, computed delta of exactly zero. `false` when a nonzero
   *  delta exists, or the two most recent snapshots can't be honestly
   *  compared at all (different base currency, an unpriced position, or no
   *  snapshot yet) — "unchanged" is a claim this function only makes when it
   *  can back it with an actual computed comparison. */
  unchanged: boolean
}

/**
 * The honest "since your last import" delta. Deliberately NOT "since your
 * last visit" — there are no live prices, so net worth between two snapshots
 * on different calendar days is only comparable if both are backed by an
 * actual recorded snapshot; comparing against "whenever you last opened the
 * app" would read `▲ ₹0` on every visit that isn't immediately post-snapshot
 * (see `implementation-docs/dashboard-ux-redesign.md` § the honest-delta
 * constraint). `lastSeenAt` feeds only `importsSinceLastSeen` here — it is
 * never used to compute `delta`.
 */
export function changeSinceLastImport(
  history: readonly HistoryRecord[],
  lastSeenAt: number | undefined,
  baseCurrency: BaseCurrency,
): ChangeSinceImport {
  const importsSinceLastSeen =
    lastSeenAt === undefined ? 0 : history.filter((h) => h.capturedAt > lastSeenAt).length

  if (history.length === 0) {
    return {
      delta: undefined,
      deltaPct: undefined,
      sinceDate: undefined,
      importsSinceLastSeen,
      unchanged: false,
    }
  }

  const latest = history[history.length - 1]

  if (history.length === 1) {
    return {
      delta: undefined,
      deltaPct: undefined,
      sinceDate: latest.date,
      importsSinceLastSeen,
      unchanged: true,
    }
  }

  const prior = history[history.length - 2]

  if (prior.baseCurrency !== baseCurrency || latest.baseCurrency !== baseCurrency) {
    // An INR-base record read as USD (or vice versa) is exactly the failure
    // buildRecord's own doc comment warns against — refuse rather than guess.
    return {
      delta: undefined,
      deltaPct: undefined,
      sinceDate: prior.date,
      importsSinceLastSeen,
      unchanged: false,
    }
  }

  const priorTotals = netWorthTotals(buildPositions(prior.holdings, prior.assets ?? []))
  const latestTotals = netWorthTotals(buildPositions(latest.holdings, latest.assets ?? []))

  if (priorTotals.currentValueStrict === undefined || latestTotals.currentValueStrict === undefined) {
    // Either day has a position with no computable base value. Comparing the
    // known-subtotals instead would risk showing a "gain" that's really just
    // a different set of positions being excluded day to day, not movement.
    return {
      delta: undefined,
      deltaPct: undefined,
      sinceDate: prior.date,
      importsSinceLastSeen,
      unchanged: false,
    }
  }

  const delta = latestTotals.currentValueStrict - priorTotals.currentValueStrict
  const deltaPct =
    priorTotals.currentValueStrict > 0 ? delta / priorTotals.currentValueStrict : undefined

  return {
    delta,
    deltaPct,
    sinceDate: prior.date,
    importsSinceLastSeen,
    unchanged: delta === 0,
  }
}
