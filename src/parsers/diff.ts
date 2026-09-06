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

/** How the user decided to handle one duplicate-row group. `'keep-last'`
 *  matches today's shipped default (the survivor `diffHoldings` already
 *  picked, untouched); `'combine'` merges every lot into one row. */
export type DuplicateDecision = 'keep-last' | 'combine'

/** One duplicate-row group, reconstructed from a `DiffResult`: every lot
 *  that shared a `sourceSymbol` within the incoming file, oldest-discarded
 *  first, plus the survivor `diffHoldings` already kept in `inserts`/
 *  `updates`. `lots` always ends with `survivor` — the two are not
 *  independent copies of the same data. */
export type DuplicateGroup = {
  sourceSymbol: string
  lots: CanonicalHolding[]
  survivor: CanonicalHolding
}

/** Reconstructs every duplicate group in a `DiffResult` — pure, read-only
 *  over the diff's own output, no re-parsing needed (per `DuplicateRow`'s
 *  own doc comment above). A group with no matching survivor (should not
 *  happen given `diffHoldings`'s own invariant: every discarded lot's key
 *  also appears in `dedupedIncoming`, hence in `inserts` or `updates`) is
 *  silently skipped rather than thrown — defensive, not a case this
 *  function can meaningfully recover from. */
export function groupDuplicates(diff: DiffResult): DuplicateGroup[] {
  const survivorByKey = new Map<string, CanonicalHolding>()
  for (const row of [...diff.inserts, ...diff.updates]) {
    survivorByKey.set(row.sourceSymbol, row)
  }

  const discardedByKey = new Map<string, CanonicalHolding[]>()
  for (const d of diff.duplicates) {
    const lots = discardedByKey.get(d.sourceSymbol) ?? []
    lots.push(d.discarded)
    discardedByKey.set(d.sourceSymbol, lots)
  }

  const groups: DuplicateGroup[] = []
  for (const [sourceSymbol, discarded] of discardedByKey) {
    const survivor = survivorByKey.get(sourceSymbol)
    if (!survivor) continue
    groups.push({ sourceSymbol, lots: [...discarded, survivor], survivor })
  }
  return groups
}

/**
 * Combines a duplicate group's lots into one row via quantity-weighted
 * average cost — the financially correct way brokers merge tranches
 * (`Σ(qty×avgBuyPrice) / Σqty`), computed as a single pass over the FULL lot
 * list. Never implemented as pairwise-chained partial averages — chaining
 * two already-blended averages silently produces the wrong number for 3+
 * lots (a classic weighted-average-of-averages bug).
 *
 * Refuses (`undefined`) if any lot has a non-finite or non-positive
 * `quantity`/`avgBuyPrice` — R1: never fabricate a weighted average from a
 * broken input row. Every field except `quantity`/`avgBuyPrice` carries
 * through from `survivor` unchanged (name, currentPrice, currency,
 * assetClass, source, sourceSymbol) — the survivor is already the freshest
 * row (`diffHoldings`'s own last-occurrence-wins semantics), so there is no
 * separate "which lot's price wins" decision to make.
 *
 * Operates only on pre-stamp fields (`quantity`, `avgBuyPrice`) — never
 * reads or writes `avgBuyPriceBase`/`currentPriceBase`. Must run before FX
 * stamping in the caller; `diff.inserts`/`diff.updates` are always unstamped
 * at the point `diffHoldings` produces them (stamping happens later, in
 * `handleCommit`), so this invariant holds by construction as long as this
 * function's output feeds the same pre-stamp pipeline it read from.
 */
export function combineDuplicateGroup(group: DuplicateGroup): CanonicalHolding | undefined {
  for (const lot of group.lots) {
    if (!Number.isFinite(lot.quantity) || lot.quantity <= 0) return undefined
    if (!Number.isFinite(lot.avgBuyPrice) || lot.avgBuyPrice <= 0) return undefined
  }
  let totalQty = 0
  let totalCost = 0
  for (const lot of group.lots) {
    totalQty += lot.quantity
    totalCost += lot.quantity * lot.avgBuyPrice
  }
  return { ...group.survivor, quantity: totalQty, avgBuyPrice: totalCost / totalQty }
}

/**
 * Applies the user's per-group duplicate decisions to a diff's `inserts`/
 * `updates`, swapping in the combined row wherever the decision is
 * `'combine'` and a valid combination exists. A missing decision (the
 * default map has no entry) or an explicit `'keep-last'` leaves the row
 * exactly as `diffHoldings` produced it — today's shipped behavior is
 * unchanged unless the user opts in. A `'combine'` decision that
 * `combineDuplicateGroup` refuses (a broken lot in the group) also falls
 * back to keep-last, silently — the caller surfaces the refusal via the
 * panel UI, not by throwing here.
 */
export function applyDuplicateDecisions(
  diff: DiffResult,
  decisions: Readonly<Record<string, DuplicateDecision>>,
): { inserts: CanonicalHolding[]; updates: CanonicalHolding[] } {
  const groups = groupDuplicates(diff)
  const combinedByKey = new Map<string, CanonicalHolding>()
  for (const group of groups) {
    if (decisions[group.sourceSymbol] !== 'combine') continue
    const combined = combineDuplicateGroup(group)
    if (combined) combinedByKey.set(group.sourceSymbol, combined)
  }
  const swap = (row: CanonicalHolding) => combinedByKey.get(row.sourceSymbol) ?? row
  return { inserts: diff.inserts.map(swap), updates: diff.updates.map(swap) }
}
