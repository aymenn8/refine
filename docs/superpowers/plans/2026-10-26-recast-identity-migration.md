# Recast Identity Migration (Phase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recast runs as `com.drummerms.recast` and, on first launch, carries over everything an existing Refine install saved, without touching or deleting the old copy.

**Architecture:** A new `identity_migration` module copies `~/Library/Application Support/com.refine` into a staging folder next to the new app-data folder, then renames it into place. It runs as the first statement of `setup`, before anything reads `settings.json`. The Keychain service stays `com.refine`, so saved keys keep resolving by the ids in the copied `settings.json`.

**Tech Stack:** Tauri 2 (Rust std::fs; `fs::copy` uses APFS clones on macOS, so large models copy cheaply).

**Spec:** `RECAST_HANDOFF.md` section 4; bundle ID `com.drummerms.recast` chosen by Mike in chat on 2026-10-26.

## Global Constraints

- New identifier: `com.drummerms.recast`. Legacy identifier: `com.refine`.
- Keychain `SERVICE_NAME` stays `com.refine`; secrets are never read, rewritten or logged by the migration.
- Never delete or modify anything under the legacy folder.
- Copy only when the new folder is missing or empty. Never overwrite existing Recast data.
- No new dependencies.

## Review Focus

1. Crash mid-copy (staging folder left behind): the next launch must retry cleanly. Test `leftover_staging_is_replaced`.
2. Copy error (disk full, permission): no half-made new folder, old data untouched, app does not start on blank settings. Test `failed_copy_leaves_no_target`, plus an alert-and-quit path in `lib.rs`.
3. Upgrade run twice: the second run changes nothing. Test `second_run_is_a_no_op`.
4. Fresh install (no Refine data): nothing is created. Test `no_legacy_data_does_nothing`.
5. Keychain access from the new bundle ID may show a macOS "allow access" prompt; Accessibility and Automation must be granted again. Manual QA, release notes.

---

### Task 1: Migration module (TDD)

**Files:** Create `src-tauri/src/identity_migration.rs`; modify `src-tauri/src/lib.rs` (`mod identity_migration;`).

**Interfaces — Produces:**
- `pub const LEGACY_IDENTIFIER: &str = "com.refine";`
- `pub enum Outcome { NoLegacyData, TargetHasData, Migrated }` (Debug, PartialEq)
- `pub fn migrate_app_data(legacy: &Path, target: &Path) -> std::io::Result<Outcome>`
- `pub fn run(app: &tauri::AppHandle) -> Result<Outcome, String>` (resolves `app_data_dir()`, legacy = sibling `com.refine`)

- [ ] Tests (temp dirs under `std::env::temp_dir()`): `no_legacy_data_does_nothing`, `copies_nested_files_byte_for_byte` (settings.json, clipboard/history.db, models/a/b.bin), `legacy_is_untouched`, `second_run_is_a_no_op`, `existing_target_data_is_never_overwritten`, `empty_target_dir_is_filled`, `leftover_staging_is_replaced`, `failed_copy_leaves_no_target` (unreadable legacy file → Err, no target, no staging).
- [ ] Run `cargo test identity_migration` → FAIL; implement; → PASS.

### Task 2: Wire it in and switch the identifier

**Files:** `src-tauri/src/lib.rs` (first lines of `.setup`), `src-tauri/tauri.conf.json` (`identifier`), `src-tauri/src/fork_safety_tests.rs`, `src-tauri/src/model.rs:111` comment.

- [ ] Update `identity_stays_on_com_refine_until_migration` → `identity_is_recast_and_keychain_stays_legacy`: identifier `com.drummerms.recast`; `SERVICE_NAME` still `com.refine`; `LEGACY_IDENTIFIER == "com.refine"`; `lib.rs` calls `identity_migration::run` before `load_shortcut_from_store`.
- [ ] In setup: on `Err(reason)`, log it, show an `osascript` alert ("Recast couldn't copy your Refine settings … Your Refine data is untouched …"), then `std::process::exit(1)`.

### Task 3: Verify

- [ ] `pnpm build`, `pnpm test`, `cargo test` pass.
- [ ] Bundled debug build: first launch copies `com.refine` → `com.drummerms.recast` (modes, stats, keys work); second launch no-op; legacy folder unchanged (checksums before/after).
- [ ] `detect_changes`, commit on `feat/recast-identity`.
