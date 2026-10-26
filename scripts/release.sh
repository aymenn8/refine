#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

load_local_env() {
  local script_dir root_dir env_files=()
  script_dir="$(cd "$(dirname "$0")" && pwd)"
  root_dir="$(cd "${script_dir}/.." && pwd)"

  # Load release/signing secrets first, then root app env to allow overrides
  # (e.g. PostHog keys used during frontend build).
  if [ -f "${script_dir}/.env.local" ]; then
    env_files+=("${script_dir}/.env.local")
  elif [ -f "${root_dir}/.env.notarization" ]; then
    env_files+=("${root_dir}/.env.notarization")
  fi
  if [ -f "${root_dir}/.env.local" ]; then
    env_files+=("${root_dir}/.env.local")
  fi
  [ "${#env_files[@]}" -gt 0 ] || return 0

  set -a
  local env_file
  for env_file in "${env_files[@]}"; do
    # shellcheck disable=SC1090
    . "${env_file}"
  done
  set +a
}
load_local_env

die() {
  echo "Error: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Unified release script

Usage:
  ./scripts/release.sh prepare --version <x.y.z> [--targets both|arm64|intel] [--release-repo owner/repo]
  ./scripts/release.sh status --version <x.y.z> [--submission-id <id>] [--manifest <path>]
  ./scripts/release.sh publish --version <x.y.z> [--manifest <path>] [--wait-minutes <N>] [--release-repo owner/repo]
  ./scripts/release.sh all --version <x.y.z> [--targets both|arm64|intel] [--wait-minutes <N>] [--release-repo owner/repo]

Notes:
- --version is mandatory for every command.
- prepare updates version everywhere:
  package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock
EOF
}

require_env_vars() {
  local var
  for var in "$@"; do
    if [ -z "${!var:-}" ]; then
      die "Missing ${var} (set it in scripts/.env.local or .env.local)"
    fi
  done
}

validate_version() {
  local version="$1"
  if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "Invalid version '${version}' (expected format: x.y.z, e.g. 0.1.1)"
  fi
}

sync_project_version() {
  local version="$1"

  node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const version = process.argv[2];
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    json.version = version;
    fs.writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  ' "$ROOT_DIR/package.json" "$version"

  node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const version = process.argv[2];
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    json.version = version;
    fs.writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  ' "$ROOT_DIR/src-tauri/tauri.conf.json" "$version"

  local tmp_file

  tmp_file="$(mktemp)"
  awk -v version="$version" '
    BEGIN { in_pkg = 0; updated = 0 }
    {
      if ($0 == "[package]") { in_pkg = 1; print; next }
      if (in_pkg && $0 ~ /^\[/) { in_pkg = 0 }
      if (in_pkg && $0 ~ /^version = "/ && updated == 0) {
        print "version = \"" version "\""
        updated = 1
        next
      }
      print
    }
    END { if (updated == 0) exit 1 }
  ' "$ROOT_DIR/src-tauri/Cargo.toml" > "$tmp_file" || {
    rm -f "$tmp_file"
    die "Unable to update src-tauri/Cargo.toml version"
  }
  mv "$tmp_file" "$ROOT_DIR/src-tauri/Cargo.toml"

  tmp_file="$(mktemp)"
  awk -v version="$version" '
    BEGIN { in_refine = 0; updated = 0 }
    {
      if ($0 == "[[package]]") { in_refine = 0 }
      if ($0 == "name = \"refine\"") {
        in_refine = 1
        print
        next
      }
      if (in_refine && $0 ~ /^version = "/ && updated == 0) {
        print "version = \"" version "\""
        updated = 1
        in_refine = 0
        next
      }
      print
    }
    END { if (updated == 0) exit 1 }
  ' "$ROOT_DIR/src-tauri/Cargo.lock" > "$tmp_file" || {
    rm -f "$tmp_file"
    die "Unable to update src-tauri/Cargo.lock version"
  }
  mv "$tmp_file" "$ROOT_DIR/src-tauri/Cargo.lock"
}

get_package_version() {
  node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(j.version || "");' "$ROOT_DIR/package.json"
}

get_tauri_config_version() {
  node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(j.version || "");' "$ROOT_DIR/src-tauri/tauri.conf.json"
}

# Release files are named after the app (productName), e.g. Recast_1.2.3_aarch64.dmg.
app_name() {
  node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(j.productName || "");' "$ROOT_DIR/src-tauri/tauri.conf.json"
}

