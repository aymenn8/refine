#!/usr/bin/env bash
# Reassemble the exact production ZIP from tracked binary parts; does not touch src-tauri/icons.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
zip="$here/Recast_Production_Icon_Assets.zip"
expected='242d3b1eb7b183a71794142995ab60d11762075c619a2674d619275aab6cdf7e'

if [[ -e "$zip" ]]; then
  current="$(shasum -a 256 "$zip" | awk '{print $1}')"
  if [[ "$current" == "$expected" ]]; then
    printf 'Already assembled and verified: %s\n' "$zip"
    exit 0
  fi
  printf 'Refusing to replace existing archive with a different checksum: %s\n' "$zip" >&2
  exit 1
fi

parts=("$here"/archive-parts/Recast_Production_Icon_Assets.zip.part[0-9][0-9][0-9])
if (( ${#parts[@]} != 19 )); then
  printf 'Expected 19 icon-pack parts, found %d\n' "${#parts[@]}" >&2
  exit 1
fi

tmp="$(mktemp "$here/.recast-zip.XXXXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
cat -- "${parts[@]}" > "$tmp"
actual="$(shasum -a 256 "$tmp" | awk '{print $1}')"
if [[ "$actual" != "$expected" ]]; then
  printf 'Archive SHA-256 mismatch: expected %s, got %s\n' "$expected" "$actual" >&2
  exit 1
fi

mv -- "$tmp" "$zip"
trap - EXIT
printf 'Recast icon pack assembled and SHA-256 verified: %s\n' "$zip"
printf 'Review contents: unzip -l "%s"\n' "$zip"
printf 'To extract into a staging folder (without replacing live icons):\n'
printf '  unzip "%s" -d "%s"\n' "$zip" "$here"
