# Analytics depth — PR A (pure-fold widgets)

> Implemented via `/brainstorm` → `/develop` on 2026-05-21. PR A of a two-PR feature for issue #24. The full plan covering both PRs lives at `implementation-docs/analytics-depth.md`; this doc is PR A's self-contained shipping artifact.

## What

Adds two analytics-page widgets, both gated on a new compile-time flag `FEATURE_ANALYTICS_DEPTH` (default `false` in this commit — see Why below):

1. **Risk KPI sub-row** on the analytics page, below the existing Value / Invested / P&L / Positions row. Three cells: **Top-5 weight** (share of priced base-currency value held by the five largest positions), **Concentration** (HHI band label with raw value in the sub-line), **Single-stock risk** (loss-toned cell naming the largest position when its weight strictly exceeds 10%; muted "no position >10%" otherwise).
2. **Currency Exposure donut** in `ChartsPanel`, a new chart card that splits the portfolio by listing currency (INR-listed vs USD-listed). Reuses the existing `allocation(rows, 'market')` fold so the data path is shared with the existing Allocation donut's market mode.

Files touched (5 modified + 1 new, +321 lines):
- `src/lib/analytics.ts` — new `concentration()` fold + `Concentration` / `HhiBand` types
- `src/lib/analytics.test.ts` — 11 new tests covering empty / unpriced / single / 10-equal / 5-equal / 4-equal-boundary / single-stock-flag / unpriced-skip / all-INR / all-USD fixtures
- `src/components/charts/CurrencyExposureDonut.tsx` — new chart component, mirrors `AllocationDonut`'s pattern (less the toggle, less the tail collapse)
- `src/components/charts/ChartsPanel.tsx` — wires the new donut into the grid behind the flag
- `src/routes/AnalyticsRoute.tsx` — wires the Risk sub-row + `RiskRow` component, computes `concentration(deriveRows(holdings))` behind the flag
- `src/featureFlags.ts` — new `FEATURE_ANALYTICS_DEPTH` (default `false`)

External surface: no runtime external calls. No IndexedDB schema change (no `DB_VERSION` bump). No new bundled data. PR A respects R10 (privacy doctrine) and R9 (compile-time flags) unchanged.

## Why

Issue #24 ("Analytics depth: sector allocation, concentration risk, benchmark overlay, currency exposure") scopes four widgets. The plan settled on **Approach 2 — two PRs along the data-dependency seam**. Two of the four widgets are pure folds over the existing `DerivedRow[]`; the other two depend on new bundled JSON data plus a weekly CI refresh workflow. Failure modes cluster on that data-dependency axis (two regions, not four), so two flag regions match the natural partition — Approach 1's single flag would coarsen rollback to a hammer, Approach 3's four flags would over-fit the failure space.

**PR A delivers the pure-fold half**: concentration KPI + currency exposure donut, no new bundled data, no CI workflow. PR B (separate branch, raised next) delivers sector + benchmark on top. The split lets reviewers separate two distinct cognitive areas (analytics math vs data-pipeline ops) and isolates failure: a broken sector lookup or a malformed benchmark JSON in PR B cannot regress PR A's widgets.

**Reliability tenets honored** (from the plan-review):
- **Tenet 3 (blast radius)** — `ChartErrorBoundary` already wraps every chart via `ChartCard`; one bad chart can't white-screen the page. The new fold returns absence-propagating `undefined` rather than throwing, so a portfolio with no priced holdings yields a graceful "—" rather than a crash.
- **Tenet 6 (staggered rollout + rollback)** — the new flag ships **`false`** in this commit so the PR can merge with no user-visible change. The "canary gate" (playwright + unit fixtures) is then captured; a one-line follow-up commit flips the flag to `true`. On a static GitHub Pages site the flag is a *pre-merge dark-shipping* switch — post-deploy rollback is `git revert` → existing `deploy.yml` redeploys (~2 min).
- **Tenet 7 (test the limits)** — every edge-case fixture the plan-review named is in `analytics.test.ts`: empty portfolio, all-unpriced, single-holding degenerate (top5=1, HHI=1, flag fires), 10/5/4-equal positions for the three HHI band edges, a >50% single position firing the flag, an at-exactly-10% case where the flag stays off, unpriced rows correctly skipped, all-INR / all-USD currency-exposure degenerates.

