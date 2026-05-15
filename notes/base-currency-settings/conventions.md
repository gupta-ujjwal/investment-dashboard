# Conventions for this change

## Commit style
Conventional commits — `feat(scope):`, `fix(scope):`, `chore(scope):`, `docs(scope):`. Scope tags seen in `git log`: `ui`, `parsers`, `storage`, `routing`, `readme`, `plan`, `deps`. New scopes worth using: `fx`, `settings`. Body lines describe *why*, brief, sometimes use `—` em-dashes.

## Project shape (READMEs + CLAUDE.md)
- Edge-only / no backend (CLAUDE.md). Frankfurter call is the only outbound network; user-initiated.
- Storage is one IDB DB (`investment-dashboard`), single store `holdings` at v1. New `settings` store + DB v2 bump.
- Phase-1 scope is India (INR) + US (USD) only. Base-currency type is constrained to those two.
- README § "Still open" currently says "FX: manual-paste model until a CORS-friendly source is picked." This work picks Frankfurter — README update needed in the same branch.

## Testing patterns
- Vitest, files alongside source (`src/foo.ts` + `src/foo.test.ts`). Pattern: `describe('module — context', () => { it('...', ...) })`.
- Parser tests load real fixtures from `tests/fixtures/`; pure-logic tests (e.g., `diff.test.ts`) inline-construct holdings via a small `holding(...)` helper.
- For this feature, expected new test files:
  - `src/lib/fx.test.ts` — Frankfurter response validation, timeout behavior, range check
  - `src/storage/settings.test.ts` — singleton store roundtrip, default values
  - (Existing) `src/parsers/diff.test.ts` — still passes unchanged because `diffHoldings` is structural

## Code style
- TS strict, ES modules, named exports (no default exports for utilities). `export type` and `export function` next to each other.
- React 19 with `react-router-dom` v7 `createBrowserRouter` loaders. Loaders are plain async fns returning data; routes use `useLoaderData()`.
- Tailwind 4 via `@tailwindcss/vite`; design tokens in CSS custom properties (`var(--color-tick-400)`); palette names (`bone`, `ink`, `tick`, `jade`, `ember`) seen across components.
- Currency type lives in `src/storage/holdings.ts:5`. Reuse rather than duplicate.

## Rules to cite in commits
- "`Currency = 'INR' | 'USD'` is the canonical Phase-1 base set" — when adding `BaseCurrency` type.
- "no backend; FX call is user-initiated" — when adding Frankfurter fetch.
- "additive schema, no migration" — when bumping DB v2 (matches CLAUDE.md / README § storage).
