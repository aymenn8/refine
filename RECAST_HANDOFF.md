# Recast — Claude Code Rebranding Handoff

**Status (2026-10-26):** Implemented with the user's approval: visual rebrand (PR #8), bundle ID `com.drummerms.recast` with data migration (PR #9), release script and docs (Phase 5). Plans are in `docs/superpowers/plans/2026-10-26-recast-*.md`. The sections below are the original handoff and describe the pre-rebrand code.

- **Repository:** `Drummerms/refine` (upstream: `aymenn8/refine`)
- **Approved product name:** **Recast**
- **Brand concept:** **Pack A — metallic blue folded-ribbon R on graphite**, with a minimal monochrome menu bar mark.
- **Product message:** **Select. Recast. Done.**
- **Platform:** macOS; Tauri 2, Rust, React 19, TypeScript, Vite, Tailwind 4, SQLite
- **Approved production icon pack:** the exact 73-file ZIP is preserved **losslessly** as numbered binary parts in [`branding/recast/archive-parts/`](branding/recast/archive-parts/). Assemble it with [`branding/recast/assemble-archive.sh`](branding/recast/assemble-archive.sh) (no application files touched).
- **Brand sources and asset instructions:** [`branding/recast/README.md`](branding/recast/README.md) and [`branding/recast/source/`](branding/recast/source/). The ZIP also contains the concept reference under `reference/` and its own `README.md`.
- **Bundle identifier:** `com.drummerms.recast` is a **proposal**, not yet final or approved.

## 0. Immediate instruction — protect concurrent development

This repository has been actively developed. Start **read-only**:

1. Read the current `CLAUDE.md`, `CLAUDE_CODE_SETUP.md`, and this handoff.
2. Inspect `git status --short`, current branch, HEAD and recent commits. Do not assume the audit SHA below is current.
3. Review staged/unstaged/untracked files and any open or active branches before proposing modifications.
4. Treat all existing work as owned by the active developer. Do not revert, overwrite, reset, clean or force-push.
5. Follow this repository's GitNexus impact-analysis and change-detection workflow before source edits/commits where those tools are available. If unavailable, say so and use a conservative manual code-path audit.
6. **Report a read-only audit and phased implementation proposal, then stop for approval.** No autonomous implementation, publishing, signing, analytics changes, commits or pushes.

A previous source audit was at `f0e06d79094cbcbc16e6b55eb96d5ec610c98fa1` on `main` (October 25, 2026); verify any differences before acting.

## 1. Preserve the existing product

Do **not** rebuild existing, working functionality during the rebrand. Preserve:

- Global shortcuts, including **Control+Space** (with macOS conflict guidance).
- Selected-text capture from other applications and the floating panel.
- Saved rewrite modes, pinned modes, flows and quick actions.
- DeepSeek via the existing OpenAI-compatible custom provider (including API-key isolation) plus OpenAI, Anthropic, Ollama and local models.
- Local settings, prompts, model downloads, history, clipboard history, Keychain credentials and privacy choices.
- Preview, copy, and **explicit, safe in-place replacement** of selected text.

**Verified in the earlier audit:** The current code already implemented `openai_compatible`/DeepSeek configuration in `src-tauri/src/providers.rs` and `src/settings/ModelsLibraryTab.tsx`; Control-vs-Command/Space parsing in `src/utils/shortcut.ts` and `src-tauri/src/shortcuts.rs`; and selected-text/clipboard safety work in `src-tauri/src/selection.rs`. These are **not hypothetical future tasks**. Reconfirm with the latest checkout and do not overwrite them.

## 2. Brand & Taste design direction

**Design read:** Native-feeling, premium macOS text productivity tool for keyboard-focused users. This is a compact desktop utility, **not** a full SaaS dashboard or marketing landing page.

Use the installed **Taste** workflow where available and its frontend engineering guidance, but apply its aesthetic principles to the actual Tauri/React stack; do not introduce a new web framework or replace working macOS integration merely to follow template defaults.

- **Name:** `Recast` consistently in app titles, menu entries, welcome, About, help and release files.
- **Tagline:** `Select. Recast. Done.`
- **Icon:** Approved **Pack A**, folded-ribbon **R**. Use the supplied artwork; do not generate competing concepts or redesign the logo without review.
- **Color direction:** graphite `#171B21`, surface `#252C35`, muted steel-blue accent `#8B9FBF`, text `#F3F5F8`. These are **starting tokens**; review light/dark contrast and token semantics rather than hardcoding values in components.
- **Typography:** native SF system font stack; no unnecessary font packages.
- **Visual:** restrained macOS vibrancy, intentional layout, accessible contrast/focus, modest motion, no generic purple AI gradients, no gratuitous oversized panels, cards or blur.
- **UX flow:** select text → Control+Space → pick mode → rewrite → preview → copy or replace. Keep keyboard navigation first-class.
- Support light and dark appearance in **both** primary popup and Settings; review current Settings dark-mode assumptions.

### Icon integration — not automatic

Archive layout contains:

- `source/` editable SVG icon, ribbon mark, menu bar template and wordmarks.
- `master-png/` dark/light PNG exports 16–1024 px.
- `brand-marks/` transparent symbols and wordmarks.
- `menu-bar/` monochrome macOS menu bar template PNGs.
- `macos/Recast.icns` and `.iconset/`.
- `tauri-icons/` drop-in Tauri icon file names.
- `reference/` the selected conceptual reference image (**do not ship**).
- `asset-manifest.json` with asset hashes.

