import type { CanonicalHolding, HoldingKey, Source } from '../storage/holdings'
import { mergeWithOverrides } from '../storage/holdingMerge'

export type DiffResult = {
  inserts: CanonicalHolding[]
  /** Update rows already reflect `mergeWithOverrides` (per-field sticky
   *  overrides honored) and `closed → open` flips for re-imported closed
   *  rows. The caller writes these via `commitImport.updates` directly. */
  updates: CanonicalHolding[]
  /** Existing rows the broker didn't re-deliver. Closed rows are NOT included
   *  here — a `status:'closed'` row that's "missing" from the new export is
   *  not news (the user already exited the position). Excluding them keeps
   *  the PreviewStep prompt focused on rows the user still needs to decide
   *  about. */
  missing: CanonicalHolding[]
}

export function diffHoldings(
  existingForSource: CanonicalHolding[],
  incoming: CanonicalHolding[],
  source: Source,
): DiffResult {
  for (const row of existingForSource) {
    if (row.source !== source) {
      throw new Error(
        `diffHoldings: existing row has source="${row.source}" but expected "${source}"`,
      )
    }
  }
  for (const row of incoming) {
    if (row.source !== source) {
      throw new Error(
        `diffHoldings: incoming row has source="${row.source}" but expected "${source}"`,
      )
    }
  }

  const existingByKey = new Map<string, CanonicalHolding>()
  for (const row of existingForSource) existingByKey.set(row.sourceSymbol, row)

  const incomingKeys = new Set<string>()
  const inserts: CanonicalHolding[] = []
  const updates: CanonicalHolding[] = []

  for (const row of incoming) {
    incomingKeys.add(row.sourceSymbol)
    const existing = existingByKey.get(row.sourceSymbol)
    if (!existing) {
      inserts.push(row)
      continue
    }
    // Update path: merge sticky overrides + flip closed→open if the row
    // came back from the broker (a re-import implies the user re-opened the
    // position). The `closed→open` flip is independent of overrides — a
    // closed row with no overrides still flips back to open on re-import.
    const merged = mergeWithOverrides(existing, row)
    if (merged.status === 'closed') merged.status = 'open'
    updates.push(merged)
  }

  // Missing rows: existing entries the broker didn't re-deliver. Skip closed
  // ones — the user has already exited; no decision to ask about.
  const missing = existingForSource.filter(
    (row) => !incomingKeys.has(row.sourceSymbol) && row.status !== 'closed',
  )
  return { inserts, updates, missing }
}

export function toDeleteKeys(rows: CanonicalHolding[]): HoldingKey[] {
  return rows.map((r) => ({ source: r.source, sourceSymbol: r.sourceSymbol }))
}
