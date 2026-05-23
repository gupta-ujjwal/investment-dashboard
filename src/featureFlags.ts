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
export const FEATURE_SECTOR_DONUT = false

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
export const FEATURE_BENCHMARK_OVERLAY = false