**Plan-review findings folded into PR A:**
- All 17 findings from `/brainstorm`'s parallel review sub-agents were triaged `FIX` and folded into the plan. Of those, the ones that bite PR A are: concentration metric trio (top-5 / HHI / single-stock — implemented as specified); HHI band thresholds at the DOJ convention (with an explicit JSDoc clarification on the boundary semantics added post-review); render-guard for malformed data (inherited via `ChartErrorBoundary`); named edge-case unit fixtures (all eight from the list).

**Post-implementation `/deep-review` findings** (Block: 0 — clean; Request changes: 5; Follow-up: 2; Nit: 1) — see "How" below for each one's disposition.

**Pre-mortem** (PR A surface): the most likely PR A failure is a "Single-stock risk: AAPL 80% of portfolio" label appearing for a closed AAPL position whose price was last stamped before exit. The single-stock flag would be technically correct (AAPL still has the largest base-currency value among `deriveRows(holdings)` output) but misleading because AAPL is closed. Rollback is `git revert` + redeploy or — faster — flip `FEATURE_ANALYTICS_DEPTH = false` and push the one-line revert. Detection: no runtime telemetry by doctrine (R10); user-report or self-monitoring on the dashboard. Mitigation captured as a follow-up below.

## How

Implementation in four vertical slices, tracer-bullet style.

### Slice 1 — Compile-time flag

`src/featureFlags.ts`: added `FEATURE_ANALYTICS_DEPTH = false` with a JSDoc that names the staggering discipline — the flag is the pre-merge dark-shipping switch, intended to be flipped to `true` in a one-line follow-up commit *after* playwright evidence is captured.

