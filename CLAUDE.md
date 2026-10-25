# GitNexus — Code Intelligence

This project is indexed by GitNexus as **refine**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

This section is hand-written. `.gitnexusrc` (`"skipAgentsMd": true`) stops `gitnexus analyze` from writing into this file, so edit it like any other section.

> Index stale? Run `node .gitnexus/run.cjs analyze --force` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze --force` (npm 11 crash → `npm i -g gitnexus`; #1939).

## GitNexus or claude-mem?

They answer different questions. Pick by what you need to know:

- **GitNexus — what the code is NOW.** A graph of the current checkout: symbols, callers and callees, execution flows, blast radius. Use it for "how does X work", "what calls this", "what breaks if I change it", and before every edit and commit (Always Do, below). It knows nothing about why a change was made.
- **claude-mem — what we DID and WHY.** Observations recorded from past Claude Code sessions: decisions, fixes, dead ends, what was tried. Use it (the `mem-search` skill) for "did we already solve this", "why is it built this way", "what happened last session". It can lag the code — verify any file, function, or flag it names against the checkout before relying on it.
- When both apply, claude-mem first for the history, then GitNexus to confirm what the code does today. For a plain lookup of a known file or string, neither — just search.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/refine/context` | Codebase overview, check index freshness |
| `gitnexus://repo/refine/clusters` | All functional areas |
| `gitnexus://repo/refine/processes` | All execution flows |
| `gitnexus://repo/refine/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

## Stale GitNexus index — reindex on sight

When anything reports the index is stale, **reindex immediately** — don't ask, don't defer, don't explain:

```bash
node .gitnexus/run.cjs analyze --force
```

`--force` is needed while GitNexus 1.6.12 is installed: the plain command can leave `Method` nodes with an empty id, and `impact` and `detect_changes` then return wrong results (GitNexus #3564). Drop it when that issue is fixed in the installed version.

`.gitnexusrc` keeps `analyze` out of `CLAUDE.md`. If a reindex ever changes this file, stop and say so — the config has stopped working. Report a reindex in **one line — "Reindexed GitNexus." — and nothing more.**

**A hint that comes back after the reindex.** The GitNexus MCP server counts "commits behind" from the commit it started at (#3564). A reindex does not clear that count; only a server restart does. When the hint appears again, run `node .gitnexus/run.cjs status`:

- `Indexed commit` equals `Current commit`: the index is current. Do not rebuild. Report one line: "GitNexus index is current (`<sha>` = HEAD); the server's stale hint remains."
- The two differ: reindex on sight.

# Refine Fork — Claude Code Project Instructions

## Mission
Maintain a personally branded macOS AI text-rewriting application based on the MIT-licensed Refine project. Implement the user's workflow with reliable selected-text capture, a floating prompt picker, multiple saved rewrite modes, DeepSeek BYOK, a preview, and optional in-place replacement. The brand name, logo, and final bundle identifier are NOT yet supplied: ask for them before committing permanent branded identifiers; use explicit placeholders in plans only.

## Repository facts (verify against working tree before edits)
- GitHub fork: https://github.com/Drummerms/refine
- Upstream: https://github.com/aymenn8/refine
- Frontend: React 19 / TypeScript / Vite / Tailwind in `src/`, especially `src/App.tsx` and `src/settings/`.
- Desktop: Tauri 2 / Rust in `src-tauri/`; macOS panels and keyboard automation.
- Backend: `src-tauri/src/providers.rs` (fixed OpenAI endpoint), `credentials.rs` (Keychain), `inference.rs`, `modes.rs`, `shortcuts.rs`, `window.rs`, `quick_actions.rs`, and `commands.rs`.
- Distribution and identity: `src-tauri/tauri.conf.json`, `src-tauri/icons/`, `scripts/release.sh`, `src/settings/AboutTab.tsx`, `src-tauri/src/tray.rs`.
- Existing upstream app ID is `com.refine`; updater refers to `aymenn8/refine`. Never ship the fork with the upstream updater configuration.

## Model separation
- Claude Code development agent: Anthropic Claude Opus 5.5 (`claude-opus-5-5`). Project starts at medium effort; use `/effort high` for difficult debugging and security reviews.
- Runtime model for the Refine app: DeepSeek using a user's own API key, independent of Claude Code authentication.
- Do not change `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`, or Claude Code authentication to DeepSeek; that would change which model develops the project.
- Never print, commit, log, or include a real API key in prompts, tests, screenshots, or docs.

## Target UX
1. Select text in a macOS application.
2. Press **Control + Space** (unless reserved by macOS; explain how to free it).
3. Open a floating panel already populated with the selected text.
4. Choose a saved rewrite mode, including custom tones, and run it.
5. Inspect, copy, or safely replace the original selected text.
- Keep mode management persistent and simple. Never erase user modes or clipboard contents as a side effect.
- Selection/paste-back must fail safely if the original app loses focus or selection is no longer valid.

## Technical requirements
- Add an **OpenAI-compatible custom endpoint** provider, with DeepSeek preset (`https://api.deepseek.com`, `deepseek-flash`; optionally `deepseek-v4-pro`), without breaking OpenAI or Anthropic providers.
- Existing `providers.rs` hardcodes `https://api.openai.com/v1/chat/completions` and validates keys against OpenAI. Route authentication and validation through the selected provider/URL so a DeepSeek key is NEVER sent to OpenAI.
- Validate custom endpoint URLs, block unsafe schemes and credential-bearing URLs; use HTTPS except explicitly loopback development targets if needed; don't leak keys in errors.
- Store keys in macOS Keychain; plan migration from `com.refine` before changing the Keychain service, app identifier, or settings data directory.
- Fix shortcut recorders in `src/settings/ConfigTab.tsx` and `src/settings/QuickActionsTab.tsx` to preserve actual Control vs Command, support Space, and report duplicate/OS shortcut collisions.
- The current selection capture uses AppleScript Cmd+C and the clipboard; audit rich-text/file clipboard restoration, timing, permissions, secure text fields, and race conditions.
- The current paste-back simulates Cmd+V; require correct previous-app focus, cancellation, failure messages, and manual macOS integration tests.
- Disable any fork build's upstream update checks **before** public builds. Future updates need independent feed, signing key, and release pipeline. Do not copy signing secrets.
- Keep the original MIT license and copyright attribution. A rebrand does not remove third-party notices.

