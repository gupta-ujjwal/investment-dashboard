# Evidence — issue #24 (analytics depth)

Playwright captures for the two-PR analytics-depth feature. Generated 2026-05-22 against the dev server at `localhost:5173`, with all three feature flags temporarily flipped to `true` in `src/featureFlags.ts` (restored to `false` before the commit shipped — the flags ship off; the engineer flips them on after this evidence is reviewed).

Per `.claude/rules/frontend-design.md`: exercising the golden path and at least one edge case per distinct user-visible path introduced by the diff, on desktop (1280×900) and mobile (390×900). Console-error check returned no new errors — only pre-existing react-router v7 route-config warnings on the `/` index redirect and the same favicon 404 the previous evidence commit (#20) called out.

The MCP Playwright browser launch is blocked in this environment by a GLIBC mismatch (system Chrome 2.38 vs system glibc 2.35); these captures were produced via a small one-off Node script using the cached Playwright at `~/.npm/_npx/.../playwright`, launched with `LD_LIBRARY_PATH` cleared via `direnv` and the `.envrc` in the repo root. The capture script lives at `notes/analytics-depth/capture-evidence.mjs` (gitignored; re-runnable to refresh captures).

## Test fixture

A mixed-currency portfolio designed to exercise every PR surface in one run:

- INR (Groww) holdings: Reliance (INE002A01018), TCS (INE467B01029), Infosys (INE009A01021), HDFC Bank (INE040A01034) — all in `sectors.json`
- USD (Vested) holdings: Apple (AAPL), Microsoft (MSFT) — both in `sectors.json`
- One unmapped holding: `TESTNEW1` (no entry in `sectors.json`) — exercises the Unknown sector wedge
- 5 history snapshots (2026-04-19 → 2026-05-17, all in INR base) — gives `ValueOverTime` + benchmark overlay enough points to draw
- Base currency: INR (so NIFTY 50 is the active benchmark when mixed-currency hide isn't triggered)

For the all-INR capture (#03), the fixture filters out the USD holdings so the mixed-currency hide doesn't trigger and the benchmark line renders.

## Captures

| # | File | What it shows | PR |
|---|---|---|---|
| 01 | `01-analytics-mixed-currency-desktop.png` | Full `/analytics` page, mixed-currency portfolio, all flags on. Risk KPI sub-row + currency exposure donut (PR A) + sector donut + benchmark hidden caveat (PR B) all visible. | A + B |
| 02 | `02-analytics-mixed-currency-mobile.png` | Same as #01 at 390×900 mobile viewport. Confirms responsive layout for the Risk sub-row (`grid-cols-1 sm:grid-cols-3`) and the donut cards. | A + B |
| 03 | `03-analytics-all-inr-with-benchmark.png` | All-INR portfolio with the NIFTY 50 benchmark overlay rendered on `ValueOverTime`. Legend reads `NIFTY 50 (REBASED) · AS OF 21 MAY`. | B |
| 04 | `04-value-over-time-benchmark-legend.png` | Zoom on the `ValueOverTime` chart card showing the benchmark legend + the rebased benchmark dashed line beside the portfolio value line. | B |
| 05 | `05-risk-row-single-stock-firing.png` | Zoom on the Risk KPI sub-row. Top-5 weight **88.42%**, Concentration **Moderate** (HHI 0.19), Single-stock risk firing on **Microsoft** at **27.56% of portfolio** in the ember `loss` tone. | A |
| 06 | `06-sector-donut-with-unknown.png` | Zoom on the sector donut. Five slices: Information Technology 54.18%, IT 15.52% (NSE label coexisting with GICS — plan-confirmed), Energy 14.42%, **Unknown 10.73%** (the TESTNEW1 fixture), Financial Services 5.13%. | B |
| 07 | `07-currency-exposure-donut.png` | Zoom on the currency exposure donut. US 64.92% · India 35.08%, base currency INR. | A |
| 08 | `08-mixed-currency-caveat.png` | Mixed-currency `ValueOverTime` showing the caveat replacement: **BENCHMARK HIDDEN — SWITCH BASE TO COMPARE AGAINST A SINGLE INDEX.** No benchmark line. | B |

## Console messages

The capture script attached console listeners across all 8 navigations and recorded 81 messages total. Filtered for severity:

- **Errors (1 type):** `Failed to load resource: 404 (Not Found)` — the favicon 404, pre-existing on `main` (called out by the #20 evidence commit too).
- **Warnings (2 types):** react-router v7 `Matched leaf route at location "/" does not have an element` and `No HydrateFallback element provided` — both about the `/` index route's loader-only redirect to `/analytics` or `/import`. Pre-existing in `main`; the analytics-depth PRs don't touch routing.
- **Info:** React DevTools download tip (dev-mode only).

**No new errors or warnings** were introduced by either PR. The raw console dump is intentionally NOT committed (per the no-raw-dump rule in `.claude/rules/frontend-design.md` — summary belongs here and in the commit/PR comment; the dump itself is dev-time scratch).

## Empty state

The `EmptyState` component on `/analytics` (rendered when `holdings.length === 0`) is unchanged by either PR — no new capture added. See `src/routes/AnalyticsRoute.tsx`'s existing `EmptyState` function.

## Stale-benchmark chip (>30d)

Not separately captured here. The bundled benchmark JSON was refreshed today (`2026-05-22`), so the legend renders the "as of" caption without the `stale` chip. The engineer can simulate the stale state by editing the `asOf` field in `src/data/benchmarks/*.json` to a date >30 days ago and rerunning the capture script, but the rendered output is mechanical: the `stale` ember chip appears next to the "as of" caption and the benchmark line's `strokeOpacity` drops from 0.85 to 0.4. See `src/components/charts/ValueOverTime.tsx:80-90` and `:184`.
