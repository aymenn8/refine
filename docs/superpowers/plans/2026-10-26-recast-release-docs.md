# Recast Release Path and Docs (Phase 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `scripts/release.sh` can produce a signed, notarized Recast DMG without any updater pieces, the app carries its MIT notice, and the docs and agent guidance describe Recast.

**Architecture:** Strip the updater steps out of the existing script (keep its prepare → status → publish flow and its typed-repo publish confirmation), derive artifact names from `productName`, ship `LICENSE` as a bundle resource, and pin all of it with source-scanning tests in `fork_safety_tests.rs`.

**Tech Stack:** Bash, Tauri 2 bundle config, Rust tests.

**Spec:** `RECAST_HANDOFF.md` sections 5–6; Phase 0/2/4 review findings (2026-10-26).

## Global Constraints

- Updater stays disabled: no `plugins.updater`, no `createUpdaterArtifacts`, no `TAURI_SIGNING_*`, no `latest.json`, no `.app.tar.gz`.
- Apple signing/notarization flow and the typed-repo confirmation before `gh release create` stay as they are.
- Artifact names: `<productName>_<version>_<aarch64|x86_64>.dmg` (today `Recast_…`).
- Keep crate name `refine` (version sync reads it from `Cargo.lock`), `REFINE_POSTHOG_*`, `LICENSE` text unchanged.
- Never run `prepare`, `publish` or `all` with real credentials; no signing or uploading in this phase.

## Review Focus

1. Running `prepare` with no credentials must stop before it edits versions or builds. Manual check: exit non-zero, `git status` clean.
2. `publish` with an old manifest that still lists `TAR_*`/`SIG_*` keys must still work (extra keys ignored).
3. `productName` with a space would break unquoted paths: the derived name is quoted everywhere.
4. `.context/release-state/` holds local paths and notary IDs: ignored by git.
5. The LICENSE file lands in `Recast.app/Contents/Resources/LICENSE`. Manual check on a debug bundle.

---

### Task 1: Guard tests

**Files:** `src-tauri/src/fork_safety_tests.rs`

- [ ] Extend `tauri_config_has_no_updater_plugin`: `/bundle/createUpdaterArtifacts` is absent.
- [ ] `release_script_has_no_updater_steps`: `scripts/release.sh` contains none of `TAURI_SIGNING`, `check-updater-signing-key`, `tar.gz`, `latest.json`, `Refine_`, `refine-build`; contains `productName`. `scripts/.env.example` contains no `TAURI_SIGNING`.
- [ ] `license_ships_inside_the_app`: `/bundle/resources/../LICENSE == "LICENSE"`.
- [ ] `cargo test fork_safety` → the new tests FAIL.

### Task 2: Release script

**Files:** `scripts/release.sh`, delete `scripts/check-updater-signing-key.py`, `scripts/.env.example`, `.gitignore`.

- [ ] Add `app_name()` (reads `productName` from `src-tauri/tauri.conf.json` via node).
- [ ] `prepare`: require only `APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID`; drop the key check; `CARGO_TARGET_DIR` → `~/.cache/recast-build/target`; require only the DMG; manifest writes `DMG_*` and `SUBMISSION_*`.
- [ ] `publish`: copy only the DMG as `"$(app_name)_${version}_${suffix}.dmg"`; drop `latest.json`, the platform map and `platform_from_target`; `UPLOAD_ORDER.txt` lists the DMGs.
- [ ] `.env.example`: remove the updater key block. `.gitignore`: add `.context/`.

### Task 3: License in the bundle

**Files:** `src-tauri/tauri.conf.json` (`bundle.resources: {"../LICENSE": "LICENSE"}`).

### Task 4: Docs and agent guidance

**Files:** `README.md` (body: Recast, release section, updater note), `CLAUDE.md` (Refine Fork section: brand, bundle ID, Keychain, release facts; GitNexus section untouched), `.claude/agents/*.md` (role line names Recast), `src-tauri/Cargo.toml` (`description`, `authors`).

### Task 5: Verify

- [ ] `bash -n scripts/release.sh`; `./scripts/release.sh --help`.
- [ ] `./scripts/release.sh prepare --version 9.9.9 --release-repo Drummerms/refine` with no credentials → exits non-zero at the credential check; `git status --short` unchanged.
- [ ] `cargo test`, `pnpm build`, `pnpm test` pass.
- [ ] `pnpm tauri build --debug --bundles app` → `Recast.app/Contents/Resources/LICENSE` matches `LICENSE`.
- [ ] Release-safety review, `detect_changes`, commit on `feat/recast-release`.
