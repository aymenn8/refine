# Safe Selection Capture and Paste-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening the panel or running a quick action never changes or loses what the user had on the clipboard (text, rich text, images, files), works while Control is still held after ⌃Space, reports permission problems instead of opening empty, and never pastes into the wrong app. Refine's own clipboard writes are invisible to clipboard managers such as Paste, and Refine's built-in clipboard history becomes an opt-in choice made during first-run setup (default off).

**Architecture:** A new `pasteboard.rs` snapshots and restores every item and type on the macOS general pasteboard (legacy `objc`/`cocoa` crates, like `native_mac.rs`) and reads the live modifier-key state. A new `selection.rs` holds the two flows as small functions over injected operations, so their ordering guarantees are unit-tested with fakes: `capture_with` (wait for modifiers to release → ⌘C → wait for the pasteboard to change → read → restore) and `guarded_paste_with` (write → activate target → wait until it is frontmost, else refuse → ⌘V → restore). `window.rs`, `commands.rs` and `quick_actions.rs` call the real versions. Frontend: auto-copy defaults to off, capture errors show in the panel, results that arrive after the panel closed are dropped.

**Tech Stack:** Rust (Tauri 2, objc 0.2 / cocoa 0.26, core-graphics), React 19 + TypeScript.

**Spec:** `CLAUDE.md` → "Target UX" (select text → ⌃Space → panel already populated → preview → copy or safely replace), "Keep mode management persistent and simple. Never erase user modes or clipboard contents as a side effect.", "Selection/paste-back must fail safely if the original app loses focus or selection is no longer valid.", "Technical requirements" (audit rich-text/file clipboard restoration, timing, permissions, secure text fields, race conditions; paste-back requires correct previous-app focus, cancellation, failure messages). `CLAUDE_CODE_SETUP.md` §7: "Default replace behavior: preview first, replace only on explicit action". Phase 1 audit findings (window.rs:251-285, 296-311; commands.rs:232-296, 335-389; quick_actions.rs:184-264; App.tsx:221-231, 248-251, 371-382) and the phase 4 reviews (held Control turns ⌘C into ⌃⌘C).

## Global Constraints

- No new dependencies. Native calls use the crates already in `Cargo.toml` (`objc`, `cocoa`, `core-graphics`); `CGEventSourceFlagsState` may be declared with `extern "C"` and `#[link(name = "CoreGraphics", kind = "framework")]`.
- Keystrokes stay as today (`osascript` → System Events `keystroke "c"/"v" using command down`).
- Timings: modifier-release wait ≤ 500 ms, pasteboard-change wait ≤ 500 ms, target-frontmost wait ≤ 1000 ms, all polled every 10 ms; restore after paste 500 ms after ⌘V.
- The panel's flow is unchanged: preview first; Enter pastes (the explicit replace action). Auto-copy stays a setting, default **off** (a stored `true` is respected).
- Never log selected text, clipboard contents or results.
- Refine's own clipboard writes (restoring the user's clipboard, writing a result to paste) carry the marker type `org.nspasteboard.TransientType` (empty data), so clipboard managers like Paste ignore them.
- Clipboard history setting: store key `clipboardHistoryEnabled`; anything other than `true` (including unset) means off. Existing saved history is never deleted automatically.
- Before editing any existing function, run GitNexus `impact`; run `detect_changes` before each commit. Branch `feat/safe-capture-paste` from `main`.

## Review Focus

1. Clipboard holds an image, a file from Finder, or rich text from Notes when the panel opens or a quick action runs → afterwards every type is back byte-for-byte (Task 1 round-trip test with RTF + plain text + a custom type; manual check with an image and a Finder file).
2. User is still holding ⌃ (or ⌘⇧) when capture starts → ⌘C is sent only after release, or after 500 ms (Task 2 `capture_waits_for_modifier_release` with a fake).
3. Accessibility / Automation not granted → the panel opens with a clear message, not an empty box (Task 2 `capture_reports_keystroke_failure` + Task 3 payload + Task 4 UI).
4. User switches apps (or the original app quit) before pressing Enter / before a quick action finishes → nothing is pasted, the clipboard is restored, and a toast says why (Task 2 `paste_refused_when_target_not_frontmost`).
5. User closes the panel while a rewrite is running → the late result is dropped: no clipboard write, no panel update (Task 4, manual check).
6. Clipboard history off (the default) → nothing is recorded and ⌘⇧V is not registered, so Paste's shortcut works (Task 5 `history_is_off_unless_enabled`, manual check); when on, password-manager copies are skipped (Task 5 `skips_concealed_and_transient_copies`).

