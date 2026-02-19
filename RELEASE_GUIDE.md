# Refine - Release macOS (script unifie)

Script principal:
- `./scripts/release.sh`

Wrappers (compatibilite):
- `./scripts/release-before-notarization.sh` -> `release.sh prepare`
- `./scripts/notary-status.sh` -> `release.sh status`
- `./scripts/release-after-notarization.sh` -> `release.sh publish`

## Pre-requis

1. Mets tes secrets dans `scripts/.env.local`:
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

2. Verifie que `RELEASE_NOTES.md` contient tes notes de version.

3. Le parametre `--version <x.y.z>` est obligatoire.
Ce parametre est applique automatiquement dans:
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` (package `refine`)

4. Verifie la coherence des cles updater/signature:

```bash
python3 scripts/check-updater-signing-key.py --require-private-key
```

5. Si la cle updater change:
- Les versions deja installees qui embarquent l'ancienne `pubkey` ne pourront pas verifier les nouvelles signatures.
- Soit tu publies une release "pont" signee avec l'ancienne cle privee mais contenant la nouvelle `pubkey`,
- Soit tu demandes une reinstall manuelle pour repartir sur la nouvelle chaine de confiance.

## Commandes

### 1) All (prepare + publish en une commande)

```bash
./scripts/release.sh all --version 0.1.1 --targets both
```

Options:
- `--version <x.y.z>` obligatoire
- `--targets both|arm64|intel` (defaut: `both`)
- `--wait-minutes <N>` optionnel (defaut: `240`)
- `--release-repo owner/repo` optionnel

### 2) Prepare (build + soumission notarization)

```bash
./scripts/release.sh prepare --version 0.1.1 --targets both
```

Options:
- `--version <x.y.z>` obligatoire
- `--targets both|arm64|intel` (defaut: `both`)
- `--release-repo owner/repo` (defaut: `aymenn8/refine-releases`)

Sortie:
- Manifest: `.context/release-state/v<version>/manifest.env`

### 3) Status (suivi notarization)

```bash
./scripts/release.sh status --version 0.1.1
./scripts/release.sh status --version 0.1.1 --submission-id <id>
```

Options:
- `--version <x.y.z>` obligatoire
- `--submission-id <id>` optionnel
- `--manifest <path>` optionnel

### 4) Publish (attente Accepted + staple + release GitHub)

```bash
./scripts/release.sh publish --version 0.1.1
```

Options:
- `--version <x.y.z>` obligatoire
- `--manifest <path>` optionnel (defaut: manifest de la version)
- `--wait-minutes <N>` optionnel (defaut: `240`)
- `--release-repo owner/repo` optionnel

Sortie:
- Dossier: `release-assets/v<version>/`
- Fichiers: DMG, `.app.tar.gz`, `.sig`, `latest.json`, `UPLOAD_ORDER.txt`

## Run recommande

1. Rapide (recommande): `./scripts/release.sh all --version 0.1.1 --targets both`
2. Ou en 2 temps:
3. `./scripts/release.sh prepare --version 0.1.1 --targets both`
4. `./scripts/release.sh status --version 0.1.1` (optionnel)
5. `./scripts/release.sh publish --version 0.1.1`

## Verification updater

```bash
curl -L https://github.com/aymenn8/refine-releases/releases/latest/download/latest.json
```
