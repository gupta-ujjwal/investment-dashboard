# Manual add / edit / delete holdings (issue #20)

> Implemented via `/brainstorm` → `/develop` on 2026-05-20. Closes [#20](https://github.com/gupta-ujjwal/investment-dashboard/issues/20).

## What

Direct-CRUD path for individual holdings on `/holdings`:

- **Add** a manual position via a modal form (`+ Add holding` button in the page header).
- **Edit** a position inline on desktop (the row's cells become inputs in place); or via the same modal on mobile cards.
- **Mark closed** / **Re-open** any position (broker or manual), preserving its history in `historySnapshots` and dropping it from current views by default.
- **Revert to broker** for a row whose user-edits should be undone, clearing its sticky per-field overrides.
- **Delete forever** with a confirm dialog and a 5-second post-action undo toast.

The import wizard's missing-row prompt grows a third option — **Mark closed** — alongside Keep / Delete, so a sold position never silently vanishes from the time series.

External surface: none. No public API, no URL contract change (`/holdings` stays). Schema additions are optional scalars, no `DB_VERSION` bump.

Files touched (15):

- New: `src/storage/holdingMerge.ts`, `src/lib/holdingValidators.ts`, `src/components/HoldingForm.tsx`, `src/components/HoldingRow.tsx`, `src/components/HoldingActionsMenu.tsx`, `src/components/useUndoableAction.ts`, `src/components/UndoToast.tsx`.
- Modified: `src/storage/holdings.ts`, `src/parsers/diff.ts`, `src/lib/holdingsView.ts`, `src/components/HoldingsTable.tsx`, `src/routes/HoldingsRoute.tsx`, `src/App.tsx`, `src/routes/import/PreviewStep.tsx`, `src/routes/import/wizardState.ts`, plus type narrowing in `Instructions.tsx`, `UploadStep.tsx`, `SourcePicker.tsx`.
- Tests: `src/storage/holdingMerge.test.ts`, `src/lib/holdingValidators.test.ts`, expanded `src/parsers/diff.test.ts` (three-branch + three-hop integration), expanded `src/lib/holdingsView.test.ts` (closed-row filter + isStale skip).
- Tooling: `.gitignore` adds `notes/` and `.playwright-mcp/` as scratch.

## Why

`CLAUDE.md` promises the dashboard supports "import their investment holdings via CSV upload, **or add them manually one at a time**". The manual path didn't exist and there was no edit / delete affordance on imported rows either. The issue body cited three real gaps the absence created:

- instruments no broker exports cleanly (RSUs, ESOPs, gold, PPF, foreign brokers without parsers);
- corrections — broker exports with stale prices or wrong quantities couldn't be fixed without re-importing;
- exits — sold positions silently vanished on the next import, losing their contribution to historical P&L.

### Approaches considered

**Approach 1 (chosen) — single PR, full vertical**: schema additions + new primitives + diff-merge logic + add modal + inline-cell edit + overflow menu + show-closed toggle + PreviewStep mark-closed branch all land together. Bigger review surface but no half-state in `main`.

**Approach 2 — two PRs (foundation, then corrections)**: smaller PRs but leaves a foundation-only PR1 where `Delete` is the only removal verb until PR2 (mark-closed) ships. The brainstorm review identified this as the worse rollback shape for a single-user side project — Approach 1 sidesteps it.

A finer 3-PR split (add → edit → mark-closed) was ruled out because the add / edit modals share one component; splitting them across PRs forces stubbing and reassembling without coherence win.

### Decisions pinned during the grill loop

1. **Scope**: all four bullets in one PR; mark-closed applies to **all sources**, not just manual rows.
2. **Closed model**: `status: 'open' | 'closed'` field (extensible — easier to add `'delisted'` or `'pending'` later than to retrofit from a boolean).
3. **Audit timestamps**: `createdAt: number` (immutable) + `updatedAt: number` (set on every write). Existing `importedAt` stays as-is for R8 staleness.
4. **Manual ≠ import-diff**: `source:'manual'` rows are direct CRUD; they never enter `diff.ts`. R7 (source containment) preserved by typing the import wizard against a new `BrokerSource = Exclude<Source, 'manual'>`.
5. **Form surface**: modal triggered from `/holdings` header.
6. **Edit UX**: inline-cell edit on desktop (the row flips into edit mode); modal-edit on mobile cards.
7. **Broker-row edits**: sticky per-field via `manualOverrides?: OverridableField[]`. Import-diff update preserves overridden fields; `✎ edited` badge marks the row; per-row Revert to broker action clears the set.
8. **Destructive UX**: two distinct overflow-menu actions — `Mark closed` (reversible) and `Delete forever` (inline confirm dialog with steering copy).
9. **Closed visibility**: hidden by default; `Show closed (N)` filter toggle surfaces them. Snapshots keep their copy regardless.

### Findings the plan review surfaced — dispositions

The 4 Shapes lens + reliability-tenets lens surfaced 14 findings; 12 FIX folded in, 2 DEFER both contingent on Approach 2 (not chosen).

- **FIX** — Closed-row lifecycle policy unstated → R11 added to `productContext/dsl.md` (in a follow-up PR; this branch can't edit productContext/).
- **FIX** — `currentPrice` user vs broker future-collision → DSL forward-compat note (same follow-up PR).
- **FIX** — Override-merge open-coded risk → `src/storage/holdingMerge.ts` extracted. Single test surface.
- **FIX** — Edit + extend overrides must be one txn → `upsertHolding(row, { addOverrides })` makes the value-write + override-extend a single atomic IDB tx.
- **FIX** — Validators must be single source of truth → `src/lib/holdingValidators.ts` imported by both modal and inline-edit save paths.
- **FIX** — `HoldingRow.tsx` extraction promoted to step 1 of UI work, before any inline-edit wiring (kept `HoldingsTable.tsx` thin).
- **FIX** — `✎ edited` badge prominent + one-click revert (confirmed in implementation).
- **FIX** — Dedicated `diff.test.ts` table-test for the three new branches (skip-overridden-fields, closed-not-missing, closed→open on update).
- **FIX** — 5-second undo toast on Delete forever (`useUndoableAction` + `UndoToast`).
- **FIX** — Same undo toast for inline-edit Save (fat-finger protection on numeric fields).
- **FIX** — Three-hop integration test: edit broker row → re-`commitImport` with conflicting payload → assert override stuck (`src/parsers/diff.test.ts:167-198`).
- **FIX** — `useUndoableAction` extracted as a shared hook to keep `HoldingsTable` thin.
- **DEFER** — (Approach-2-contingent) Drop `status` from PR1 entirely.
- **DEFER** — (Approach-2-contingent) Pull `Mark closed` / `Re-open` forward into PR1.

### Pre-mortem

**Most likely failure**: silent override stomp on re-import. User edits a broker row's quantity inline; six weeks later imports a fresh Vested XLSX; a bug in `mergeWithOverrides` lets the broker value win; the `✎ edited` badge keeps rendering because `manualOverrides` itself persists; the user has no visual signal that the underlying value reverted; cost basis, profit %, and historical-series math silently use the wrong value until they spot-check against the broker app.

**Rollback shape**: code → `git revert <merge-SHA> && git push origin main`, GitHub Pages redeploys in ~2 min. Schema additions are optional scalars — a reverted build simply stops reading them and existing data stays valid against the prior `CanonicalHolding` shape. Data recovery for the user: pull the pre-corruption row from the most recent `historySnapshots` entry (R3 best-effort daily snapshots embed the full holdings array) via DevTools, or restore via PR #31's Restore-from-backup if a backup file from before the bad import is available.

**Detection signal**: load-bearing detection is *pre-merge* — the three-hop integration test in `src/parsers/diff.test.ts` (edit a broker row → run `commitImport` with a conflicting payload → assert override held) blocks merge if `mergeWithOverrides` regresses. Post-merge there is no telemetry (edge-only, hard constraint). Soft signal: the `✎ edited` badge is forensic only.

**Responder**: the user (single-stakeholder; no oncall).

## How

### Storage layer

`CanonicalHolding` (`src/storage/holdings.ts:25-58`) gains four optional fields — `status?: 'open' | 'closed'`, `createdAt?: number`, `updatedAt?: number`, `manualOverrides?: OverridableField[]` — and a third `Source` member, `'manual'`. The import wizard is narrowed to `BrokerSource = Exclude<Source, 'manual'>` (`holdings.ts:7-10`) and threaded through `wizardState.ts`, `Instructions.tsx`, `UploadStep.tsx`, `SourcePicker.tsx` so the compiler enforces R7 (no `'manual'` row reaches a parser or the diff).

Four new single-row IDB primitives, each in its own readwrite tx (R3 holds at row level): `upsertHolding(row, opts?: { addOverrides? })`, `deleteHolding(key)`, `setHoldingStatus(key, status)`, `revertHoldingOverrides(key)`. `upsertHolding`'s optional `addOverrides` parameter unions field names into `row.manualOverrides` *inside the same tx*, so the value-write + override-extend are atomic by construction. No `DB_VERSION` bump — additive optional scalars per `productContext/dsl.md § dsl-decision-guide`.

### Pure helpers (single source of truth)

`src/storage/holdingMerge.ts` exports `mergeWithOverrides(existing, incoming)` — the per-field write-priority lattice (`manual > broker` for fields in `existing.manualOverrides`, `broker > manual` otherwise) that both `diff.ts`'s update path and any future caller needing the same semantics use. Unit-tested in `holdingMerge.test.ts` across {no overrides, empty overrides, single override, multiple overrides, currentPrice undefined override, status + createdAt preservation, defensive-copy contract}.

`src/lib/holdingValidators.ts` exports `validateHoldingForm()` + `buildHoldingFromForm()`. Shared by the modal form (`HoldingForm.tsx`) and the desktop inline-cell-edit save path (`HoldingRow.tsx`). Duplicate compound-key check uses `existingKeys` from the loader; `currentKey` lets the row being edited not false-positive against itself.

### Diff + view updates

`diff.ts`'s update path calls `mergeWithOverrides` and flips `status:'closed' → 'open'` when a previously-exited row reappears in a broker import (re-buy semantics). Closed rows that stay missing from incoming are excluded from `missing` — the user already decided. `holdingsView.ts` gains `Filters.showClosed?: boolean` (default false; hides closed rows from `/holdings` + analytics) and treats `isStale` as `false` for closed rows (a closed position can't go stale).

The three new branches on the import critical path are covered by a dedicated table-test in `diff.test.ts` (`describe('diffHoldings — manual-overrides + closed-row semantics')`, lines 117-165) plus the three-hop integration scenario (lines 167-198) that mirrors the pre-mortem's most-likely-failure path.

### Action layer

`App.tsx` gains a `holdingsAction` declared on the `/holdings` route, mirroring `settingsAction`. Intents: `add | update | delete | setStatus | revertOverrides`. Returns a typed `HoldingActionResult` with optional `fieldErrors` for field-level error display. The `add` intent FX-stamps the new row with `settings.lastFxRate` when it's < 24h old (existing pattern); otherwise the row lands with base figures undefined and the `RefreshBanner` prompts the user. The `update` intent computes a `diffOverrides` over the user-changed fields and writes via `upsertHolding(row, { addOverrides })` so broker-row edits accumulate sticky overrides.

### UI

`HoldingsTable.tsx` is thinned to header + body map + totals; per-row JSX lives in `HoldingRow.tsx` (desktop `<tr>` + mobile `<article>` + the InlineEditRow). The `HoldingRow.tsx` exports the formatter helpers (`Cell`, `StaleMarker`, `money`, `profitColor`, etc.) that `HoldingsTable.tsx`'s totals row also consumes — single source of truth.

`HoldingActionsMenu.tsx` is the ⋯ overflow menu (Edit · Mark closed / Re-open · Revert to broker · Delete forever). Click-outside + Escape close. Delete forever flips the panel into a confirm view with steering copy ("Use *Mark as closed* instead if you sold the position — it preserves time-series fidelity"). Revert to broker only renders when `manualOverrides` is non-empty.

Desktop inline-cell-edit lives in `HoldingRow.tsx → InlineEditRow`. The row's local state flips into edit mode when Edit is picked from the menu; name / quantity / avgBuyPrice / currentPrice / assetClass become inputs in place; market / currency / source / broker stay frozen (identity-shape). Save fires the same `update` intent the modal uses; field-level errors decorate the matching inputs. On success the row exits edit mode and the parent's `onEditSaved` callback fires the undo toast with the pre-edit snapshot.

Mobile cards (`HoldingCard`) keep modal-edit — inline-cell editing on a 375px viewport is more error-prone than ergonomic and the modal already exists.

`useUndoableAction.ts` is a generic post-action recovery hook (Gmail-style undo toast). One instance in `HoldingsRoute.tsx` serves both Delete-undo and inline-edit-save-undo — restore semantics are identical (`upsertHolding(snapshot)` + `revalidator.revalidate()`). 5-second window, single-toast policy (a new `show()` supersedes), bound to Reliability Tenet 3 (blast radius) on irreplaceable single-user data.

`HoldingsRoute.tsx` adds:
- `+ Add holding` button in the header.
- Empty-state CTA pairs `+ Add manually` with `Go to Import` so the manual path is discoverable on first run.
- `Show closed (N)` filter toggle in `HoldingsControls`, hidden when no closed rows exist — keeps the control surface honest.
- Page caption shows "N open · X INR · Y USD · Z closed" so the filter toggle has a visible target.
- One imperative `useFetcher` for delete / setStatus / revertOverrides (fire-and-forget — no UI surface for field errors). Edit + Add each have their own fetcher inside `HoldingForm` / `InlineEditRow` to surface field-level errors.

`PreviewStep.tsx`'s missing-row prompt grows a third button — Mark closed — alongside Keep and Delete. `MissingDecision` union extends to `'keep' | 'close' | 'delete'`. On commit, rows the user picked Close for become `status:'closed'` updates inside the same atomic `commitImport` tx as the other inserts / updates / deletes (R3 preserved).

### productContext updates — DEFERRED to a separate human-gated PR

The `/develop` skill forbids edits to `productContext/`. The plan named three doc changes to be made in a follow-up PR:

- **R11** (new, `dsl.md § dsl-domain-rules`): closed rows persist indefinitely until manual `Delete forever`; never auto-purged. *Note: the existing `dsl.md` already has an R11 covering "Holdings are positional" — the follow-up PR should reconcile the numbering (rename to R13 or restructure).*
- **R12** (new): manual overrides are sticky across re-imports; per-row `Revert to broker` is the only restoration path.
- **R10 forward-compat note** (or new R14): any future live-price fetch must respect `manualOverrides` — if `'currentPrice' ∈ row.manualOverrides`, the live-price refresh skips that row. Pre-empts a silent corruption when issue #10 (live prices) lands.
- **`architecture.md § arch-storage`**: list the four new `CanonicalHolding` fields and the four new CRUD primitives.

### Build / format / test outcomes

- **Typecheck** (`npm run typecheck`): PASSED.
- **Tests** (`npm run test:run`): PASSED — 128/128 tests across 11 files. Includes new `holdingMerge.test.ts` (7 tests), new `holdingValidators.test.ts` (12 tests), expanded `diff.test.ts` (6 new tests including the three-hop integration), expanded `holdingsView.test.ts` (4 new tests).
- **Build** (`npm run build` = `tsc -b && vite build`): PASSED. Bundle-size warning on the main chunk is pre-existing (~1.3 MB before this PR; this branch adds ~10 kB).
- **Format**: skipped — no formatter is configured in `package.json` (no prettier / biome). Style consistency is manual; the new files follow the project's existing inline-Tailwind + raw-`<input>` pattern.

### Autonomous review pass

`/deep-review` ran clean: `Block: 0 · Request changes: 1 · Follow-up: 7 · Nit: 6`. All 12 FIX dispositions are present and load-bearing in the code. The single Request-changes finding (tighten `diffHoldings(source: Source)` → `BrokerSource`) is a typing follow-through of the `BrokerSource` introduction; the 7 Follow-ups cluster around (a) the productContext PR called out above, (b) a `useUndoableAction` unit test using `vi.useFakeTimers()`, and (c) the optional `console.warn` in `mergeWithOverrides` the plan itself marked as deferrable. Nits are dead-field cleanups (`market`, `_existingKeyCount` — both plumbed through but unread by the action layer).

### What's NOT in this PR (for the engineer)

- **Playwright verification** of the rendered output. `/develop`'s flow runs build + test + auto-review; the project's `.claude/rules/frontend-design.md` calls for Playwright capture before the draft PR is marked ready-for-review. Recommended to run before raising the PR: `npm run dev` in one terminal, then exercise add / edit-inline / edit-modal / delete-with-undo / mark-closed / re-open / revert / show-closed-toggle / PreviewStep mark-closed across desktop + mobile viewports; capture `## Evidence` screenshots.
- **productContext updates** (R11 / R12 / forward-compat note / arch-storage). Plan documented; this PR cannot edit `productContext/` per `/develop` skill rules. Raise a separate doc-only PR.
- **Inline-edit unit / component tests.** The form validators are unit-tested; the `useUndoableAction` hook isn't (deep-review Follow-up). A `vi.useFakeTimers()` test would cover show / supersede / timeout / undo / unmount-cleanup.
