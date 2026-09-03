# Evidence — bold UI/UX pass (React Bits + Skiper UI, reimplemented in-house)

Plan: `/home/vishal/.claude/plans/golden-shimmying-twilight.md`

## What changed

- `AmbientBackground` — soft drifting gradient + grain (React Bits "Grainient," rebuilt on CSS/SVG instead of its `ogl` WebGL dependency), behind the Overview net-worth hero, the Overview empty state, and the Import "pick a broker" screen (the app's true first-run landing surface — this SPA has no separate marketing page).
- `FeatureCarousel` — 3-slide auto-advancing text carousel (Skiper "Creative carousel," rebuilt on framer-motion instead of `swiper`, since the original is image-gallery-shaped and this app has no images to show), on the same two first-run surfaces.
- `AnimatedNumber` — count-up-on-mount for the Overview hero's 3 KPI values (Skiper "Animated number," rebuilt on framer-motion alone instead of pulling in `@number-flow/react` + `react-intersection-observer`).
- `HoverTile` — restrained hover lift/nudge (Skiper "ExpandOnHover," adapted from its image-card layout to KPI tiles / broker cards / sidebar nav rows), desktop/mouse-only via a `(hover: hover)` check.

All four respect `prefers-reduced-motion` (JS-level `usePrefersReducedMotion` hook, mirroring the existing CSS-level handling in `index.css`).

## Screenshots

| File | Surface | Viewport |
|---|---|---|
| `desktop/overview-hero-1440.png` | Overview hero, seeded data — ambient background + animated KPI counters | 1440 |
| `desktop/overview-empty-1440.png` | Overview empty state — ambient background + feature carousel above CTAs | 1440 |
| `desktop/import-sourcepicker-1440.png` | Import "pick a broker" (reinterpreted landing surface) | 1440 |
| `desktop/nav-hover-1440.png` | Sidebar nav hover nudge (Portfolio row) | 1440 |
| `desktop/broker-card-hover-1440.png` | Broker card hover lift (Vested card) | 1440 |
| `mobile/overview-hero-390.png` | Overview hero, seeded data | 390 |
| `mobile/import-sourcepicker-390.png` | Import "pick a broker" | 390 |

## Verification performed

- `npm run typecheck`, `npm run test:run` (274 tests) — both green.
- `npm run build` — `AmbientBackground` (0.52 kB gz) and `FeatureCarousel` (2.45 kB gz) land in their own lazy chunks, confirmed by diffing against a build with the decor directory removed. `AnimatedNumber`/`HoverTile` are **not** lazy — they wrap real KPI values and interactive tiles directly, so hiding them behind a Suspense boundary would delay real content; this pulls framer-motion into the main bundle instead. Measured cost: **+41.0 kB gzip** to the main chunk (framer-motion alone — `clsx`/`tailwind-merge` were installed for a `cn()` helper that ended up unused since none of the rebuilt components needed conditional class merging, and `lucide-react`/`react-use-measure` were installed per the original plan but also went unused; all four were removed).
- Playwright: navigated Overview (empty + seeded via a pre-existing gitignored `notes/investments-tab-budget-tags/seed-idb.js` helper) and Import at 1440px and 390px; hovered a nav row and a broker card; emulated `prefers-reduced-motion: reduce` and confirmed via `browser_evaluate` that (a) `matchMedia` reports reduced, (b) ambient blobs render without their drift animation class, (c) the KPI value renders the final formatted number immediately (no count-up).
- `browser_network_requests`: no new external hosts contacted by the new components. The only cross-origin requests on the page (`fonts.googleapis.com`, `fonts.gstatic.com`) are pre-existing `<link>` tags in `index.html`, unmodified by this change (`git diff --stat -- index.html` is empty).

### Console messages (categorized summary)

- `Failed to load resource: 404 @ /favicon.ico` — pre-existing, unrelated to this change (no favicon file in the repo).
- `No HydrateFallback element provided to render during initial hydration` — pre-existing react-router warning, present on every route regardless of this change.
- No new errors or warnings observed on any of the routes touched by this change.

## Bug found and fixed during verification

The ambient background was initially invisible: `AmbientBackground` used `-z-10` inside a `relative` container that did not establish its own stacking context, so the negative z-index hoisted the blobs to the document root's stacking order, where they painted *behind* the container's own opaque background instead of in front of it. Fixed by adding `isolate` to each container (`NetWorthSection`, `EmptyState`, `SourcePicker`'s `<section>`), which scopes the `-z-10` layering locally as intended. Also bumped blob opacity (0.16 → 0.32) and size — the original values were too subtle to register at "go bold" scope once actually visible.

## Explicitly descoped (see plan)

- Theme toggle — no light palette exists in this dark-only design system; out of scope for this pass.
- A second, separate static landing page — reinterpreted as the Import wizard's first screen per user decision (this SPA has no marketing site to attach one to).