Read the archive's README before implementation. Existing files under `src-tauri/icons/` and `public/` must **not** be overwritten until the user approves integration. The menu-bar icon needs an actual Cocoa template configuration (not merely a PNG replacement). Verify 16px/32px appearance on a real Mac, and treat the supplied vector reconstruction as the approved production source. Only standalone assets and the assembly script are being added in this handoff; application assets remain unchanged.

## 3. Source locations & implementation scope

| Area | Relevant paths / current concern |
| --- | --- |
| Identity and window titles | `src-tauri/tauri.conf.json` (`productName: Refine`, `identifier: com.refine`); `index.html`, `package.json` |
| Rust metadata / crate identity | `src-tauri/Cargo.toml`, `Cargo.lock` (avoid breaking crate symbols unnecessarily) |
| Menus & app label strings | `src-tauri/src/tray.rs`, `src-tauri/src/shortcuts.rs` |
| About/Help & old social links | `src/settings/AboutTab.tsx` |
| Onboarding/welcome | `src/Onboarding.tsx` |
| Settings and home | `src/Settings.tsx`, `src/settings/HomeTab.tsx` |
| Popup and design tokens | `src/App.tsx`, `src/App.css`, `src/spotlight/`, `src/utils/accent.ts` |
| Existing images | `src-tauri/icons/`, `public/logo-white-no-bg.png`, root `logo.png` |
| Credentials/Keychain | `src-tauri/src/credentials.rs` (`SERVICE_NAME: com.refine`) |
| Settings and persistence | `settings.json` via Tauri store; modes/flows/history, `src-tauri/src/model.rs`, `src-tauri/src/clipboard.rs` |
| Privacy/telemetry | `src-tauri/src/analytics.rs`; existing opt-in semantics must remain |
| Releases/updater | `scripts/release.sh`, `scripts/check-updater-signing-key.py`, `src-tauri/src/fork_safety_tests.rs` |
| Documentation/attribution | `README.md`, `CLAUDE.md`, `CLAUDE_CODE_SETUP.md`, `LICENSE` |

Search all files for user-visible `Refine`/`refine`, `com.refine`, upstream URLs and prior asset filenames; **classify** each occurrence before changing it. Historical references, compatibility/migration code and legally required notices may need to remain. **Never blindly global-replace** identifiers.

## 4. Critical identity/data migration risks

Changing the bundle ID or Keychain service may change Tauri app storage directories and credential lookup. Existing Refine installations can hold sensitive user data and downloaded models. **Do not change identifiers until an approved migration strategy exists.**

Migration must cover as applicable: Keychain API credentials; `settings.json`; saved modes, flows, quick actions, shortcuts and preferences; generated history; clipboard SQLite database; model download directory; onboarding state.

Require tested backup/restore, idempotent one-time migration, failure handling and verification that secrets never get printed/logged. Do not delete old state automatically. Test fresh installation, upgrade, repeat upgrade, partial failure and rollback separately. Avoid silently changing already-installed apps' analytics state.

## 5. Release safety finding

The original Refine updater configuration was removed in this fork, but `scripts/release.sh` still calls `check-updater-signing-key.py`, which expects an updater public key, and still hardcodes `Refine_...`/`Refine.app.tar.gz` filenames. The current release path requires explicit repair and validation **before** publication.

Keep the updater **disabled** until the branded application has its own signing keys and update feed. Separate ordinary Apple application signing/notarization from Tauri updater package signing. Preserve fork safety tests and MIT copyright/license notices.

## 6. Suggested implementation phases (after authorization)

1. **Phase 0 — Read-only assessment.** Verify branch/worktree, baseline tests, code paths, exact diff and dependencies; report without editing.
2. **Phase 1 — Design tokens / asset approval.** Audit Taste fit; map supplied Pack A assets and UI tokens; review light/dark, accessibility and keyboard UI.
3. **Phase 2 — Visual rebrand.** Integrate approved icons in Tauri and frontend; menus, About, onboarding, Settings, popup; no underlying identity migration yet.
4. **Phase 3 — UX refinement.** Improve mode selection, compact preview and focus states without reimplementing providers or clipboard logic.
5. **Phase 4 — Identity / data migration.** Only with explicit bundle ID and migration approval; implement and test safe Keychain and settings relocation.
6. **Phase 5 — Release/documentation.** Update release names, signing flow, attribution, README, agent guidance; updater stays disabled.
7. **Phase 6 — Validation.** Build and runtime tests including actual macOS shortcuts and application focus.

Useful checks where supported:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
(cd src-tauri && cargo check)
(cd src-tauri && cargo test)
pnpm tauri dev
```

Record actual results, not assumed passes. Run on macOS for keyboard permissions, Keychain migration, paste-back, Finder/Dock and menu bar visuals; test dark/light modes and 16/32/Retina icon legibility.

## 7. Reviewers

Use available independent read-only reviewers before and after related implementation phases:

- **Brand/UI reviewer** — Taste, brand strings, design tokens, accessibility and icon variants.
- **macOS workflow reviewer** — shortcut conflicts, selected-text capture, clipboard restoration, focus and replacement.
- **Release/security reviewer** — identity and Keychain migration, telemetry, updater isolation, signing and legal notices.

Reviewers' material claims must be validated by the lead agent against current source and test evidence.

## 8. First Claude Code response required

Produce a concise report with:

1. Current branch/HEAD and clean or dirty working-tree details, and what must be protected.
2. Confirmed already-implemented functionality and any previous audit findings now obsolete.
3. Exact files and risks for the Recast rebrand.
4. Proposed design-system/application-icon integration plan.
5. Data migration, release and updater safeguards.
6. Ordered implementation phases, tests and first safe edit scope.

**Stop there and wait for the user's explicit go-ahead before changing application source, committing, pushing, signing or releasing.**