This was an iteration from a default-`true` first draft. `/deep-review` flagged the same-commit-flips-on collapse as a plan deviation (Request changes #2); the fix was to default `false` and document the two-step staggering in the JSDoc.

### Slice 2 — `concentration()` fold + tests

`src/lib/analytics.ts`: appended `Concentration`, `HhiBand`, and `concentration(rows: DerivedRow[]): Concentration`. The fold filters to priced rows (`currentValueBase` defined and > 0), normalizes weights, sorts descending, then computes:

- `top5Pct` = sum of top-5 weights (or all weights if fewer than 5 priced rows)
- `hhi` = Σ wᵢ²
- `hhiBand`: half-open intervals `[0, 0.15) → low`, `[0.15, 0.25) → moderate`, `[0.25, 1] → high`. The DOJ Horizontal Merger Guidelines place the 2500 threshold itself in the highly-concentrated bucket, so the high-side boundary at exactly 0.25 reads as `high`. JSDoc spells this out explicitly (added post-review per Request changes #3) so the boundary semantics aren't ambiguous.
- `singleStockRisk`: the largest-weighted holding when its weight is **strictly** greater than 10% (`> 0.10`). At exactly 10% the flag stays off — a 10-equal-position portfolio passes the flag check.

All four figures propagate `undefined` honestly when no rows are priced (R1 — no sentinel `0`).

`src/lib/analytics.test.ts`: appended 11 tests organized in four describe blocks (empty/unpriced, degenerate single, HHI band thresholds, single-stock flag). Plus 2 currency-exposure degenerate tests (all-INR → one "India" slice; all-USD → one "US" slice) under a separate describe block. A `SINGLE_STOCK_THRESHOLD` constant mirrors the production threshold so band-edge tests don't drift if the threshold ever changes — they'd then need an intentional update.

### Slice 3 — `CurrencyExposureDonut.tsx` + `ChartsPanel` wiring

`src/components/charts/CurrencyExposureDonut.tsx` (new): mirrors `AllocationDonut`'s shape — `useMemo`, `Pie` + `Cell` + `Tooltip`, hollow-centre figure, legend row. Two deliberate simplifications versus `AllocationDonut`:

- **No mode toggle.** The donut presents the currency split as a primary signal rather than hiding it behind a click.
- **No `withOther` tail collapse.** Phase 1 has at most two wedges (INR, USD), so the tail-collapse machinery would be dead code.

The component calls `allocation(rows, 'market')` directly — there is **no separate `currencyExposure()` fold** in `analytics.ts`. The plan's Frame listed `currencyExposure` as a new fold name; I judged a thin renaming wrapper to be duplication for no benefit since `allocation(_, 'market')` already returns the exact `AllocationSlice[]` shape needed (INR / USD bucketed, largest-first, currency-filtered out when zero-valued). The component JSDoc explains this inline. `/deep-review` flagged this as Request changes #5 — the resolution captured here is the deliberate choice.

One related plan deviation: the plan's Status note said "currency-exposure donut always shows both wedges". The implementation shows only non-empty wedges (all-INR portfolio → one "India" slice at 100%, not "India 100% · US 0%"). `/deep-review` flagged this as Request changes #4 and judged the code "more honest" than the plan note. Resolution here is to keep the code behaviour and amend the plan note in this consolidated doc rather than add visually-empty wedges.

`src/components/charts/ChartsPanel.tsx`: imports `CurrencyExposureDonut` and `FEATURE_ANALYTICS_DEPTH`; renders the new card between `AllocationDonut` and `TopMovers` gated on the flag. With the flag `false`, the grid is unchanged from `main`'s 4-card layout. With the flag `true`, the grid becomes 5 cards — a transient odd-count layout that PR B's `SectorDonut` will resolve to a clean 6-card grid.

### Slice 4 — Risk KPI sub-row in `AnalyticsRoute.tsx`

`src/routes/AnalyticsRoute.tsx`: adds `concentration(deriveRows(holdings))` behind the flag, renders a new `<section aria-label="Risk">` between the existing "Key figures" section and the "Charts" section. Three `Kpi` cells using the existing `Kpi` component — no new component primitives — with the `loss` tone reserved for `hhiBand === 'high'` and a firing single-stock flag; everything else stays `mute` so the row reads as context rather than alarm.

Grid: `grid-cols-1 sm:grid-cols-3` — single-column on mobile, three across on `sm+`. Matches the existing Key Figures section's `grid-cols-2 sm:grid-cols-4` pattern for hairline-bordered KPI tiles.

A local `pctNoSign(value: number)` helper strips the leading `+` from `formatPercent` for the risk-context cells (weights are magnitudes, not directional changes). `/deep-review`'s sole Nit was that this helper is duplicated as inline `.replace('+', '')` calls in `AllocationDonut`, the new `CurrencyExposureDonut`, and would appear again in PR B's `SectorDonut` — promoting it to `src/lib/format.ts` is a clean follow-up; deferred from PR A scope.

### Build / format / test outcomes

- **Build (`npm run build` = `tsc -b && vite build`)**: ✅ green. ChartsPanel chunk: 406.58 KB (was 405 KB on `main` — net +1.5 KB gzipped for the new donut). Main bundle: 1316.60 KB (was 1318 KB — slightly smaller because `FEATURE_ANALYTICS_DEPTH = false` lets the bundler tree-shake the dead branches). Well inside the plan's +200 KB combined ceiling for PRs A + B.
- **Format**: skipped — project has no formatter configured (`package.json` has no `format` script; no Prettier / ESLint setup). Engineer reviews style manually.
- **Tests (`npm run test:run`)**: ✅ green. 139 / 139 tests passing across 11 test files. 25 of those are in `analytics.test.ts` (15 pre-existing + 10 new for concentration + 2 new for currency-exposure degenerates).

### Playwright verification — gap

`.claude/rules/frontend-design.md` requires Playwright MCP evidence before the PR is marked ready-for-review. **The Playwright MCP server could not launch a browser in this environment** — the system Chrome at `/opt/google/chrome/chrome` is linked against a glibc symbol set (`GLIBC_2.38`, `GLIBC_ABI_DT_X86_64_PLT`, `GLIBC_ABI_DT_RELR`) that the nix-mixed runtime libc doesn't supply. The MCP server's Chrome launch exits with code 1 before the page can be navigated.

**This is the canary gate the plan calls out** — the flag does not flip from `false` → `true` until the engineer captures:
1. Default state of the analytics page with flag `true`, showing the Risk sub-row and the new currency-exposure donut card.
2. Empty-state: zero holdings → page should fall through to the existing `EmptyState`.
3. Degenerate state: all-INR or all-USD portfolio → currency-exposure donut shows one wedge at 100%.
4. Single-stock-risk state: one holding > 10% → Risk row's third cell goes loss-toned, names the position, shows weight.
5. `browser_console_messages` confirming no new errors / warnings.

The flag default of `false` means the PR can land safely without this evidence — the user-facing surface is unchanged until the follow-up flag flip.

### `/deep-review` outcome

Block: 0 — clean. The autonomous review-and-fix loop in Step 7.5 terminated on the first iteration with no Block-tier findings. Sub-Block findings were triaged inline:

| Finding | Tier | Disposition |
|---|---|---|
| #1 — `concentration` includes `status==='closed'` rows | Request changes | **Deferred** to a cross-cutting follow-up. The existing analytics folds (`portfolioTotals`, `allocation`, `topMovers`) don't filter closed either; touching only `concentration` would create internal inconsistency between the KPI row's `Value` total and the Risk row's `Top-5 weight`. The right fix filters closed across all analytics in its own small PR. Documented JSDoc on `CanonicalHolding.status` in `src/storage/holdings.ts:48-52` says closed rows "are hidden from `/holdings` and analytics by default"; the analytics half of that promise is unmet today. |
| #2 — `FEATURE_ANALYTICS_DEPTH = true` ships in same commit | Request changes | **Fixed.** Flag now defaults `false`; JSDoc names the staggering discipline. |
| #3 — HHI boundary at 0.25 → `high` undocumented | Request changes | **Fixed.** JSDoc on `HhiBand` rewritten with explicit half-open intervals and a one-line note on why 0.25 itself is `high`. |
| #4 — Currency donut shows one slice for all-one-currency portfolio | Request changes | **Plan reconciled here.** Code keeps the "show only non-empty slices" behaviour (more honest); this doc supersedes the plan's "always shows both wedges" Status note. |
| #5 — No `currencyExposure()` fold | Request changes | **Plan reconciled here.** Deliberate reuse of `allocation(_, 'market')`; component JSDoc explains. This doc supersedes the plan's Frame entry for `currencyExposure`. |
| #6 — Coverage gap: priced-one-currency + unpriced-other-currency fixture | Follow-up | **Deferred to PR B**. PR B introduces the SectorDonut which exercises the same shape; a single combined fixture across both donuts is cleaner than adding to PR A. |
| #7 — `DonutCard` extraction | Follow-up | **Deferred to PR B**. PR B's `SectorDonut` is the third donut — rule-of-three triggers. Extraction lands then. |
| #8 — Lift `pctNoSign` to `src/lib/format.ts` | Nit | **Deferred to PR B** with the `DonutCard` extraction since the same helper is used across all three donut sites. |

The full review is in `notes/analytics-depth/review.md` (gitignored scratch); this table mirrors the dispositions for reviewers without that artifact.

### Conventions / anchors honored

- `productContext/dsl.md § dsl-decision-guide` (analytics/charts) — new fold lives in `lib/analytics.ts` (pure folds rule). `ChartErrorBoundary` inherited via `ChartCard`. `role="img"` + `aria-label` on `ResponsiveContainer` wrapper. Recharts stays in the lazy `ChartsPanel` chunk.
- `productContext/dsl.md § dsl-domain-rules` R1 — concentration figures propagate `undefined` honestly; no sentinel `0`.
- `productContext/dsl.md § dsl-domain-rules` R9 — `FEATURE_ANALYTICS_DEPTH` is a compile-time `const`, not runtime config.
- `productContext/dsl.md § dsl-domain-rules` R10 — no runtime external calls introduced.
- Tailwind palette unchanged — Risk row uses existing `mute`/`loss` `Kpi` tones; donut uses existing `donutPalette`. No new tokens (`dsl.md § dsl-decision-guide` UI rules).
- Conventional-commits + scoped subjects per `git log` precedent.

### Plan deviations summary (audit trail)

1. **No `currencyExposure()` fold in `analytics.ts`** — component calls `allocation(rows, 'market')` directly. Justified inline in component JSDoc.
2. **Currency-exposure donut shows only non-empty wedges** — plan said "always shows both wedges". Code is more honest; plan superseded by this doc.
3. **`FEATURE_ANALYTICS_DEPTH = false` initially** — matches plan intent; the planning doc's text suggested same-commit flip-on but the staggering discipline (off → playwright → flip) is what the plan actually wanted. First draft had `true`, post-review corrected to `false`.
4. **Closed-status filter not added to `concentration`** — out of PR A scope; documented as a known follow-up.
5. **`pctNoSign` not lifted** — Nit-tier, deferred to PR B's donut consolidation.
