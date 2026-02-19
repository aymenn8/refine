## Refine v0.1.7

### Highlights

- Spotlight UI redesign with a cleaner, more minimal layout and a more sober default accent color.
- Improved loading experience with new animations (input border glow + minimalist processing dots).
- Settings modals updated to match the app visual system, including accent-color consistency.

### Improvements

- Dynamic placeholder: `Refine your text with <current mode>`.
- Modes settings page refreshed for better readability and less scrolling.
- Better update UX: improved update/restart dialogs and progress display.
- Stronger prompt quality for `PROMPT IT`.
- More professional translation behavior for `TO ENGLISH`.

### Model Download & Reliability

- Fixed local model download flow getting stuck at 100% in onboarding/settings.
- Download completion is now confirmed only after backend success (not just progress events).
- Added safer cleanup of temporary files on failed download verification.
- Checksum verification is now resolved dynamically from the model response metadata instead of relying on stale hardcoded values.
- Updated model size metadata to better reflect real remote file sizes.

### Language Consistency

- Responses now consistently follow the language of the user input across modes (unless explicitly requested otherwise).

### Bug Fixes

- Fixed auto-update flow reliability.
- Removed the `BETA` tag from Settings and About screens.
