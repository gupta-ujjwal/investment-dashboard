# Conventions — homepage analytics charts (issue #9)

No `CONTRIBUTING.md` / `ARCHITECTURE.md` / lint config in the repo. Conventions
inferred from existing code + git log.

- **Commit messages**: conventional commits — `feat(scope):`, `docs(scope):`,
  `chore(scope):` (git log: `feat(holdings):`, `feat(storage,fx,parsers):`).
- **Branch naming**: `feat/<slug>` (`feat/holdings-filters-sort-columns`,
  `feat/base-currency-settings`). → branch `feat/homepage-analytics-charts`.
- **Tests**: Vitest, colocated `*.test.ts` next to source. `describe`/`it`/
  `expect`. Helper factory functions for fixtures (`holding(over = {})` in
  `holdingsView.test.ts`). New `analytics.test.ts` + `history.test.ts` follow
  this shape.
- **Derived-figure semantics** (`holdingsView.ts` doc comment): a missing
  figure is `undefined`, never a sentinel `0`; the renderer shows `—`. Chart
  aggregation must keep this — no `?? 0` papering over absent prices.
- **Type-only imports**: `import type { … }` for types (TS `verbatimModuleSyntax`-style).
- **Design tokens** (`index.css` `@theme`): colors `ink-*` (bg), `bone-*` (text),
  `tick-*` (amber accent), `jade-*` (positive/green), `ember-*` (negative/red);
  fonts `font-display` (Fraunces serif), `font-sans`, `font-mono`. Charts must
  use these CSS variables (`var(--color-tick-400)` etc.), not raw hex.
- **Feature flags**: `src/featureFlags.ts` exports `const FEATURE_* = true`;
  UI gates on them (`AnalyticsRoute.tsx` gates base-currency KPI). Add
  `FEATURE_HISTORY` the same way.
- **No auto-formatter** — match surrounding style by hand (2-space indent,
  single quotes, no semicolons).
