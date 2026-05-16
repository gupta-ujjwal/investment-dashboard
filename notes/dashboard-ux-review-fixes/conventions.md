# Conventions (same project as homepage-analytics-charts)

- Conventional commits: `fix(scope):`, `feat(scope):`, `chore(scope):`.
- Branch naming `fix/<slug>` or `feat/<slug>`.
- Vitest colocated `*.test.ts`. No auto-formatter — match style by hand
  (2-space indent, single quotes, no semicolons).
- Design tokens via CSS vars: `ink/bone/tick/jade/ember`. Active/selected
  segmented-control treatment across the app = solid `bg-tick-400 text-ink-950`.
- Derived figures: `undefined` (not `0`) for uncomputable; render `—`.
- `import type` for type-only imports.
