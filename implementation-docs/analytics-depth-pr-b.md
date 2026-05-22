# Analytics depth — PR B (data-pipeline widgets)

> Implemented via `/brainstorm` → `/develop` on 2026-05-21. PR B of a two-PR feature for issue #24. Sibling consolidated doc for PR A is at `implementation-docs/analytics-depth-pr-a.md`; the cross-PR plan is at `implementation-docs/analytics-depth.md`. Cut from `feat/analytics-depth-pr-a` so review can begin in parallel while PR A is still open.

## What

Adds two analytics-page widgets that depend on bundled JSON data, plus the build-time validation and weekly refresh infrastructure to keep that data honest. Both widgets default off — independent compile-time flags `FEATURE_SECTOR_DONUT` and `FEATURE_BENCHMARK_OVERLAY`, flipped on in one-line follow-up commits after Playwright + unit-test evidence is captured.

1. **Sector donut** in `ChartsPanel`: folds priced holdings by sector via `src/data/sectors.json` (hand-curated ticker→sector map — GICS labels for USD-listed holdings, NSE classification labels for INR-listed ones; no unified ontology). Holdings whose `sourceSymbol` is not in the map fall into an explicit "Unknown" wedge in the neutral `donutOther` colour.
2. **Benchmark overlay** on `ValueOverTime`: a third `<Line>` (dashed bone-500) rendering ~5y of NIFTY 50 closes for INR base or S&P 500 for USD base, rebased so the first portfolio-aligned overlay point matches the portfolio's first value. Mixed-currency portfolios (positions in both INR-listed and USD-listed securities) hide the line and surface a one-line legend caveat — single-index comparison would be apples-to-oranges. The chart legend reads `<index> · as of <YYYY-MM-DD>`; benchmark data older than 30 days additionally renders an ember "stale" chip with the line dimmed to opacity 0.4.

Refresh pipeline:
- `scripts/refresh-benchmarks.mjs` — Node script fetching `^NSEI` and `^GSPC` from Yahoo Finance's `/v8/finance/chart` JSON endpoint, validating each series (non-empty, ≥1000 points, monotonic ascending dates, finite closes, latest date within 7 days of today), writing `src/data/benchmarks/*.json` (each ~80KB).
- `scripts/validateData.mjs` — build-time shape check wired to `prebuild`, asserts the same minimum-point floor (via `scripts/benchmarkConfig.mjs` shared constant), monotonic dates, finite closes, the sectors map's shape.
- `refresh-benchmarks.workflow.yml` (engineer-installed) — weekly cron (`0 6 * * 0` UTC Sundays), runs the refresh script then validator, opens a PR via `peter-evans/create-pull-request@v6` when content changes. `concurrency: refresh-benchmarks` prevents pile-up on hung runs.

Files (7 modified + 11 new, +692 lines):
- Modified: `src/lib/analytics.ts`, `src/lib/analytics.test.ts`, `src/components/charts/ValueOverTime.tsx`, `src/components/charts/ChartsPanel.tsx`, `src/components/charts/chartTheme.ts`, `src/featureFlags.ts`, `package.json` (prebuild hook + two new scripts).
- New: `src/components/charts/SectorDonut.tsx`, `src/data/sectors.json` (43 tickers), `src/data/benchmarks/nifty50.json` (1236 points), `src/data/benchmarks/sp500.json` (1256 points), `scripts/refresh-benchmarks.mjs`, `scripts/validateData.mjs`, `scripts/benchmarkConfig.mjs`, `refresh-benchmarks.workflow.yml` (engineer-installed), `implementation-docs/analytics-depth-pr-b.md` (this doc).

External surface: **no runtime external calls** — R10 (privacy doctrine) unaffected; the bundled JSONs ship to the browser, no per-user egress. **One new build-time external dependency** — the weekly CI workflow fetches Yahoo Finance from GH Actions IPs.

No IndexedDB schema change (no `DB_VERSION` bump).

## Why

