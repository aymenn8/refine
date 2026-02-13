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

MANIFEST_PATH=""
WAIT_MINUTES="${WAIT_MINUTES:-240}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-after-notarization.sh [--manifest <path>] [--wait-minutes 240]

What it does:
1) Waits for each DMG submission to become Accepted
2) Staples + validates DMGs
3) Builds an ordered release folder with:
   - both DMGs
   - both updater tar.gz + sig
   - latest.json
   - UPLOAD_ORDER.txt
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --manifest)
      MANIFEST_PATH="${2:-}"
      shift 2
      ;;
    --wait-minutes)
      WAIT_MINUTES="${2:-240}"
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

for v in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!v:-}" ]; then
    echo "Missing $v (set it in scripts/.env.local)"
    exit 1
  fi
done

if [ -z "$MANIFEST_PATH" ]; then
  MANIFEST_PATH="$(find .context/release-state -type f -name manifest.env 2>/dev/null | sort | tail -n 1)"
fi

if [ -z "$MANIFEST_PATH" ] || [ ! -f "$MANIFEST_PATH" ]; then
  echo "Manifest not found. Run ./scripts/release-before-notarization.sh first."
  exit 1
fi

# shellcheck disable=SC1090
. "$MANIFEST_PATH"

if [ -z "${VERSION:-}" ] || [ -z "${TAG:-}" ] || [ -z "${TARGETS:-}" ]; then
  echo "Manifest is incomplete: $MANIFEST_PATH"
  exit 1
fi

RELEASE_REPO="${RELEASE_REPO:-aymenn8/refine-releases}"
RELEASE_DIR="release-assets/${TAG}"
mkdir -p "$RELEASE_DIR"

key_from_target() {
  echo "$1" | tr '[:lower:]-' '[:upper:]_'
}

platform_from_target() {
  case "$1" in
    aarch64-apple-darwin) echo "darwin-aarch64" ;;
    x86_64-apple-darwin) echo "darwin-x86_64" ;;
    *) echo "" ;;
  esac
}

suffix_from_target() {
  case "$1" in
    aarch64-apple-darwin) echo "aarch64" ;;
    x86_64-apple-darwin) echo "x86_64" ;;
    *) echo "$1" ;;
  esac
}

notary_status() {
  local id="$1"
  xcrun notarytool info "$id" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --output-format json \
    | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))'
}

wait_for_accepted() {
  local id="$1"
  local target="$2"
  local loops sleep_sec status max_loops
  sleep_sec=20
  max_loops=$(( WAIT_MINUTES * 60 / sleep_sec ))
  loops=0
  while true; do
    status="$(notary_status "$id")"
    echo "[$target] submission=$id status=$status"
    if [ "$status" = "Accepted" ]; then
      return 0
    fi
    if [ "$status" = "Invalid" ] || [ "$status" = "Rejected" ]; then
      echo "Notarization failed for $target ($id). Fetching log:"
      xcrun notarytool log "$id" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" || true
      return 1
    fi
    loops=$((loops + 1))
    if [ "$loops" -ge "$max_loops" ]; then
      echo "Timeout waiting notarization for $target ($id)"
      return 1
    fi
    sleep "$sleep_sec"
  done
}

copy_targets=()

