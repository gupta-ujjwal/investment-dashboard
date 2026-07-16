# Evidence — PR #49: W2 PR-B + PR-C (deep-links, inline Planning config, invested hint)

## Status: CAPTURED ✅

Playwright (MCP) screenshots at desktop **1440×1200** and mobile **390×844**, against `npm run dev`
(`http://localhost:5173/investment-dashboard/`) with a seeded portfolio (49 holdings + a Savings asset) plus
3 budget months and 2 history snapshots (2026-05-30 invested ₹1.0L, 2026-06-20 invested ₹1.75L) to exercise
the #4 hint.

## Non-visual verification (all green)

| Check | Command | Result |
|---|---|---|
| Types | `tsc -b --noEmit` | clean |
| Unit tests | `vitest run` | **255 passed** (20 files) |
| Build | `vite build` | green |
| Code review | `/deep-review` | **Block 0** (Request-changes 1 confirmed-intent; Follow-up 1 + 2 nits fixed) |

New coverage: `investedDeltaForMonth` (bracket→delta, no-in-month→undefined, no-baseline→undefined, malformed
month→undefined, cross-currency R6 skip).

## Screenshots

| File | What it shows |
|---|---|
| `planning-inline-config-desktop` | **#6** — the three "set in Settings" round-trips replaced by inline forms: Monthly need/Months of cover (₹1,75,000 / 6), Safe/Moderate/High % targets (30/40/30 with target markers on the risk bars), and Bulk-invest now enabled |
| `planning-inline-config-mobile` | Same, responsive at 390px |
| `overview-deeplinks-desktop` | **#5** — Overview section headings link to their tabs; the "Net worth →" hover affordance is visible (each of Net worth / Cash flow / Emergency fund / Goal links to Investments / Budget / Planning) |
| `budget-invested-hint-desktop` | **#4** — beside "invested this month" for June 2026: *"Your holdings cost basis moved +₹75,000.00 between snapshots (2026-05-30 → 2026-06-20) — a rough guide, not an entry."* |

Also verified live (not screenshotted):
- **#6 merge-safety** — the inline emergency save persisted `need`/`months` while `goalCorpus`, `baseCurrency`,
  and `numberLocale` were **preserved**; a subsequent inline allocation save preserved the emergency need too
  (repeated partial saves don't clobber each other). This is the plan review's highest-consequence check.
- **#4 honest omission** — switching to a month with no in-month snapshot removes the hint entirely.
- **#5** — all four headings resolve to the correct routes (verified via `href`).

## Console summary

Two classes across the exercised routes, **both pre-existing on `main` — none introduced by this PR**:

| Class | Level | New? | Cause |
|---|---|---|---|
| `No HydrateFallback element …` | warning | pre-existing | React Router v7 data-router boilerplate |
| `Failed to load resource: 404` (`/favicon.ico`) | error | pre-existing | App ships no favicon; 404s on `main` too |

**Conclusion: no new errors or warnings introduced by this PR.**
