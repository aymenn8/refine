# Recast — production icon assets

This archive contains scalable vector artwork and rendered icon assets for the macOS app **Recast**. The artwork is a **vector recreation of the selected Pack A folded-R concept**, not a lossless extraction from the generated concept image. Colors, lighting and curves were rebuilt for reliable scaling and small-size output.

## Contents

| Path | Usage |
| --- | --- |
| `source/Recast-App-Icon-Dark.svg` | Editable 1024-viewBox SVG icon master |
| `source/Recast-App-Icon-Light.svg` | Editable light appearance SVG |
| `source/Recast-Mark-Color.svg` | Transparent colored ribbon-R mark |
| `source/Recast-Mark-White.svg` | Transparent white mark |
| `source/Recast-Mark-Black.svg` | Transparent dark mark |
| `source/Recast-Menu-Bar-Template.svg` | Simplified solid black mark for menu bar |
| `source/Recast-Wordmark-Dark.svg` | Brand lockup for dark UI |
| `source/Recast-Wordmark-Light.svg` | Brand lockup for light UI |
| `master-png/` | Dark/light full PNG exports at 16, 32, 64, 128, 256, 512, 1024 px |
| `brand-marks/` | Transparent PNG mark, editable source in `source/` |
| `macos/Recast.icns` | Native multi-size macOS icon |
| `macos/Recast.iconset/` | Standard macOS iconset with all required sizes and Retina variants |
| `menu-bar/RecastMenuBarTemplate.png` | 18x18 monochrome macOS menu bar icon |
| `menu-bar/RecastMenuBarTemplate@2x.png` | 36x36 Retina macOS menu bar icon |
| `tauri-icons/` | Drop-in replacements matching `src-tauri/tauri.conf.json` icon paths |
| `reference/` | Original selected concept sheet (not a shipping asset) |

## How to integrate (only after approval)

**The archive does not modify your GitHub repository.** From your local Recast working tree, after reviewing brand assets and preserving any current changes:

1. Safely back up the current `src-tauri/icons` directory.
2. Copy `tauri-icons/*` into `src-tauri/icons/` if you want the provided icon set. Tauri config currently references `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, and `icons/icon.ico`.
3. Replace `public/logo-white-no-bg.png` only after choosing and resizing the appropriate `brand-marks/Recast-Mark-Color-1024.png` for the UI.
4. The menu bar icon currently uses the application icon in `src-tauri/src/tray.rs`. Change it to use the template PNG and macOS template rendering, rather than dropping the new PNG into the icon directory and expecting automatic monochrome adaptation.
5. Update user-facing titles, bundle identifier, release metadata, package metadata, signing workflow, and Keychain migration **separately** from icon integration.
6. Run `pnpm build`, `(cd src-tauri && cargo check)`, and `pnpm tauri dev` and visually review at 16, 32, 128, and Retina sizes on macOS.

## Important constraints

- The `Recast.icns` was created and decoded using Pillow as part of the validation process. macOS itself was not available for a Finder/Dock visual check.
- The `.svg` designs are editable vector artwork with bezier paths, not embedded raster sprites or a literal high-resolution extraction of the concept.
- Menu bar template assets are pure black glyphs with alpha. Cocoa template coloring requires the host app to flag them as templates.
- Images contain **no signing information, bundle identifiers, or embedded application code**.
- The source files are included so you can revise colors and regenerate downstream sizes if needed.
