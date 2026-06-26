# Investments tab, net-worth IA restructure, budget tags

> Implemented via `/brainstorm` → `/develop` on 2026-06-26.

## What

Restructures the dashboard from an equity-centric layout into a net-worth-centric one, and
adds reusable budget tags. Three threads:

1. **Information architecture** — tabs go from `Analytics · Holdings · Budget · Planning ·
   Import · Settings` to **`Overview · Investments · Equity · Budget · Planning · Import ·
   Settings`**. `/analytics`→`/overview` and `/holdings`→`/equity` redirects preserve
   bookmarks. First-run still lands on `/import`.
2. **Investments tab** (new) — manage every asset class in one list. Equity · India / Equity ·
   US are **backfilled read-only** from the holdings store (aggregated by market); all other
   classes (crypto, gold, MF, NPS, FD, cash) are editable manual assets.
3. **Budget tags** — a managed `budgetTags` IndexedDB store (DB v4→**v5**) and a creatable,
   kind-filtered tag combobox on each budget line.

Files touched (new ⁺): routing/shell `src/App.tsx`, `src/routes/AppShell.tsx`; routes
`src/routes/OverviewRoute.tsx`⁺ (replaces `AnalyticsRoute`), `src/routes/InvestmentsRoute.tsx`⁺,
`src/routes/EquityRoute.tsx`⁺ (replaces `HoldingsRoute`); folds `src/lib/investments.ts`⁺,
`src/lib/analytics.ts`; charts `src/components/charts/OverviewCharts.tsx`⁺,
`NetWorthHistoryArea.tsx`⁺, `AssetClassSparklines.tsx`⁺, `ChartsPanel.tsx`; storage
`src/storage/budgetTags.ts`⁺, `src/storage/holdings.ts`, `src/storage/backup.ts`,
`src/lib/restoreBackup.ts`, `src/routes/DataBackupSection.tsx`; budget UI `src/routes/BudgetRoute.tsx`;
asset form `src/components/AssetForm.tsx`; form action paths `HoldingForm.tsx`/`HoldingRow.tsx`;
`src/routes/import/ImportRoute.tsx`; `src/featureFlags.ts`. Removed: `AnalyticsRoute.tsx`,
`HoldingsRoute.tsx`, `AssetsSection.tsx`, `AssetsTable.tsx` (superseded).

**External surface:** IndexedDB schema (new `budgetTags` store, `DB_VERSION` 4→5, additive);
backup JSON gains a `budgetTags` array; URL routes `/overview`, `/investments`, `/equity` (+ two
redirects). No network surface changes.

## Why

The old `AnalyticsRoute` mixed two concerns (cross-asset net worth **and** equity-specific
depth) and `HoldingsRoute` carried both the equity table and manual-asset CRUD. The user's
mental model is net-worth-first: equity (US + India) is *one* asset class among many. The
restructure makes each surface single-purpose: Overview = generic, Investments = manage all
classes, Equity = drill into the ticker portfolio.

**Approach taken — extract-and-reuse.** Routes are thin compositions over existing pure folds
(`deriveRows`, `netWorth` grouping, `analytics`), with one new store. The rejected alternative
("in-place re-section": keep the old route files and branch on path) was turned down because it
re-complects the exact "two concerns in one route" smell being undone and fights per-tab lazy
chunking — equity charts would leak into the Overview bundle. The build confirms the split holds:
`OverviewCharts` is its own 5 kB lazy chunk, the equity `ChartsPanel` a separate 202 kB chunk.

**Key data-model decisions (from the brainstorm grill):**
- Equity backfill is **derived read-only** (aggregated live from holdings by market), never
  written into the assets store — one source of truth, respects the positional-holdings rule.
- The manual `equity` asset class is **dropped from the add form** but re-surfaced when editing a
  pre-existing equity asset (so its class round-trips instead of silently switching on save).
- A budget tag is a **managed label, not a foreign key**: the tag's `label` is copied into the
  unchanged `BudgetLine.category`. No line migration; renaming a tag does not rewrite past
  months (historical fidelity); deleting a tag leaves past lines intact and only removes it from
  the picker.

**Plan-review dispositions folded in (FIX):** one parameterized `valueSeries(history, base,
filter?)` instead of two paths (equity-only = `isHoldingPosition`); v5 backup→current-app restore
defaults the absent `budgetTags` key to `[]`; the backfill fold is defensive (non-finite figures
treated as not-computable, never thrown or summed); derived equity rows render read-only with a
"View →" link to the Equity tab; legacy manual-equity assets stay editable and are flagged as
"counted separately"; route renames swept (forms repost to `/equity`, redirects added); idempotent
`objectStoreNames.contains` store creation + `VersionError`/`blocked`/`blocking`/`terminated`
handling on DB open. **Deferred (DEFER):** staging the migration a release ahead / splitting it into
a separate PR — the user pinned single delivery; the data-safety guarantee instead comes from the
idempotent additive migration, migration-first commit ordering, the round-trip test, and the
`FEATURE_BUDGET_TAGS` kill switch.

