#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

load_local_env() {
  local script_dir root_dir env_file
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  root_dir="$(cd "${script_dir}/.." && pwd)"
  if [ -f "${script_dir}/.env.local" ]; then
    env_file="${script_dir}/.env.local"
  elif [ -f "${root_dir}/.env.notarization" ]; then
    env_file="${root_dir}/.env.notarization"
  else
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  . "${env_file}"
  set +a
}
load_local_env

TARGETS="both"
RELEASE_REPO="${RELEASE_REPO:-aymenn8/refine-releases}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-before-notarization.sh [--targets both|arm64|intel] [--release-repo owner/repo]

What it does:
1) Builds macOS updater+dmg artifacts
2) Submits each DMG to Apple Notary (async, no wait)
3) Saves a manifest in .context/release-state/<tag>/manifest.env
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --targets)
      TARGETS="${2:-}"
      shift 2
      ;;
    --release-repo)
      RELEASE_REPO="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

for v in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD; do
  if [ -z "${!v:-}" ]; then
    echo "Missing $v (set it in scripts/.env.local)"
    exit 1
  fi
done

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"
STATE_DIR=".context/release-state/${TAG}"
MANIFEST_PATH="${STATE_DIR}/manifest.env"
mkdir -p "$STATE_DIR"

target_triples=()
case "$TARGETS" in
  both)
    target_triples=("aarch64-apple-darwin" "x86_64-apple-darwin")
    ;;
  arm64)
    target_triples=("aarch64-apple-darwin")
    ;;
  intel)
    target_triples=("x86_64-apple-darwin")
    ;;
  *)
    echo "Invalid --targets value: $TARGETS (expected: both|arm64|intel)"
    exit 1
    ;;
esac

ensure_target_installed() {
  local triple="$1"
  if ! rustup target list --installed | grep -qx "$triple"; then
    rustup target add "$triple"
  fi
}

submit_dmg() {
  local dmg="$1"
  local out submission_id
  out="$(xcrun notarytool submit "$dmg" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --output-format json)"
  submission_id="$(printf "%s" "$out" | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id",""))')"
  if [ -z "$submission_id" ]; then
    echo "Unable to read submission id for $dmg"
    exit 1
  fi
  echo "$submission_id"
}

key_from_target() {
  echo "$1" | tr '[:lower:]-' '[:upper:]_'
}

{
  echo "VERSION=${VERSION}"
  echo "TAG=${TAG}"
  echo "RELEASE_REPO=${RELEASE_REPO}"
  echo "CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "TARGETS=\"${target_triples[*]}\""
} > "$MANIFEST_PATH"

for triple in "${target_triples[@]}"; do
  ensure_target_installed "$triple"

  # The project lives on an iCloud-synced (FileProvider) volume.
  # FileProvider automatically adds extended attributes (resource forks,
  # com.apple.fileprovider.*) to newly created files, which causes
  # codesign to fail with "detritus not allowed".
  #
  # Fix: redirect Cargo's target directory to a local (non-synced) path
  # so the .app bundle is built outside FileProvider's reach.
  export CARGO_TARGET_DIR="${HOME}/.cache/refine-build/target"
  mkdir -p "$CARGO_TARGET_DIR"

  xattr -cr src-tauri/icons src-tauri/entitlements.plist

  echo ">>> Building target: $triple"
  pnpm tauri build --target "$triple" --bundles app,dmg --verbose --ci --skip-stapling

  bundle_base="${CARGO_TARGET_DIR}/${triple}/release/bundle"
  dmg_path="$(find "${bundle_base}/dmg" -maxdepth 1 -type f -name '*.dmg' | head -n 1)"
  tar_path="${bundle_base}/macos/Refine.app.tar.gz"
  sig_path="${bundle_base}/macos/Refine.app.tar.gz.sig"

  if [ -z "$dmg_path" ] || [ ! -f "$tar_path" ] || [ ! -f "$sig_path" ]; then
    echo "Missing expected artifacts for $triple"
    echo "dmg=$dmg_path"
    echo "tar=$tar_path"
    echo "sig=$sig_path"
    exit 1
  fi

  echo ">>> Submitting DMG to Apple Notary: $dmg_path"
  submission_id="$(submit_dmg "$dmg_path")"
  echo "Submission ID ($triple): $submission_id"

  key="$(key_from_target "$triple")"
  {
    echo "DMG_${key}=${dmg_path}"
    echo "TAR_${key}=${tar_path}"
    echo "SIG_${key}=${sig_path}"
    echo "SUBMISSION_${key}=${submission_id}"
  } >> "$MANIFEST_PATH"
done

echo
echo "Done."
echo "Manifest saved to: $MANIFEST_PATH"
echo "Next step:"
echo "./scripts/release-after-notarization.sh --manifest \"$MANIFEST_PATH\""