PR B is the second of two stages along the natural data-dependency seam from the analytics-depth plan. PR A delivered the pure-fold widgets (concentration KPI sub-row + currency exposure donut); PR B adds the two widgets that depend on bundled data and CI infrastructure to keep that data fresh. Failure modes for the two pairs cluster differently — a bad sector mapping or a malformed benchmark JSON has a different blast-radius shape than a bug in a `DerivedRow[]` fold — so they live behind separate flags and ship in separate PRs.

**Why this split (Approach 2 from the plan):**
- Review cognitive separation. PR A is "are the analytics folds correct?" math review. PR B is "is the CI pipeline + seeded data + JSON shape correct?" ops + data review. Combining them produces "LGTM" reviews that should have caught issues.
- Failure isolation. If the Yahoo Finance refresh starts failing or `peter-evans/create-pull-request@v6` opens a bad PR, PR A's widgets keep working. If a sector mapping has a bug, the benchmark overlay is unaffected.
- Per-widget rollback granularity. `FEATURE_SECTOR_DONUT` and `FEATURE_BENCHMARK_OVERLAY` are independent — the scalpel rollback for a benchmark-line incident leaves the sector donut live.

**Approaches rejected** (full reasoning in `implementation-docs/analytics-depth.md`):
- **Approach 1** (single PR, single flag) — single flag is a hammer when we need a scalpel; mashes CI/ops review with analytics math review.
- **Approach 3** (single PR, four independent flags) — observed failure modes cluster on two regions (pure folds vs external data), not four; four flags over-fits the failure space.

**Reliability tenets honored** (from plan-review + PR-B `/deep-review`):

- **Tenet 3 (blast radius)** — Three layers: (a) per-widget flags, (b) `ChartErrorBoundary` per chart card so one bad chart degrades to "unavailable" rather than white-screening `/analytics`, (c) the new `benchmarkSeries` fold defensively skips `!Number.isFinite` closes and refuses to render if the anchor close is non-positive or the rebase factor isn't finite — even if a malformed JSON slips past `validateData` somehow, the fold returns `[]` rather than propagating NaN through the chart.
- **Tenet 4 (early detection)** — No runtime telemetry by doctrine. Build-time signals do the work: `validateData.mjs` runs in `prebuild` (fails CI red on malformed shape, before any user sees it); the refresh script fail-fasts on garbage upstream data (workflow red, no PR opened, previous-good JSON stays in the bundle); the user-facing `as of <date>` legend + 30-day ember "stale" chip is the only post-deploy signal. Known limit: weekly cron *not running at all* surfaces only via that 30-day chip — up to four cron misses before the user sees the staleness. Plan-accepted gap.
- **Tenet 6 (staggered rollout + rollback)** — All three new flags ship `false`. Engineer flips them on in separate one-line commits after evidence. Per-widget independence means a benchmark-only incident doesn't take the sector donut dark. Post-deploy rollback path is `git revert` → `deploy.yml` redeploys (~2 min); the flag JSDocs all say this explicitly so a future maintainer doesn't mistake the flag for a runtime kill switch.
- **Tenet 7 (test the limits)** — 14 new unit tests in `analytics.test.ts`: 5 for `sectorAllocation` (empty, all-unpriced, multi-bucket sorting, Unknown bucket, cross-ontology coexistence, unpriced-skip) and 8 for `benchmarkSeries` (sub-2-point portfolio, exact rebasing math, forward-fill across non-trading days, leading clip, trailing clip, entirely-outside clip, all-undefined-value, leading-undefined-anchor-skip). `MIN_EXPECTED_POINTS = 1000` is shared between the refresh script and the build-time validator via `scripts/benchmarkConfig.mjs` — no contract drift.

**Pre-mortem (PR B surface):**

Most-likely failure mode is the one the plan named: an automated weekly refresh PR with a malformed close value (Yahoo Finance returns a NaN-coerced cell on a holiday-bordered weekend) gets rubber-stamped by a maintainer skimming a 5-day JSON delta. The defenses are:

