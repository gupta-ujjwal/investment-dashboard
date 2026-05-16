import {
  getAll,
  getDB,
  HISTORY_STORE,
  type BaseCurrency,
  type CanonicalHolding,
} from './holdings'

/**
 * A portfolio snapshot for one calendar day. The full per-holding state is
 * embedded — fresh and stale prices alike — so per-holding history stays
 * reconstructable later; the homepage charts only fold over it. Stamped with
 * the base currency it was computed in: the user can re-base later, and an old
 * INR-base record must never be read as USD.
 */
export type HistoryRecord = {
  /** Local calendar day, `YYYY-MM-DD`. Primary key — a same-day re-import
   *  overwrites this record rather than appending a second one. */
  date: string
  /** Millisecond timestamp the snapshot was captured. */
  capturedAt: number
  baseCurrency: BaseCurrency
  /** Every holding as of `capturedAt`. */
  holdings: CanonicalHolding[]
}

/** `YYYY-MM-DD` for a millisecond timestamp, in the browser's local zone. */
export function toDateKey(ts: number): string {
  const d = new Date(ts)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Build a history record from a portfolio state — the pure half of
 *  `recordSnapshot`, split out so the date-keying is unit-testable without a
 *  database. Two builds on the same calendar day yield the same `date`, hence
 *  the same primary key, hence an overwrite on `put`. */
export function buildRecord(
  holdings: CanonicalHolding[],
  baseCurrency: BaseCurrency,
  capturedAt: number,
): HistoryRecord {
  return { date: toDateKey(capturedAt), capturedAt, baseCurrency, holdings }
}

/**
 * Capture the current portfolio as today's history record. Idempotent per day:
 * a second call on the same calendar day overwrites that day's record (`put`
 * on a `date`-keyed store). Reads holdings itself, so the caller only has to
 * have committed first.
 */
export async function recordSnapshot(baseCurrency: BaseCurrency): Promise<void> {
  const holdings = await getAll()
  const record = buildRecord(holdings, baseCurrency, Date.now())
  const db = await getDB()
  await db.put(HISTORY_STORE, record)
}

/** All history records, oldest day first. */
export async function getHistory(): Promise<HistoryRecord[]> {
  const db = await getDB()
  const records = (await db.getAll(HISTORY_STORE)) as HistoryRecord[]
  return records.sort((a, b) => a.date.localeCompare(b.date))
}
