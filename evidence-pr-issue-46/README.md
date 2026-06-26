# Evidence — PR #46: net-worth IA + budget tags

## Status: screenshots PENDING (environment-blocked)

Playwright route screenshots could **not** be captured in the `/develop` session:
the Playwright MCP browser (system Chrome, `/opt/google/chrome`) failed to launch
with a Nix-glibc mismatch —

```
/opt/google/chrome: libc.so.6: version `GLIBC_2.38' not found
  (required by /nix/store/.../alsa-lib/libasound.so.2)
```

— because `/nix/store` libraries leaked into the MCP server's environment
(`LD_LIBRARY_PATH`, via direnv). The browser is launched by the MCP server
process, whose environment the agent cannot change. Restarting the Playwright MCP
in a clean env (outside the direnv shell / `env -u LD_LIBRARY_PATH`) resolves it.

A re-runnable IDB seeder + capture runbook is prepared in the (gitignored)
`notes/investments-tab-budget-tags/` directory (`seed-idb.js`,
`capture-runbook.md`). Once the browser launches, capture the screenshots listed
below into this directory, add the categorized console summary, and mark the PR
ready-for-review.

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

## Screenshots to capture (desktop 1280×900 + mobile 390×844)

- `/overview` — net-worth KPIs, allocation-by-class bars, emergency-fund card,
  goal, and the two new charts (stacked net-worth-by-class area + per-class
  change sparklines)
- `/investments` — unified list: read-only Equity·India / Equity·US rows (with
  "View →") above editable crypto/gold/NPS/FD/savings rows; "+ Add asset" modal
- `/equity` — equity KPIs + risk row + charts (value-over-time w/ benchmark,
  donuts, movers) + holdings table
- `/budget` — month summary, line editor with the tag combobox (datalist open),
  tag chip row, "+ tag" inline create
- `/settings` → Data → Restore preview — manifest now shows a **Budget tags** count

## Console summary

To be filled after capture: name each error/warning class observed per route,
mark new vs pre-existing on `main`, and conclude. Do **not** commit the raw
console dump (keep it under `notes/`).