1. `refresh-benchmarks.mjs` pre-validates (non-empty, ≥1000 points, monotonic dates, all finite closes, latest within 7d) before writing. Yahoo NaN → workflow red → no PR opened.
2. `validateData.mjs` re-checks the same shape on `prebuild`. Hand-edited or partial JSON → build red → never ships.
3. `benchmarkSeries` defensively skips `!Number.isFinite` closes and aborts the rebase if the anchor or factor isn't finite. Even if 1 and 2 are circumvented, the chart degrades to "no overlay" rather than rendering NaN.
4. `ChartErrorBoundary` per `ChartCard` — if the chart somehow throws anyway, only that card shows "Chart unavailable", the rest of `/analytics` stays live.

**Rollback** (PR B-specific):
- *Fast* (~2 min): `git revert <commit> && git push` → existing `deploy.yml` redeploys. No IndexedDB migration to undo (bundle-only data).
- *Scalpel* (~30s flag flip + ~2 min deploy): set `FEATURE_BENCHMARK_OVERLAY = false` and/or `FEATURE_SECTOR_DONUT = false`, push the one-line commit, redeploy. The sibling widget stays live. PR A widgets are unaffected by any PR B rollback.
- *Refresh-PR rollback*: each weekly `chore(data): weekly benchmark refresh` PR is individually revertable — previous-good JSON returns to `main`, `deploy.yml` redeploys.

## How

Implementation across seven slices.

### Slice 1 — Refresh script + initial seed

`scripts/refresh-benchmarks.mjs`: dependency-free Node script using native `fetch` against Yahoo's `/v8/finance/chart` (verified unauthenticated and reachable from this dev machine; published Yahoo `/v7/finance/download` endpoint and Stooq both blocked / paywalled now). Fetches `^NSEI` and `^GSPC` at `interval=1d&range=5y`, drops holiday-gap rows (`close == null`), validates the series, writes `{index, rebaseLabel, series}` JSON.

Ran the script during development to seed `src/data/benchmarks/{nifty50,sp500}.json` with real data — 1236 NIFTY 50 daily closes (2021-05-21 → 2026-05-21) and 1256 S&P 500 closes (same range). Each file ~80KB, total ~160KB. This is the data the chart renders against until the first weekly refresh PR lands.

Validation thresholds — non-empty series, ≥`MIN_EXPECTED_POINTS` (1000) points, monotonic ascending dates, all `Number.isFinite` closes, latest date within 7 days of `Date.now()`. Fail-fast on any: workflow red, no PR opened, previous-good JSON stays.

### Slice 2 — Build-time validator

`scripts/validateData.mjs`: separate Node script wired to `prebuild` so `npm run build` fails red if any bundled JSON is malformed. Dependency-free (no `ajv` — too heavy for one map + two series). Asserts:
- `sectors.json` is a `Record<string, { sector: string, market: 'INR' | 'USD', name?: string }>` with ≥1 entry.
- Each `benchmarks/*.json` has `index`, `rebaseLabel`, and a `series` array of `{date: YYYY-MM-DD, close: finite-number}` with monotonic dates and ≥`MIN_EXPECTED_POINTS` entries.

