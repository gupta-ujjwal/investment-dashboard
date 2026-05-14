# Detected commands

- **Build / typecheck**: `npm run typecheck` (= `tsc -b --noEmit`) is the canonical gate per `.agency/do.md`. `npm run build` (= `tsc -b && vite build`) builds the production bundle. Use both.
- **Format**: none detected. No `prettier`, `eslint --fix`, or `biome` config in the repo. Skip Step 6 explicitly.
- **Lint**: none detected. TypeScript strict mode acts as the lint gate.
- **Test**: not currently configured — bootstrapping `vitest` as part of this slice (user-ratified). New scripts:
  - `npm test` → `vitest` (watch mode for dev)
  - `npm run test:run` → `vitest run` (one-shot for CI / handoff verification)
- **Dev**: `npm run dev` → vite dev server on `http://localhost:5173/investment-dashboard/`.
- **Preview**: `npm run preview` → serves the built bundle.
- **Source**: `package.json`, `.agency/do.md`, `README.md`.
