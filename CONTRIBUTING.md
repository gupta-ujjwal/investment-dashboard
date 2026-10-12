# Contributing to Investment Dashboard

Thanks for your interest in improving Investment Dashboard! This is a small,
edge-only portfolio tracker, and contributions of any size — bug fixes, new
features, docs, design tweaks — are welcome.

## Getting started

1. Fork the repo and clone your fork.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Make your changes. All portfolio data lives in the browser's IndexedDB, so
   you can freely import, add, and edit holdings while testing without
   needing a backend or any account.

## Before opening a PR

Run the checks CI expects:

```bash
npm run typecheck   # tsc -b --noEmit
npm run test:run    # vitest run
npm run build        # tsc -b && vite build
```

## Making changes

- Keep PRs focused — one feature or fix per PR is easier to review than a
  bundle of unrelated changes.
- Match the existing code style (TypeScript, functional React components,
  hooks for state, Tailwind for styling). Parser/analytics logic is pure and
  unit-tested with Vitest (`tests/fixtures/` for sample broker exports) —
  new lib functions should follow the same pattern.
- **Read [`CLAUDE.md`](./CLAUDE.md) before touching storage, FX, or
  privacy-sensitive code.** The hard constraints there (edge-only, no
  backend, opt-in egress, India+US equities for Phase 1) are not
  suggestions — PRs that violate them without discussion will be asked to
  change.
- If you change the IndexedDB schema (`src/storage/holdings.ts`), bump
  `DB_VERSION` and add an **additive-only** migration in the `upgrade()`
  hook — no migration should ever drop or reshape an existing user's data.
  Every migration since v1 has followed this rule; keep it that way.
- If you add a broker parser, follow the shape in `src/parsers/vested.ts` /
  `src/parsers/groww.ts`: project the source-specific file into one
  `CanonicalHolding`, skip (don't zero-fill) rows with unparseable required
  fields, and add fixtures under `tests/fixtures/`.
- Update `README.md` if you add a user-facing feature worth mentioning.

## Reporting bugs / suggesting features

Open a GitHub issue with:

- What you expected to happen vs. what actually happened (for bugs).
- Steps to reproduce, if applicable.
- Screenshots, if it's a visual/UI issue.

## Code of Conduct

By participating in this project, you agree to abide by the
[Code of Conduct](./CODE_OF_CONDUCT.md).
