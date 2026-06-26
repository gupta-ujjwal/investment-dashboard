# Dashboard revamp — equity tracker → full personal-finance dashboard

> Implemented via `/brainstorm` → `/develop` on 2026-06-25.

## What

Expands the edge-only (no-backend) equity holdings tracker into a full personal-finance
dashboard, in five flag-gated phases on one branch. New surfaces: **multi-asset net
worth** (crypto, gold, FDs, NPS, cash alongside equity), a **Budget** tab (monthly
cash-flow), a **Planning** tab (emergency-fund + risk allocation + bulk-invest what-if),
and **goal projection** on Analytics. Two new IndexedDB stores (`assets`, `budgetMonths`)
at DB v4; goal/planning targets ride the existing `settings` singleton. All data stays
on-device — no new network egress.

Touched 35 files under `src/` (+~3.6k lines): new stores (`storage/assets.ts`,
`storage/budget.ts`, `storage/backup.ts`), new pure libs (`lib/netWorth.ts`,
`lib/budget.ts`, `lib/planning.ts`, `lib/goals.ts`, `lib/assetValidators.ts`), new routes
(`routes/BudgetRoute.tsx`, `routes/PlanningRoute.tsx`) and components
(`components/AssetForm.tsx`, `AssetsTable.tsx`, `AssetsSection.tsx`, `formModal.tsx`),
and edits to the migration (`storage/holdings.ts`), FX (`lib/refreshFx.ts`), snapshots
(`storage/history.ts`), analytics (`lib/analytics.ts`), backup/restore
(`lib/restoreBackup.ts`, `routes/DataBackupSection.tsx`), settings, nav, and the router /
action layer (`App.tsx`). Four compile-time flags (`FEATURE_ASSETS`, `FEATURE_BUDGET`,
`FEATURE_PLANNING`, `FEATURE_GOALS`) gate the four feature phases; Phase 0 (migration +
backup coverage + responsive nav) is unconditional infrastructure.

## Why

The product owner's reference spreadsheet tracks a whole personal-finance system —
multi-asset net worth, monthly budget, emergency fund, allocation/risk, goals — far
beyond the app's Phase-1 equity-only scope. The revamp is the explicit "hard-constraint
conversation" `CLAUDE.md` requires before broadening scope; everything added stays
edge-only, so the architecture constraints hold while the product scope grows.

**Approach chosen: additive stores + a `NetWorthPosition` unifier** (over two rejected
alternatives — a single catch-all `finance` store, and full per-concern normalization).
This directly continues the codebase's own rule **R11** ("holdings stay positional; new
concerns are additive IndexedDB stores alongside `holdings`, never reshape it"). Each new
concern gets its own clearly-typed store (per-store blast-radius isolation — a budget-write
bug can't corrupt asset data), exactly matching how `holdings` / `settings` /
`historySnapshots` are already separated. The single genuinely-new abstraction is
`NetWorthPosition`: both an equity `DerivedRow` and a `ManualAsset` project into it, so
net-worth totals, allocation, and history all fold over one uniform unit (rule-of-three).

**Plan-review findings, all folded in (FIX):**
- *Net worth must not collapse to `—` when one holding is unstamped* → `netWorthTotals`
  returns a strict total (undefined-propagating, R1) **and** a known subtotal + excluded
  count; the UI shows the subtotal with a "partial" badge, never a silently understated
  total.
- *Mixed-FX totals (stamped holdings vs un-stamped assets)* → assets are FX-stamped in
  the same `refreshFx` pass as holdings, plus on base-currency change and asset edit
  (`maybeStampAsset`); a non-base asset with a stale stamp is flagged in the UI.
- *Snapshot two-writers gap* → `recordSnapshot`/`buildRecord` read **both** stores, so any
  net-worth-moving trigger (import, FX refresh, asset add/edit/delete) writes a complete
  record; budget edits deliberately don't snapshot (they don't move net worth).
- *Backup orphaned by the v4 bump* → `parseBackup` now accepts `schemaVersion <=
  DB_VERSION` and upconverts (old holdings-only backups stay restorable); export/restore
  cover all stores + the planning/goal targets, atomically across stores, with a
  restore-preview manifest. This was the pre-mortem's #1 failure mode (a returning user
  restoring an old backup and silently wiping the new data).
- *`investedAmount` thin for cash/FD* → optional per asset; value-only assets count toward
  net worth but are excluded from P&L%.
- *Speculative front-loading* → `riskBand`/`emergencyFund` are additive optional asset
  fields used only by Phase 3.
