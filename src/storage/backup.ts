import {
  ASSETS_STORE,
  BUDGET_STORE,
  BUDGET_TAGS_STORE,
  DB_VERSION,
  getAll,
  getDB,
  HISTORY_STORE,
  HOLDINGS_STORE,
} from './holdings'
import { getAllAssets } from './assets'
import { getAllBudgetMonths } from './budget'
import { getAllBudgetTags } from './budgetTags'
import { getHistory } from './history'
import { getSettings, saveSettings } from './settings'
import type { ParsedBackup } from '../lib/restoreBackup'

/** What a parsed backup will write, for the restore-preview manifest. The UI
 *  shows this *before* the destructive confirm so a backup that silently omits
 *  a store (e.g. an old holdings-only v3 file) is visible, not a surprise wipe. */
export type BackupManifest = {
  holdings: number
  assets: number
  budgetMonths: number
  budgetTags: number
  history: number
  hasSettings: boolean
}

/**
 * Serialize every store into one backup JSON. Supersedes the holdings-only
 * `exportSnapshot` — a v4 backup round-trips holdings, assets, budget months,
 * and the planning/goal settings targets, so restore can no longer silently
 * drop the new data. FX-stamp fields are included as-is (they are part of each
 * record), so a restored portfolio keeps its base-currency figures.
 * `historySnapshots` is included too — previously the only store absent from
 * backup entirely, which meant a bad snapshot write had no recovery path.
 */
export async function exportBackup(): Promise<string> {
  const [holdings, assets, budgetMonths, budgetTags, history, settings] = await Promise.all([
    getAll(),
    getAllAssets(),
    getAllBudgetMonths(),
    getAllBudgetTags(),
    getHistory(),
    getSettings(),
  ])
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      schemaVersion: DB_VERSION,
      holdings,
      assets,
      budgetMonths,
      budgetTags,
      history,
      settings: {
        emergencyMonthlyNeed: settings.emergencyMonthlyNeed,
        emergencyMonths: settings.emergencyMonths,
        goalCorpus: settings.goalCorpus,
        monthlyContribution: settings.monthlyContribution,
        allocationTargets: settings.allocationTargets,
      },
    },
    null,
    2,
  )
}

export function backupManifest(backup: ParsedBackup): BackupManifest {
  return {
    holdings: backup.holdings.length,
    assets: backup.assets.length,
    budgetMonths: backup.budgetMonths.length,
    budgetTags: backup.budgetTags.length,
    history: backup.history.length,
    hasSettings: backup.settings !== undefined,
  }
}

/**
 * Replace holdings, assets, budget months, budget tags, and history snapshots
 * on this device with the backup's contents, atomically — one readwrite
 * transaction spanning all five stores, so the clears and adds either all
 * succeed or all roll back (a partial restore that wipes holdings but fails to
 * write assets is impossible by construction). Settings targets are merged
 * after the atomic data restore (config, not data: the device-local base
 * currency and FX metadata are preserved, only the planning/goal targets
 * present in the backup overwrite).
 */
export async function restoreAll(backup: ParsedBackup): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(
    [HOLDINGS_STORE, ASSETS_STORE, BUDGET_STORE, BUDGET_TAGS_STORE, HISTORY_STORE],
    'readwrite',
  )
  const holdings = tx.objectStore(HOLDINGS_STORE)
  const assets = tx.objectStore(ASSETS_STORE)
  const budget = tx.objectStore(BUDGET_STORE)
  const budgetTags = tx.objectStore(BUDGET_TAGS_STORE)
  const history = tx.objectStore(HISTORY_STORE)

  holdings.clear()
  for (const row of backup.holdings) holdings.add(row)
  assets.clear()
  for (const row of backup.assets) assets.add(row)
  budget.clear()
  for (const row of backup.budgetMonths) budget.add(row)
  // A pre-v5 backup has no `budgetTags` (parsed to `[]`), so this clears any
  // tags on the device and adds nothing — the same replace-semantics the other
  // stores get. Restoring an old backup intentionally wipes tags, surfaced in
  // the restore manifest.
  budgetTags.clear()
  for (const row of backup.budgetTags) budgetTags.add(row)
  // A pre-fix backup has no `history` (parsed to `[]`) — same replace
  // semantics, surfaced in the restore manifest like every other store.
  history.clear()
  for (const row of backup.history) history.add(row)
  await tx.done

  if (backup.settings) {
    const current = await getSettings()
    await saveSettings({
      ...current,
      emergencyMonthlyNeed:
        backup.settings.emergencyMonthlyNeed ?? current.emergencyMonthlyNeed,
      emergencyMonths: backup.settings.emergencyMonths ?? current.emergencyMonths,
      goalCorpus: backup.settings.goalCorpus ?? current.goalCorpus,
      monthlyContribution:
        backup.settings.monthlyContribution ?? current.monthlyContribution,
      allocationTargets:
        backup.settings.allocationTargets ?? current.allocationTargets,
    })
  }
}
