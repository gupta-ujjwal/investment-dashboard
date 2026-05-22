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
export const FEATURE_ANALYTICS_DEPTH = false
