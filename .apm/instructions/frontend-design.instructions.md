---
description: Route dashboard UI/UX work through the /frontend-design skill, and verify with Playwright MCP before the draft PR is marked ready.
---

## When this applies

Any task that adds, changes, or styles a visible element of the investment dashboard — components, pages, layouts, theming, copy in the UI, charts, tables, dialogs, empty states, error states. If the user will *see* the change in a browser, this rule is in scope.

Not in scope: pure data-layer work (storage, CSV parsing, FX conversion, analytics math) with no UI surface; build/tooling/config changes; backend-shaped utilities. If a task is ambiguous, treat the UI-touching half as in scope and the rest as normal.

## In `/talk`

When the conversation is about how a dashboard element should look, feel, or behave visually — before the user invokes `/do` — invoke the `frontend-design` skill (via the `Skill` tool, `skill: "frontend-design"`) to anchor the aesthetic direction. Surface its design thinking (typography, color/theme, motion, composition, atmosphere) as part of the discussion so the user can react to a concrete direction rather than an abstract sketch.

This sits alongside the existing talk-mode auto-review (hickey + lowy on any concrete proposal) — it does not replace it. Order: research first, then `/frontend-design` for design direction on UI work, then hickey + lowy on the resulting proposal.

## In `/do`

During the **implement** step, when the diff will touch user-visible UI, invoke the `frontend-design` skill (via the `Skill` tool) to set the aesthetic direction before writing component code. Match the design language already established in the dashboard rather than improvising per-component — consistency across the app is the priority once a direction is set.

### Playwright verification (gated on draft PR readiness)

UI changes are not done when `tsc` is green. They are done when the rendered output matches the intent. After **implement** and before the draft PR is marked ready-for-review:

1. Start the dev server (`npm run dev`) in the background.
2. Use the Playwright MCP browser tools (`mcp__plugin_playwright_playwright__browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_console_messages`, etc.) to:
   - Load each route/page the diff affects.
   - Exercise the golden path and at least one edge case per distinct user-visible path the diff introduces (matches the e2e-coverage rule in `/do`'s **implement** step).
   - Capture screenshots of the changed surface in its key states (default, hover/focus where relevant, empty/error/loading where applicable).
   - Read `browser_console_messages` and confirm no new errors or warnings were introduced by the change.
3. If anything looks wrong — visual regression in unrelated areas, console errors, broken interaction — fix it before proceeding. Don't paper over it with a screenshot caveat.
4. Tear down the dev server.

#### What gets committed to the repo

- **Screenshots** (PNGs) — yes, under `evidence-pr-issue-<N>/`. They are the artifact reviewers actually look at.
- **Console messages** — only as a *categorized summary* inside the evidence `README.md` (and in the `## Evidence` PR comment + the commit body). The summary names each error/warning class observed, whether it is new or pre-existing on `main`, and the conclusion ("no new errors introduced by this PR"). **Do not commit the raw console dump** (a `console-messages.txt` or any verbatim listener output) — it's dev-time scratch, ships noise into `main`, and the summary is what reviewers read. If the script that captures screenshots also writes the raw log, write it to a gitignored path (`notes/<topic-slug>/`, `.playwright-mcp/`, or similar), not to the evidence directory.
- **Capture scripts / IDB seeders / `.envrc` workarounds** — gitignored scratch. Keep under `notes/<topic-slug>/` for re-runnability; never ship to `main`. The evidence directory holds only the human-reviewable artifacts (PNGs + README).

The draft PR stays draft until this evidence is captured. The `evidence` step in `/do` (which reads `.agency/do.md`'s `## PR evidence` section) is the canonical place this runs — see that file for the exact capture-and-post procedure. The user marks the PR ready-for-review manually after reviewing the `## Evidence` comment.

### Why this ordering

The natural fit with `/do`'s existing flow: `commit` pushes the primary feature commit to a **draft** PR (nothing visible to reviewers, nothing mergeable), and `evidence` posts Playwright results under a `## Evidence` heading before `done`. The "don't ship unverified" guarantee comes from the draft-PR convention, not from blocking the first `git push`.

## Skill-call hygiene

- `/frontend-design` is a user-level skill (`~/.claude/skills/frontend-design/`). It's invoked via the `Skill` tool with `skill: "frontend-design"`. Do not try to spawn it as a sub-agent — it's a skill, not an agent.
- Playwright MCP tools are namespaced `mcp__plugin_playwright_playwright__*`. They are deferred — load schemas via `ToolSearch` with `select:mcp__plugin_playwright_playwright__browser_navigate,...` before first use in a session.
- If the Playwright MCP server isn't available in the current environment, say so and ask the user to enable it rather than silently skipping verification. Skipping verification on UI work and shipping a screenshot-less `## Evidence` comment defeats the purpose of this rule.
