# Conventions

No `CONTRIBUTING.md` / `ARCHITECTURE.md`. Rules inferred from code + git log + CLAUDE.md.

- **Commits**: conventional commits with scope — `feat(ui): …`, `feat(storage,fx): …`, `docs(readme): …`. Lowercase, imperative.
- **Tests**: vitest, co-located as `<name>.test.ts` next to source. `describe`/`it`/`expect`. Real fixtures loaded from `tests/fixtures/`.
- **Pure-logic-module + thin-component**: `refreshFx.ts`, `parsers/diff.ts` are pure and unit-tested; components stay presentational. The plan's `holdingsView.ts` follows this.
- **Partial values via `undefined`**, never sentinel `0` — `baseCostLabel` (`HoldingsTable.tsx:32-35`) renders `—` on `undefined`. Mirror for current price.
- **No formatter** — match surrounding style manually (2-space indent, single quotes, no semicolons).
- **frontend-design rule** (`.claude/rules/frontend-design.md`): UI changes need Playwright verification before the draft PR is ready — surfaced as a NEXT step in handoff (this skill stops at branch-pushed).
- **CLAUDE.md**: edge-only, no backend; build only what Phase 1 needs.
