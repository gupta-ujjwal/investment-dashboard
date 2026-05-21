import type { CanonicalHolding, OverridableField } from './holdings'

/**
 * Per-field write-priority lattice for broker-row updates:
 *   - `manual > broker` for fields listed in `existing.manualOverrides`
 *   - `broker > manual` (broker-only) for fields outside the set
 *
 * Used by the import-diff update path *and* by any code path that needs to
 * synthesize the row that "should be written" given an existing row, an
 * incoming broker row, and the user's sticky overrides.
 *
 * Inputs:
 *   - `existing`: the row currently in storage (carries `manualOverrides`).
 *   - `incoming`: the row the broker just delivered (no overrides set).
 *
 * Output: a new row whose overridden fields come from `existing`, whose
 * non-overridden fields come from `incoming`, and whose `manualOverrides`
 * + `createdAt` + `status` are preserved from `existing`. `importedAt` is
 * taken from `incoming` (the row was just touched by an import). `updatedAt`
 * is set by the caller — this function stays pure.
 *
 * A `closed → open` flip on re-import is NOT done here. That decision lives
 * in the caller (a re-imported row that was closed implies the user re-bought
 * the position, so the caller flips `status` to `'open'`). Keeping that
 * policy out of the merge keeps this function trivially testable.
 */
export function mergeWithOverrides(
  existing: CanonicalHolding,
  incoming: CanonicalHolding,
): CanonicalHolding {
  const overrides = existing.manualOverrides
  // No overrides → broker wins everything; existing's manualOverrides/status
  // /createdAt are preserved separately below.
  const base: CanonicalHolding = overrides && overrides.length > 0
    ? applyOverrides(incoming, existing, overrides)
    : { ...incoming }

  // Preserve fields that are *not* part of the broker's truth at all:
  // manualOverrides (the set itself), status, createdAt. Note that
  // `updatedAt` is the caller's responsibility.
  if (overrides && overrides.length > 0) {
    base.manualOverrides = [...overrides]
  }
  if (existing.status !== undefined) base.status = existing.status
  if (existing.createdAt !== undefined) base.createdAt = existing.createdAt
  return base
}

function applyOverrides(
  incoming: CanonicalHolding,
  existing: CanonicalHolding,
  overrides: readonly OverridableField[],
): CanonicalHolding {
  const out: CanonicalHolding = { ...incoming }
  for (const field of overrides) {
    // `quantity` / `avgBuyPrice` are required scalars — direct assignment.
    // `currentPrice` is optional and may be undefined on either side; the
    // override still wins, including the "user said no current price" case.
    switch (field) {
      case 'quantity':
        out.quantity = existing.quantity
        break
      case 'avgBuyPrice':
        out.avgBuyPrice = existing.avgBuyPrice
        break
      case 'currentPrice':
        if (existing.currentPrice === undefined) {
          delete out.currentPrice
        } else {
          out.currentPrice = existing.currentPrice
        }
        break
      case 'name':
        out.name = existing.name
        break
      case 'assetClass':
        out.assetClass = existing.assetClass
        break
    }
  }
  return out
}
