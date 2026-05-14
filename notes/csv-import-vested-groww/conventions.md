# Conventions for this slice

## Commit messages

Conventional Commits, matching the existing log:
- `feat:` `chore:` `refactor(hickey):` `refactor:` already in the log (`git log --oneline | head -10`).
- Body should describe *why*, not *what*. Reference plan section or rule when load-bearing.
- Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (matches the harness's commit template).

## TypeScript settings that bite

From `tsconfig.app.json`:
- `strict: true`
- `noUnusedLocals: true`, `noUnusedParameters: true` — every imported name and parameter must be used.
- `verbatimModuleSyntax: true` — type-only imports must use `import type { Foo } from '...'`.
- `erasableSyntaxOnly: true` — no enums; use string-literal unions or const objects.
- `noFallthroughCasesInSwitch: true` — exhaustive switches need defaults or all-cases.
- `noUncheckedSideEffectImports: true` — every side-effect import is explicit.

These force a particular style. Plan accordingly:
- `parserResult` types defined as `type ParseResult = { ... }`, imported as `import type`.
- `Source = 'vested' | 'groww'` as a string-literal union, not an enum.
- `AssetClass = 'equity' | 'mf' | 'etf' | 'invit' | 'other'` same shape.

## Project rules that apply to this slice

- **`.agency/do.md` check command**: `npm run typecheck` (= `tsc -b --noEmit`). This is the build gate. Add `vitest` as a separate script.
- **`.agency/do.md` documentation rule**: "Keep `README.md` in sync with user-facing changes." This slice changes the README's "Future slices add Dexie … PapaParse …" line — we chose `idb` and `xlsx` instead. Update README in the same slice.
- **`.claude/rules/frontend-design.md`**: Playwright MCP verification gates the draft PR → ready-for-review transition. NOT this skill's responsibility (`/implement-lite` stops at branch pushed). Surface in handoff as "next step: run frontend-design evidence capture before marking PR ready."
- **`CLAUDE.md` hard constraints**: edge-only (no server, no telemetry); GitHub Pages static bundle (no SSR); privacy-first (no third-party scripts). Library picks must respect this. `idb` and `xlsx` are pure client-side, no telemetry, no network.

## Deviation from README

The brainstorm explicitly chose `idb` over Dexie (smaller, simpler for one object store) and `xlsx` (SheetJS) over PapaParse (PapaParse is CSV-only; our broker exports are XLSX). README's "Future slices add Dexie/PapaParse …" line was the scaffold author's working assumption — superseded by the plan at `implementation-docs/csv-import-vested-groww.md`. README will be updated in this slice to reflect actual choices.

## Testing convention (precedent-setting)

The scaffold has zero tests. This slice establishes the conventions:
- **Test runner**: Vitest (Vite-native; zero config friction).
- **Fixture location**: `tests/fixtures/` at repo root, separate from source.
- **Test file location**: co-located `*.test.ts` next to the source it tests (e.g., `src/parsers/groww.test.ts`).
- **What gets unit-tested**: pure functions (parsers, diff). Stateful UI (wizard, routes) is exercised via Playwright in the evidence step, not via component tests in this slice.