## Working method
1. First run `/phase-1-audit` and establish the unmodified baseline; audit only, no product-code edits.
2. Inventory requirements and show a concise phased plan with exact files, risks, validation, and approval points.
3. Request the user's brand name, logo, bundle ID, and preferred preview/replace behavior only when those are necessary for the next edit. Do not invent a brand.
4. Implement one small phase at a time on a feature branch. Avoid blanket search/replace, large rewrites, and unrelated dependency updates.
5. For applicable changes: `pnpm install --frozen-lockfile` (if needed), `pnpm build`, `(cd src-tauri && cargo check)`, relevant tests, then manual macOS QA when available. Report command exit status and failures; never claim passing tests without running them.
6. Ask for approval before touching signing, releases, telemetry, publishing, any destructive migrations, labor-intensive refactors, merging upstream, pushing, or modifying main.
7. Use the three read-only project reviewers for backend/provider, macOS workflow, and release/branding risks. Integrate their findings; don't blindly accept them.
8. Before each substantive commit: inspect `git status --short` and `git diff --check`, report what changed, and commit only scoped files after authorization. Never force-push.
9. Keep a short phase log in your response: completed, tests run, known gaps, next recommended change. Do not claim future work was done.

## Useful commands
- `pnpm install --frozen-lockfile` — install locked JS dependencies.
- `pnpm build` — TypeScript and frontend build.
- `(cd src-tauri && cargo check)` — validate Rust.
- `pnpm tauri dev` — launch macOS dev app for manual checks.
- `pnpm tauri build --bundles app` — package an app only when ready.
- `git remote -v` / `git status --short` — inspect remotes and working tree.

See `CLAUDE_CODE_SETUP.md` for onboarding, first-session prompt, phases, and official sources.