# Conventions in play for this slice

- `CLAUDE.md` — privacy-first: no third-party script / CDN fonts. Self-host via Fontsource ✓.
- `CLAUDE.md` — boring tech; no novel CSS approaches. Tailwind v4 `@theme` for design tokens is the documented v4 way to do tokens.
- `.claude/rules/frontend-design.md` — Playwright MCP evidence required before draft PR → ready-for-review.
- Commit messages follow conventional-commits (see recent `git log`): `feat(scope): ...`, `fix(scope): ...`, `chore(scope): ...`, `docs(scope): ...`.
- No new dependencies beyond Fontsource packages — anything else needs a separate conversation.
