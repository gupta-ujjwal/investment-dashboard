# Pre-mortem — homepage analytics charts (issue #9)

## Most likely failure mode
The `DB_VERSION` 2→3 migration ships, a user with existing v2 holdings opens
the app, and the `upgrade` callback throws or the page-load sequence races —
result: `getDB()` rejects, `dashboardLoader` (`App.tsx:21`) rejects, and the
router shows an error boundary instead of the dashboard. The user sees a blank
or errored app and, because IndexedDB has *partially* bumped to v3, simply
reloading does not fix it. This is worse than a broken chart: a broken chart
loses a widget, a broken migration loses the whole app. Second-most-likely:
charts render but `valueSeries()` divides by a zero `avgBuyPrice` or chokes on
a single-snapshot history, producing `NaN`/`Infinity` axis ticks and a Recharts
render throw that white-screens `/analytics`.

## Rollback shape
Two-layer. (1) **UI layer** — the feature is behind `FEATURE_HISTORY` in
`featureFlags.ts`; flip it to `false` and redeploy. The KPI rework and charts
disappear, the homepage falls back to the prior placeholder frames; no schema
change needed, no user stranded. (2) **Schema layer** — the v3 migration is NOT
rolled back. It is purely additive (`createObjectStore('historySnapshots')`
only, no edits to the `holdings` store), so a v2 build cannot reopen a v3 DB
(`VersionError`), but a v3 DB with the feature flag off behaves exactly like v2
— the new store just sits unused. Therefore: rollback = `FEATURE_HISTORY=false`
+ redeploy; never revert `DB_VERSION`. This is tested before merge: Playwright
runs both a fresh-DB (v0→v3) and an upgrade (seed v2, then load v3) path.

## Detection signal + responder
This is a single-user static app — no server telemetry, no pager. Detection is
the **draft-PR Playwright gate** (the frontend-design rule): the PR stays draft
until Playwright has (a) loaded `/analytics` with seeded holdings AND with a
seeded v2 DB, (b) confirmed `browser_console_messages` shows no new errors/
warnings, (c) captured the four charts in default + empty (`<2` snapshots)
states. The responder is the PR author reviewing the `## Evidence` comment
before clicking ready-for-review. Post-merge, the only "signal" is the user
themselves opening the deployed app — so the migration + empty-state paths must
be proven in Playwright pre-merge, because there is no second line of defence.
