import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

export type Source = 'vested' | 'groww' | 'manual'
/** Broker sources only — every `Source` except `'manual'`. The import wizard
 *  uses this because `'manual'` rows are direct-CRUD and never flow through
 *  a parser or the diff path (R7 source containment). */
export type BrokerSource = Exclude<Source, 'manual'>
export type Currency = 'INR' | 'USD'
export type BaseCurrency = Currency
export type AssetClass = 'equity' | 'mf' | 'etf' | 'invit' | 'other'

/** A row is `'closed'` when the user marked the position as exited. Closed rows
 *  stay in storage (and in any `historySnapshots` that captured them) for
 *  time-series fidelity, but drop out of current views by default. */
export type HoldingStatus = 'open' | 'closed'

/** Fields a user can override on a broker-imported row. Listing a field here
 *  means: the user's value wins over any future broker re-import for that
 *  field. Other fields keep flowing from the broker. The set is `undefined` (or
 *  absent) when no overrides have been recorded — never `[]` (R1: no sentinels). */
export type OverridableField =
  | 'quantity'
  | 'avgBuyPrice'
  | 'currentPrice'
  | 'name'
  | 'assetClass'

export type CanonicalHolding = {
  name: string
  source: Source
  sourceSymbol: string
  quantity: number
  avgBuyPrice: number
  currency: Currency
  assetClass: AssetClass
  importedAt: number
  fxRate?: number
  fxAsOf?: number
  avgBuyPriceBase?: number
  /** Current per-unit market price, native currency. Snapshot captured at
   *  import from the broker export. `undefined` when the export had no
   *  current-price column (old imports, or a future export drops it). */
  currentPrice?: number
  /** `currentPrice` converted to the base currency, stamped at import
   *  alongside `avgBuyPriceBase`. `undefined` when `currentPrice` is absent
   *  or import-time FX was unavailable. */
  currentPriceBase?: number
  /** `'open'` (default when absent) or `'closed'`. Closed rows are hidden
   *  from `/holdings` and analytics by default; toggled visible via the
   *  "Show closed positions" filter. */
  status?: HoldingStatus
  /** First time this row entered local storage. Immutable after first write.
   *  Distinct from `importedAt`, which is the last broker-import timestamp. */
  createdAt?: number
  /** Last time this row was written (manual edit, re-import, FX stamp, exit).
   *  System-managed; `undefined` on legacy rows until their first write. */
  updatedAt?: number
  /** Per-field sticky overrides for broker rows. When a field is listed here,
   *  the next broker re-import preserves the user's value for that field. */
  manualOverrides?: OverridableField[]
}

export type HoldingKey = {
  source: Source
  sourceSymbol: string
}

export const DB_NAME = 'investment-dashboard'
export const DB_VERSION = 4
/** The holdings object store. Exported so the cross-store backup/restore
 *  (`storage/backup.ts`) can open a transaction spanning every store. */
export const HOLDINGS_STORE = 'holdings'
const STORE = HOLDINGS_STORE
const IDX_BY_SOURCE = 'by-source'
export const SETTINGS_STORE = 'settings'
/** Per-day portfolio snapshots — see `storage/history.ts`. Added in v3. */
export const HISTORY_STORE = 'historySnapshots'
/** Value-only manual assets (crypto, gold, FD, …) — see `storage/assets.ts`.
 *  Added in v4. Keyed by a generated `id`. */
export const ASSETS_STORE = 'assets'
/** Monthly cash-flow records — see `storage/budget.ts`. Added in v4. Keyed by
 *  `YYYY-MM`. */
export const BUDGET_STORE = 'budgetMonths'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, {
            keyPath: ['source', 'sourceSymbol'],
          })
          store.createIndex(IDX_BY_SOURCE, 'source')
        }
        if (oldVersion < 2) {
          db.createObjectStore(SETTINGS_STORE)
        }
        if (oldVersion < 3) {
          // Additive only — one store, keyed by `YYYY-MM-DD`. No backfill in
          // the upgrade callback (keeps the app-open critical path simple);
          // snapshots populate lazily on the next import.
          db.createObjectStore(HISTORY_STORE, { keyPath: 'date' })
        }
        if (oldVersion < 4) {
          // Personal-finance revamp: two additive stores alongside `holdings`
          // (R11 — holdings stay positional, new concerns are new stores; never
          // reshape `holdings`). Additive-only, no backfill — both populate
          // lazily on the first asset/budget the user enters. `assets` is
          // keyed by a generated id; `budgetMonths` by `YYYY-MM`.
          db.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
          db.createObjectStore(BUDGET_STORE, { keyPath: 'month' })
        }
        // `status`, `createdAt`, `updatedAt`, `manualOverrides`, and the v4
        // asset planning tags (`riskBand`, `emergencyFund`) are optional
        // scalars on existing rows — per dsl.md § dsl-decision-guide, optional
        // scalar additions do not bump the schema version.
      },
    })
  }
  return dbPromise
}

