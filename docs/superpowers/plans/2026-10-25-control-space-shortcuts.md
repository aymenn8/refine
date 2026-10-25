# Control+Space Shortcut Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user record and use Control+Space (or any Control/Command/Option/Shift + letter, digit or Space) as the open-panel, clipboard-history and quick-action shortcuts, with Control and Command kept distinct, a failed change never losing the working hotkey, and clear messages for conflicts and macOS-reserved combinations.

**Architecture:** One pure TypeScript module (`src/utils/shortcut.ts`) turns a keyboard event into the stored shortcut string from `event.code` (physical key) and the four modifier flags; both settings recorders and the panel's in-window matcher use it. Rust keeps `parse_shortcut` (it already accepts `Control`, `Command`, `Space`, A–Z, 0–9 and the legacy `CommandOrControl`), gains a pure `swap_shortcut` helper that registers the new shortcut before unregistering the old, and startup logs instead of aborting when a saved shortcut can't be registered.

**Tech Stack:** React 19 + TypeScript (tests with Node 24's built-in `node --test`, which runs `.ts` directly), Rust (Tauri 2, tauri-plugin-global-shortcut).

**Spec:** `CLAUDE.md` → "Target UX" step 2 ("Press Control + Space (unless reserved by macOS; explain how to free it)") and "Technical requirements" ("Fix shortcut recorders in `src/settings/ConfigTab.tsx` and `src/settings/QuickActionsTab.tsx` to preserve actual Control vs Command, support Space, and report duplicate/OS shortcut collisions"); Phase 1 audit findings (ConfigTab.tsx:186/221, QuickActionsTab.tsx:65/96, shortcuts.rs:141-147, lib.rs:201/206, App.tsx:407/412).

## Global Constraints

- No new dependencies. Frontend tests use `node --test` (Node 24.12, built-in TS type stripping); add `"test": "node --test src/**/*.test.ts"` to `package.json` scripts and `"exclude": ["src/**/*.test.ts"]` to `tsconfig.json` (test files import `node:test`, which the app's type-check has no types for).
- Stored shortcut format stays `Modifier+…+Key`, modifiers in the order `Command`, `Control`, `Shift`, `Alt`; key `A`–`Z`, `0`–`9` or `Space`. New recordings write `Command` / `Control`, never `CommandOrControl`.
- Saved shortcuts using the legacy `CommandOrControl` keep working (it means Command on macOS).
- Defaults stay `CommandOrControl+Shift+R` (open) and `CommandOrControl+Shift+V` (history). Changing the default to Control+Space is out of scope (macOS reserves it out of the box) — the user records it.
- Before editing any existing function, run GitNexus `impact` on it; run `detect_changes` before each commit.
- Commits go on branch `feat/shortcut-recorder` (from `main`).

## Review Focus

1. Shortcut saved by an older build as `CommandOrControl+Shift+V` → still recognized as the same shortcut as a new recording of ⌘⇧V (conflict checks, panel matcher) — Task 1 test `legacy_command_or_control_matches_command`.
2. Option+letter (macOS types `®`, `∑`…) and Shift+digit (`!`, `@`…) → recorded as `Alt+R`, `Shift+1` from the physical key — Task 1 tests.
3. User records a combination another app already holds → old hotkey keeps working and the error is shown in Settings — Task 3 `swap_shortcut` tests + Task 2 UI step.
4. User records ⌃Space or ⌘Space → a visible note says which macOS feature uses it and where to turn that off — Task 1 `reservedShortcutHint` tests.
5. A saved shortcut fails to register at launch → app still starts; the other shortcuts still register — Task 3 (startup change, manual check).

---

### Task 1: Shortcut helpers + frontend test runner

**Files:**
- Create: `src/utils/shortcut.ts`, `src/utils/shortcut.test.ts`
- Modify: `package.json` (scripts), `tsconfig.json` (exclude)

**Interfaces:**
- Produces (all exported from `src/utils/shortcut.ts`; `KeyInput = { code: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }`):
  - `shortcutFromKeyEvent(e: KeyInput): string | null` — `null` unless at least one modifier is held and `code` is `KeyA`–`KeyZ`, `Digit0`–`Digit9` or `Space`.
  - `modifierPrefix(e: KeyInput): string` — held modifiers only, e.g. `"Control+Shift"` (for live display while recording).
  - `normalizeShortcut(s: string): string` — canonical form: `CommandOrControl`/`Cmd`/`Super` → `Command`, `Ctrl` → `Control`, `Option` → `Alt`, modifiers reordered, key uppercased (`space` → `Space`).
  - `eventMatchesShortcut(e: KeyInput, shortcut: string): boolean` — exact match after normalizing both.
  - `reservedShortcutHint(shortcut: string): string | null` — exact copy:
    - `Control+Space` or `Control+Alt+Space` → `"macOS uses this to switch input sources. If it doesn't open the panel, turn it off in System Settings → Keyboard → Keyboard Shortcuts → Input Sources."`
    - `Command+Space` or `Command+Alt+Space` → `"macOS uses this for Spotlight. If it doesn't open the panel, turn it off in System Settings → Keyboard → Keyboard Shortcuts → Spotlight."`
    - anything else → `null`.

- [ ] **Step 1: Write the failing tests** in `src/utils/shortcut.test.ts` (`import { test } from "node:test"; import assert from "node:assert/strict"; import {…} from "./shortcut.ts";`). Helper `key(code, mods)` builds a `KeyInput`.

```ts
test("records Control+Space", () => assert.equal(shortcutFromKeyEvent(key("Space", { ctrlKey: true })), "Control+Space"));
test("keeps Command and Control distinct", () => {
  assert.equal(shortcutFromKeyEvent(key("KeyR", { metaKey: true, shiftKey: true })), "Command+Shift+R");
  assert.equal(shortcutFromKeyEvent(key("KeyR", { ctrlKey: true, shiftKey: true })), "Control+Shift+R");
  assert.equal(shortcutFromKeyEvent(key("KeyR", { metaKey: true, ctrlKey: true })), "Command+Control+R");
});
test("uses the physical key for Option and Shift+digit", () => {
  assert.equal(shortcutFromKeyEvent(key("KeyR", { altKey: true })), "Alt+R");
  assert.equal(shortcutFromKeyEvent(key("Digit1", { shiftKey: true })), "Shift+1");
});
test("needs a modifier and a supported key", () => {
  assert.equal(shortcutFromKeyEvent(key("KeyR", {})), null);
  assert.equal(shortcutFromKeyEvent(key("ControlLeft", { ctrlKey: true })), null);
  assert.equal(shortcutFromKeyEvent(key("F5", { ctrlKey: true })), null);
});
test("shows held modifiers while recording", () => assert.equal(modifierPrefix(key("ControlLeft", { ctrlKey: true, shiftKey: true })), "Control+Shift"));
test("legacy_command_or_control_matches_command", () => {
  assert.equal(normalizeShortcut("CommandOrControl+Shift+R"), "Command+Shift+R");
  assert.equal(eventMatchesShortcut(key("KeyV", { metaKey: true, shiftKey: true }), "CommandOrControl+Shift+V"), true);
  assert.equal(eventMatchesShortcut(key("KeyV", { ctrlKey: true, shiftKey: true }), "CommandOrControl+Shift+V"), false);
  assert.equal(eventMatchesShortcut(key("Space", { ctrlKey: true }), "Control+Space"), true);
});
test("explains macOS-reserved shortcuts", () => {
  assert.match(reservedShortcutHint("Control+Space") ?? "", /Input Sources/);
  assert.match(reservedShortcutHint("Command+Space") ?? "", /Spotlight/);
  assert.equal(reservedShortcutHint("Control+Shift+Space"), null);
});
```

- [ ] **Step 2: Add the `test` script and the tsconfig exclude**, then run `pnpm test` — Expected: FAIL (module `./shortcut.ts` not found).
- [ ] **Step 3: Implement** `src/utils/shortcut.ts` (no imports).
- [ ] **Step 4: Run** `pnpm test` — Expected: 7 passed. `pnpm build` — exit 0.
- [ ] **Step 5: Commit** `git add src/utils/shortcut.ts src/utils/shortcut.test.ts package.json tsconfig.json && git commit -m "feat: shortcut helpers that keep Control and Command distinct"`

### Task 2: Use the helpers in both recorders and the panel

**Files:**
- Modify: `src/settings/ConfigTab.tsx` (`keysToShortcut` :184-196, `handleKeyDown` :198-292, the two shortcut rows ~:425-455), `src/settings/QuickActionsTab.tsx` (`keysToShortcut` :63-75, `handleKeyDown` :77-~135, row ~:305-312), `src/App.tsx` (`matchesShortcut` :404-416).

**Interfaces:**
- Consumes: Task 1 exports.

- [ ] **Step 1: Implement:**
  - Both recorders: replace the `recordedKeys: Set<string>` bookkeeping and `keysToShortcut` with the helpers — on each keydown, `shortcutFromKeyEvent(e)` gives the finished shortcut (proceed to the existing conflict check and save when non-null); while recording show `formatShortcut(shortcutFromKeyEvent(e) ?? modifierPrefix(e))` (keep a small `recordingPreview: string` state for that). Escape still cancels. Remove `keysToShortcut` and the now-unused `recordedKeys` state.
  - ConfigTab: the `catch` blocks of `update_global_shortcut` and `update_history_shortcut` call `setShortcutError(String(error))` (keep the `console.error`). The string-equality checks between global and history use `normalizeShortcut` on both sides.
  - ConfigTab: under each shortcut row, when `reservedShortcutHint(<that shortcut>)` is non-null, show it as a small muted line.
  - QuickActionsTab: same reserved-shortcut hint under a quick action's shortcut.
  - App.tsx: `matchesShortcut(e, shortcut)` becomes `eventMatchesShortcut(e, shortcut)` (`e` is a React keyboard event; it has `code` and the modifier flags).
- [ ] **Step 2: Verify** `pnpm test` (7 passed), `pnpm build` exit 0, `(cd src-tauri && cargo test)` still green.
- [ ] **Step 3: Commit** `git add src/settings/ConfigTab.tsx src/settings/QuickActionsTab.tsx src/App.tsx && git commit -m "fix: record Control, Command and Space correctly in shortcut settings"`

### Task 3: Rust — never lose the working hotkey; don't abort startup

**Files:**
- Modify: `src-tauri/src/shortcuts.rs` (`update_global_shortcut` :128-159, `update_history_shortcut` :255-294, new helper + tests), `src-tauri/src/lib.rs` (setup :201-207).

**Interfaces:**
- Produces: `fn swap_shortcut<S: Copy + PartialEq, E>(old: Option<S>, new: S, mut register: impl FnMut(S) -> Result<(), E>, mut unregister: impl FnMut(S)) -> Result<(), E>` — if `old == Some(new)` does nothing; otherwise calls `register(new)` and returns its error untouched (no `unregister`), then `unregister(old)` when `old` is `Some`.

- [ ] **Step 1: Write the failing tests** (`#[cfg(test)] mod tests` in shortcuts.rs; use `u8` as `S` and a `Vec<String>` call log):

```rust
// swap_registers_new_before_unregistering_old: old Some(1), new 2, register Ok → log == ["register 2", "unregister 1"], Ok
// failed_registration_keeps_the_old_shortcut: register Err("taken") → Err("taken"), log == ["register 2"] (no unregister)
// same_shortcut_is_left_alone: old Some(2), new 2 → log empty, Ok
// first_shortcut_has_nothing_to_unregister: old None, new 2 → log == ["register 2"]
// parses_control_space: parse_shortcut("Control+Space") == Some(Shortcut::new(Some(Modifiers::CONTROL), Code::Space))
// legacy_command_or_control_still_parses_as_command: parse_shortcut("CommandOrControl+Shift+R") == parse_shortcut("Command+Shift+R") and is Some
```

  (The two parse tests pin existing behavior the frontend now relies on; they are expected to pass on first run — note it.)

- [ ] **Step 2: Run** `(cd src-tauri && cargo test shortcuts)` — Expected: compile error (no `swap_shortcut`).
- [ ] **Step 3: Implement** `swap_shortcut`; use it in `update_global_shortcut` (old = current state value) and `update_history_shortcut` (old = parsed stored value), keeping each function's store save and state update after a successful swap. In `lib.rs` setup, replace the two `register(...)?` calls with `if let Err(e) = … { eprintln!("[shortcuts] Couldn't register …: {e}") }` so startup continues.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test)` — Expected: all pass. `cargo check` clean.
- [ ] **Step 5: Commit** `git add src-tauri/src/shortcuts.rs src-tauri/src/lib.rs && git commit -m "fix: keep the working hotkey when a new one can't be registered"`

### Task 4: Branch verification, manual check, review

- [ ] `pnpm test`, `pnpm build`, `(cd src-tauri && cargo test && cargo check)`, `git diff --check main...` — all exit 0.
- [ ] Manual (`pnpm tauri dev`): record ⌃Space for "Open" → shows ⌃ Space and the Input Sources note; with the macOS input-source shortcut turned off, ⌃Space opens the panel on selected text; record ⌘⇧R back; record a quick action as ⌥R → shown as ⌥ R and fires.
- [ ] GitNexus `detect_changes({scope: "compare", base_ref: "main"})`.
- [ ] Dispatch `macos-workflow-reviewer` (read-only) on the branch plus the whole-branch code reviewer; apply findings via superpowers:receiving-code-review; then superpowers:finishing-a-development-branch.
