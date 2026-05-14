# /do config

## Check command
`npm run typecheck` — TypeScript project-references typecheck, no emit.

## Documentation
Keep `README.md` in sync with user-facing changes.

## PR evidence

Required for any diff that touches user-visible UI (components, pages, styles, charts, dialogs, empty/error states, etc.). Skip with a note only when the diff is purely non-visual (data layer, build config, internal utilities with no UI surface).

The capture sub-agent should:

1. **Boot the dev server** in the background: `npm run dev`. Wait for Vite to print `Local: http://localhost:<port>/` and capture the port — Vite picks the next free one if 5173 is taken, so don't hard-code.
2. **Use the Playwright MCP browser tools** (`mcp__plugin_playwright_playwright__*`) to drive a real browser against the local dev server. Load schemas via `ToolSearch` first (`select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_take_screenshot,mcp__plugin_playwright_playwright__browser_console_messages,mcp__plugin_playwright_playwright__browser_resize,mcp__plugin_playwright_playwright__browser_close`).
3. **For each user-visible path the diff introduces or modifies**, capture:
   - A full-page screenshot in the default state (`browser_take_screenshot` with `fullPage: true` where supported).
   - Screenshots of meaningful interaction states (hover, focus, dialog open, error, empty, loading) where the diff affects them.
   - The accessibility snapshot from `browser_snapshot` for the affected region, so structural changes are recorded alongside the visual ones.
   - `browser_console_messages` output — paste the tail. Any new errors/warnings introduced by the diff are a verification failure, not an evidence caveat.
4. **Test at two viewports** for any layout-affecting change: desktop (1440×900) and mobile (390×844). Use `browser_resize` between captures.
5. **Tear down**: `browser_close`, then kill the dev server process.
6. **Host the screenshots so the PR comment can link them.** Upload each PNG as a GitHub release asset on a draft "evidence" release tagged with the PR number, then reference the asset URLs in markdown. Concretely:
   - `gh release create pr-evidence-<PR_NUMBER> --draft --notes "Evidence assets for PR #<PR_NUMBER>"` (idempotent — if it already exists, skip create and just upload).
   - `gh release upload pr-evidence-<PR_NUMBER> <file>.png --clobber` for each screenshot.
   - The asset URL is `https://github.com/gupta-ujjwal/investment-dashboard/releases/download/pr-evidence-<PR_NUMBER>/<file>.png`. Embed inline: `![desktop default](<url>)`.
7. **Return a single block of markdown** suitable for posting under `## Evidence`, structured as:

   ```md
   ### Routes exercised
   - `/` — dashboard root
   - `/holdings` — holdings table

   ### Desktop (1440×900)
   | Path | State | Screenshot |
   |------|-------|------------|
   | `/` | default | ![](https://.../home-desktop-default.png) |
   | `/` | empty | ![](https://.../home-desktop-empty.png) |

   ### Mobile (390×844)
   | Path | State | Screenshot |
   |------|-------|------------|
   | `/` | default | ![](https://.../home-mobile-default.png) |

   ### Console
   No new errors or warnings.
   <or: paste the offending lines and explain>

   ### Accessibility snapshot (excerpt)
   <relevant portion of browser_snapshot output, fenced>
   ```

The sub-agent must not post the comment itself — only return the markdown. The /do `evidence` step wraps it in the `## Evidence` heredoc and posts via `gh pr comment`.
