# Refine - Release macOS (2 commandes)

Ce guide utilise seulement:
- `./scripts/release-before-notarization.sh`
- `./scripts/release-after-notarization.sh`

Script de support (debug):
- `./scripts/notary-status.sh`

## Pré-requis

1. Mets tes secrets dans `scripts/.env.local`:
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

2. Vérifie que `RELEASE_NOTES.md` contient bien tes notes de version.

3. Mets ton code + version finale sur `main`.

## Commande 1: avant notarization

```bash
./scripts/release-before-notarization.sh [options]
```

### Options

- `--targets both|arm64|intel`
  - `both` (défaut): build Apple Silicon + Intel
  - `arm64`: build Apple Silicon seulement
  - `intel`: build Intel seulement
- `--release-repo owner/repo`
  - défaut: `aymenn8/refine-releases`
  - utilisé pour générer les URLs dans `latest.json`

### Ce que la commande fait

1. Charge `scripts/.env.local`
2. Build les artefacts pour chaque target demandé:
- `dmg`
- `Refine.app.tar.gz`
- `Refine.app.tar.gz.sig`
3. Soumet chaque `dmg` à Apple Notary (asynchrone, sans attendre)
4. Sauve un manifest ici:
- `.context/release-state/<tag>/manifest.env`

Le manifest contient les chemins de fichiers + IDs de soumission Apple.

## Commande 2: après notarization

```bash
./scripts/release-after-notarization.sh [options]
```

### Options

- `--manifest <path>`
  - manifeste explicite
  - si absent, le script prend le dernier manifest automatiquement
- `--wait-minutes <N>`
  - timeout global d’attente notarization
  - défaut: `240`

### Ce que la commande fait

1. Charge `scripts/.env.local`
2. Lit le manifest
3. Attend que chaque soumission DMG soit `Accepted`
4. Pour chaque DMG:
- `stapler staple`
- `stapler validate`
- `spctl -t install` (validation Gatekeeper)
5. Génère un dossier prêt à uploader:
- `release-assets/<tag>/`
6. Dans ce dossier:
- DMG(s)
- `Refine_<version>_<arch>.app.tar.gz`
- `Refine_<version>_<arch>.app.tar.gz.sig`
- `latest.json`
- `UPLOAD_ORDER.txt`

## Script de support: notary status

```bash
./scripts/notary-status.sh
./scripts/notary-status.sh <submission-id>
```

- sans argument: affiche les submissions locales récentes puis l’historique Apple
- avec `submission-id`: affiche le statut précis de cette soumission

## Run complet recommandé (micro étapes)

1. Lancer la phase build + soumission:
```bash
./scripts/release-before-notarization.sh --targets both
```

2. Vérifier l’état (optionnel pendant l’attente):
```bash
./scripts/notary-status.sh
```

3. Lancer la phase finalisation + packaging:
```bash
./scripts/release-after-notarization.sh
```

4. Uploader les fichiers du dossier:
```bash
release-assets/<tag>/
```
sur la release GitHub publique (`aymenn8/refine-releases`).

5. Vérifier l’endpoint updater:
```bash
curl -L https://github.com/aymenn8/refine-releases/releases/latest/download/latest.json
```

## Notes importantes

- Apple notarization est asynchrone: ça peut prendre du temps.
- `stapler` colle le ticket Apple dans le DMG (important pour distribution).
- `latest.json` est requis pour l’auto-update in-app.
- Si tu rebuild, ce sont de nouveaux artefacts -> nouvelle notarization.
