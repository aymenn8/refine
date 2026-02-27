# Refine - Local Release Guide

Releases are handled locally with scripts in `scripts/`.
No GitHub Actions release workflow is used.

## Prerequisites

- macOS with Xcode CLI tools (`xcrun`, `notarytool`, `stapler`)
- `pnpm`, Node.js, Rust toolchain (`rustup`)
- `gh` CLI authenticated with access to the release repository
- A local env file at `scripts/.env.local` (gitignored)

Required variables in `scripts/.env.local`:

- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Optional: `RELEASE_REPO` (default: `aymenn8/refine`)

## Release Flow

1. Prepare release (version sync, build, notarization submit):

```bash
./scripts/release.sh prepare --version 0.1.0 --targets both --release-repo owner/repo
```

2. Check notarization status:

```bash
./scripts/release.sh status --version 0.1.0
```

3. Publish when notarization is accepted (staple, create `latest.json`, create GitHub release and upload assets):

```bash
./scripts/release.sh publish --version 0.1.0 --release-repo owner/repo
```

4. Optional all-in-one command:

```bash
./scripts/release.sh all --version 0.1.0 --targets both --wait-minutes 240 --release-repo owner/repo
```

The script stores release state in:

- `.context/release-state/v<version>/manifest.env`
- `release-assets/v<version>/`

Compatibility wrappers (legacy command names):

- `./scripts/release-before-notarization.sh` -> `release.sh prepare`
- `./scripts/notary-status.sh` -> `release.sh status`
- `./scripts/release-after-notarization.sh` -> `release.sh publish`

## Updater Endpoint

Set the updater endpoint in:

- `src-tauri/tauri.conf.json` -> `plugins.updater.endpoints`

Expected format:

```text
https://github.com/aymenn8/refine/releases/latest/download/latest.json
```
