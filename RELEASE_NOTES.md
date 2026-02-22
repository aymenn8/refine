## Refine v0.1.9

### Highlights

- Spotlight now opens on pinned modes consistently and no longer falls back unexpectedly to unpinned modes like `PROMPT IT`.
- Added a new `Auto-copy result` setting to copy processed text to clipboard automatically after refinement.
- Improved light-mode readability across windows while keeping the existing transparent visual style.
- Reworked pinned mode management with persistent ordering and manual reordering controls.

### New

- Added a dedicated `Clipboard` section in Settings > Configuration with an `Auto-copy result` toggle.
- Added pinned mode reordering (`move up` / `move down`) in Settings > Modes.
- Added backend support for pinned order persistence via `pin_order` and a new `reorder_pinned_modes` command.
- Added an `Edit` app menu (Undo, Redo, Cut, Copy, Paste, Select All) in the macOS menu bar.

### Improvements

- Modes list in Settings is now split into `Pinned in Spotlight` and `Other modes` for clearer organization.
- Spotlight now sorts pinned modes by `pin_order`, including keyboard selection order (`Cmd/Ctrl + 1..9`).
- Spotlight UI components now support explicit light/dark styling (`SelectorBar`, `ProcessedBar`, `PipelineStrip`, `FooterBar`, `CommandPalette`).
- Added a subtle in-app confirmation toast when auto-copy succeeds (`Copied to clipboard`).

### Fixes

- Fixed Color Picker positioning near the bottom of Settings by anchoring it to the Configuration scroll container, refreshing position on scroll, and removing problematic absolute anchoring on the hidden input.
- Fixed occasional wrong initial Spotlight mode selection on open by enforcing pinned-mode fallback logic.
- Fixed text capture reliability on global shortcut by waiting briefly for modifier-key release before simulated copy.
- Fixed low-contrast/near-invisible UI elements in macOS light mode by applying automatic contrast adjustments for `white/*` utility styles.

### Behavior Changes

- Pinning a new mode when 3 modes are already pinned now auto-unpins the oldest pinned mode instead of blocking the action.
- Spotlight startup mode selection now prioritizes current pinned mode (if still pinned), then default mode (only if pinned), then the first pinned mode by `pin_order`.
