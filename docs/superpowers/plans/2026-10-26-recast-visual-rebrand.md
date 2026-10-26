# Recast Visual Rebrand (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app looks and reads as Recast (icons, menu bar, strings, product name, About), while data location and identity stay on `com.refine`.

**Architecture:** Copy the approved Pack A files into the existing icon paths, load a template glyph for the tray, rename user-facing text only, and pin all of it with source-scanning guard tests in `fork_safety_tests.rs`.

**Tech Stack:** Tauri 2 (Rust), React 19 / TypeScript.

**Spec:** `RECAST_HANDOFF.md` (sections 1–3, 6) plus the Phase 2 scope approved in chat on 2026-10-26.

## Global Constraints

- Name `Recast`; tagline `Select. Recast. Done.`; art from `branding/recast/` Pack A only, unchanged.
- `identifier` stays `com.refine`; `credentials.rs` `SERVICE_NAME` stays `com.refine`; no data paths move.
- Keep: crate names `refine`/`refine_lib`, `REFINE_POSTHOG_*`, the `total_words_refined` stats key, the `get_total_words_refined` command, `LICENSE`.
- Updater stays disabled; `release.sh` is Phase 5, not touched here.
- About: feedback link → `https://github.com/Drummerms/refine/issues`; X link removed; credit line "Based on Refine by aymenn8 · MIT License".

## Review Focus

1. Menu bar in light and dark appearance: the glyph must flip color (template), not stay black. Manual QA on a bundled build.
2. Shortcut collision message still names the main shortcut after the rename (`Already used by "Open Recast"`). Covered by the string-scan test plus manual record of a duplicate.
3. Accessibility and Automation grants still work after `productName` changes the `.app` name. Manual QA on a bundled build.
4. A missing tray icon must not panic at startup: `include_bytes!` makes it a compile-time file, so a missing file fails the build instead.
5. The new square logo at the old `h-*` sizes doesn't overflow in Settings, Home, About, Onboarding. Manual QA.

---

### Task 1: Guard tests

**Files:** Modify `src-tauri/src/fork_safety_tests.rs`

- [ ] Add `identity_stays_on_com_refine_until_migration`: `identifier == "com.refine"` in `tauri.conf.json`.
- [ ] Add `product_name_and_windows_say_recast`: `productName == "Recast"`; every `/app/windows/*/title` starts with `"Recast"`; `index.html` contains `<title>Recast</title>`.
- [ ] Add `user_facing_text_says_recast`: for each UI file (`tray.rs`, `shortcuts.rs`, `selection.rs`, `Onboarding.tsx`, `ConfigTab.tsx`, `QuickActionsTab.tsx`, `HomeTab.tsx`, `Settings.tsx`, `App.tsx`, `spotlight/FooterBar.tsx`, `AboutTab.tsx`), after removing the allowed phrase `Based on Refine`, the text contains no `Refine` and no `>refine<`, and no `logo-white-no-bg.png`.
- [ ] Add `about_tab_has_no_upstream_social_links`: `AboutTab.tsx` has no `canny.io` and no `getrefineapp`, and does contain `github.com/Drummerms/refine/issues` and `Based on Refine`.
- [ ] Add `tray_icon_is_a_template_glyph`: `tauri::image::Image::from_bytes(include_bytes!("../icons/tray/RecastMenuBarTemplate@2x.png"))` is 36×36, every pixel has RGB 0,0,0, and at least one pixel has alpha > 0.
- [ ] Run `(cd src-tauri && cargo test fork_safety)`. Expected: the new tests FAIL (missing file / old strings).

### Task 2: Icons and tray

**Files:** Replace `src-tauri/icons/{32x32.png,128x128.png,128x128@2x.png,icon.icns,icon.ico,icon.png}` from `tauri-icons/`; create `src-tauri/icons/tray/RecastMenuBarTemplate@2x.png` from `menu-bar/`; create `public/recast-mark-white.png` (Pack A `Recast-Mark-White-1024.png` downsized to 256 px with `sips`); delete `public/logo-white-no-bg.png` once nothing references it; modify `src-tauri/src/tray.rs` `setup_tray`.

- [ ] Copy files; check each copied file's SHA-256 against `branding/recast/asset-manifest.json`.
- [ ] In `setup_tray`, use `.icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray/RecastMenuBarTemplate@2x.png"))?)` and `.icon_as_template(true)`.

### Task 3: Strings and product name

**Files:** `tauri.conf.json` (`productName`, 3 window titles), `index.html`, `tray.rs`, `shortcuts.rs`, `selection.rs`, `Onboarding.tsx`, `ConfigTab.tsx`, `QuickActionsTab.tsx`, `HomeTab.tsx`, `Settings.tsx`, `App.tsx`, `FooterBar.tsx`.

- [ ] Product name `Refine` → `Recast`; verb `refine` → `recast` ("Recast your text...", footer hint `recast`, "Words recast", "Recasts this week"); wordmark `refine` → `Recast`; onboarding subtitle → `Select. Recast. Done.`; logo `src` → `/recast-mark-white.png`, `alt="Recast"`.
- [ ] Keep wording identical between `shortcuts.rs` labels and `ConfigTab.tsx:246` (`Open Recast`).

### Task 4: About and README credit

**Files:** `src/settings/AboutTab.tsx`, `README.md` (header and new "Credits" section only; the rest of README is Phase 5).

- [ ] Replace the Canny button with "Feedback" → `https://github.com/Drummerms/refine/issues`; remove the X button and its divider; add credit line linking `https://github.com/aymenn8/refine`.
- [ ] README: header logo/title → Recast; add `## Credits`: based on Refine (https://github.com/aymenn8/refine), MIT, original copyright kept in `LICENSE`.

### Task 5: Verify and commit

- [ ] `pnpm build`, `pnpm test`, `(cd src-tauri && cargo test)`: all pass.
- [ ] `pnpm tauri build --debug --bundles app`; open `src-tauri/target/debug/bundle/macos/Recast.app`; check Dock icon, menu bar glyph in light and dark, tray menu labels, Settings/About/Onboarding logos.
- [ ] `detect_changes`, `git diff --check`, commit on `feat/recast-visual`. Push/PR only with approval.