- *Time-to-goal needs a named model* → `projectGoal` states a flat-contribution model
  (no assumed market growth) and surfaces the assumption in the UI.
- *6-tab mobile overflow* → the nav is a horizontal scroll strip.

**Pre-mortem rollback shape:** each phase is gated by a compile-time flag (R9) and the
migration is strictly additive — rollback is `git revert` → redeploy via `deploy.yml`;
the v4 stores sit inert when flags are off (like `historySnapshots` does when
`FEATURE_HISTORY` is off). No schema downgrade is ever attempted.

## How

**Phase 0 — foundations.** `DB_VERSION` 3→4 adds `assets` (keyed `id`) and `budgetMonths`
(keyed `YYYY-MM`) in an `oldVersion < 4` guard, additive, no backfill. `lib/restoreBackup.ts`
gains validators for assets / budget months / settings targets and the `<= DB_VERSION`
upconvert; `storage/backup.ts` serializes every store and restores holdings+assets+budget
in one cross-store transaction (settings targets merged after). `DataBackupSection` shows a
manifest before the destructive confirm. `AppShell` nav becomes a horizontal scroll strip
that holds up to six tabs.

**Phase 1 — assets + net worth.** `ManualAsset` (value-only: name, class, currency,
optional invested, current value, FX stamp, optional planning tags). `lib/netWorth.ts`:
`buildPositions` → `netWorthTotals` (dual strict/known return) + `netWorthAllocation` +
`staleAssetCount`. `stampAsset` added to `refreshFx`; `App.tsx` gains `addAsset` /
`updateAsset` / `deleteAsset` intents with a best-effort post-write snapshot. UI:
`AssetsSection` on Holdings (table + add/edit modal + delete), a net-worth KPI row +
allocation bars + partial badge on Analytics. `HoldingForm`'s modal primitives were
extracted to `components/formModal.tsx` and shared with `AssetForm`.

**Phase 2 — budget.** `storage/budget.ts` (month records) + `lib/budget.ts` (`summarizeMonth`
/ `summarizeAll`: % spent / invested / remaining, `undefined` when income is 0). `BudgetRoute`
edits a month's income/expense lines (client state → JSON hidden fields) and lists saved
months. `budgetAction` parses and persists; no snapshot trigger.

**Phase 3 — planning.** Optional `riskBand` + `emergencyFund` tags on assets (additive).
`lib/planning.ts`: `emergencyFundStatus` (current from emergency-tagged assets vs
need×months, partial-aware), `riskAllocation` (by band, with target overlay),
`bulkAllocation` (lump-sum split, normalized, scratch-only). `PlanningRoute` renders all
three; targets are set in Settings.

**Phase 4 — goals.** `goalCorpus` / `monthlyContribution` on `settings`; `lib/goals.ts`
`projectGoal` (progress %, flat-contribution months-to-goal, stated assumption); a goal
card on Analytics. Settings gains a "Planning & goals" fieldset (saved via the existing
`save` intent through an extended `readSettingsFromForm`).

**Conventions honored:** R1 (partial values propagate `undefined`, verified by
`netWorth.test.ts`), R2 (base figures stamped, never render-computed), R3 (single-tx
atomic writes; best-effort snapshots), R9 (compile-time flags), R10 (no new egress), R11
(additive stores), additive-only migration with a `DB_VERSION` bump for the new stores,
token palette only, conventional-commit messages.

**Verification:** `tsc -b --noEmit` clean; `npm run build` green (data validation passes;
the >500 kB Recharts chunk warning is pre-existing, not introduced here); **198 Vitest
tests pass** including new suites for the net-worth fold, budget/planning/goals folds, asset
validators, and backup round-trip (manual-source holdings + `allocationTargets` + v3
upconvert). No auto-formatter is configured, so style was matched by hand to the
surrounding code.

**Review:** clean after one auto-fix iteration. Both Block findings were on the restore
path (the pre-mortem's #1 risk) and were fixed + locked with tests: (1) `parseBackup`
rejected `source:'manual'` holdings, breaking restore for anyone who added a holding by
hand; (2) `allocationTargets` were dropped from the backup round-trip. One Follow-up and
one Nit were logged, not Block-level.

**Remaining manual step:** per `.claude/rules/frontend-design.md`, Playwright verification
of the new UI surfaces (Holdings assets section, Budget, Planning, Analytics net-worth +
goal) is captured before the draft PR is marked ready-for-review — that gate is
engineer-driven and was not run in this `/develop` (which verifies via local build +
tests). The dev server (`npm run dev`) plus the Playwright MCP tools cover it.
</content>
