# Rewrite Modes Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saved rewrite modes (including custom tones) stay exactly as the user left them, always receive the selected text, can't be deleted out from under a flow or quick action, and settings errors are visible.

**Architecture:** Pure helpers in `src-tauri/src/modes.rs` (prompt rendering, one-time legacy migration, delete guard, reset) with unit tests; the Tauri commands call them. `ModesTab.tsx` shows command errors instead of swallowing them.

**Tech Stack:** Tauri 2, Rust (`cargo test`), React 19 + TypeScript.

**Spec:** `CLAUDE.md` — Target UX step 4 ("Choose a saved rewrite mode, including custom tones, and run it"), "Keep mode management persistent and simple. Never erase user modes or clipboard contents as a side effect." Setup guide `CLAUDE_CODE_SETUP.md` §7 item C ("Preserve and test multiple persistent user-created rewrite modes, mode selection, result preview, copying, and safe in-place replacement"). Preview, copy and replacement were done in Phase 5.

## Global Constraints

- Never erase or rewrite user modes as a side effect; only an explicit user action changes them.
- No new dependencies. Store keys stay in `settings.json` (`processingModes`, `processingFlows`, `quickActions`).
- New store key `modesMigrationVersion` (number). Current version `1`. Missing means `0`.
- Built-in modes stay non-editable and non-deletable (unchanged UI rule).
- Before editing any existing function, run GitNexus `impact`; `detect_changes` before each commit. Branch `feat/rewrite-modes`.

## Review Focus

1. User pins TO ENGLISH + CORRECT + ASK and unpins PROMPT IT → after restart the pins are unchanged (Task 2 `user_pin_choice_survives_reload`).
2. A custom mode whose template has no `{text}` (user cleared it, or "Generate with AI" returned none) → the selected text is still sent (Task 1 `template_without_placeholder_still_gets_the_text`).
3. User deletes a mode that a flow step or quick action uses → refused with a message naming them; nothing else changes (Task 3 `mode_in_use_by_flow_and_quick_action_is_named`).
4. Reset to defaults with custom modes present → built-ins and their pins restored, custom modes kept (Task 4 `reset_keeps_custom_modes_unpinned`).
5. A settings action fails (last pinned mode, mode in use) → the user sees the reason (Task 5, manual).

---

### Task 1: Every mode receives the selected text

**Files:**
- Modify: `src-tauri/src/modes.rs` (`ProcessingMode::build_prompt` :28; new fn; tests module)
- Modify: `src-tauri/src/inference.rs:276`

**Interfaces:**
- Produces: `pub fn render_user_prompt(template: &str, text: &str) -> String` in `modes.rs` — replaces every `{text}`; if the template has no `{text}`, returns `text` when the template is blank, else `"{template}\n\n{text}"`.

- [ ] **Step 1: Write the failing tests** (`#[cfg(test)] mod tests` in `modes.rs`):

```rust
// template_placeholder_is_replaced: render_user_prompt("Fix: {text}", "hi") == "Fix: hi"
// every_placeholder_is_replaced: render_user_prompt("{text} / {text}", "a") == "a / a"
// template_without_placeholder_still_gets_the_text: render_user_prompt("Make it formal.", "hey") == "Make it formal.\n\nhey"
// blank_template_sends_just_the_text: render_user_prompt("  ", "hey") == "hey"
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test --lib modes)` — Expected: compile error (`render_user_prompt` missing).
- [ ] **Step 3: Implement** `render_user_prompt`; use it in `build_prompt` and at `inference.rs:276`.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test --lib)` — Expected: all pass.
- [ ] **Step 5: Commit** `git add docs/superpowers/plans/2026-10-25-rewrite-modes.md src-tauri/src/modes.rs src-tauri/src/inference.rs && git commit -m "fix: send the selected text even when a mode's template has no {text}"`

### Task 2: Legacy mode migration runs once, not on every load

**Files:**
- Modify: `src-tauri/src/modes.rs` (`append_missing_default_modes` :104-171 and every command that calls it)

**Interfaces:**
- Produces:
  - `pub fn normalize_modes(modes: &mut Vec<ProcessingMode>, migration_version: u64) -> bool` — always: add missing built-ins, give pinned modes without `pin_order` one. Only when `migration_version < MODES_MIGRATION_VERSION`: the old "pinned trio" swap and moving PROMPT IT to the front. Returns whether anything changed.
  - `const MODES_MIGRATION_VERSION: u64 = 1;` `const MODES_MIGRATION_KEY: &str = "modesMigrationVersion";`
  - A private loader used by all mode commands and `get_mode_by_id` that reads the list and version, calls `normalize_modes`, and when the stored version is below 1, saves the list and version `1`.

- [ ] **Step 1: Write the failing tests:**

```rust
// user_pin_choice_survives_reload: modes = defaults with prompt-it unpinned and translate/correct/ask pinned (pin_order 0,1,2);
//   normalize_modes(&mut modes, 1) leaves those pins exactly as given.
// legacy_pin_layout_is_migrated_once: same input with version 0 → prompt-it pinned, translate-to-english unpinned.
// user_order_survives_reload: a custom mode first, prompt-it second; version 1 → order unchanged.
// missing_builtins_are_added_back: list without "ask"; version 1 → "ask" present.
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test --lib modes)` — Expected: compile error (`normalize_modes` missing).
- [ ] **Step 3: Implement** `normalize_modes`, the loader, and switch every caller of `append_missing_default_modes` to the loader; remove `append_missing_default_modes`.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test --lib)` — Expected: all pass.
- [ ] **Step 5: Commit** `git add src-tauri/src/modes.rs && git commit -m "fix: keep the user's mode pins and order across restarts"`

