export const FEATURE_BASE_CURRENCY = true

/** Homepage price-history snapshots + analytics charts (issue #9). Turning
 *  this off hides the charts and reverts the KPI row; it does NOT revert the
 *  IndexedDB v3 schema — the `historySnapshots` store simply sits unused. */
export const FEATURE_HISTORY = true
