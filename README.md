<p align="center">
  <img src="public/logo-white-no-bg.png" alt="Refine logo" width="84" />
</p>

<h1 align="center">Refine</h1>

<p align="center">
  Open-source macOS text processing with global shortcuts, local models, and cloud providers.
</p>

<p align="center">
  <strong>Free since v0.1.0</strong> · <strong>MIT</strong> · <strong>macOS only</strong>
</p>

Refine is a desktop app built with Tauri, React, and TypeScript.
It lets you rewrite, clean up, transform, and reuse text from anywhere on your Mac without building your workflow around a browser tab.

## Why Refine

- Trigger text processing from any app with global shortcuts
- Create custom modes for your own prompts and workflows
- Keep a local history of previous results
- Run with local models or connect cloud providers
- Update the app through a GitHub release feed

## Features

- Global shortcut window for fast text refinement
- Quick actions mapped to custom shortcuts
- Clipboard history window stored locally on device
- Custom modes and flows
- Local model support
- Cloud provider support for OpenAI, Anthropic, and Ollama
- Auto-copy and paste-friendly workflow
- Native macOS release pipeline with notarization

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

At that point, Refine is ready to use system-wide on your Mac.

## Repository Setup

Releases are published directly on the main open-source repository:

- `aymenn8/refine`

That means:

- source code and release assets live in the same GitHub repo
- the updater reads `latest.json` from the same repo
- local release scripts publish directly to the main release page

## Release Process

Releases are local-only.
GitHub Actions is not used for build or publishing.

Main script:

```bash
./scripts/release.sh all --version 0.1.0 --targets both --release-repo owner/repo
```

Detailed guide:

- [RELEASE_GUIDE.md](RELEASE_GUIDE.md)
- [RELEASE_NOTES.md](RELEASE_NOTES.md)

## Updater

Set the updater endpoint in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json):

```text
https://github.com/<owner>/<repo>/releases/latest/download/latest.json
```

In this repo, the updater points directly to `aymenn8/refine`.

## Project Structure

- [src](src): React frontend
- [src-tauri](src-tauri): Rust backend and Tauri config
- [scripts](scripts): local release scripts
- [public](public): app assets

## Open Source Status

As of `0.1.0`:

- premium gating has been removed
- the project is MIT licensed
- releases are prepared locally with gitignored env files

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

Refine only sends manual product events after the user explicitly opts in from Settings.
The app does not send input text, prompts, or API keys. It uses a random local
installation ID to count repeat usage anonymously, and you can self-host
PostHog if you do not want event traffic to reach PostHog Cloud.

## License

This project is licensed under the MIT License.
See [LICENSE](LICENSE).
