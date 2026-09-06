export const FEATURE_BASE_CURRENCY = true

/** Homepage price-history snapshots + analytics charts (issue #9). Turning
 *  this off hides the charts and reverts the KPI row; it does NOT revert the
 *  IndexedDB v3 schema — the `historySnapshots` store simply sits unused. */
export const FEATURE_HISTORY = true

/** Analytics-depth pure-fold widgets (issue #24, PR A): Risk KPI sub-row
 *  (top-5 weight, HHI band, single-stock-risk flag) and currency-exposure
 *  donut. Pure folds over existing `DerivedRow[]`; no new bundled data, no
 *  new IndexedDB store. Flipping off hides both surfaces and reverts the
 *  analytics page to the prior 4-KPI + 4-chart shape.
 *
 *  Defaults to `false` in the introducing commit so the PR can stage:
 *  (1) merge with the flag off (no user-visible change), (2) capture
 *  Playwright + unit-test evidence per `.claude/rules/frontend-design.md`,
 *  (3) flip to `true` in a one-line follow-up commit. This is the "canary
 *  gate" the analytics-depth plan calls out — the flag is the pre-merge
 *  dark-shipping switch, not a post-deploy kill switch (rollback after
 *  deploy is `git revert` → redeploy via the existing `deploy.yml`). */
export const FEATURE_ANALYTICS_DEPTH = true

/** Sector-allocation donut (issue #24, PR B). Reads
 *  `src/data/sectors.json` (hand-curated ticker → sector map: GICS for
 *  USD-listed, NSE classification for INR-listed — no unified ontology).
 *  Holdings whose `sourceSymbol` is not in the map fall into an explicit
 *  "Unknown" bucket; PRs against the JSON extend coverage.
 *
 *  Independent of FEATURE_ANALYTICS_DEPTH and FEATURE_BENCHMARK_OVERLAY —
 *  the plan's "per-widget rollback bulkhead" means a buggy sector lookup
 *  can't take the benchmark overlay down with it on rollback. Defaults
 *  `false`; flipped on in a one-line follow-up commit after Playwright
 *  evidence + unit fixtures pass (the canary gate). Pre-merge dark-
 *  shipping switch, not a post-deploy kill switch — once deployed,
 *  rollback is `git revert` → redeploy via `deploy.yml`. */
export const FEATURE_SECTOR_DONUT = true

/** Benchmark overlay on `ValueOverTime` (issue #24, PR B). Reads
 *  `src/data/benchmarks/{nifty50,sp500}.json`, refreshed weekly via
 *  `.github/workflows/refresh-benchmarks.yml`. NIFTY 50 for INR base,
 *  S&P 500 for USD base; mixed-currency portfolios hide the line with a
 *  legend caveat (apples-to-oranges comparison would be misleading).
 *
 *  Independent of FEATURE_ANALYTICS_DEPTH and FEATURE_SECTOR_DONUT — same
 *  per-widget rollback bulkhead reasoning. Defaults `false`; flipped on
 *  in a one-line follow-up commit after Playwright evidence + unit
 *  fixtures pass. Pre-merge dark-shipping switch, not a post-deploy kill
 *  switch — once deployed, rollback is `git revert` → redeploy via
 *  `deploy.yml`. */
export const FEATURE_BENCHMARK_OVERLAY = true

// ── Personal-finance revamp (dashboard-revamp-expansion) ────────────────────
// Four phase flags gating the scope expansion from an equity-only tracker into
// a full personal-finance dashboard. Each is an independent per-feature
// bulkhead: flipping one off hides its tab/widgets and reverts to the prior
// shape without touching the others or the DB schema (R9 — flags are
// compile-time, the v4 stores exist regardless). Phase 0 (DB v4 migration +
// backup/restore coverage + responsive nav) is infrastructure and is NOT
// flag-gated — it ships unconditionally so the data-safety guarantees hold
// even with every feature flag off.

/** Phase 1: multi-asset net worth. Value-only `ManualAsset` store alongside
 *  holdings; `NetWorthPosition` unifier; net-worth KPIs + allocation on
 *  Analytics; asset CRUD on Holdings; assets folded into history snapshots. */
export const FEATURE_ASSETS = true

/** Phase 2: monthly cash-flow / budget. `budgetMonths` store; Budget tab;
 *  category-total entry with % spent/invested/remaining folds. Independent of
 *  FEATURE_ASSETS — budget moves spending, not net worth. */
export const FEATURE_BUDGET = true

/** Phase 3: planning. Adds optional `riskBand` + `emergencyFund` tags to
 *  assets (additive, no version bump); Planning tab derives the emergency-fund
 *  status and allocation/risk mix from tagged assets + manual targets on
 *  Settings. Depends on FEATURE_ASSETS for its source data. */
export const FEATURE_PLANNING = true

/** Phase 4: goals & projection. Manual goal corpus + monthly contribution on
 *  Settings; time-to-goal projection surfaced on Analytics. Reads net-worth
 *  totals, so it is most useful with FEATURE_ASSETS on. */
export const FEATURE_GOALS = true

/** Reusable budget tags (DB v5). Adds a `budgetTags` store and a creatable,
 *  kind-filtered tag combobox on the Budget line editor; the tag's label is
 *  written into `BudgetLine.category` (managed label, not a foreign key). The
 *  per-feature bulkhead for the budget-tags surface: flipping this off reverts
 *  the Budget line inputs to free-text and stops reading/writing tags, WITHOUT
 *  reverting the v5 schema (R9 — flags are compile-time; the additive
 *  `budgetTags` store simply sits unused). This is the data-loss-capable
 *  surface's kill switch — the v5 migration is one-way, but this flag lets the
 *  tag UI be disabled without a schema revert (the rollback shape the plan
 *  review converged on). */
export const FEATURE_BUDGET_TAGS = true

/** Homepage action rail (`implementation-docs/dashboard-ux-redesign.md` PR-2,
 *  commit-2): up to 4 pure-fold guidance cards — risk drift, emergency gap,
 *  stale prices, unstamped FX, an unlogged month, single-position
 *  concentration — surfaced right under the net-worth hero on `/` (`Today`).
 *  Reads existing derived data only; no new store, no new egress. Defaults
 *  `false` so the introducing commit can stage: (1) merge with the flag off
 *  (no user-visible change), (2) capture Playwright + unit-test evidence per
 *  `.claude/rules/frontend-design.md`, (3) flip to `true` in a one-line
 *  follow-up commit — the same canary-gate precedent as
 *  `FEATURE_ANALYTICS_DEPTH`/`FEATURE_SECTOR_DONUT`/`FEATURE_BENCHMARK_OVERLAY`.
 *  Pre-merge dark-shipping switch, not a post-deploy kill switch — once
 *  deployed, rollback is `git revert` → redeploy via `deploy.yml`. */
export const FEATURE_ACTION_RAIL = false
