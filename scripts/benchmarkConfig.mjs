// Shared thresholds for the analytics-depth refresh + validation pipelines
// (issue #24, PR B). One file, two consumers:
//   - `scripts/refresh-benchmarks.mjs` validates fetched data before writing
//   - `scripts/validateData.mjs` validates bundled data in `prebuild`
//
// Keeping the thresholds in one place avoids the silent drift where a
// hand-edited or partial `benchmarks/*.json` passes `prebuild` while
// failing the refresh script — the two stages now agree on what
// "valid benchmark series" means.

/** Minimum number of daily-close points a valid benchmark series must
 *  carry. ~4 trading years; lower than the 5y fetch range so a refresh
 *  that returns slightly truncated data isn't false-rejected, but high
 *  enough to catch hand-editing accidents and truncated CSVs. */
export const MIN_EXPECTED_POINTS = 1000
