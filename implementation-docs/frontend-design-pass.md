# Plan: Frontend design pass — editorial broadsheet (cream)

> Issue: https://github.com/gupta-ujjwal/investment-dashboard/issues/3
> Working notes: `notes/frontend-design-pass-broadsheet/`.
> Parent slice: `feat/csv-import-vested-groww` (the wizard + holdings list this redresses).

## Frame

- **Kind**: design pass — no behavior change, no data-layer touch.
- **One-line summary**: Replace the generic Tailwind aesthetic on the import wizard + holdings list with an opinionated **editorial / financial broadsheet** direction. Variant **A — cream broadsheet** is the picked direction (per issue #3 ✓ default).
- **Branch base**: `feat/csv-import-vested-groww` (not `main`) — the design pass needs the UI surface that branch shipped. Once both PRs merge, this rebases cleanly.

## Files touched

- `package.json` — add `@fontsource/newsreader`, `@fontsource/geist`, `@fontsource/geist-mono` (privacy-first self-hosting; no Google Fonts CDN).
- `src/index.css` — Tailwind v4 `@theme` tokens for the broadsheet palette + serif/body/mono font stacks, global lining + tabular figures, paper-grain SVG overlay, font imports.
- `src/routes/home/HomeRoute.tsx` — masthead with display serif, small-caps dateline, double-rule divider, one-shot staggered fade-in on first paint.
- `src/routes/home/HoldingsTable.tsx` — hairline column rules, double top-rule, no shadows/rounded corners, right-aligned numerics, currency glyph in its own narrow column, serifed initials replacing colored source chips, right-edge hover hairline.
- `src/routes/import/ImportRoute.tsx` — step indicator in small caps with em-dash separators, current step bold, no circles; text-crossfade between steps (~150ms).
- `src/routes/import/{SourcePicker,Instructions,UploadStep,PreviewStep,CommitStep}.tsx` — editorial restyling: rule-based panels, serif heads, body sans, mono for tickers/file names; preview "Sanity check" becomes an italic-serif pull-quote with side rule.

## Out of scope (explicit defers from the issue)

- Charts / data viz aesthetics — waits for the price-data slice (no chart in app yet).
- Mobile-first layout pass — separate slice; the broadsheet variant still degrades acceptably at 390px.
- Dark-mode toggle — Variant A is the picked variant; Variant B (off-black terminal) is a later polish slice.

## Direction (recap of the contract)

- **Variant A — cream broadsheet.** Background `#f5f1ea` (newsprint), ink `#1a1815`, oxblood `#6b1d1d` for negative numbers + editorial red `#b03030` for the source distinction. Daytime read.
- **Display**: Newsreader (free, Fontsource). Masthead, route titles, large stat numbers.
- **Body**: Geist. Labels, paragraph copy, buttons.
- **Mono**: Geist Mono. Tickers, ISINs, prices, dates.
- Global `font-feature-settings: 'lnum' 1, 'tnum' 1` on numeric surfaces.
- Faint paper-grain SVG noise overlay (~3–5% opacity), fixed-positioned.
- Motion: one staggered fade-in on home first paint (~20–30ms per row), ~150ms text crossfade between wizard steps. No slide.

## Reliability tenets (carried over from the parent slice)

This is a presentation-only diff. The parent slice's tenets still apply:

- **Tenet 2 (critical path simple)**: nothing in the design pass touches `commitImport` or the parsers. The diff is `*.tsx` and `index.css` only — no behavior changes.
- **Tenet 3 (blast radius)**: no new dependencies beyond three self-hosted font packages. Bundle increase is well-known WOFF2 weights (Newsreader + Geist + Geist Mono ≈ 100–150 KB across required subsets).
- **Tenet 6 (rollback)**: code rollback via `git revert HEAD && git push`. No data shape change → no migration concerns.

## Pre-mortem

- **Most likely failure**: the paper-grain SVG noise overlay reads as moiré/glitchy on certain LCDs or scales weirdly when zoomed. Mitigation: keep opacity ≤5% and ship without the overlay if it doesn't survive verification — the typography + rule-lines carry the look on their own.
- **Second**: font fallback flash before WOFF2 loads. Mitigation: self-host all three families via Fontsource (already done by including the CSS imports), let the browser use `font-display: swap` (Fontsource default), and ensure the system-font fallback stack (`Georgia, serif` for display; `system-ui, sans-serif` for body) is visually close enough that the swap isn't jarring.
- **Third**: small caps via `font-variant-caps` may not render evenly across all browsers for Geist. Mitigation: prefer literal uppercase with reduced tracking (`text-[0.7rem] tracking-[0.18em]`) where the small-cap effect matters most (step indicator, dateline).

## Verification

Per `.claude/rules/frontend-design.md`, Playwright MCP screenshots are required before the draft PR goes ready-for-review:

- Empty-state redirect (`/` with no holdings → `/import`).
- Source picker.
- Instructions for both Vested + Groww.
- Upload step — empty state.
- Upload step — parse-error state (force an error with a non-XLSX file or unsupported header).
- Preview — no-missing case.
- Preview — with-missing case.
- Commit success.
- List view — single source.
- List view — both sources.
- Desktop 1440×900 + mobile 390×844 viewports.
- `browser_console_messages` clean (no new errors/warnings).

## Evidence

20 screenshots captured (10 desktop @ 1440×900, 10 mobile @ 390×844) at
`.playwright-mcp/{desktop,mobile}-NN-*.png`. The Playwright MCP wrapper
hit a stable 5s RPC timeout in this session after the first capture, so
the screenshots were taken via the project-local `playwright` package
driven by `notes/frontend-design-pass-broadsheet/capture.mjs`. The script
records new console errors/warnings; output: only pre-existing favicon
404 + react-router `HydrateFallback` warning, **no new errors/warnings
from this diff**.

Variant not exercised: **preview with missing rows**. Reaching that state
requires a re-upload whose source omits a previously-imported row.
Unmodified fixtures don't produce that diff. `MissingRowsPanel` was
redesigned in the same editorial style as the rest of the preview step
(oxblood eyebrow, hairline-divided list, smallcaps Keep/Delete actions);
its design is consistent with the rest of the slice and the parser-level
unit tests already cover the `missing` branch.

## Status

Implemented under `/implement-lite`. Branch: `feat/design-pass-broadsheet`
off `feat/csv-import-vested-groww`. Ready for PR.
