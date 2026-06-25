import { ASSETS_STORE, getDB, type Currency } from './holdings'

/**
 * Value-only manual assets — the non-equity half of net worth (crypto, gold,
 * NPS, FDs, savings, cash, and any holding the user tracks as a lump sum rather
 * than per-ticker). Distinct from `CanonicalHolding`, which is positional
 * (quantity × price) and broker-imported; an asset has no quantity and no
 * per-unit price, only an invested amount (optional) and a current value the
 * user updates by hand. Stored in its own `assets` store alongside `holdings`
 * (R11 — never reshape holdings to fit a new concern).
 */
export type ManualAssetClass =
  | 'equity'
  | 'mutualFund'
  | 'crypto'
  | 'gold'
  | 'nps'
  | 'fd'
  | 'savings'
  | 'cash'
  | 'other'

/** Planning risk band (Phase 3). Optional tag — absent means "untagged", which
 *  the allocation/risk view buckets explicitly rather than guessing. */
export type RiskBand = 'safe' | 'moderate' | 'high'

export type ManualAsset = {
  /** Generated identity (`crypto.randomUUID()`). Unlike a holding there is no
   *  natural business key — two "Gold" assets in different apps are distinct. */
  id: string
  name: string
  assetClass: ManualAssetClass
  currency: Currency
  /** Native-currency cost basis. **Optional**: value-only classes (cash,
   *  savings, often gold/FD) have no meaningful buy basis. `undefined` means
   *  "value-only" — the asset contributes to net worth but is excluded from
   *  P&L%. Never store `0` to mean "no basis" (R1 — no sentinels). */
  investedAmount?: number
  /** Native-currency current value. Always present — an asset with no current
   *  value is not an asset worth tracking. */
  currentValue: number
  /** FX stamp (R2): base-currency figures are stamped at write/refresh, never
   *  computed at render. Identity stamp (rate 1) when `currency === base`. A
   *  non-base asset whose `fxAsOf` lags the latest rate is flagged stale in the
   *  UI and re-stamped on the next FX refresh / base-currency change. */
  fxRate?: number
  fxAsOf?: number
  investedAmountBase?: number
  currentValueBase?: number
  /** Phase 3 planning tags. Additive optional fields — no schema version bump
   *  (dsl.md § dsl-decision-guide). */
  riskBand?: RiskBand
  emergencyFund?: boolean
  /** Immutable first-write timestamp. */
  createdAt: number
  /** Every-write timestamp (manual edit, FX re-stamp). */
  updatedAt: number
}

export async function getAllAssets(): Promise<ManualAsset[]> {
  const db = await getDB()
  return db.getAll(ASSETS_STORE) as Promise<ManualAsset[]>
}

export async function getAsset(id: string): Promise<ManualAsset | undefined> {
  const db = await getDB()
  return db.get(ASSETS_STORE, id) as Promise<ManualAsset | undefined>
}

/** Single-row upsert in one readwrite tx (R3 — atomic even for row writes). */
export async function upsertAsset(asset: ManualAsset): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(ASSETS_STORE, 'readwrite')
  await Promise.all([tx.objectStore(ASSETS_STORE).put(asset), tx.done])
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(ASSETS_STORE, 'readwrite')
  await Promise.all([tx.objectStore(ASSETS_STORE).delete(id), tx.done])
}

/** Atomic clear-then-add — the assets half of Restore-from-backup. One
 *  readwrite tx so the clear and the adds all succeed or all roll back. */
export async function restoreAllAssets(assets: ManualAsset[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(ASSETS_STORE, 'readwrite')
  const store = tx.objectStore(ASSETS_STORE)
  store.clear()
  for (const a of assets) store.add(a)
  await tx.done
}
