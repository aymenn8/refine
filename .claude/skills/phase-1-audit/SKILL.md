---
name: phase-1-audit
description: Establish the clean, read-only Refine baseline and phased rebranding/DeepSeek implementation plan before changes.
disable-model-invocation: true
---
# Phase 1: Refine fork baseline audit (no product-code edits)

1. Read `CLAUDE.md`, `CLAUDE_CODE_SETUP.md`, current `README.md`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and relevant source files.
2. Inspect `git status --short`, `git remote -v`, current branch and recent commits. Record an existing dirty tree; never reset it.
3. Check platform/dependencies (`uname -m`, `node --version`, `pnpm --version`, `cargo --version`, `xcode-select -p`). Explain anything missing without attempting global installs.
4. If dependencies are available, run `pnpm install --frozen-lockfile`, `pnpm build`, and `(cd src-tauri && cargo check)`. Do not edit source files or lockfiles. Note that dependency installation/build artifacts may be generated.
5. Delegate independent read-only reviews to `deepseek-provider-reviewer`, `macos-workflow-reviewer`, and `release-safety-reviewer` when agent delegation is available.
6. Report with exact path/line references:
   - verified working features vs assumptions
   - compile/test results and any baseline blockers
   - critical DeepSeek endpoint, Control+Space, selection/clipboard, Keychain, and updater issues
   - ordered implementation phases, file lists, migration and verification strategies
   - information still needed from user (brand name, bundle ID, logo, replacement behavior).
7. STOP after the report and request approval before source modifications, branch pushes, releases, code signing, or destructive changes.

Use Claude Opus 5.5. Adopt medium effort for initial reconnaissance; use high effort for complex, high-risk analysis. Do not write product code during this skill.