# Detected commands

- **Build**: `npm run build` (`tsc -b && vite build`)
- **Format**: skip — no formatter detected (no prettier/eslint/editorconfig)
- **Lint / typecheck**: `npm run typecheck` (`tsc -b --noEmit`)
- **Test**: `npm run test:run` (`vitest run`); scope with `npx vitest run <pattern>`
- **Source**: `package.json` scripts
