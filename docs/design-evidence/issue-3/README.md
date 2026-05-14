# Issue #3 — design-pass evidence

Playwright captures of the design pass in 10 states across two
viewports (desktop 1440×900, mobile 390×844). Current direction:
**Private ledger after hours** (warm-dark, brass accent, EB Garamond
italic display — see `implementation-docs/frontend-design-pass.md`
"Iteration 2" for why the original cream-broadsheet got pivoted).
Regenerate locally with:

```bash
npm i -D playwright    # one-time
npm run dev            # leave running
node notes/frontend-design-pass-broadsheet/capture.mjs
```

| # | State | Desktop | Mobile |
| --- | --- | --- | --- |
| 01 | Empty-state redirect → source picker | `desktop-01-…` | `mobile-01-…` |
| 02 | Vested instructions | `desktop-02-…` | `mobile-02-…` |
| 03 | Groww instructions | `desktop-03-…` | `mobile-03-…` |
| 04 | Upload empty state (Groww) | `desktop-04-…` | `mobile-04-…` |
| 05 | Upload parse error (Vested file → Groww parser) | `desktop-05-…` | `mobile-05-…` |
| 06 | Preview — no missing rows | `desktop-06-…` | `mobile-06-…` |
| 07 | Commit success ("Import complete.") | `desktop-07-…` | `mobile-07-…` |
| 08 | Holdings list — single source (Vested) | `desktop-08-…` | `mobile-08-…` |
| 09 | Preview — Groww | `desktop-09-…` | `mobile-09-…` |
| 10 | Holdings list — both sources | `desktop-10-…` | `mobile-10-…` |

Not exercised in this batch: **preview with missing rows**. Reaching that
state requires a re-upload whose source file omits a previously-imported
row. The unmodified fixtures don't produce that diff. `MissingRowsPanel`
in `src/routes/import/PreviewStep.tsx` was redesigned in the same
editorial style as the rest of the preview step.

Console output during capture: only pre-existing favicon 404 + react-router
`HydrateFallback` warning. **No new errors or warnings from this diff.**
