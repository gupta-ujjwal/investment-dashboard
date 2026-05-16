# Frame: Homepage analytics — design and implement the right charts (issue #9)

- **Kind**: feature
- **One-line summary**: Rework the homepage (`/analytics`) from placeholder frames into a real at-a-glance portfolio view, and add the price-history storage that makes time-series charts possible.
- **Files/modules likely touched**: `src/storage/holdings.ts` (DB_VERSION 2→3, new store), new `src/storage/history.ts`, `src/routes/import/PreviewStep.tsx` (snapshot write after commit), `src/routes/AnalyticsRoute.tsx` (KPI rework + charts), new `src/components/charts/*`, new `src/lib/analytics.ts` (allocation/movers/series aggregation), `package.json` (Recharts dependency).
- **External surface affected**: IndexedDB schema (DB_VERSION 2→3, new `historySnapshots` object store — additive, with an `upgrade` migration). No public API/CLI. New npm dependency (Recharts).
- **Out of scope**: per-holding history drill-down UI (data is captured, no screen), live/intraday price feed, day-change numbers, the dedicated deeper analytics tab.
