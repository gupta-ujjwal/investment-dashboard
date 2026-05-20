# Draft Outline — Investment Dashboard productContext

## architecture.md

| Anchor | Section | Grounding |
|---|---|---|
| `arch-overview` | 1. Overview | `README.md:1-7`, `CLAUDE.md:5-16` |
| `arch-component-map` | 2. Component / Module Map | `src/` directory listing, `App.tsx:90-121` |
| `arch-routing` | 3. Routing & Navigation | `App.tsx:90-121`, `AppShell.tsx:3-8`, `ImportRoute.tsx:10-18` |
| `arch-storage` | 4. Storage Layer | `storage/holdings.ts:36-69`, `storage/settings.ts`, `storage/history.ts` |
| `arch-import-pipeline` | 5. Import Pipeline | `parsers/vested.ts`, `parsers/groww.ts`, `parsers/diff.ts`, `PreviewStep.tsx:27-77` |
| `arch-fx` | 6. FX & Currency Conversion | `lib/fx.ts`, `lib/refreshFx.ts` |
| `arch-analytics` | 7. Analytics Engine | `lib/analytics.ts`, `lib/holdingsView.ts` |
| `arch-charts` | 8. Charts (Recharts) | `components/charts/ChartsPanel.tsx`, `ChartCard.tsx`, chart components |
| `arch-deployment` | 9. Deployment | `deploy.yml`, `vite.config.ts:6`, `README.md:31-33` |
| `arch-gaps` | 10. Gaps / Unverified | User-provided sources insufficient for these items |

## dsl.md

| Anchor | Section | Grounding |
|---|---|---|
| `dsl-terminology` | 1. Terminology | `storage/holdings.ts:4-29`, `lib/holdingsView.ts:30-48`, `lib/analytics.ts` type aliases |
| `dsl-domain-rules` | 2. Domain Rules | `holdingsView.ts:50-91`, `analytics.ts`, `fx.ts:79-88` |
| `dsl-decision-guide` | 3. Reviewer Decision Guide | `CLAUDE.md:17-30`, `README.md:40-65`, implementation-docs |
| `dsl-gaps` | 4. Gaps / Unverified | TBD |

---

## Inferences to confirm

1. **Schema evolution strategy**: The DB uses additive-only migrations (`oldVersion < N` guards in `holdings.ts:49-65`). No data migration or backfill in upgrade callbacks — is this a permanent rule or temporary?
2. **Feature flag retirement plan**: `FEATURE_BASE_CURRENCY` and `FEATURE_HISTORY` are currently `true`. Is there a plan to remove these flags once stable?
3. **Future brokers**: Only Vested and Groww are supported. Are there concrete plans for Robinhood/Zerodha/Fidelity, or is the dual-source setup sufficient for Phase 1?