export async function getAll(): Promise<CanonicalHolding[]> {
  const db = await getDB()
  return db.getAll(STORE) as Promise<CanonicalHolding[]>
}

export async function getForSource(source: Source): Promise<CanonicalHolding[]> {
  const db = await getDB()
  return db.getAllFromIndex(STORE, IDX_BY_SOURCE, source) as Promise<CanonicalHolding[]>
}

export async function getHolding(key: HoldingKey): Promise<CanonicalHolding | undefined> {
  const db = await getDB()
  return db.get(STORE, [key.source, key.sourceSymbol]) as Promise<CanonicalHolding | undefined>
}

export type CommitImportArgs = {
  inserts: CanonicalHolding[]
  updates: CanonicalHolding[]
  deletes: HoldingKey[]
}

export async function commitImport(args: CommitImportArgs): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  await Promise.all([
    ...args.inserts.map((row) => store.add(row)),
    ...args.updates.map((row) => store.put(row)),
    ...args.deletes.map(({ source, sourceSymbol }) => store.delete([source, sourceSymbol])),
    tx.done,
  ])
}

/** Single-row upsert. One readwrite tx per call — R3 (atomic commit) holds
 *  even for row-level mutations. When `opts.addOverrides` is supplied, those
 *  field names are unioned into `row.manualOverrides` *inside the same
 *  transaction*, so the value-write and the override-extend are atomic by
 *  construction — not by convention. The caller passes the desired final
 *  shape; this function does not stamp `updatedAt`/`createdAt`. */
export async function upsertHolding(
  row: CanonicalHolding,
  opts?: { addOverrides?: OverridableField[] },
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  let toWrite = row
  if (opts?.addOverrides && opts.addOverrides.length > 0) {
    const existing = new Set<OverridableField>(row.manualOverrides ?? [])
    for (const f of opts.addOverrides) existing.add(f)
    toWrite = { ...row, manualOverrides: Array.from(existing) }
  }
  await Promise.all([store.put(toWrite), tx.done])
}

export async function deleteHolding(key: HoldingKey): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  await Promise.all([store.delete([key.source, key.sourceSymbol]), tx.done])
}

/** Flip `status` on a single row without rewriting its other fields. Touches
 *  `updatedAt`. No-op if the row is absent. */
export async function setHoldingStatus(
  key: HoldingKey,
  status: HoldingStatus,
  now: number = Date.now(),
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const existing = (await store.get([key.source, key.sourceSymbol])) as
    | CanonicalHolding
    | undefined
  if (!existing) {
    await tx.done
    return
  }
  await Promise.all([store.put({ ...existing, status, updatedAt: now }), tx.done])
}

/** Clear a row's `manualOverrides` set entirely — the per-row "Revert to
 *  broker" action. Touches `updatedAt`. Returns immediately if the row is
 *  absent or had no overrides. */
export async function revertHoldingOverrides(
  key: HoldingKey,
  now: number = Date.now(),
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const existing = (await store.get([key.source, key.sourceSymbol])) as
    | CanonicalHolding
    | undefined
  if (!existing || !existing.manualOverrides || existing.manualOverrides.length === 0) {
    await tx.done
    return
  }
  const { manualOverrides: _drop, ...rest } = existing
  await Promise.all([store.put({ ...rest, updatedAt: now }), tx.done])
}

/**
 * Replace every holding on this device with the supplied set, atomically.
 * One readwrite transaction — the clear and the adds either all succeed or
 * all roll back. Used by the Restore-from-backup flow; do not use for
 * normal import (which is diff-driven via `commitImport`).
 */
export async function restoreAllHoldings(holdings: CanonicalHolding[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  store.clear()
  for (const row of holdings) store.add(row)
  await tx.done
}

export async function exportSnapshot(): Promise<string> {
  const holdings = await getAll()
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      schemaVersion: DB_VERSION,
      holdings,
    },
    null,
    2,
  )
}