**Pre-mortem.** Most likely failure: after v5 migrates, a stale-cached/reverted older bundle opens
the v5 DB and throws `VersionError`, or a two-tab open `blocks` the upgrade — either could
white-screen the app over the user's only data copy. Mitigation shipped: `getDB` surfaces a
"reload to latest / close other tabs" message instead of rejecting unhandled, and the migration is
additive (old code still reads a v5 DB — it only *added* a store). **Rollback:** flip
`FEATURE_BUDGET_TAGS` off + `git revert` the UI commit + redeploy; the v5 store simply sits unused
(the migration is a one-way door but safe — it never touched existing stores).

## How

Built in four slices, verified end-to-end (`tsc` clean, 216 unit tests pass, `vite build` green).

1. **Migration + tag store + backup round-trip** (`storage/holdings.ts`, `storage/budgetTags.ts`,
   `storage/backup.ts`, `lib/restoreBackup.ts`, `DataBackupSection.tsx`). `DB_VERSION` → 5 with an
   `if (oldVersion < 5)` block that creates `budgetTags` only if absent (idempotent). `getDB` gained
   `blocked`/`blocking`/`terminated` callbacks and a `.catch` that maps `VersionError` to a
   user-facing reload prompt (test seam `setDbBlockedPresenter`). `BudgetTag = {id, label, kind,
   createdAt}` with CRUD + `restoreAllBudgetTags` + a case/space-insensitive `tagDedupeKey`.
   `exportBackup`/`restoreAll`/`backupManifest` include `budgetTags`; `restoreAll` clears+adds all
   four stores in **one** atomic transaction; `parseBackup` validates tags and upconverts a missing
   `budgetTags` key to `[]`.
2. **Budget tags UI + actions** (`App.tsx`, `BudgetRoute.tsx`, `featureFlags.ts`). `budgetLoader`
   loads tags; `budgetAction` gains idempotent `createTag` (dedupes within kind) and `deleteTag`
   intents. `LineEditor` backs each category input with a kind-scoped `<datalist>` (reuse via
   autocomplete) + an inline "+ tag" to persist a new label and a chip row to delete tags. All gated
   on `FEATURE_BUDGET_TAGS` (off → plain free-text inputs, no schema revert).
3. **Investments backfill + drop manual equity** (`lib/investments.ts`, `AssetForm.tsx`).
   `buildInvestmentRows` = `deriveEquityRows` (open holdings aggregated by market, partial-aware:
   excluded count, non-finite → not-computable) ++ editable asset rows, legacy equity flagged not
   hidden. `AssetForm` drops `equity` from the picker, re-adding it only when editing an existing
   equity asset.
4. **Analytics split + new charts + IA** (`lib/analytics.ts`, three route files, three chart files,
   `AppShell.tsx`, `App.tsx`). `valueSeries` reworked into one fold over `buildPositions` with an
   optional position filter (`isHoldingPosition` for the equity-only series feeding the benchmark);
   new `classValueSeries` + `assetClassChanges` power the Overview stacked area + per-class
   sparklines. `OverviewRoute` keeps net worth + composition + emergency-fund card + goal + lazy
   `OverviewCharts`; `EquityRoute` absorbs the holdings table + equity KPIs/risk/charts;
   `InvestmentsRoute` renders the unified list. `ChartsPanel` switched to the equity-only series.

**Conventions honored:** additive-only IDB migration with `oldVersion < N` guard, no backfill in
`upgrade`, `DB_VERSION` bumped for the new store (per the storage decision guide); partial-value
discipline (`undefined`/non-finite never read as `0`) across every new fold; Recharts kept out of
the initial bundle via default-exported lazy panels; `FEATURE_*` compile-time bulkhead reused.

**Review:** `/deep-review` returned **no Block findings** (clean after 1 iteration). Two non-Block
items: (a) the post-restore success toast now includes `budgetTags` in its count (fixed); (b) see
the test limitation below.

**Known limitation — IDB-level tests.** The test harness runs in `node` with **no
`fake-indexeddb`**, and adding it is out of this change's dependency scope. So the two
data-loss-capable IDB paths — the `upgrade` callback and the atomic `restoreAll` transaction — are
**not** unit-tested; only the pure parse/serialize boundary (`parseBackup`/`exportBackup` shape,
including the tags round-trip and the missing-key default) is. Those IDB paths should be exercised
via Playwright (load each route, add/delete a tag, export→reload→restore) before the PR is marked
ready-for-review — this is the remaining manual verification gate for a UI change of this size.