---

### Task 1: Pasteboard snapshot and restore

**Files:**
- Create: `src-tauri/src/pasteboard.rs` (+ `mod pasteboard;` in `src-tauri/src/lib.rs`)

**Interfaces:**
- Produces (macOS; `#[cfg(target_os = "macos")]`, `#![allow(deprecated)]` like native_mac.rs):
  - `pub struct PasteboardSnapshot(Vec<Vec<(String, Vec<u8>)>>)` — per pasteboard item, its (type, data) pairs in order. Derives `Clone, PartialEq`; implements `Debug` by hand as `"PasteboardSnapshot(<n> items)"` (contents are user data and must never be printed; `Debug` exists only so test assertions compile).
  - `pub fn snapshot_general() -> PasteboardSnapshot`, `pub fn restore_general(snapshot: &PasteboardSnapshot)`, `pub fn general_change_count() -> i64`, `pub fn read_general_text() -> String` (plain-text type; empty if none).
  - `pub fn modifiers_held() -> bool` — `CGEventSourceFlagsState(kCGEventSourceStateHIDSystemState)` has any of Command, Control, Option, Shift.
  - `pub const TRANSIENT_TYPE: &str = "org.nspasteboard.TransientType";` — `restore` adds it (empty data) to the first item unless already present; `pub fn write_general_text_transient(text: &str)` writes plain text plus the marker; `pub fn general_types() -> Vec<String>` (types of the first item, for Task 5).
  - Internal `unsafe fn snapshot(pb: id) -> PasteboardSnapshot` / `unsafe fn restore(pb: id, s: &PasteboardSnapshot)` used by the general versions and the tests. Restore = `clearContents`, then (if non-empty) one `NSPasteboardItem` per saved item with `setData:forType:` per pair, then `writeObjects:`. Wrap work in `objc::rc::autoreleasepool` (these run on background threads).

- [ ] **Step 1: Write the failing tests** (`#[cfg(all(test, target_os = "macos"))]`), each on a private pasteboard from `pasteboardWithUniqueName` (released with `releaseGlobally` at the end), never the user's general pasteboard:

