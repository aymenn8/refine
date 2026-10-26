# Recast — approved production icon pack (Pack A)

**Approval:** The folded metallic-blue ribbon **R**, on graphite, is the selected Recast brand direction. This folder is an **additive staging area** for Claude Code. Nothing here replaces the live Refine icons, application metadata or settings.

![Recast dark app icon](source/Recast-App-Icon-Dark.svg)

## Recover the complete 73-file production archive

The **exact original 5,623,683-byte ZIP** is stored in 19 Git-tracked binary parts under `archive-parts/` (18 × 300,000 bytes, one × 223,683 bytes). This representation was necessary for the connected GitHub upload; **no content was omitted or recompressed**. To rebuild it on macOS:

```bash
bash branding/recast/assemble-archive.sh
unzip -l branding/recast/Recast_Production_Icon_Assets.zip
# Optional: extract into this brand staging folder only
unzip branding/recast/Recast_Production_Icon_Assets.zip -d branding/recast/
```

ZIP checksum (SHA-256):

```text
242d3b1eb7b183a71794142995ab60d11762075c619a2674d619275aab6cdf7e
```

The assembly script is safe to rerun: it verifies the existing ZIP and refuses to overwrite a differently hashed file. It does not write into `src/`, `public/`, or `src-tauri/`.

## What's available directly in GitHub

| Location | Contents |
| --- | --- |
| `source/` | 10 original editable SVGs for dark/light app icons, transparent marks, wordmarks, and macOS menu bar templates |
| `asset-manifest.json` | Checksums/dimensions for the production asset contents |
| `ARCHIVE_README.md` | Original production pack integration guide |
| `archive-parts/` | Lossless binary data of the complete ZIP including all original PNGs, ICNS, ICO and reference art |
| `assemble-archive.sh` | Offline, hash-verified ZIP reconstruction |

After extraction, the ZIP contains `Recast_Production_Icon_Assets/` with `source/`, `master-png/`, `brand-marks/`, `menu-bar/`, `macos/` (including `.icns` and `.iconset/`), `tauri-icons/`, and `reference/`.

## Claude Code integration rules

Read [`RECAST_HANDOFF.md`](../../RECAST_HANDOFF.md) and `ARCHIVE_README.md` first. Do not copy over `src-tauri/icons/` or `public/logo-white-no-bg.png` without user approval. The current Tauri icon keys include `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns` and `icons/icon.ico`. The macOS tray icon needs template rendering for the monochrome glyph. Rebranding app identity requires a **separate** Keychain/storage migration and release-script review. Preserve MIT attribution.

**Design status:** Production asset masters were validated as previously documented; macOS Finder/Dock/menu rendering and live app integration have **not** been tested or performed.
