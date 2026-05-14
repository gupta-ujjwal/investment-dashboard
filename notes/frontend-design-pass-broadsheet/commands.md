# Detected commands

- **Build**: `npm run build` (runs `tsc -b && vite build`)
- **Format**: skip — no formatter configured in package.json (no prettier, no biome).
- **Lint / typecheck**: `npm run typecheck` (runs `tsc -b --noEmit`).
- **Test**: `npm run test:run` (runs `vitest run`); design pass is `.tsx` + `.css` only, no unit tests to add — but the existing parser/diff suite must still pass.
- **Source**: `package.json` (scripts section).
