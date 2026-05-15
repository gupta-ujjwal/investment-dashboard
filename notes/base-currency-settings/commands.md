# Detected commands

- **Build**: `npm run build` (`tsc -b && vite build`)
- **Typecheck-only (faster gate)**: `npm run typecheck` (`tsc -b --noEmit`)
- **Format**: skip — no formatter detected (no prettier/eslint configured, no `format` script)
- **Lint**: skip — no eslint configured
- **Test**: `npm run test:run` (vitest one-shot; `npm test` is watch mode)
- **Dev server**: `npm run dev`
- **Source**: `package.json` scripts + `README.md` § "Local development"

Test files live next to source as `*.test.ts` / `*.test.tsx` (vitest config `include: src/**/*.test.ts`); fixtures at `tests/fixtures/`.
