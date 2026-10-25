# Claude Code + Opus 5.5 — Refine Fork Setup

**Repository:** https://github.com/Drummerms/refine  
**Upstream:** https://github.com/aymenn8/refine  
**Purpose:** Develop your personalized, rebranded macOS text-rewriting app, with a DeepSeek API key **inside the app** and Claude Opus 5.5 **as the coding assistant**.

> Status: This repository contains Claude Code project instructions, shared settings, three read-only reviewers, and a start-audit skill. They configure Claude Code; they do **not** implement DeepSeek or rebrand the application yet.

## 1. Files included in the fork

| File | Purpose |
| --- | --- |
| `CLAUDE.md` | Persistent architecture, workflow, safety, and implementation requirements |
| `.claude/settings.json` | Pins Claude Code to `claude-opus-5-5` at `medium` effort and prompts for approval on selected risky Git operations |
| `.claude/agents/deepseek-provider-reviewer.md` | Independent read-only provider and credential review |
| `.claude/agents/macos-workflow-reviewer.md` | Independent read-only global shortcut, clipboard, panel, and paste-back review |
| `.claude/agents/release-safety-reviewer.md` | Independent read-only branding, license, updater, signing, and privacy review |
| `.claude/skills/phase-1-audit/SKILL.md` | Explicit `/phase-1-audit` command: inspect, validate, report, then stop |
| `CLAUDE_CODE_SETUP.md` | This guide, also offered as a standalone downloadable Markdown file |

## 2. One-time macOS requirements

In Terminal, inspect what is already installed:

```bash
claude --version
git --version
node --version
pnpm --version
cargo --version
xcode-select -p
```

Refine's README calls for macOS, Node.js 20+, pnpm, the Rust toolchain, and Xcode Command Line Tools. On a Mac where they are missing:

