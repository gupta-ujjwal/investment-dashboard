# Detected commands

- **Build**: `npm run build` (`tsc -b && vite build`)
- **Format**: skip — no formatter detected (no prettier/eslint config, no format script)
- **Lint / typecheck**: `npm run typecheck` (`tsc -b --noEmit`)
- **Test**: `npm run test:run` (`vitest run`)
- **Source**: package.json `scripts`, `.github/workflows/deploy.yml` (CI runs only `npm run build`)
