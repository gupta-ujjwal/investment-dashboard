import { BUDGET_TAGS_STORE, getDB } from './holdings'

/**
 * A reusable budget tag — a managed income/expense category the user creates
 * once and reuses across months. Added in DB v5 (revamp). Kept deliberately
 * thin: a tag is a *managed label*, not a foreign key. When a budget line picks
 * a tag, the tag's `label` is copied into `BudgetLine.category` (see
 * `storage/budget.ts`); the line does not reference the tag by `id`. This means:
 *   - no `BudgetLine` migration is needed (existing free-text categories keep
 *     rendering, and can be promoted to tags),
 *   - renaming a tag does NOT rewrite past months' lines (historical snapshots
 *     stay accurate to what they were at the time),
 *   - deleting a tag leaves past lines intact (the label persists on the line);
 *     it only removes the tag from the picker.
 * The tradeoff (label snapshot vs referenced identity) was taken deliberately —
 * it is the boring, data-safe choice for an edge-only single-user app.
 */
export type BudgetTagKind = 'income' | 'expense'

export type BudgetTag = {
  /** Generated identity (`crypto.randomUUID()`). The label is the user-facing
   *  value written into a line's `category`; the id only keys the store and the
   *  picker, so renames don't have to chase down line references. */
  id: string
  /** Display text, also the value copied into `BudgetLine.category`. */
  label: string
  /** Which line list this tag belongs in — income tags and expense tags are
   *  disjoint sets in the picker. */
  kind: BudgetTagKind
  createdAt: number
}

export async function getAllBudgetTags(): Promise<BudgetTag[]> {
  const db = await getDB()
  const tags = (await db.getAll(BUDGET_TAGS_STORE)) as BudgetTag[]
  // Stable alphabetical order so the picker list doesn't reshuffle between
  // reads (creation order would surface newest-last, which reads as random).
  return tags.sort((a, b) => a.label.localeCompare(b.label))
}

/** Single-row upsert in one readwrite tx (R3 — atomic even for a row write). */
export async function upsertBudgetTag(tag: BudgetTag): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(BUDGET_TAGS_STORE, 'readwrite')
  await Promise.all([tx.objectStore(BUDGET_TAGS_STORE).put(tag), tx.done])
}

export async function deleteBudgetTag(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(BUDGET_TAGS_STORE, 'readwrite')
  await Promise.all([tx.objectStore(BUDGET_TAGS_STORE).delete(id), tx.done])
}

/**
 * Atomic clear-then-add — the budget-tags half of Restore-from-backup. One
 * readwrite tx so the clear and the adds all succeed or all roll back (mirrors
 * `restoreAllBudgetMonths` / `restoreAllAssets`).
 */
export async function restoreAllBudgetTags(tags: BudgetTag[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(BUDGET_TAGS_STORE, 'readwrite')
  const store = tx.objectStore(BUDGET_TAGS_STORE)
  store.clear()
  for (const t of tags) store.add(t)
  await tx.done
}

/** Case-insensitive dedupe key for a tag within its kind — two tags with the
 *  same label (modulo case/whitespace) in the same kind are the same tag. The
 *  caller uses this to avoid creating a duplicate when a user "creates" a tag
 *  whose label already exists. */
export function tagDedupeKey(label: string, kind: BudgetTagKind): string {
  return `${kind}:${label.trim().toLowerCase()}`
}
