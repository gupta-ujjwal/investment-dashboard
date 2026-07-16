# Playwright evidence — PR #50 (Budget tab focused-month revamp)

Captured on `feat/budget-tab-revamp` (dev server, IndexedDB seeded via `browser_evaluate`).
Desktop is 1280-wide; mobile is 390×844.

## States captured
| File | State | What it shows |
|------|-------|---------------|
| `budget-01-golden-desktop.png` | 3 months, newest focused | Aggregate line, month strip with stacked bars, stats with month-over-month deltas, both donuts, line details |
| `budget-02-zero-income.png` | income = 0 | Income ₹0.00, percentages render `—` (R1, no NaN), allocation donut shows a single Spent wedge + "Overspent by ₹43,000" callout |
| `budget-03-overspent-first.png` | overspent **and** first month | Header "FIRST MONTH · NO PRIOR TO COMPARE" (no delta lines), Remaining −35% shown honestly, allocation donut draws Spent+Invested only (no negative slice) + "Overspent by ₹70,000" callout |
| `budget-04-empty-zero-months.png` | fresh 0-month install | Lands directly in Add-month mode; no strip / aggregate / cancel |
| `budget-05-mobile.png` | 390×844 golden path | Aggregate wraps, strip stays horizontal, stats 2×2, donuts stack ring-over-legend, details stack |
| `budget-06-golden-lazy.png` | golden path, re-verified after the lazy-load refactor | Donuts mount via Suspense — renders identically |
| `budget-07-tag-trends.png` | 4 months, per-tag trends (desktop) | "By tag · across months" — Income by tag (Salary flat, Bonus spikes then 0) + Expenses by tag (Family/Rent/Food/Travel/Utilities lines + a folded "Other") |
| `budget-08-trend-tooltip.png` | trend hover tooltip | May 2026 point → each tag's value sorted desc (Family ₹60k … Utilities ₹6.5k), 0-value series dropped |
| `budget-09-trends-mobile.png` | per-tag trends (390×844) | Both line charts stack full-width, legends wrap |

## Console summary
Assertion: **no new errors or warnings introduced by this PR.**

- **Errors: 0** on every Budget state. (A single `favicon.ico` 404 fires once on the initial `/overview` load before redirect — pre-existing, unrelated to this route.)
- **Warnings: 1, pre-existing** — `No HydrateFallback element provided to render during initial hydration`, emitted by react-router at the router-config level on every route (not introduced here).

Raw per-navigation console dumps were kept in the gitignored `.playwright-mcp/` scratch dir and are intentionally not committed — only this categorized summary is.
