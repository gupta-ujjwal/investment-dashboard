import type { CanonicalHolding, HoldingKey, Source } from '../storage/holdings'

export type DiffResult = {
  inserts: CanonicalHolding[]
  updates: CanonicalHolding[]
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
    if (existingByKey.has(row.sourceSymbol)) updates.push(row)
    else inserts.push(row)
  }

  const missing = existingForSource.filter((row) => !incomingKeys.has(row.sourceSymbol))
  return { inserts, updates, missing }
}

export function toDeleteKeys(rows: CanonicalHolding[]): HoldingKey[] {
  return rows.map((r) => ({ source: r.source, sourceSymbol: r.sourceSymbol }))
}
