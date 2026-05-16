# Reliability Tenets — homepage analytics charts (issue #9)

One-line restate: auxiliary, off-critical-path frontend feature — new IndexedDB
store + schema migration + new chart dependency on a static GitHub Pages app.
Blast radius if it goes wrong: a broken `/analytics` page or, worst case, a
failed DB migration that blocks the whole app from opening.

Picked tenets: **2, 3, 6**. (1/5/7/8/9/10 are server/SLA-shaped and don't apply
to an edge-only static app; 4 partially folds into 6.)

## Tenet 2 — Critical path: simple, few dependencies
The dashboard's "critical path" is *the app opening at all*. The DB migration
(`DB_VERSION` 2→3) is on it — `getDB()` runs before any route renders. Keep the
`oldVersion < 3` branch to a single `createObjectStore('historySnapshots')` and
nothing else: no data backfill, no cross-store writes inside `upgrade`. Recharts
adds ~100KB+ to the initial bundle — for a static app the "critical path" cost
is first-paint time; lazy-load the chart components (`React.lazy`) so the KPI
row and a holdings-bearing page aren't gated on the chart bundle.
*Q: does the app still open instantly if the chart bundle is slow or fails to
load — i.e. is Recharts behind a `Suspense` boundary with a fallback?*

## Tenet 3 — Reduce blast radius
A snapshot write failure, a malformed history record, or a Recharts render
throw must not take down `/analytics` (KPIs + holdings) or any other route.
Bulkheads: (a) `recordSnapshot()` wrapped in try/catch — history is best-effort,
a failure is `console.warn` only, never blocks the "Import complete" screen;
(b) each chart wrapped in an error boundary so one bad chart degrades to a
placeholder, not a white screen; (c) `valueSeries()` tolerates history records
from an older shape / different base currency rather than throwing.
*Q: if the historySnapshots store contains one corrupt record, does the value
chart skip it and render the rest, or does the whole page crash?*

## Tenet 6 — Staggered rollout + rollback
The irreversible part is the **schema migration**: once a user's browser opens
`DB_VERSION` 3, IndexedDB will not let a `DB_VERSION` 2 build open that database
(`VersionError`) — a rollback of the deployed bundle strands anyone who already
upgraded. Mitigations: (a) gate the whole feature behind a `FEATURE_HISTORY`
flag in `featureFlags.ts` (matching the existing `FEATURE_BASE_CURRENCY`
pattern) so the UI can be turned off without reverting the schema; (b) make the
`v3` migration purely additive and forward-safe so a partial rollback only
loses the *new* UI, not existing holdings; (c) verify via Playwright that a
fresh DB (v0→v3) and an upgrade (v2→v3) both succeed before marking the PR
ready. There is no canary on a single-user static app — the "stagger" is the
feature flag plus the draft-PR Playwright gate.
*Q: what is the rollback story for a user who already migrated to v3 if the
charts ship broken — is it "flip FEATURE_HISTORY off and redeploy", with the
schema left at v3?*

## Tension
Tenet 2 (simple critical path) vs. the feature itself: every line added to the
`upgrade` callback raises migration risk. Resolution — the migration does
exactly one thing (`createObjectStore`); all snapshot *population* happens
lazily on the next import, never inside `upgrade`.
