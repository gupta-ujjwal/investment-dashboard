import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

export type Source = 'vested' | 'groww'
export type Currency = 'INR' | 'USD'
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
}

export type HoldingKey = {
  source: Source
  sourceSymbol: string
}

const DB_NAME = 'investment-dashboard'
const DB_VERSION = 1
const STORE = 'holdings'
const IDX_BY_SOURCE = 'by-source'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, {
            keyPath: ['source', 'sourceSymbol'],
          })
          store.createIndex(IDX_BY_SOURCE, 'source')
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
