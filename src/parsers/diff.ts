import type { BrokerSource, CanonicalHolding, HoldingKey } from '../storage/holdings'
import { mergeWithOverrides } from '../storage/holdingMerge'

/** One `sourceSymbol` that appeared more than once in a single `incoming`
 *  array. `discarded` is the earlier occurrence's full row — kept as data
 *  (not just a count) so a future per-row Combine/Keep-one picker can
 *  consume it directly without re-parsing the file. */
export type DuplicateRow = {
  sourceSymbol: string
  discarded: CanonicalHolding
}

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
  /** `sourceSymbol`s that appeared more than once within `incoming` itself
   *  (not against storage). Only the last occurrence per key reaches
   *  `inserts`/`updates` — keeping any duplicate is a heuristic pending a
   *  per-row picker (roadmap Next-bucket item), not a user decision. This
   *  fixes a real crash: two `add()`s at the same [source, sourceSymbol]
   *  key threw a raw IndexedDB ConstraintError after the preview already
   *  showed both rows as safe. */
  duplicates: DuplicateRow[]
}

export function diffHoldings(
  existingForSource: CanonicalHolding[],
  incoming: CanonicalHolding[],
  source: BrokerSource,
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

  // Dedup incoming against itself first — a broker export can list the same
  // sourceSymbol twice in one file (a data-quality glitch, or two lots that
  // legitimately belong to one position). Keep the last occurrence, matching
  // the broker-truth-wins semantics the update path below already applies;
  // record what got discarded so the caller can surface it instead of it
  // vanishing. Without this, two fresh-import rows at the same key both
  // reached `inserts` and the second `store.add()` threw a raw IndexedDB
  // ConstraintError after the preview had already shown both as safe.
  const dedupedIncoming = new Map<string, CanonicalHolding>()
  const duplicates: DuplicateRow[] = []
  for (const row of incoming) {
    const prior = dedupedIncoming.get(row.sourceSymbol)
    if (prior) duplicates.push({ sourceSymbol: row.sourceSymbol, discarded: prior })
    dedupedIncoming.set(row.sourceSymbol, row)
  }

  const existingByKey = new Map<string, CanonicalHolding>()
  for (const row of existingForSource) existingByKey.set(row.sourceSymbol, row)

  const incomingKeys = new Set<string>()
  const inserts: CanonicalHolding[] = []
  const updates: CanonicalHolding[] = []

  for (const row of dedupedIncoming.values()) {
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
  return { inserts, updates, missing, duplicates }
}

export function toDeleteKeys(rows: CanonicalHolding[]): HoldingKey[] {
  return rows.map((r) => ({ source: r.source, sourceSymbol: r.sourceSymbol }))
}