```rust
// round_trips_every_item_and_type: write one item with "public.utf8-plain-text" = b"hello",
//   "public.rtf" = b"{\\rtf1 hello}", "com.example.custom" = [0,159,146,150] (non-UTF-8);
//   s1 = snapshot(pb); clearContents; restore(pb, &s1); the restored item holds those 3 pairs unchanged
//   plus (TRANSIENT_TYPE, []) — and restoring that again doesn't add a second marker.
// transient_text_write_is_marked: write_text_transient(pb, "result") → plain text "result" and TRANSIENT_TYPE present.
// round_trips_multiple_items: two items (b"one", b"two" as plain text) → restored snapshot has 2 items in order.
// restoring_an_empty_snapshot_leaves_the_pasteboard_empty: snapshot of a cleared pasteboard; write b"x"; restore → snapshot has 0 items.
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test --lib pasteboard)` — Expected: compile error (module/functions missing).
- [ ] **Step 3: Implement** `pasteboard.rs`.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test --lib)` — Expected: all pass (4 new).
- [ ] **Step 5: Commit** `git add docs/superpowers/plans/2026-10-25-safe-capture-paste.md src-tauri/src/pasteboard.rs src-tauri/src/lib.rs && git commit -m "feat: snapshot and restore every type on the clipboard"`

### Task 2: Capture and paste flows with tested ordering

**Files:**
- Create: `src-tauri/src/selection.rs` (+ `mod selection;` in lib.rs)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `pub fn wait_until(timeout: Duration, poll: Duration, mut done: impl FnMut() -> bool) -> bool` — true as soon as `done()`; false after `timeout`.
  - `pub struct CaptureOps<S> { snapshot, restore, modifiers_held, change_count, send_copy, read_text }` — boxed or generic `FnMut`s; `send_copy: FnMut() -> Result<(), String>`.
  - `pub fn capture_with<S>(ops: CaptureOps<S>, timings: Timings) -> Result<String, String>`:
    1. `snap = snapshot()`; 2. `wait_until(!modifiers_held(), modifier_wait)`; 3. `before = change_count()`; 4. `send_copy()?` (error returned, nothing to restore); 5. if `!wait_until(change_count() != before, change_wait)` → `Ok(String::new())` (nothing selected; clipboard untouched); 6. `text = read_text()`; 7. `restore(&snap)`; 8. `Ok(text)`.
  - `pub struct PasteOps<S> { snapshot, write_text, activate_target, target_is_frontmost, send_paste, restore, settle }` (`settle` = sleep before restore).
  - `pub fn guarded_paste_with<S>(ops: PasteOps<S>, text: &str, timings: Timings) -> Result<(), String>`: `snap = snapshot()`; `write_text(text)?`; `activate_target()`; if `!wait_until(target_is_frontmost(), frontmost_wait)` → `restore(&snap)`, `Err(NOT_FRONTMOST)`; `send_paste()` — on error `restore` then return it; `settle()`; `restore(&snap)`; `Ok(())`.
  - `pub struct Timings { modifier_wait, change_wait, frontmost_wait, poll: Duration }` with `Timings::default()` = the Global Constraints values; tests use 1–20 ms.
  - Fixed messages: `pub const NOT_FRONTMOST: &str = "Couldn't switch back to the original app — nothing was pasted."`; keystroke failure (used by the real ops in Task 3): `"Refine couldn't send keystrokes. Allow it in System Settings → Privacy & Security → Accessibility (and Automation → System Events)."`.
  - Real wrappers: `pub fn capture_selection() -> Result<String, String>` and `pub fn paste_into_previous_app(text: &str) -> Result<(), String>` (write = `pasteboard::write_general_text_transient`; target = `native_mac::previous_app_bundle_id()`; frontmost check compares `native_mac::get_frontmost_app_info().bundle_id`; activation = `native_mac::activate_previous_app()`; keystrokes via `osascript` with exit status checked; on macOS only, other targets return `Err`).
- Also produces in `native_mac.rs`: `pub fn previous_app_bundle_id() -> Option<String>`.

- [ ] **Step 1: Write the failing tests** (fakes record a `Vec<&'static str>` call log; `Timings` with tiny values):