- Claude Code (Anthropic's current recommended native installer): `curl -fsSL https://claude.ai/install.sh | bash`
- Or Homebrew: `brew install --cask claude-code`
- Xcode Command Line Tools: `xcode-select --install`
- Node.js: https://nodejs.org/ (install Node 20 or newer)
- pnpm: https://pnpm.io/installation
- Rust: https://rustup.rs/

**Security:** Review install instructions and the URL before piping downloaded scripts into a shell. You do not need to reinstall working tools.

## 3. Clone your fork and enter a feature branch

```bash
mkdir -p ~/Developer
cd ~/Developer
git clone https://github.com/Drummerms/refine.git
cd refine
git remote add upstream https://github.com/aymenn8/refine.git
git switch -c feature/brand-deepseek
git remote -v
```

`origin` is your writable fork; `upstream` is the original repository. If `upstream` already exists, skip `git remote add upstream`. Never merge upstream changes automatically.

## 4. Establish the app baseline

```bash
pnpm install --frozen-lockfile
pnpm build
(cd src-tauri && cargo check)
pnpm tauri dev
```

These are local checks, not a claim that the current app is fully functional. First Rust builds can download and compile many packages. `pnpm tauri dev` requires macOS GUI access. Allow only the macOS Automation/Accessibility permissions you intend to grant when prompted, and test the app against a disposable text document first.

## 5. Start Claude Code with Opus 5.5

Open a second Terminal tab in the same project:

```bash
cd ~/Developer/refine
claude
```

The repository's `.claude/settings.json` selects `claude-opus-5-5`, with `medium` effort. Within Claude Code:

- `/status` verifies the loaded model and settings files.
- `/context` verifies that `CLAUDE.md` is loaded.
- `/agents` displays and explains your registered subagents.
- `/effort high` switches to deeper reasoning for a complex fix or security review; `/effort medium` returns to the default for simpler engineering work.
- `/phase-1-audit` runs the **first task**, gathering code and build evidence without editing product source files.

Alternatively, for a one-off explicit selection, launch `claude --model claude-opus-5-5 --effort medium`.

**Important:** A repository setting is not a license or entitlement. Claude Code needs a supported Claude login/account or Anthropic API configuration with access to this model.

### Keep Claude Opus separate from your DeepSeek key

**Claude Code uses Anthropic Opus 5.5 to write code. The finished app uses your DeepSeek key to rewrite text.**

Do not set `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` or `ANTHROPIC_MODEL=deepseek-flash` for this development session; that would redirect Claude Code away from Opus 5.5. Do **not** put any credentials in `CLAUDE.md`, repository settings, scripts, or Git history. Enter your DeepSeek key only into the app's Keychain-backed provider UI after Claude implements the integration.

## 6. First action: read-only baseline audit

At the Claude Code prompt, run:

```text
/phase-1-audit
```

The skill asks Opus 5.5 to:
1. Read and trace the actual fork.
2. Run feasible frontend/Rust validation commands and record failures.
3. Delegate **three independent, read-only reviews**.
4. Identify precise change locations for provider routing, hotkeys, clipboard/paste-back, branding, and releases.
5. Propose a phased implementation plan with tests and approval points.
6. Stop before source edits.

If you want to issue the request as ordinary chat instead of invoking the skill, paste:

> Read CLAUDE.md and CLAUDE_CODE_SETUP.md. Run the Phase 1 audit only. Delegate read-only reviews to the three project reviewers. Run baseline checks that are available on this Mac; report verified facts, blockers, exact affected files, and an ordered implementation plan. Do not change application source, commit, push, publish, or alter code signing. Stop for my approval.

## 7. Next action: implementation prompt (after reviewing the audit)

Replace the bracketed brand values **when you know them**. If you have not chosen a name yet, tell Claude to complete the DeepSeek/shortcut fixes first and defer identity changes.

```text
We have completed Phase 1. Work on feature/brand-deepseek, not main.

Brand:
- Display name: [YOUR BRAND NAME]
- macOS bundle ID: [com.yourcompany.product]
- Logo: [path to artwork, or defer icon changes]
- Default replace behavior: preview first, replace only on explicit action

Implement in individually validated phases with focused commits:
A. Implement an OpenAI-compatible provider with a DeepSeek preset
   (https://api.deepseek.com, deepseek-flash; optional deepseek-v4-pro).
   Store API keys in macOS Keychain. Do not send the DeepSeek key to
   api.openai.com. Keep existing providers working and add routing tests.
B. Fix the shortcut recorders and Rust shortcut registration for
   Control+Space. Handle macOS conflicts, empty selection, permission
   errors, focus, and clipboard restoration. Validate with manual tests.
C. Preserve and test multiple persistent user-created rewrite modes,
   mode selection, result preview, copying, and safe in-place replacement.
D. Rebrand the app identity, assets, names, menus, and Help/About
   materials; retain MIT attribution and safely migrate local data.
E. Remove the original upstream updater from branded builds. Leave
   auto-update disabled until my own release feed and signing keys exist.

Before modifying each phase, tell me the exact files and risks and
request approval. Run pnpm build, (cd src-tauri && cargo check),
relevant automated tests, and any feasible macOS manual checks.
Use the dedicated read-only reviewers after relevant changes.
Never publish, push, use real production secrets, enable telemetry,
or sign/notarize without my explicit authorization. Report test
results and remaining risks after each phase.
```

## 8. Important source findings in the fork (verify again locally)

| Code location | Current concern | Desired outcome |
| --- | --- | --- |
| `src-tauri/src/providers.rs` | Hardcoded OpenAI chat and credential-check URLs | Provider-specific OpenAI-compatible endpoint for DeepSeek |
| `src-tauri/src/credentials.rs` | Current Keychain service is `com.refine` | New service with a deliberate migration path |
| `src/settings/ModelsLibraryTab.tsx` | Only OpenAI, Anthropic, Ollama shown | DeepSeek preset or custom compatible provider |
| `src/settings/ConfigTab.tsx` / `QuickActionsTab.tsx` | Shortcut recorder folds Control into Command and does not record Space | Correct `Control+Space` encoding |
| `src-tauri/src/window.rs` | Selected text captured by simulated Cmd+C; clipboard restored as text | Reliable capture while preserving clipboard content |
| `src-tauri/src/commands.rs` | Paste-back via simulated Cmd+V | Confirm target app/selection and safe replacement |
| `src-tauri/tauri.conf.json` | `com.refine` ID and `aymenn8/refine` updater | Independent app ID and disabled/replaced updater before release |
| `scripts/release.sh` | Upstream-branded defaults and artifact names | Own release identity and verified signing flow |

The features above are **source-code findings**, not verified macOS runtime behavior. macOS keyboard shortcuts may be reserved by Input Sources under System Settings → Keyboard → Keyboard Shortcuts. Automation and Accessibility permissions may be required for selected-text capture and replacement.

## 9. Safety and version-control rules

- Do not run Claude Code in `--dangerously-skip-permissions` mode.
- Work on a feature branch; inspect `git status --short` before/after changes.
- Keep the original `LICENSE` and notices.
- Do not paste DeepSeek keys into Claude or any committed file.
- Request approval for destructive commands, pushes, tagging, signing, releases, updater changes, and credential migration.
- After passing tests and review, commit only the relevant files in logical units. Keep main and upstream untouched unless explicitly requested.
- Build locally with `pnpm tauri build --bundles app` once implementation and QA are complete; signed public distribution is a separate project.

## Official documentation

- Claude Code overview/install: https://code.claude.com/docs/en/overview
- Project instructions / CLAUDE.md: https://code.claude.com/docs/en/memory
- Settings scopes and precedence: https://code.claude.com/docs/en/settings
- Model and effort configuration: https://code.claude.com/docs/en/model-config
- Subagents: https://code.claude.com/docs/en/sub-agents
- Skills: https://code.claude.com/docs/en/skills
- Claude Opus 5.5: https://platform.claude.com/docs/en/models/opus-5-5/overview
- DeepSeek API endpoints and model names: https://api-docs.deepseek.com/quick_start/agent_integrations/

*Prepared for the Drummerms/refine fork, October 2026.*
