# W2 PR-B + PR-C — deep-links, inline Planning config, and the invested hint

> Implemented via `/brainstorm` → `/develop` on 2026-07-16. The final two PRs of the W2 connective-tissue wave
> (overarching plan: `implementation-docs/w2-connective-tissue.md`), combined into one PR at the owner's
> request. PR-A (Budget→Overview/Planning/Goals derivations) merged separately.

## What
Three connective-tissue links, all read-folds + UI + reuse of the existing write path — no schema change,
`DB_VERSION` stays 5.
- **#5 — Overview deep-links.** Each Overview section heading (Net worth, Cash flow, Emergency fund, Goal)
  now links to the tab that owns it, turning Overview into the hub. Pure UI (`OverviewRoute.tsx`, a new
  `SectionHeading` helper).
- **#6 — inline Planning config.** Planning's three "set in Settings" round-trips become inline forms: an
  emergency need/months form and an allocation-targets (Safe/Moderate/High %) form, plus the Bulk-invest
  empty-state now points at the in-page Risk allocation card. Each posts `intent=save` to the **existing**
  `settingsAction` (`PlanningRoute.tsx`, a new `InlineTargetsForm`).
- **#4 — Budget invested hint.** A read-only holdings cost-basis month-over-month delta beside Budget's manual
  "invested this month", shown only when two history snapshots cleanly bracket the month; otherwise omitted
  (new `investedDeltaForMonth` in `lib/analytics.ts`; `budgetLoader` now reads history; `BudgetRoute.tsx`).

## Why
The tabs were siloed. #5 makes Overview a launchpad; #6 removes the Settings detour so the user configures
planning where they read it; #4 gives an honest cross-reference for the one field Budget still asks for by
hand, without pretending to a precision the data can't support.

**Approaches.** Combined PR-B + PR-C on one branch (owner's call) — acceptable because both are small and share
no risky surface; each link still reverts independently by file. #4's alternative — a real per-transaction
"invested" source — was rejected (W3-scale; broker exports carry no buy dates, so the source would itself be
manual).

**The load-bearing decision (#6 write safety):** the inline forms reuse `settingsAction` rather than adding a
new write path. That is only safe because `readSettingsFromForm` (`App.tsx`) read-modify-write **MERGES** —
each field keeps its stored value when its form input is absent (`readTarget`→`'keep'`,
`readAllocationTargets`→`current`). So a partial inline save preserves every omitted field — base currency,
goal corpus, the other targets, and any future consent flags / API keys. This was the plan review's
highest-consequence concern (a UI convenience clobbering privacy state); it is verified end-to-end below.

**Plan-review dispositions (from this PR's `/deep-review`, Block 0):**
- **FIX** — stale "saved" badge on `InlineTargetsForm` could sit beside edited-but-unsubmitted values →
  cleared on input change (honest success signal).
- **FIX** — duplicate `import type … from '../storage/assets'` lines merged.
- **CONFIRMED (no change)** — the Bulk-invest empty-state now references the in-page Risk allocation card
  instead of Settings; intended and internally consistent.
- **DEFER (nit)** — the `investedDeltaForMonth` internals (`${month}-31` lexicographic bound, double
  `reverse()`) read slightly hacky but are correct and O(n) on a tiny series.

**Pre-mortem / rollback.** Most-likely failure was #6 clobbering unrelated Settings on a partial save —
guarded by the merge contract and proven end-to-end. Rollback = `git revert` (no schema change, no migration;
the only write goes through the already-merging `settingsAction`); the loaders and folds are read-only.

## How
- **#4 fold** — `investedDeltaForMonth(history, base, month)` folds `valueSeries` (base-currency-scoped, R6)
  into the cost-basis change between the latest snapshot *within* month M and the latest *before* it; returns
  `undefined` (no hint) unless both exist with a computable invested total — never a running total or an
  auto-fill (R1). `budgetLoader` adds `getHistory()` (FEATURE_HISTORY-gated); `BudgetEditor` computes the hint
  for the selected month and renders a muted caption beside the input.
- **#6 inline config** — `InlineTargetsForm` renders labelled numeric inputs and posts `intent=save` +
  only its own fields to `/settings`; the route loader revalidates on completion. Emergency card gets a
  need/months form; Risk-allocation card gets a Safe/Moderate/High % form; both read defaults from `settings`.
- **#5 deep-links** — `SectionHeading({ to })` wraps the heading in a `Link` with a hover "→" affordance;
  applied to the four Overview section headings.

**Conventions honored:** dsl.md R1 (the fold returns `undefined`, never a false number), R6 (currency-scoped
delta — a USD in-month snapshot is skipped, asserted by test), R10 (no new egress; history is a local
FEATURE_HISTORY-gated read), the merge-safe settings write contract, and the token palette.

**Verification.** `tsc -b --noEmit` clean; `vite build` green; Vitest **255 passed** (new `investedDeltaForMonth`
suite incl. the bracket/omit and cross-currency cases). Playwright on a seeded portfolio + 3 budget months +
history: **#6** inline emergency + allocation saves both persisted while `goalCorpus`/`baseCurrency`/
`numberLocale` and the other targets were **preserved across repeated partial saves** (the merge-safety proof);
**#5** all four headings resolved to the right tabs; **#4** the hint showed the correct **+₹75,000** delta for a
bracketed month and was **omitted** for a month with no in-month snapshot; 0 new console errors (favicon 404 +
react-router HydrateFallback pre-exist on `main`).

**Review.** `/deep-review` — Block 0 · Request changes 1 (confirmed intent) · Follow-up 1 (fixed) · Nit 3
(2 fixed, 1 deferred as correct-as-is).

No formatter is configured; style applied by hand to match surrounding code.