get_cargo_toml_version() {
  awk '
    BEGIN { in_pkg = 0 }
    $0 == "[package]" { in_pkg = 1; next }
    in_pkg && $0 ~ /^\[/ { in_pkg = 0 }
    in_pkg && $0 ~ /^version = "/ {
      gsub(/^version = "/, "", $0)
      gsub(/"$/, "", $0)
      print
      exit
    }
  ' "$ROOT_DIR/src-tauri/Cargo.toml"
}

get_cargo_lock_refine_version() {
  awk '
    $0 == "[[package]]" { in_refine = 0 }
    $0 == "name = \"refine\"" { in_refine = 1; next }
    in_refine && $0 ~ /^version = "/ {
      gsub(/^version = "/, "", $0)
      gsub(/"$/, "", $0)
      print
      exit
    }
  ' "$ROOT_DIR/src-tauri/Cargo.lock"
}

assert_project_version() {
  local expected="$1"
  local package_version tauri_version cargo_toml_version cargo_lock_version

  package_version="$(get_package_version)"
  tauri_version="$(get_tauri_config_version)"
  cargo_toml_version="$(get_cargo_toml_version)"
  cargo_lock_version="$(get_cargo_lock_refine_version)"

  [ "$package_version" = "$expected" ] || die "package.json version is ${package_version}, expected ${expected}"
  [ "$tauri_version" = "$expected" ] || die "src-tauri/tauri.conf.json version is ${tauri_version}, expected ${expected}"
  [ "$cargo_toml_version" = "$expected" ] || die "src-tauri/Cargo.toml version is ${cargo_toml_version}, expected ${expected}"
  [ "$cargo_lock_version" = "$expected" ] || die "src-tauri/Cargo.lock refine version is ${cargo_lock_version}, expected ${expected}"
}

key_from_target() {
  echo "$1" | tr '[:lower:]-' '[:upper:]_'
}

suffix_from_target() {
  case "$1" in
    aarch64-apple-darwin) echo "aarch64" ;;
    x86_64-apple-darwin) echo "x86_64" ;;
    *) echo "$1" ;;
  esac
}

notary_status() {
  local submission_id="$1"
  xcrun notarytool info "$submission_id" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --output-format json \
    | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))'
}

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
    die "Unable to read submission id for ${dmg}"
  fi
  echo "$submission_id"
}

wait_for_accepted() {
  local submission_id="$1"
  local target="$2"
  local wait_minutes="$3"
  local loops sleep_sec status max_loops
  sleep_sec=20
  max_loops=$(( wait_minutes * 60 / sleep_sec ))
  loops=0

  while true; do
    status="$(notary_status "$submission_id")"
    echo "[$target] submission=${submission_id} status=${status}"
    if [ "$status" = "Accepted" ]; then
      return 0
    fi
    if [ "$status" = "Invalid" ] || [ "$status" = "Rejected" ]; then
      echo "Notarization failed for ${target} (${submission_id}). Fetching log:"
      xcrun notarytool log "$submission_id" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" || true
      return 1
    fi
    loops=$((loops + 1))
    if [ "$loops" -ge "$max_loops" ]; then
      echo "Timeout waiting notarization for ${target} (${submission_id})"
      return 1
    fi
    sleep "$sleep_sec"
  done
}

prepare_cmd() {
  local version=""
  local targets="both"
  local release_repo="${RELEASE_REPO:-}"
  local target_triples=()
  local state_dir manifest_path tag triple bundle_base dmg_path submission_id key name

  while [ $# -gt 0 ]; do
    case "$1" in
      --version)
        version="${2:-}"
        shift 2
        ;;
      --targets)
        targets="${2:-}"
        shift 2
        ;;
      --release-repo)
        release_repo="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option for prepare: $1"
        ;;
    esac
  done

  [ -n "$version" ] || die "--version is required"
  [ -n "$release_repo" ] || die "--release-repo (or RELEASE_REPO) is required"
  validate_version "$version"

  # No updater: this fork ships notarized DMGs only, so no Tauri updater signing key is needed.
  require_env_vars APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
  name="$(app_name)"
  [ -n "$name" ] || die "productName missing in src-tauri/tauri.conf.json"

  sync_project_version "$version"
  assert_project_version "$version"

  tag="v${version}"
  state_dir=".context/release-state/${tag}"
  manifest_path="${state_dir}/manifest.env"
  mkdir -p "$state_dir"

  case "$targets" in
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
      die "Invalid --targets value: ${targets} (expected: both|arm64|intel)"
      ;;
  esac

  {
    echo "VERSION=${version}"
    echo "TAG=${tag}"
    echo "RELEASE_REPO=${release_repo}"
    echo "CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "TARGETS=\"${target_triples[*]}\""
  } > "$manifest_path"

  for triple in "${target_triples[@]}"; do
    ensure_target_installed "$triple"

    export CARGO_TARGET_DIR="${HOME}/.cache/recast-build/target"
    mkdir -p "$CARGO_TARGET_DIR"

    xattr -cr src-tauri/icons src-tauri/entitlements.plist

    echo ">>> Building target: ${triple}"
    pnpm tauri build --target "$triple" --bundles app,dmg --verbose --ci --skip-stapling

    bundle_base="${CARGO_TARGET_DIR}/${triple}/release/bundle"
    # The build folder is reused, so match this version's file, not any older DMG left in it.
    dmg_path="$(find "${bundle_base}/dmg" -maxdepth 1 -type f -name "${name}_${version}_*.dmg" | head -n 1)"

    if [ -z "$dmg_path" ]; then
      die "Missing ${name}_${version} DMG for ${triple}"
    fi

    echo ">>> Submitting DMG to Apple Notary: ${dmg_path}"
    submission_id="$(submit_dmg "$dmg_path")"
    echo "Submission ID (${triple}): ${submission_id}"

    key="$(key_from_target "$triple")"
    {
      printf 'DMG_%s=%q\n' "$key" "$dmg_path"
      echo "SUBMISSION_${key}=${submission_id}"
    } >> "$manifest_path"
  done

  echo
  echo "Done."
  echo "Manifest saved to: ${manifest_path}"
  echo "Next step:"
  echo "./scripts/release.sh publish --version ${version} --manifest \"${manifest_path}\""
}

