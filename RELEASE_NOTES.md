## Refine v0.1.10

### Highlights

- Fixed a crash when quitting Refine normally on macOS.
- Fixed Spotlight mode selection so switching modes works reliably again.
- Restored `Cmd/Ctrl + 1..9` shortcuts for pinned modes, including non-US keyboard layouts.

### Fixes

- Fixed an app termination crash triggered during macOS shutdown/quit flow.
- Fixed Spotlight state reset behavior that could force mode back to default.
- Fixed pinned mode switching via keyboard when focus was not on the textarea.
- Fixed mode hotkeys detection by using physical key codes (`Digit1..Digit9` / `Numpad1..9`) with fallback handling.

### Improvements

- Improved Spotlight keyboard handling by centralizing pinned-mode switching logic.
- Improved consistency between mouse mode selection and keyboard shortcuts.

### Notes

- No UI/feature changes in this release: this update focuses on stability and mode-switching reliability.
