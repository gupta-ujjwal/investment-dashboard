# Evidence — PR #48: W2 PR-A — Budget feeds the flywheel

## Status: CAPTURED ✅

Playwright (MCP) screenshots at desktop **1440×1100** and mobile **390×844**, against `npm run dev`
(`http://localhost:5173/investment-dashboard/`) with a seeded portfolio (49 imported holdings + 1 manual
Savings asset, ₹36.2L net worth) plus **3 logged budget months** (income ~₹2.8–3.0L, expenses ~₹1.2–1.3L,
invested ~₹50–60k) and a ₹50L goal corpus. `emergencyMonthlyNeed` and `monthlyContribution` left **unset in
Settings** so the budget-derived fallback is exercised.

## Non-visual verification (all green)

| Check | Command | Result |
|---|---|---|
| Types | `tsc -b --noEmit` | clean |
| Unit tests | `vitest run` | **250 passed** (20 files) |
| Build | `vite build` | green |
| Code review | `/deep-review` | **Block 0** (3 findings fixed in-loop; 2 accepted as intentional) |

New coverage: `monthlyAverages` (≥2-month `undefined` guard, savings-rate zero-income), `cashflow`
(`effectiveValue` tri-state incl. explicit-0, `liquidAssets` equity-excluded/partial-aware, `runwayMonths`
no-Infinity, `provenanceLabel`, and a **cold-start composition** suite feeding `[]`/`[oneMonth]`).

## Screenshots

| File | What it shows |
|---|---|
| `overview-desktop` | The new **Cash flow** card (avg of 3 months): savings rate **+56.05%**, income ₹2,86,666.67, expenses ₹1,26,000, invested ₹55,000, left over ₹1,05,666.67, **runway 4.0 mo** — plus the emergency card's "need · budget-derived · avg of 3 mo" caption and the goal projection |
| `overview-mobile` | Same, responsive at 390px (Cash-flow KPIs reflow to a 2-col grid) |
| `planning-desktop` | Emergency fund now uses the **budget-derived** need (₹1,26,000/mo, "NEED · BUDGET-DERIVED · AVG OF 3 MO") — previously it required a Settings value |
| `planning-settings-override` | Precedence proof: with an explicit `emergencyMonthlyNeed` = ₹2,00,000 set in Settings, the need flips to **"NEED · FROM SETTINGS"** (₹2,00,000/mo) — Settings overrides the budget-derived value |

Also verified live (not screenshotted): **cold-start** — with zero budget months the Cash-flow card is absent
and no card renders `NaN`/`Infinity` (the derived feeds fall back to unset).

## Console summary

Two classes observed across the exercised routes, **both pre-existing on `main` — none introduced by this PR**:

| Class | Level | New? | Cause |
|---|---|---|---|
| `No HydrateFallback element provided during initial hydration` | warning | pre-existing | React Router v7 data-router boilerplate |
| `Failed to load resource: 404` (`/favicon.ico`) | error | pre-existing | App ships no favicon; 404s on `main` too |

**Conclusion: no new errors or warnings introduced by this PR.** The diff adds pure read-folds + display
surfaces — no router config or asset change.
