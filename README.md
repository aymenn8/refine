<p align="center">
  <img src="public/recast-mark-white.png" alt="Recast logo" width="84" />
</p>

<h1 align="center">Recast</h1>

<p align="center">
  Open-source macOS text processing with global shortcuts, local models, and cloud providers.
</p>

<p align="center">
  <strong>MIT</strong> · <strong>macOS only</strong>
</p>

Recast is a desktop app built with Tauri, React, and TypeScript. Select. Recast. Done.
It lets you rewrite, clean up, transform, and reuse text from anywhere on your Mac without building your workflow around a browser tab.

## Why Recast

- Trigger text processing from any app with global shortcuts
- Create custom modes for your own prompts and workflows
- Keep a local history of previous results
- Run with local models or connect cloud providers / ollama

## Features

- Global shortcut window for fast text rewriting
- Quick actions mapped to custom shortcuts
- Clipboard history window stored locally on device
- Custom modes and flows
- Local model support
- Cloud provider support for OpenAI, Anthropic, Ollama, and OpenAI-compatible endpoints such as DeepSeek
- Auto-copy and paste-friendly workflow
- Native macOS app packaging with notarization support

## Tech Stack

- Tauri v2
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Rust
- SQLite

## Requirements

- macOS
- Node.js 20+
- `pnpm`
- Rust toolchain
- Xcode Command Line Tools

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Start the app in development:

```bash
pnpm tauri dev
```

3. Build the frontend bundle:

```bash
pnpm build
```

4. Check the Rust backend:

```bash
cd src-tauri && cargo check
```

## First-Time Setup

After launching the app:

1. Open Settings
2. Add a model source:
   use a local model, or configure OpenAI / Anthropic / Ollama
3. Pick your default model
4. Create one or more custom modes
5. Assign a shortcut for quick actions

At that point, Recast is ready to use system-wide on your Mac.

## Upgrading from Refine

Recast uses the bundle ID `com.drummerms.recast`. On first launch it copies an existing Refine install's data
(`~/Library/Application Support/com.refine`: settings, modes, history, clipboard, models) into its own folder.
The Refine folder is never changed or deleted. Quit Refine before the first launch. Saved API keys stay in the
Keychain under `com.refine`, so they keep working. macOS asks again for Accessibility and Automation permission.

## Releases

```bash
./scripts/release.sh prepare --version x.y.z --release-repo Drummerms/refine
./scripts/release.sh publish --version x.y.z --release-repo Drummerms/refine
```

`prepare` builds, signs, and submits the DMGs for notarization. Commit and push the version bump it makes, then
`publish` staples them, names them `Recast_<version>_<aarch64|x86_64>.dmg`, and creates the GitHub release at that
commit after you type the repo name to confirm. Apple credentials go in
`scripts/.env.local` (see `scripts/.env.example`).

`THIRD_PARTY_NOTICES.txt` ships inside the app. After any dependency change, run
`node scripts/third-party-notices.mjs` and commit the result; `prepare` stops if the file is out of date.

## Updater

Recast ships without an updater. Upstream's update feed and signing key were removed so a fork build can never install upstream Refine. A new feed and signing key are needed before adding one.

## Project Structure

- [src](src): React frontend
- [src-tauri](src-tauri): Rust backend and Tauri config
- [public](public): app assets

## Optional Analytics

Analytics are optional and disabled by default.

If you want to enable anonymous product analytics, compile the app with:

```bash
REFINE_POSTHOG_API_KEY=phc_xxx pnpm tauri dev
```

Optional overrides:

- `REFINE_POSTHOG_HOST=https://us.i.posthog.com`
- `REFINE_POSTHOG_HOST=https://eu.i.posthog.com`
- `REFINE_POSTHOG_HOST=https://your-posthog.yourdomain.com` for self-hosted PostHog

Recast only sends manual product events after the user explicitly opts in from Settings.
The app does not send input text, prompts, or API keys. It uses a random local
installation ID to count repeat usage anonymously, and you can self-host
PostHog if you do not want event traffic to reach PostHog Cloud.

## Credits

Recast is based on [Refine](https://github.com/aymenn8/refine) by aymenn8, released under the MIT License.
The original copyright notice is kept in [LICENSE](LICENSE).

## License

This project is licensed under the MIT License.
See [LICENSE](LICENSE).
