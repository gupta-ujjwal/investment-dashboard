import { BUDGET_STORE, getDB } from './holdings'

/**
 * One month of cash flow at category-total grain — the shape of the reference
 * spreadsheet's monthly sheets: a handful of income lines and a handful of
 * expense lines, each a single number the user types in, with no
 * transaction-level detail. A transaction ledger is a deliberate future store
 * (R11), not this. Keyed by `YYYY-MM` so a given month is a singleton record;
 * a re-save overwrites it.
 */
export type BudgetLine = {
  /** Free-text category label (e.g. "Salary", "Rent", "Credit Card Axis"). */
  category: string
  /** Amount in the user's base currency. Budget is single-currency by design —
   *  cash flow is tracked in the reporting currency, not per-market like
   *  holdings, so there is no FX stamp here. */
  amount: number
}

export type BudgetMonth = {
  /** `YYYY-MM`. Primary key. */
  month: string
  income: BudgetLine[]
  expenses: BudgetLine[]
  /** How much of this month's income the user marked as invested (Emergency
   *  Fund, SIP, …). Tracked as a single number rather than per-line so the
   *  `% invested` fold matches the sheet without a transaction model. */
  invested: number
  createdAt: number
  updatedAt: number
}

/** `YYYY-MM` for a millisecond timestamp, browser-local zone. */
export function toMonthKey(ts: number): string {
  const d = new Date(ts)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export async function getAllBudgetMonths(): Promise<BudgetMonth[]> {
  const db = await getDB()
  const months = (await db.getAll(BUDGET_STORE)) as BudgetMonth[]
  // Newest month first — the entry UI lands on the most recent month.
  return months.sort((a, b) => b.month.localeCompare(a.month))
}

export async function getBudgetMonth(month: string): Promise<BudgetMonth | undefined> {
  const db = await getDB()
  return db.get(BUDGET_STORE, month) as Promise<BudgetMonth | undefined>
}

export async function upsertBudgetMonth(record: BudgetMonth): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(BUDGET_STORE, 'readwrite')
  await Promise.all([tx.objectStore(BUDGET_STORE).put(record), tx.done])
}

export async function deleteBudgetMonth(month: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(BUDGET_STORE, 'readwrite')
  await Promise.all([tx.objectStore(BUDGET_STORE).delete(month), tx.done])
}

/** Atomic clear-then-add — the budget half of Restore-from-backup. */
export async function restoreAllBudgetMonths(records: BudgetMonth[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(BUDGET_STORE, 'readwrite')
  const store = tx.objectStore(BUDGET_STORE)
  store.clear()
  for (const r of records) store.add(r)
  await tx.done
}
