# Evidence — PR #46: net-worth IA + budget tags

## Status: CAPTURED ✅

Playwright route screenshots captured at desktop **1280×900** and mobile
**390×844** (deviceScaleFactor 2), against `npm run dev`
(`http://localhost:5173/investment-dashboard/`) with a seeded v5 portfolio
(5 equity holdings across IN/US, 5 manual assets, 2 budget months, 5 budget
tags, 4 history snapshots).

> Capture note: the Playwright **MCP** browser still could not launch here — the
> system Chrome (`/opt/google/chrome`) hits a Nix-glibc `GLIBC_2.38 not found`
> mismatch because `/nix/store` libs leak into the MCP server's env via
> `LD_LIBRARY_PATH`/direnv, and the agent can't change the MCP server's env.
> Worked around by driving the bundled chromium directly from a **clean env**
> (`env -u LD_LIBRARY_PATH`), via the re-runnable
> `notes/investments-tab-budget-tags/capture.mjs` + `seed-idb.js` (gitignored
> scratch). Same browser engine, same routes.

## Non-visual verification (all green)

| Check | Command | Result |
|---|---|---|
| Types | `tsc -b --noEmit` | clean |
| Unit tests | `vitest run` | **216 passed** (18 files) |
| Build | `vite build` | green; `OverviewCharts` split into its own 5 kB lazy chunk, equity `ChartsPanel` a separate chunk (initial bundle stays Recharts-free) |
| Code review | `/deep-review` | **no Block findings** (clean after 1 iteration) |

New unit coverage: equity backfill fold (partial-aware, defensive on non-finite),
`classValueSeries` / `assetClassChanges`, parameterized `valueSeries` equity-only
filter, budget-tag backup round-trip + pre-v5 missing-key default, tag dedupe.

## Screenshots

Desktop (`-desktop.png`) and mobile (`-mobile.png`) for each route, full-page:

| File | What it shows |
|---|---|
| `overview-{desktop,mobile}` | Net-worth KPIs, allocation-by-class bars, emergency-fund card (5.4 mo / 90%), goal, and the **two new charts** — *Net worth by asset class* stacked area + *Change by asset class* per-class sparklines |
| `investments-{desktop,mobile}` | Unified list: **Equity·India / Equity·US** read-only rows (`VIEW →`, "from holdings") above editable crypto/gold/NPS/FD/savings manual rows |
| `investments-add-asset-modal` | `+ Add asset` modal — name, asset class, IN/US currency toggle, value/invested, planning tags (risk band + emergency-fund) |
| `equity-{desktop,mobile}` | Equity KPIs + concentration/single-stock-risk row + charts (value-over-time w/ benchmark, P&L-over-time, allocation/currency/sector donuts, top movers) + per-ticker holdings table |
| `budget-{desktop,mobile}` | Month summary; line editor with the **tag combobox** ("Pick or type a tag"); income/expense **tag chips** (Salary/Interest, Rent/Groceries/EMI); `+ Add line` inline create |
| `settings-{desktop,mobile}` | Settings (data/backup, external-API consent, FX, allocation targets) |

## Console summary

Captured `error` + `warning` console output across every route load
(raw JSON kept in gitignored `notes/`, not committed). Three distinct classes,
**all pre-existing on `main` — none introduced by this PR**:

| Class | Level | New? | Cause |
|---|---|---|---|
| `Matched leaf route at location "/" does not have an element or Component` | warning | pre-existing | React Router v7 layout route (`/`) renders an `<Outlet/>` only — router-config boilerplate, unrelated to the tab restructure |
| `No HydrateFallback element provided to render during initial hydration` | warning | pre-existing | React Router v7 data-router boilerplate; no `HydrateFallback` configured |
| `Failed to load resource: 404` (`/favicon.ico`) | error | pre-existing | App ships no favicon (no `public/`, no `<link rel=icon>`); Chrome auto-requests `/favicon.ico` on every page and it 404s on `main` too |

**Conclusion: no new errors or warnings introduced by this PR.** The two router
warnings and the favicon 404 are environmental/framework artifacts present on
`main` independent of this diff.