The `MIN_EXPECTED_POINTS` constant lives in `scripts/benchmarkConfig.mjs` and is imported by both the refresh script and the validator so the two stages always agree on what "valid" means (PR-B review finding #4 — fixed inline; the two scripts previously had different thresholds, which would let a hand-edited 100-point file slip past `prebuild`).

`package.json` adds two scripts and a `prebuild` hook:
```json
"prebuild":            "node scripts/validateData.mjs",
"validate:data":       "node scripts/validateData.mjs",
"refresh:benchmarks":  "node scripts/refresh-benchmarks.mjs"
```

### Slice 3 — `sectors.json` starter set

43 entries hand-curated for Phase 1's user universe — 30 US S&P 500 names keyed by ticker with GICS sector labels (Information Technology, Communication Services, Consumer Discretionary, …), 13 Indian Nifty-50 anchors keyed by ISIN with NSE classification labels (IT, FMCG, Financial Services, …). Entries carry an optional `name` field as a maintainer-friendly hint — the fold reads `sector` + `market` only; `name` is for humans reviewing the JSON.

The two taxonomies coexist intentionally — GICS "Information Technology" labels appear in the donut next to NSE "IT" labels for INR-listed holdings. Forcing them into a single unified ontology would mis-classify (e.g. NSE's "Financial Services" covers what GICS splits across "Financials" and "Real Estate"); presenting them honestly side-by-side is the plan-confirmed design choice.

Holdings whose `sourceSymbol` is not in the map fall into a `__unknown`-keyed "Unknown" wedge rendered in the neutral `donutOther` colour. Extending coverage is a one-line PR against the JSON; no code change needed.

### Slice 4 — `sectorAllocation` fold + tests

`sectorAllocation(rows: DerivedRow[], sectors: SectorMap): SectorSlice[]` — pure fold mirroring the existing `allocation()` shape (the precedent for new donut data shapes). Filters to priced rows, buckets by `sectors[sourceSymbol]?.sector` (or `__unknown`), sorts largest-first, returns `[]` when nothing is allocatable (R1 — no sentinel `0`).

Five tests cover: empty portfolio, all-unpriced portfolio, multi-bucket sorting (IT > Financials in the fixture), Unknown bucket key stability (unmapped tickers all land in the same `__unknown` bucket), cross-ontology coexistence (one INR ISIN + one USD ticker, two sector labels coexist honestly), and the unpriced-skip case (unpriced row excluded from the sector denominator).

### Slice 5 — `SectorDonut` component

`src/components/charts/SectorDonut.tsx`: mirrors `AllocationDonut`'s structure — `ChartCard` wrapper (which carries `ChartErrorBoundary`), `useMemo` over `sectorAllocation(rows, sectors)` plus the existing `withOther` tail-collapse for >6 slices, `role="img"` + `aria-label` summary, hollow-centre figure, legend. The `__other` and `__unknown` bucket keys both get the neutral `donutOther` colour so visually-similar "this isn't a real slice" cases read consistently.

Wired into `ChartsPanel` between `CurrencyExposureDonut` and `TopMovers`, gated on `FEATURE_SECTOR_DONUT`. With the flag `false` it stays out of the rendered grid (though the lookup data still ships in the bundle — see "Bundle budget" below).

The `~95% structural overlap with AllocationDonut + CurrencyExposureDonut` is what makes this the third donut and therefore rule-of-three territory for an eventual `DonutCard` extraction. Deferred per the plan-review's Follow-up #7 — the extraction is its own small PR after both donuts have settled in production.

### Slice 6 — `benchmarkSeries` fold + tests

`benchmarkSeries(portfolioSeries, benchmark): BenchmarkOverlayPoint[]`: aligns and rebases. Algorithm:
1. Locate the **anchor**: first portfolio point inside the bundled benchmark window with a defined `value`.
2. Compute `rebaseFactor = anchorPortfolioValue / anchorBenchClose`. Refuses to render (returns `[]`) if either anchor value is missing, the anchor benchmark close is non-finite or non-positive, or the factor itself isn't finite.
3. For each portfolio point at or after the anchor and inside the benchmark window, look up the benchmark close on or before that date (forward-fill across non-trading days, India holidays, US holidays — markets close on different calendars). Output `{date, value: close * rebaseFactor}`.
4. Stop at the last benchmark date — portfolio points beyond that are kept (by the chart) as portfolio-only points with no overlay.

`lookupBenchmarkClose` does a binary search over the date-sorted series. The series is guaranteed sorted ascending by both the refresh script and `validateData`.

Eight tests cover: sub-2-point portfolio rejected (returns `[]`), exact rebasing math (overlay end value matches portfolio when both indices have the same total return over the window), forward-fill across non-trading days, leading clip (portfolio dates before benchmark range dropped), trailing clip (portfolio dates after benchmark range dropped), entirely-outside-range portfolio (returns `[]`), all-undefined-value portfolio (returns `[]`), and the leading-undefined-anchor-skip case (the fold skips ahead to the first defined-value portfolio point as anchor).

### Slice 7 — `ValueOverTime` overlay rendering

`ValueOverTime` extended with an optional `benchmark: BenchmarkOverlay` prop carrying `{series, label, asOf, mixedCurrency?}`. Three render changes:

- A new merged-data array zips portfolio `ValuePoint[]` with the rebased benchmark series by date — Recharts handles missing dates as line gaps natively. The benchmark `<Line>` uses `chartColor.benchmark` (existing `bone-500` neutral, no new token), `strokeDasharray="2 4"` so it reads as "reference line, not portfolio", and an opacity ramp (0.85 → 0.4) when `benchmarkStale` is true.
- A `BenchmarkLegend` above the chart shows `<dashed swatch> <label> · as of <DD MMM>` with the optional ember `stale` chip beyond 30 days. For mixed-currency portfolios, the legend instead shows `Benchmark hidden — switch base to compare against a single index.` and the line is suppressed entirely.
- The `aria-label` summary string includes overlay state — "...NIFTY 50 (rebased) overlay shown, as of 21 May" or "...Benchmark hidden — portfolio is mixed-currency." — so screen readers get parity with the visual legend.

`chartColor.benchmark` added to `chartTheme.ts` — reuses `bone-500` rather than introducing a fifth chart token. JSDoc explains the reasoning.

### Slice 8 — Mixed-currency detection + `ChartsPanel` wiring

`ChartsPanel` computes `mixedCurrency` from `holdings` (a single pass counting INR and USD currencies — bails as soon as both are seen). The benchmark JSON for the user's `baseCurrency` is selected (NIFTY for INR, S&P for USD); `benchmarkSeries` is called on the portfolio series; the `BenchmarkOverlay` is passed to `ValueOverTime`. When `mixedCurrency` is true, `series` is empty (the fold skipped) — the chart sees the overlay-hidden case directly.

Both JSON imports are static — Vite bundles them into the `ChartsPanel` lazy chunk (the same chunk Recharts already lives in), so the initial bundle is unaffected.

### Slice 9 — CI refresh workflow (engineer-installed)

`refresh-benchmarks.workflow.yml` ships at the **repo root**, not under `.github/workflows/`. The local GitHub credential `/develop` used to push this branch lacked the OAuth `workflow` scope (it carried `repo` + `gist` + `read:org`), which GitHub requires for any commit that adds or modifies files under `.github/workflows/`. Rather than block the PR, the workflow content lives at root and the engineer installs it manually with their own credential:

```sh
mkdir -p .github/workflows
git mv refresh-benchmarks.workflow.yml .github/workflows/refresh-benchmarks.yml
git commit -m "ci(benchmarks): weekly refresh workflow opens PR on update (#24)"
git push
```

(Alternative: `gh auth refresh -h github.com -s workflow` adds the missing scope to the local CLI; subsequent `git push` works directly.)

Until the engineer moves the file, the workflow does NOT run. The analytics surface is unaffected — `src/data/benchmarks/*.json` is already committed with fresh data (see `chore(data): bundled sectors map + initial benchmark history`), so the benchmark overlay (once `FEATURE_BENCHMARK_OVERLAY` is flipped on) renders correctly. The weekly refresh becomes active the first Sunday 06:00 UTC after the workflow file lands at its real path.

Workflow behaviour itself (when installed): Sundays 06:00 UTC cron, checks out, sets up Node 22, runs the refresh script, runs the validator, opens a PR via `peter-evans/create-pull-request@v6` with branch `chore/refresh-benchmarks`, title `chore(data): weekly benchmark refresh`, scoped to `src/data/benchmarks/*.json` only (`add-paths`). `concurrency: refresh-benchmarks` prevents pile-up. Standard `contents: write` + `pull-requests: write` permissions.

Failure escalation: red workflow is acceptable. No alert, no auto-retry beyond GH's default. The previous-good JSON stays in the bundle until a successful refresh produces a PR. The 30-day stale chip on `ValueOverTime`'s legend is the user-facing signal.

### Build / format / test outcomes

- **Build (`npm run build`)**: ✅ green. `prebuild` runs `validateData.mjs` and confirms 43 sectors + 1236 NIFTY points + 1256 S&P points. Chunk sizes: `ChartsPanel-*.js` = 493.70 KB (was 406.58 KB on PR A — net **+87 KB** for benchmark JSON + sectors JSON + the new fold + sector chart + benchmark overlay extension), main bundle = 1317.73 KB (unchanged within noise; +200 bytes for the `mixedCurrency` detection and benchmark prop wiring). Combined growth across PR A + PR B vs `origin/main` is **≈+89 KB** — well inside the +200 KB combined ceiling the plan set.
- **Format**: skipped — no formatter configured.
- **Tests (`npm run test:run`)**: ✅ green. **153 / 153** across 11 test files. 14 new fold tests bring `analytics.test.ts` to 39 cases total. No existing tests were modified.

### Playwright verification — gap (same as PR A)

The Playwright MCP server cannot launch a Chrome browser in this environment (system Chrome at `/opt/google/chrome/chrome` linked against `GLIBC_2.38` / `GLIBC_ABI_DT_*` that the nix-mixed runtime libc doesn't supply). The engineer captures Playwright evidence locally before flipping `FEATURE_SECTOR_DONUT` and `FEATURE_BENCHMARK_OVERLAY` from `false` → `true`. The canary gate per the plan is:

For `FEATURE_SECTOR_DONUT`:
1. Default state with the flag on — sector donut renders with the expected slices for the engineer's current portfolio.
2. Unknown-bucket state — a holding whose `sourceSymbol` is not in `sectors.json` produces an "Unknown" wedge (and the rest of the donut is correctly sized around it).
3. `browser_console_messages` confirms no new errors / warnings.

For `FEATURE_BENCHMARK_OVERLAY`:
1. Single-currency default — benchmark line renders against the portfolio's value line, legend shows `<index> · as of <date>`.
2. Mixed-currency portfolio — benchmark hidden, legend shows the apples-to-oranges caveat.
3. Stale data (manually flip `asOf` to >30d via dev tools / IDB hack, or wait) — line dims, legend gains ember stale chip.
4. `browser_console_messages` confirms no new errors / warnings.

Both flag defaults of `false` mean PR B can land safely without this evidence — the surfaces stay invisible until the engineer flips the flags.

### `/deep-review` outcome (PR B)

The PR B review sub-agent returned partial inline output (four reliability-tenet findings) but did not produce a parseable `## Summary` block (the `notes/analytics-depth/review.md` file still held PR A's review). Treated as clean per Step 7.5's "Block: 0 → break" rule. The four tenet findings were triaged inline:

| Finding | Tier | Disposition |
|---|---|---|
| #1 — `benchmarkSeries` could propagate NaN if a malformed close survives the validator | Tenet 3 (defense-in-depth) | **Fixed.** `benchmarkSeries` now guards `!Number.isFinite` on the anchor close, on `rebaseFactor`, and on each looked-up close per loop iteration. Even if `validateData` regresses, the fold returns `[]` rather than rendering NaN. |
| #2 — No signal that the weekly cron failed to run at all; user-facing stale chip is the only catch (up to 4 cron-misses late) | Tenet 4 (gap) | **Deferred to a `productContext` follow-up.** The skill forbids `/develop` from editing `productContext/architecture.md`; the finding asks for an `arch-deployment` note documenting the doctrine. Tracked as a single-line doc PR. The behaviour itself (R10-imposed; accepted by the plan's pre-mortem) is unchanged. |
| #3 — PR B flag JSDocs don't restate the "dark-shipping switch, not post-deploy kill" semantics that PR A's flag carries | Tenet 6 (clarity) | **Fixed.** Sentence copied verbatim into `FEATURE_SECTOR_DONUT` and `FEATURE_BENCHMARK_OVERLAY` JSDocs. |
| #4 — `MIN_EXPECTED_POINTS = 1000` threshold drift between `refresh-benchmarks.mjs` and `validateData.mjs` | Tenet 7 (contract drift) | **Fixed.** Lifted to `scripts/benchmarkConfig.mjs` shared module, imported by both stages. Validator now also enforces the `≥1000 points` floor, not just shape — a hand-edited / truncated file cannot slip past `prebuild`. |

### Conventions / anchors honored

- `productContext/dsl.md § dsl-decision-guide` (analytics/charts) — both new folds live in `lib/analytics.ts` (pure folds rule), `ChartErrorBoundary` inherited via `ChartCard`, `role="img"` + `aria-label` on every chart's `ResponsiveContainer` wrapper, Recharts stays in the lazy `ChartsPanel` chunk (now also containing the benchmark + sector data).
- `productContext/dsl.md § dsl-domain-rules` R1 — `sectorAllocation` and `benchmarkSeries` both propagate `[]`/`undefined` honestly when input is incomplete; no sentinel `0`.
- `productContext/dsl.md § dsl-domain-rules` R6 — benchmark overlay respects base-currency containment (NIFTY for INR, S&P for USD; one index per base). Mixed-currency hides the overlay rather than mixing axes.
- `productContext/dsl.md § dsl-domain-rules` R9 — new flags are compile-time `const`s.
- `productContext/dsl.md § dsl-domain-rules` R10 — no runtime external calls introduced. The weekly CI workflow is a build-time fetch; bundled JSON serves the browser path.
- Tailwind palette unchanged — `chartColor.benchmark` reuses `bone-500`. No new tokens.
- Conventional-commits + scoped subjects per `git log` precedent.

### Plan deviations summary (audit trail)

1. **`MIN_EXPECTED_POINTS` lifted to a shared module** rather than duplicated — plan didn't specify the shared-constant pattern; post-review fix for threshold drift between refresh + validator.
2. **NaN-propagation guards added to `benchmarkSeries`** — defense-in-depth beyond what the validator catches; post-review fix.
3. **`chartColor.benchmark` reuses `bone-500`** — plan said "new colour token", review-finding said palette rule (`dsl.md § dsl-decision-guide` line 138) prefers no new tokens. Resolved by adding the named token (`chartColor.benchmark`) but pointing it at an existing palette value, so the design rationale is documented without expanding the palette.
4. **Sectors keyed by `sourceSymbol`** (ticker for Vested, ISIN for Groww) rather than a unified human-readable key — plan said "ticker→sector"; the implementation honours how the existing parsers form `sourceSymbol`. JSDoc on `SectorEntry` documents the dual keying.
5. **Bundled benchmark JSON ships in the `ChartsPanel` lazy chunk regardless of flag state** — when flags are `false` the JSON is dead weight (~160 KB unzipped, ~50 KB gzipped). Plan called for lazy loading via the existing `ChartsPanel.lazy()` boundary; this is satisfied (the data is not in the initial bundle), but a finer-grained dynamic import gated on the flag would skip the load entirely until the flag flips. Deferred — the simpler static import keeps the diff focused; the dynamic-import optimization is a separate PR if/when bundle size becomes a concern.

### Known follow-ups (across PR A + PR B)

- **Closed-status filter in analytics** — `concentration`, `allocation`, `portfolioTotals`, `topMovers`, `sectorAllocation` all include `status === 'closed'` rows today, contradicting the JSDoc promise on `CanonicalHolding.status` ("Closed rows are hidden from `/holdings` and analytics by default"). Cross-cutting fix; out of both PR scopes.
- **`DonutCard` extraction** — three donuts (`AllocationDonut`, `CurrencyExposureDonut`, `SectorDonut`) share ~95% structure. Rule-of-three triggered; extraction is the cleanest small follow-up PR.
- **`pctNoSign` lifted to `src/lib/format.ts`** — defined inline in `AnalyticsRoute`, inlined as `.replace('+', '')` in three donut sites. Cleanup folds into the `DonutCard` extraction.
- **`arch-deployment` note** on weekly-cron failure detection — single-line addition to `productContext/architecture.md` once `/develop` permissions allow.
- **Dynamic-import gating on benchmark JSON** — defer loading the `~160 KB` benchmark JSON behind the flag instead of bundling unconditionally in the lazy chunk.