status_cmd() {
  local version=""
  local submission_id=""
  local manifest_path=""
  local target key sub_var sub_id status

  while [ $# -gt 0 ]; do
    case "$1" in
      --version)
        version="${2:-}"
        shift 2
        ;;
      --submission-id)
        submission_id="${2:-}"
        shift 2
        ;;
      --manifest)
        manifest_path="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option for status: $1"
        ;;
    esac
  done

  [ -n "$version" ] || die "--version is required"
  validate_version "$version"
  require_env_vars APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

  if [ -n "$submission_id" ]; then
    xcrun notarytool info "$submission_id" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_PASSWORD" \
      --team-id "$APPLE_TEAM_ID"
    return 0
  fi

  if [ -z "$manifest_path" ]; then
    manifest_path=".context/release-state/v${version}/manifest.env"
  fi

  if [ -f "$manifest_path" ]; then
    # shellcheck disable=SC1090
    . "$manifest_path"
    echo "Manifest: ${manifest_path}"
    [ -n "${TARGETS:-}" ] || die "Manifest is incomplete (TARGETS missing): ${manifest_path}"
    for target in $TARGETS; do
      key="$(key_from_target "$target")"
      sub_var="SUBMISSION_${key}"
      sub_id="${!sub_var:-}"
      if [ -z "$sub_id" ]; then
        continue
      fi
      status="$(notary_status "$sub_id")"
      echo "- ${target} | ${status} | ${sub_id}"
    done
    return 0
  fi

  echo "No manifest found for version ${version}. Showing Apple notarization history."
  xcrun notarytool history \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --output-format json | /usr/bin/python3 -c '
import json,sys
d=json.load(sys.stdin)
h=d.get("history", [])
if not h:
    print("No Apple notarization submissions found.")
    raise SystemExit(0)
print("Recent Apple submissions:")
for x in h[:10]:
    print("- {status} | {id} | {date} | {name}".format(
        status=x.get("status","unknown"),
        id=x.get("id",""),
        date=x.get("createdDate",""),
        name=x.get("name","")
    ))
in_progress=[x for x in h if x.get("status")=="In Progress"]
print("")
print("In Progress count: {}".format(len(in_progress)))
if in_progress:
    print("IDs still in progress:")
    for x in in_progress:
        print("- {}".format(x.get("id","")))
'
}

