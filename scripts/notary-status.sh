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

usage() {
  cat <<'EOF'
Usage:
  ./scripts/notary-status.sh
  ./scripts/notary-status.sh <submission-id>
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

for v in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!v:-}" ]; then
    echo "Missing $v (export it or put it in scripts/.env.local)"
    exit 1
  fi
done

if [ $# -gt 0 ]; then
  id="$1"
  xcrun notarytool info "$id" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID"
  exit 0
fi

if [ -f ".context/latest-notarization-ids.tsv" ]; then
  echo "Recent local submissions:"
  tail -n 10 .context/latest-notarization-ids.tsv | while IFS=$'\t' read -r ts triple id; do
    [ -z "$id" ] && continue
    status="$(xcrun notarytool info "$id" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --output-format json | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status","unknown"))')"
    echo "- $triple | $status | $id | $ts"
  done
  exit 0
fi

if [ -f ".context/latest-notarization-id.txt" ]; then
  id="$(cat .context/latest-notarization-id.txt)"
  xcrun notarytool info "$id" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID"
  exit 0
fi

echo "No local submission id found in .context."
echo "Fetching Apple notarization history..."

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