```rust
// wait_until_returns_true_once_done / wait_until_times_out (≤ 50 ms test timeout)
// capture_restores_the_clipboard_after_reading: change_count goes 1 → 2 after send_copy; read_text "sel"
//   → Ok("sel"), log == ["snapshot","copy","read","restore"]
// capture_leaves_clipboard_alone_when_nothing_selected: change_count never changes → Ok(""), log has no "read"/"restore"
// capture_reports_keystroke_failure: send_copy Err("denied") → Err("denied"), no "restore"
// capture_waits_for_modifier_release: modifiers_held true for the first 3 polls, then false → "copy" happens after
//   the third modifiers check (log shows 3 "mods" before "copy")
// paste_writes_pastes_then_restores: frontmost true → Ok, log == ["snapshot","write","activate","paste","settle","restore"]
// paste_refused_when_target_not_frontmost: frontmost always false → Err(NOT_FRONTMOST), log has "restore", no "paste"
// paste_failure_still_restores: send_paste Err → Err, log ends with "restore"
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test --lib selection)` — Expected: compile error.
- [ ] **Step 3: Implement** `selection.rs` and `previous_app_bundle_id`.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test --lib)` — Expected: all pass.
- [ ] **Step 5: Commit** `git add src-tauri/src/selection.rs src-tauri/src/native_mac.rs src-tauri/src/lib.rs && git commit -m "feat: capture and paste flows that always restore the clipboard"`

### Task 3: Use the safe flows in the panel, paste-back and quick actions

**Files:**
- Modify: `src-tauri/src/window.rs` (`SpotlightPayload` :42-45, `capture_selected_text` :251-285, `capture_and_show` :290-~340), `src-tauri/src/commands.rs` (`paste_to_previous_app` :232-296, `paste_to_previous_app_keep_open` :305-~350), `src-tauri/src/quick_actions.rs` (`execute_quick_action` :170-~264; toast helpers :119-168), `src/App.tsx` (spotlight-open listener :313).

**Interfaces:**
- Consumes: Task 2 `capture_selection`, `paste_into_previous_app`, `NOT_FRONTMOST`.
- Produces: `SpotlightPayload { text, previous_app, capture_error: Option<String> }` (serialized `capture_error`); `pub(crate) fn show_error_toast(app: &AppHandle, message: &str)` in quick_actions.rs (= `show_toast` then `show_error_and_hide`).

- [ ] **Step 1: Implement:**
  - `capture_and_show`: decide "close" **before** capturing — if the main window is already visible (`get_webview_window("main")…is_visible()`), hide it on the main thread and return without storing the previous app or sending ⌘C. Otherwise store the previous app, then `selection::capture_selection()`; `Ok(text)` → payload text, `Err(msg)` → `capture_error: Some(msg)`, text empty. Remove `capture_selected_text`.
  - `paste_to_previous_app`: keep hiding the panels first, then `spawn_blocking(selection::paste_into_previous_app(&text))`; on `Err(msg)` call `show_error_toast(&app, &msg)` and return `Err(msg)`. `paste_to_previous_app_keep_open`: same call, keep its re-activation of Refine afterwards; errors returned (panel is still open to show them).
  - `execute_quick_action`: remember the frontmost app (`native_mac::get_and_store_frontmost_app()`), capture with `selection::capture_selection()` (empty → "No text selected" toast as today; `Err` → toast with the message), process, then `selection::paste_into_previous_app(&result)` (refusal or failure → `show_error_toast`). Delete the `pbcopy`/`pbpaste` marker flow and `get_clipboard_content` / `set_clipboard_content` if nothing else uses them.
  - App.tsx: in the `spotlight-open` listener, `setError(event.payload.capture_error ?? null)`; add `capture_error?: string | null` to the frontend `SpotlightPayload` type.
- [ ] **Step 2: Verify** `(cd src-tauri && cargo test && cargo check)` all pass, no warnings; `pnpm build` exit 0; `pnpm test` 8/8.
- [ ] **Step 3: Commit** `git add src-tauri/src/window.rs src-tauri/src/commands.rs src-tauri/src/quick_actions.rs src/App.tsx && git commit -m "fix: capture and paste without touching the user's clipboard"`

### Task 4: Frontend — auto-copy off by default, drop late results

**Files:**
- Modify: `src/App.tsx` (process handler :195-240, close/blur paths :250-262, :371-382), `src/settings/ConfigTab.tsx` (`autoCopyEnabled` default :36).

- [ ] **Step 1: Implement:**
  - Auto-copy only when the stored value is exactly `true` (`autoCopy === true`); ConfigTab's initial state `false`.
  - A `runIdRef` counter: the process handler takes `const runId = ++runIdRef.current` before invoking; `handleClose`, the blur-to-hide path and a new `spotlight-open` all increment it; after each `await` in the handler, if `runId !== runIdRef.current` return without touching state or the clipboard.
- [ ] **Step 2: Verify** `pnpm build` exit 0, `pnpm test` 8/8.
- [ ] **Step 3: Commit** `git add src/App.tsx src/settings/ConfigTab.tsx && git commit -m "fix: no automatic clipboard writes; ignore results after the panel closes"`

### Task 5: Clipboard history becomes an opt-in setup choice

**Files:**
- Modify: `src-tauri/src/clipboard.rs` (`start_clipboard_monitor` :622-670; new helpers, command, tests), `src-tauri/src/shortcuts.rs` (history shortcut registration in `reload_quick_action_shortcuts`; `update_history_shortcut`), `src-tauri/src/lib.rs` (startup history registration; register the new commands), `src/Onboarding.tsx` (new step after "Help improve Refine?"), `src/settings/ConfigTab.tsx` (toggle, hide the Clipboard History shortcut row when off, delete button), `src/App.tsx` + `src/spotlight/FooterBar.tsx` (hide the history button / ignore the in-panel toggle when off).

**Interfaces:**
- Consumes: Task 1 `pasteboard::general_types`, `TRANSIENT_TYPE`.
- Produces:
  - `pub fn history_enabled_from(value: Option<&serde_json::Value>) -> bool` (true only for `Some(Bool(true))`) and `pub fn clipboard_history_enabled(app: &AppHandle) -> bool` (reads `clipboardHistoryEnabled`).
  - `pub fn should_record(types: &[String]) -> bool` — false if any of `org.nspasteboard.ConcealedType`, `org.nspasteboard.TransientType`, `org.nspasteboard.AutoGeneratedType` is present.
  - Tauri commands `get_clipboard_history_enabled() -> bool` and `set_clipboard_history_enabled(enabled: bool)` (saves the key, then re-registers shortcuts via the same path as `reload_quick_action_shortcuts`, which registers the history shortcut only when enabled).
  - The monitor keeps running but records nothing while disabled, and skips `!should_record(&pasteboard::general_types())`.
  - Onboarding copy: title "Clipboard history?"; choice A (default, pre-selected) "No — I use another clipboard manager" / "Refine won't record what you copy, and ⌘⇧V stays free for apps like Paste."; choice B "Yes, keep a clipboard history" / "Refine remembers recent text you copy. Password-manager copies are skipped."
  - Settings: "Clipboard history" toggle in General; below it a "Delete saved clipboard history" button (calls `clear_clipboard_history`).

- [ ] **Step 1: Write the failing tests** (`clipboard.rs` tests):

```rust
// history_is_off_unless_enabled: history_enabled_from(None) == false; Some(&json!(false)) == false;
//   Some(&json!("true")) == false; Some(&json!(true)) == true
// skips_concealed_and_transient_copies: should_record(&["public.utf8-plain-text".into()]) == true;
//   with "org.nspasteboard.ConcealedType" added == false; with TRANSIENT_TYPE == false
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test --lib clipboard)` — Expected: compile error.
- [ ] **Step 3: Implement** the Interfaces (backend first, then Onboarding, Settings, panel). The history shortcut is registered at startup only when enabled.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test && cargo check)`, `pnpm build`, `pnpm test` — all pass.
- [ ] **Step 5: Commit** `git add src-tauri/src/clipboard.rs src-tauri/src/shortcuts.rs src-tauri/src/lib.rs src/Onboarding.tsx src/settings/ConfigTab.tsx src/App.tsx src/spotlight/FooterBar.tsx && git commit -m "feat: make clipboard history an opt-in setup choice"`

### Task 6: Branch verification, manual check, review

- [ ] `pnpm test`, `pnpm build`, `(cd src-tauri && cargo test && cargo check)`, `git diff --check main...` — all exit 0.
- [ ] Manual (`pnpm tauri dev`, the user): (1) copy an image, select text in Notes, ⌃Space → panel has the text; close; paste in Preview → the image. (2) Copy a file in Finder, run a quick action on selected text in TextEdit → text replaced; ⌘V in Finder pastes the file. (3) Hold ⌃ a little after ⌃Space → panel still filled. (4) Rewrite, switch to another app, press Enter → toast "Couldn't switch back…", nothing pasted, clipboard unchanged. (5) Close the panel mid-rewrite → nothing appears on the clipboard later. (6) With Paste running: run a rewrite and a quick action → Paste shows no Refine restore/result entries; ⌘⇧V opens Paste, not Refine; Settings shows Clipboard history off.
- [ ] GitNexus `detect_changes({scope: "compare", base_ref: "main"})`.
- [ ] Dispatch `macos-workflow-reviewer` and the whole-branch code reviewer; apply findings via superpowers:receiving-code-review; then superpowers:finishing-a-development-branch.