publish_cmd() {
  local version=""
  local manifest_path=""
  local wait_minutes="${WAIT_MINUTES:-240}"
  local release_repo="${RELEASE_REPO:-}"
  local tag release_dir target key dmg_var sub_var dmg_path submission_id suffix out_dmg notes_file name head_sha

  while [ $# -gt 0 ]; do
    case "$1" in
      --version)
        version="${2:-}"
        shift 2
        ;;
      --manifest)
        manifest_path="${2:-}"
        shift 2
        ;;
      --wait-minutes)
        wait_minutes="${2:-240}"
        shift 2
        ;;
      --release-repo)
        release_repo="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option for publish: $1"
        ;;
    esac
  done

  [ -n "$version" ] || die "--version is required"
  validate_version "$version"
  assert_project_version "$version"

  # The release tag is created at this commit, so it must hold the version bump and be on GitHub.
  git diff --quiet HEAD -- package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock \
    || die "Commit and push the ${version} version bump before publishing"
  head_sha="$(git rev-parse HEAD)"
  [ -n "$(git branch -r --contains "$head_sha")" ] || die "Push ${head_sha} before publishing; the release tag points at it"

  require_env_vars APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

  if [ -z "$manifest_path" ]; then
    manifest_path=".context/release-state/v${version}/manifest.env"
  fi
  [ -f "$manifest_path" ] || die "Manifest not found: ${manifest_path}. Run prepare first."

  # shellcheck disable=SC1090
  . "$manifest_path"

  [ -n "${VERSION:-}" ] || die "Manifest is incomplete (VERSION missing): ${manifest_path}"
  [ -n "${TARGETS:-}" ] || die "Manifest is incomplete (TARGETS missing): ${manifest_path}"
  [ "$VERSION" = "$version" ] || die "Manifest version is ${VERSION}, expected ${version}"

  tag="v${version}"
  [ "${TAG:-}" = "$tag" ] || die "Manifest tag is ${TAG:-<empty>}, expected ${tag}"

  if [ -z "$release_repo" ]; then
    release_repo="${RELEASE_REPO:-}"
  fi
  [ -n "$release_repo" ] || die "--release-repo (or RELEASE_REPO in the manifest) is required"

  name="$(app_name)"
  [ -n "$name" ] || die "productName missing in src-tauri/tauri.conf.json"

  release_dir="release-assets/${tag}"
  mkdir -p "$release_dir"

  for target in $TARGETS; do
    key="$(key_from_target "$target")"
    dmg_var="DMG_${key}"
    sub_var="SUBMISSION_${key}"

    dmg_path="${!dmg_var:-}"
    submission_id="${!sub_var:-}"

    if [ -z "$dmg_path" ] || [ -z "$submission_id" ]; then
      die "Missing data in manifest for target ${target}"
    fi

    wait_for_accepted "$submission_id" "$target" "$wait_minutes"

    echo "Stapling DMG: ${dmg_path}"
    xcrun stapler staple "$dmg_path"
    xcrun stapler validate "$dmg_path"
    spctl -a -vv -t install "$dmg_path"

    suffix="$(suffix_from_target "$target")"
    out_dmg="${release_dir}/${name}_${version}_${suffix}.dmg"

    cp "$dmg_path" "$out_dmg"
  done

  echo
  echo "Release folder ready: ${release_dir}"
  ls -1 "${release_dir}"
  echo

  notes_file="RELEASE_NOTES.md"
  GH_NOTES_FLAG=()
  if [ -f "$notes_file" ] && [ -s "$notes_file" ]; then
    GH_NOTES_FLAG=(--notes-file "$notes_file")
  else
    GH_NOTES_FLAG=(--notes "Release ${tag}")
  fi

  local confirm_repo
  read -r -p "Type ${release_repo} to publish ${tag} there: " confirm_repo
  [ "$confirm_repo" = "$release_repo" ] || die "Publish cancelled"

  echo "Creating GitHub release ${tag} on ${release_repo}..."
  gh release create "${tag}" \
    --repo "${release_repo}" \
    --title "${tag}" \
    --target "$head_sha" \
    "${GH_NOTES_FLAG[@]}" \
    "${release_dir}"/*.dmg

  echo
  echo "Release ${tag} published on ${release_repo}"
  echo "Verify: https://github.com/${release_repo}/releases/tag/${tag}"
}

all_cmd() {
  local version=""
  local targets="both"
  local wait_minutes="${WAIT_MINUTES:-240}"
  local release_repo=""
  local prepare_args=()
  local publish_args=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --version)
        version="${2:-}"
        shift 2
        ;;
      --targets)
        targets="${2:-}"
        shift 2
        ;;
      --wait-minutes)
        wait_minutes="${2:-240}"
        shift 2
        ;;
      --release-repo)
        release_repo="${2:-}"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option for all: $1"
        ;;
    esac
  done

  [ -n "$version" ] || die "--version is required"
  validate_version "$version"

  prepare_args=(--version "$version" --targets "$targets")
  publish_args=(--version "$version" --wait-minutes "$wait_minutes")

  if [ -n "$release_repo" ]; then
    prepare_args+=(--release-repo "$release_repo")
    publish_args+=(--release-repo "$release_repo")
  fi

  prepare_cmd "${prepare_args[@]}"
  publish_cmd "${publish_args[@]}"
}

if [ $# -lt 1 ]; then
  usage
  exit 1
fi

command="$1"
shift

case "$command" in
  prepare)
    prepare_cmd "$@"
    ;;
  status)
    status_cmd "$@"
    ;;
  publish)
    publish_cmd "$@"
    ;;
  all)
    all_cmd "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    die "Unknown command: ${command}"
    ;;
esac