for target in $TARGETS; do
  key="$(key_from_target "$target")"
  dmg_var="DMG_${key}"
  tar_var="TAR_${key}"
  sig_var="SIG_${key}"
  sub_var="SUBMISSION_${key}"

  dmg_path="${!dmg_var:-}"
  tar_path="${!tar_var:-}"
  sig_path="${!sig_var:-}"
  submission_id="${!sub_var:-}"

  if [ -z "$dmg_path" ] || [ -z "$tar_path" ] || [ -z "$sig_path" ] || [ -z "$submission_id" ]; then
    echo "Missing data in manifest for target $target"
    exit 1
  fi

  wait_for_accepted "$submission_id" "$target"

  echo "Stapling DMG: $dmg_path"
  xcrun stapler staple "$dmg_path"
  xcrun stapler validate "$dmg_path"
  spctl -a -vv -t install "$dmg_path"

  suffix="$(suffix_from_target "$target")"
  out_dmg="${RELEASE_DIR}/Refine_${VERSION}_${suffix}.dmg"
  out_tar="${RELEASE_DIR}/Refine_${VERSION}_${suffix}.app.tar.gz"
  out_sig="${RELEASE_DIR}/Refine_${VERSION}_${suffix}.app.tar.gz.sig"

  cp "$dmg_path" "$out_dmg"
  cp "$tar_path" "$out_tar"
  cp "$sig_path" "$out_sig"
  copy_targets+=("$target")
done

pub_date="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
latest_path="${RELEASE_DIR}/latest.json"
platform_map_file="$(mktemp)"

for target in "${copy_targets[@]}"; do
  suffix="$(suffix_from_target "$target")"
  platform="$(platform_from_target "$target")"
  sig_file="${RELEASE_DIR}/Refine_${VERSION}_${suffix}.app.tar.gz.sig"
  sig_value="$(tr -d '\n' < "$sig_file")"
  url="https://github.com/${RELEASE_REPO}/releases/download/${TAG}/Refine_${VERSION}_${suffix}.app.tar.gz"
  echo "${platform}|${sig_value}|${url}" >> "$platform_map_file"
done

/usr/bin/python3 - "$TAG" "$pub_date" "RELEASE_NOTES.md" "$latest_path" "$platform_map_file" <<'PY'
import json
import pathlib
import sys

tag, pub_date, notes_path, out_path, platform_file = sys.argv[1:]

notes = ""
p = pathlib.Path(notes_path)
if p.exists():
    notes = p.read_text(encoding="utf-8").strip()

platforms = {}
for line in pathlib.Path(platform_file).read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    platform, signature, url = line.split("|", 2)
    platforms[platform] = {"signature": signature, "url": url}

data = {
    "version": tag,
    "notes": notes,
    "pub_date": pub_date,
    "platforms": platforms,
}

pathlib.Path(out_path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
rm -f "$platform_map_file"

{
  echo "Upload these files to release ${TAG} on ${RELEASE_REPO}:"
  echo "1. Refine_${VERSION}_aarch64.dmg (if present)"
  echo "2. Refine_${VERSION}_x86_64.dmg (if present)"
  echo "3. Refine_${VERSION}_aarch64.app.tar.gz (if present)"
  echo "4. Refine_${VERSION}_aarch64.app.tar.gz.sig (if present)"
  echo "5. Refine_${VERSION}_x86_64.app.tar.gz (if present)"
  echo "6. Refine_${VERSION}_x86_64.app.tar.gz.sig (if present)"
  echo "7. latest.json"
} > "${RELEASE_DIR}/UPLOAD_ORDER.txt"

echo
echo "Release folder ready: ${RELEASE_DIR}"
ls -1 "${RELEASE_DIR}"
echo

NOTES_FILE="RELEASE_NOTES.md"
GH_NOTES_FLAG=()
if [ -f "$NOTES_FILE" ] && [ -s "$NOTES_FILE" ]; then
  GH_NOTES_FLAG=(--notes-file "$NOTES_FILE")
else
  GH_NOTES_FLAG=(--notes "Release ${TAG}")
fi

echo "Creating GitHub release ${TAG} on ${RELEASE_REPO}..."
gh release create "${TAG}" \
  --repo "${RELEASE_REPO}" \
  --title "${TAG}" \
  "${GH_NOTES_FLAG[@]}" \
  "${RELEASE_DIR}"/*

echo
echo "Release ${TAG} published on ${RELEASE_REPO}"
echo "Verify: https://github.com/${RELEASE_REPO}/releases/tag/${TAG}"
