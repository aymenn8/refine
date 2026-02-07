# Refine — Release Guide

## Comment release

1. Écris tes patch notes dans `RELEASE_NOTES.md`
2. Commit tout ton code sur `main`
3. Lance le script :

```bash
./scripts/release.sh        # auto-incrémente le patch (0.1.1 → 0.1.2)
./scripts/release.sh 0.2.0  # version custom
```

Le script fait tout : bump la version dans les 3 fichiers, commit, tag, push.
GitHub Actions build, signe, notarise, et publie sur `refine-releases`.

4. Va sur https://github.com/aymenn8/refine-releases/releases
5. La release est en **draft** → review et clique **Publish**

---

## GitHub Secrets

Sur `refine-app` → Settings → Secrets → Actions :

### Tauri (signature des updates)

| Secret | Valeur |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `cat ~/.tauri/refine.key \| pbcopy` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Le mot de passe de la clé |

### Apple (code signing + notarisation)

| Secret | Valeur |
|---|---|
| `APPLE_CERTIFICATE` | Le .p12 en base64 (`base64 -i cert.p12 \| pbcopy`) |
| `APPLE_CERTIFICATE_PASSWORD` | Mot de passe du .p12 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Aymen Kadri (52WH9VZ63T)` |
| `APPLE_ID` | Ton email Apple |
| `APPLE_PASSWORD` | App-Specific Password (appleid.apple.com → Sign-In → App-Specific Passwords) |
| `APPLE_TEAM_ID` | `52WH9VZ63T` |

### GitHub (publish sur le repo public)

| Secret | Valeur |
|---|---|
| `RELEASE_TOKEN` | PAT fine-grained avec Contents Read/Write sur `refine-releases` |

---

## Architecture

- Code privé : `aymenn8/refine-app`
- Releases publiques : `aymenn8/refine-releases`
- L'updater de l'app lit : `https://github.com/aymenn8/refine-releases/releases/latest/download/latest.json`
- Ne jamais régénérer `~/.tauri/refine.key` après une release publiée (casserait les updates)