### Task 3: A mode in use can't be deleted

**Files:**
- Modify: `src-tauri/src/flows.rs` (new sync loader), `src-tauri/src/modes.rs` (`delete_mode` :250; new fn)

**Interfaces:**
- Consumes: `crate::quick_actions::get_quick_actions_sync(&AppHandle) -> Vec<QuickAction>` (exists).
- Produces:
  - `pub fn get_flows_sync(app: &AppHandle) -> Vec<Flow>` in `flows.rs` (same store read as `get_flows`, empty on error).
  - `pub fn mode_users(mode_id: &str, flows: &[Flow], actions: &[QuickAction]) -> Vec<String>` — one entry per user: `flow "<name>"` for each flow whose `steps` contains the id, `quick action <shortcut>` for each quick action with `mode_id == id` and `action_type == "mode"`.
  - `delete_mode` returns `Err(format!("This mode is used by {} — remove it there first.", users.join(", ")))` when `mode_users` is non-empty, before changing anything.

- [ ] **Step 1: Write the failing tests:**

```rust
// mode_in_use_by_flow_and_quick_action_is_named: flow "Polish" steps ["correct","m1"], quick action {mode_id:"m1", shortcut:"Control+Alt+C", action_type:"mode"}
//   → mode_users("m1", ..) == ["flow \"Polish\"", "quick action Control+Alt+C"]
// unused_mode_has_no_users: mode_users("m2", same) is empty
// flow_quick_action_does_not_count: quick action {mode_id:"m1", action_type:"flow"} alone → empty
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test --lib modes)` — Expected: compile error.
- [ ] **Step 3: Implement** `get_flows_sync`, `mode_users`, and the guard in `delete_mode`.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test --lib)` — Expected: all pass.
- [ ] **Step 5: Commit** `git add src-tauri/src/flows.rs src-tauri/src/modes.rs && git commit -m "fix: refuse to delete a mode a flow or quick action uses"`

### Task 4: Reset to defaults keeps custom modes

**Files:**
- Modify: `src-tauri/src/modes.rs` (`reset_modes_to_defaults` :291), `src/settings/ModesTab.tsx` (reset modal copy :394-402)

**Interfaces:**
- Produces: `pub fn reset_keeping_custom(current: Vec<ProcessingMode>) -> Vec<ProcessingMode>` — the built-in modes exactly as shipped (prompts, pins, order), followed by every non-default mode from `current` in its existing order with `is_pinned = false`, `pin_order = None` (model override kept).
- Modal copy: title "Reset to Defaults"; subtitle "Built-in modes go back to how they shipped"; body "Built-in modes and their pins are restored. **Your custom modes are kept** (unpinned)."

- [ ] **Step 1: Write the failing test:**

```rust
// reset_keeps_custom_modes_unpinned: current = defaults with "correct" prompt edited + custom "m1" pinned (pin_order 0) with model_override Some(..)
//   → result has the shipped "correct" prompt, the shipped pins, and "m1" last with is_pinned false, pin_order None, model_override unchanged.
```

- [ ] **Step 2: Run** `(cd src-tauri && cargo test --lib modes)` — Expected: compile error.
- [ ] **Step 3: Implement** and use it in `reset_modes_to_defaults`; update the modal copy.
- [ ] **Step 4: Run** `(cd src-tauri && cargo test --lib)` and `pnpm build` — Expected: pass, exit 0.
- [ ] **Step 5: Commit** `git add src-tauri/src/modes.rs src/settings/ModesTab.tsx && git commit -m "fix: reset restores built-in modes without deleting custom ones"`

### Task 5: Settings shows why a mode action failed

**Files:**
- Modify: `src/settings/ModesTab.tsx` (handlers :117-185; banner near the list header)

- [ ] **Step 1: Implement** `const [actionError, setActionError] = useState<string | null>(null)`; each of `handleSave`, `handleDeleteConfirm`, `handleResetConfirm`, `handleTogglePin`, `handleMovePinned`, `handleSetModeModel` clears it before the call and sets it from the error (`typeof error === "string" ? error : String(error)`) on failure; a failed delete also closes the delete modal. Show it as the red banner style already used in `ConfigTab.tsx` (`bg-red-500/10 border border-red-500/20 … text-red-400`) with a dismiss ×.
- [ ] **Step 2: Verify** `pnpm build` exit 0, `pnpm test` all pass.
- [ ] **Step 3: Commit** `git add src/settings/ModesTab.tsx && git commit -m "fix: show mode errors in Settings"`

### Task 6: Verification, manual check, review

- [ ] `pnpm test`, `pnpm build`, `(cd src-tauri && cargo test && cargo check)`, `git diff --check main...` — all exit 0.
- [ ] Manual (`pnpm tauri dev`): (1) create a custom tone mode, pin it, restart → still there, pinned, same order; run it from the panel. (2) Pin TO ENGLISH + CORRECT + ASK, unpin PROMPT IT, restart → unchanged. (3) Custom mode with an empty template → result uses the selected text. (4) Add the mode to a flow, try to delete it → red message naming the flow. (5) Try to unpin the last pinned mode → red message. (6) Reset to defaults → custom modes still listed, unpinned.
- [ ] GitNexus `detect_changes({scope: "compare", base_ref: "main"})`.
- [ ] Whole-branch reviewer; apply via superpowers:receiving-code-review; then superpowers:finishing-a-development-branch.
