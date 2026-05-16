# Detected commands

- **Build**: `npm run build` (`tsc -b && vite build`)
- **Format**: skip — no formatter configured
- **Lint / typecheck**: `npm run typecheck` (`tsc -b --noEmit`)
- **Test**: `npm run test:run` (`vitest run`)
- **Source**: package.json scripts; CI (.github/workflows/deploy.yml) runs only `npm run build`
