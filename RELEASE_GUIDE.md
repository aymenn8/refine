# Refine — Release & Update Guide

## TL;DR

```bash
# 1. Bump version in tauri.conf.json
# 2. Commit + tag
git add -A && git commit -m "release: v0.2.0"
git tag v0.2.0
git push && git push --tags
# 3. GitHub Actions builds + creates draft release
# 4. Go to GitHub Releases, edit patch notes, publish
# 5. Users get the update automatically
```

---

## Table of Contents

1. [Prérequis (une seule fois)](#1-prérequis-une-seule-fois)
2. [Comment release une version](#2-comment-release-une-version)
3. [Apple Developer & Code Signing](#3-apple-developer--code-signing)
4. [Structure des artifacts](#4-structure-des-artifacts)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Prérequis (une seule fois)

### A. GitHub Secrets

Va dans **Settings > Secrets and variables > Actions** de ton repo GitHub et ajoute :

| Secret                               | Valeur                           | Comment l'obtenir                      |
| ------------------------------------ | -------------------------------- | -------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contenu de `~/.tauri/refine.key` | `cat ~/.tauri/refine.key`              |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | _(vide si pas de mot de passe)_  | Le mot de passe choisi à la génération |

```bash
# Copier ta clé privée pour la coller dans GitHub Secrets
cat ~/.tauri/refine.key | pbcopy
```

### B. Endpoint d'update

Dans `src-tauri/tauri.conf.json`, l'endpoint est configuré sur :

```
https://github.com/aymenn8/refine-app/releases/latest/download/latest.json
```

### C. Clé publique

Déjà configurée dans `tauri.conf.json` > `plugins.updater.pubkey`.
**Ne jamais changer** sauf si tu régénères les clés (ce qui casserait les updates pour tous les users existants).

---

## 2. Comment release une version

### Étape 1 : Bump la version

Dans `src-tauri/tauri.conf.json` :

```json
{
  "version": "0.2.0" // ← change ici
}
```

La version doit suivre le format **semver** : `MAJOR.MINOR.PATCH`

- **PATCH** (0.1.1) : bugfix
- **MINOR** (0.2.0) : nouvelle feature
- **MAJOR** (1.0.0) : breaking change

### Étape 2 : Commit + Tag

```bash
git add -A
git commit -m "release: v0.2.0"
git tag v0.2.0
git push && git push --tags
```

Le tag **doit** commencer par `v` (ex: `v0.2.0`). C'est ce qui déclenche le CI.

### Étape 3 : Le CI build automatiquement

GitHub Actions va :

1. Builder l'app pour **macOS ARM** (Apple Silicon) et **macOS Intel**
2. Signer les artifacts avec ta clé privée
3. Générer le `latest.json` (metadata pour l'auto-updater)
4. Créer une **Release draft** sur GitHub

Tu peux suivre le build dans l'onglet **Actions** de ton repo.

### Étape 4 : Publier la release

1. Va dans **Releases** sur GitHub
2. Tu verras un draft avec tous les artifacts
3. **Édite le body** avec les patch notes (c'est ce qui s'affiche dans l'app !)

Format recommandé pour les patch notes :

```markdown
- Fixed: shortcut conflicts between quick actions
- Added: anonymous analytics with full opt-out
- Added: auto-update system
- Improved: performance of local model inference
```

4. Clique **Publish release**

### Étape 5 : C'est tout

Les utilisateurs qui ont déjà Refine recevront automatiquement une notification de mise à jour au prochain lancement de Settings. Le modal affiche les patch notes et propose "Update now" ou "Later".

---

## 3. Apple Developer & Code Signing

### Est-ce obligatoire ?

**Non, mais fortement recommandé.**

Sans certification Apple :

- macOS affiche **"Refine can't be opened because Apple cannot check it for malicious software"**
- L'utilisateur doit faire clic droit > Ouvrir, puis confirmer
- Gatekeeper peut bloquer l'app après une mise à jour macOS

Avec certification Apple :

- L'app s'ouvre normalement, zéro warning
- Nécessaire pour distribuer sur le Mac App Store (optionnel)
- Les updates s'installent sans friction

### Comment obtenir un certificat Apple

#### 1. Inscris-toi à l'Apple Developer Program

- Va sur [developer.apple.com/programs](https://developer.apple.com/programs/)
- Coût : **99$/an** (individuel)
- L'approbation prend **24-48h**

#### 2. Crée un certificat "Developer ID Application"

Dans [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates) :

1. Clique **+** > **Developer ID Application**
2. Crée une Certificate Signing Request (CSR) via Keychain Access :
   - Ouvre **Keychain Access** > Menu **Certificate Assistant** > **Request a Certificate from a Certificate Authority**
   - Remplis ton email, laisse "Saved to disk"
3. Upload la CSR, télécharge le certificat `.cer`
4. Double-clique pour l'installer dans ton Keychain

#### 3. Exporte le certificat en .p12

1. Dans **Keychain Access** > **My Certificates**
2. Trouve "Developer ID Application: Ton Nom"
3. Clic droit > **Export**
4. Format : `.p12`, choisis un mot de passe

#### 4. Encode en base64 pour GitHub Secrets

```bash
base64 -i certificate.p12 | pbcopy
```

#### 5. Ajoute les secrets GitHub

| Secret                       | Valeur                                                               |
| ---------------------------- | -------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Le .p12 encodé en base64                                             |
| `APPLE_CERTIFICATE_PASSWORD` | Le mot de passe du .p12                                              |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: Ton Nom (TEAM_ID)`                        |
| `APPLE_ID`                   | Ton Apple ID (email)                                                 |
| `APPLE_PASSWORD`             | Un [App-Specific Password](https://appleid.apple.com/account/manage) |
| `APPLE_TEAM_ID`              | Ton Team ID (visible sur developer.apple.com)                        |

#### 6. Décommente les variables dans le workflow

Dans `.github/workflows/release.yml`, décommente les lignes `APPLE_*` :

```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Le `tauri-action` s'occupe automatiquement de :

- Signer l'app avec ton certificat
- Soumettre à Apple pour **notarization** (vérification malware)
- Stapler le ticket de notarization au DMG

---

## 4. Structure des artifacts

Après un build, GitHub Release contient :

```
Refine_0.2.0_aarch64.dmg          ← DMG pour Apple Silicon (premier install)
Refine_0.2.0_aarch64.dmg.tar.gz   ← Update package ARM (auto-updater)
Refine_0.2.0_aarch64.dmg.tar.gz.sig  ← Signature de l'update ARM
Refine_0.2.0_x64.dmg              ← DMG pour Intel
Refine_0.2.0_x64.dmg.tar.gz       ← Update package Intel
Refine_0.2.0_x64.dmg.tar.gz.sig   ← Signature
latest.json                        ← Metadata pour l'auto-updater
```

Le `latest.json` ressemble à ça :

```json
{
  "version": "0.2.0",
  "notes": "Les patch notes que tu as écrites",
  "pub_date": "2025-01-15T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://github.com/.../Refine_0.2.0_aarch64.dmg.tar.gz",
      "signature": "..."
    },
    "darwin-x86_64": {
      "url": "https://github.com/.../Refine_0.2.0_x64.dmg.tar.gz",
      "signature": "..."
    }
  }
}
```

---

## 5. Troubleshooting

### "Update check failed"

- Vérifie que l'endpoint dans `tauri.conf.json` est correct
- Vérifie que la release est **publiée** (pas draft) sur GitHub
- Vérifie que `latest.json` est bien dans les assets de la release

### "Signature verification failed"

- La clé publique dans `tauri.conf.json` ne correspond pas à la clé privée utilisée pour signer
- **Ne jamais régénérer les clés** après une release publique

### L'app ne se lance pas après update

- Check les logs : `~/Library/Logs/Refine/`
- Si crash au démarrage, l'utilisateur devra re-télécharger le DMG

### Le CI échoue

- Vérifie que les secrets `TAURI_SIGNING_PRIVATE_KEY` sont bien configurés
- Vérifie que le Rust toolchain supporte les targets macOS

### Apple Gatekeeper bloque l'app

- Sans certificat Apple : l'utilisateur doit faire clic droit > Ouvrir
- Avec certificat : vérifie que la notarization a réussi dans les logs CI
- `spctl --assess --verbose /Applications/Refine.app` pour vérifier localement
