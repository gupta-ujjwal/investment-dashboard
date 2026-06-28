# Evidence — PR #47: P0 trust & consistency fixes

## Status: CAPTURED ✅

Playwright (MCP) screenshots captured at desktop **1440×900** and mobile **390×844**,
against `npm run dev` (`http://localhost:5173/investment-dashboard/`) with a seeded
two-market portfolio (20 US · Vested + 29 India · Groww imported holdings + 1 manual
Savings asset; ₹36.2L net worth, FX stamped 1 USD = ₹94.40).

## Non-visual verification (all green)

| Check | Command | Result |
|---|---|---|
| Types | `tsc -b --noEmit` | clean |
| Unit tests | `vitest run` | **230 passed** (19 files) |
| Build | `vite build` | green |
| Code review | `/deep-review` | **Block 0 · Request changes 0 · Follow-up 0 · Nit 0** |

New/extended coverage: `riskBand.test.ts` (the 5-value default map + override precedence),
`planning.test.ts` (holdings folded via effective band, `other`→untagged, override wins,
closed/unpriced excluded, slices reconcile to 100%), `investments.test.ts` (grouping by
real asset class), `restoreBackup.test.ts` (holding `riskBand` round-trip + invalid-value
rejection + downgrade tolerance).

## Screenshots

| File | What it shows |
|---|---|
| `investments-desktop` / `investments-mobile` | **#1** — distinct rows per asset class: Equity·India, **ETF·India**, **Mutual Funds·India**, **InvIT·India**, Equity·US, **ETF·US** (no longer all "Equity"); KPI reads "Holdings · imported positions" |
| `planning-desktop` / `planning-mobile` | **#2** — Risk allocation now covers the imported book: **High / Moderate** from holdings + **Untagged** (the manual savings), reconciling to 100% (was "Untagged 100%" of just the ₹5L asset) |
| `equity-risk-band-menu-desktop` | **#2** — the per-holding **Risk band** group in the row menu (Safe / Moderate / High / **Auto (by asset class)**), marking the current effective band; header shows "RISK BAND · AUTO" when not overridden |
| `equity-as-of-chip-desktop` | **#3** — holdings table with the muted **"AS OF 27 JUN 2026"** chips (reframed from the alarming red "STALE"), alongside the per-row class chips (MF / EQUITY / ETF) |

End-to-end write path was also exercised live: setting the MF holding to **High** via the
menu moved exactly its value Moderate → High on the Planning tab after reload.

## Console summary

Captured `error` + `warning` console output across the exercised routes. Three distinct
classes, **all pre-existing on `main` — none introduced by this PR**:

| Class | Level | New? | Cause |
|---|---|---|---|
| `Matched leaf route at location "/" does not have an element or Component` | warning | pre-existing | React Router v7 layout route (`/`) renders an `<Outlet/>` only — router boilerplate, unrelated to this diff |
| `No HydrateFallback element provided to render during initial hydration` | warning | pre-existing | React Router v7 data-router boilerplate; no `HydrateFallback` configured |
| `Failed to load resource: 404` (`/favicon.ico`) | error | pre-existing | App ships no favicon; Chrome auto-requests `/favicon.ico` and it 404s on `main` too |

**Conclusion: no new errors or warnings introduced by this PR.** The diff touches
analytics folds, a row-menu control, and chip presentation — none of which alters the
router config or favicon.
