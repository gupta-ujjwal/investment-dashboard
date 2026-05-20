import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

export type Source = 'vested' | 'groww'
export type Currency = 'INR' | 'USD'
export type BaseCurrency = Currency
export type AssetClass = 'equity' | 'mf' | 'etf' | 'invit' | 'other'

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
}

export type HoldingKey = {
  source: Source
  sourceSymbol: string
}

export const DB_NAME = 'investment-dashboard'
export const DB_VERSION = 3
const STORE = 'holdings'
const IDX_BY_SOURCE = 'by-source'
export const SETTINGS_STORE = 'settings'
/** Per-day portfolio snapshots — see `storage/history.ts`. Added in v3. */
export const HISTORY_STORE = 'historySnapshots'

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
