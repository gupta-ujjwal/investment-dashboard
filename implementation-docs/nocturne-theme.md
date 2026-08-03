# Nocturne theme revamp

> Implemented via `/develop` on 2026-08-03; design source of truth: `Investment Dashboard Revamp (standalone).html` (bundled mockup at repo root).

## What

Theme-revamp refactor of the dashboard's visual system to the Nocturne design language — dark indigo ground, blurple accent, Inter typeface, sidebar-nav layout. Four files touched, no behavior change:

- `index.html` — font link swap (Fraunces + Instrument Sans → Inter), `theme-color` → `#161826`
- `src/index.css` — `@theme` token values swapped to the Nocturne palette; body background effects (film grain + scanlines + radial tint) replaced with a flat ground; Nocturne scrollbar + selection styles added; `.hr-fade` utility added
- `src/routes/AppShell.tsx` — top-nav header restructured into a sticky 224px sidebar (desktop) with per-tab SVG icons and the "All data stored on-device" footer; mobile falls back to a pill-style horizontal-scroll nav
- `src/components/charts/chartTheme.ts` — Recharts grid colour updated to a cool grey derived from the new bone token

**External surface**: pure CSS/JSX — no public API, no storage schema, no egress, no broker parser.

## Why

The current visual system ("broadsheet" dark — amber tick on near-black ink) was a pass from early May; the Nocturne mockup repositions the app with a calmer, more "product" look (inter-family type, deep-indigo surface, blurple accent) that aligns with how the user's other tools feel. The mockup was produced as a design iteration in mid-July; this branch lands it.

**Approach considered**: rewrite each route's Tailwind classes by hand (30+ files) vs. swap tokens in `@theme` once. Token swap won by a wide margin — Tailwind v4's `@theme` directive means every class reference (`bg-ink-900`, `text-bone-300`, `border-tick-400`, etc.) auto-retargets to the new values with zero call-site edits. The only hand-edits needed were AppShell (structure, not just colors) and index.html (font links).

**Plan-review dispositions**: no FIX / DEFER findings raised — the revamp stays inside the existing token families, honoring `productContext/dsl.md:138` ("no new colours without design rationale"); the bundled HTML file is itself the design rationale.

**Pre-mortem**: most-likely failure modes were (1) jade/ember tones clashing on the new indigo ground → mitigated by tuning lightness downward within the same hues; (2) mobile nav regression from the sidebar restructure → mitigated by keeping the mobile top-bar pattern, restyled with blurple active state, gated on `md:hidden`.

## How

- **Slice 1 — tokens**: `src/index.css` `@theme` block rewritten. `ink-*` → Nocturne bg/surface/neutral-dark ramp; `bone-*` → Nocturne text/neutral-light ramp; `tick-*` → Nocturne blurple (`#9184d9` base + tonal ramp); `jade-*` / `ember-*` hues kept, lightness tuned for the darker ground. `font-sans` / `font-display` → Inter. Body background: flat `background-color: var(--color-ink-950)`; film-grain overlay and scan-line pseudo-elements removed. Reduced-motion `@media` block preserved verbatim per `productContext/dsl.md:140`. Nocturne scrollbar + `::selection` styles added; `.hr-fade` utility for the signature fading horizontal rule.
- **Slice 2 — layout**: `src/routes/AppShell.tsx` rewritten. Desktop ≥md: sticky full-height `<aside>` (224px, `w-56`) with the rotated-diamond brand mark, icon + label nav items, active state = `border-l-2 border-tick-400 bg-tick-400/14 text-tick-200`, "All data stored on-device" footer pinned to the bottom. Mobile <md: existing `<header>` + horizontal-scroll nav, restyled with rounded pill (`rounded-lg`) active state, blurple highlight. Icons lifted from the mockup: bar-chart (Overview), circle-plus (Investments), line-chart (Equity), card (Budget), clock (Planning), download (Import), gear (Settings).
- **Slice 3 — fonts + charts**: `index.html` swaps Google Fonts to `Inter:wght@400;500;600;700&family=JetBrains+Mono`, drops Fraunces and Instrument Sans, bumps `theme-color` `#0E1014 → #161826`. `chartTheme.ts` grid colour cool-grey derived from the new bone-100 (`rgba(233, 233, 237, 0.07)`).
- **Verification**: `npm run build` PASSED, `npm run test:run` 255/255 PASSED, `npm run typecheck` PASSED. Visual smoke against the empty-state Overview / Equity routes and mobile 375×812 viewport matches the mockup.
- **Conventions honored**: `productContext/dsl.md:138` (token palette — no new colours at call-site level), `productContext/dsl.md:140` (reduced-motion preserved), `CLAUDE.md` hard constraints (no egress beyond the already-present Google Fonts link, no backend, no telemetry).
- **Review**: clean on iteration 1 (see `notes/nocturne-theme/review.md` for the inline lens pass). One follow-up noted: mobile nav scrollbar is a Playwright rendering artifact in headless Chromium; spot-check on a real device during PR review.
