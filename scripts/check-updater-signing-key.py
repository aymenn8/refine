#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request


def fail(message: str) -> int:
    print(f"Error: {message}", file=sys.stderr)
    return 1


def key_id_from_blob(blob: bytes, label: str) -> int:
    if len(blob) < 10:
        raise ValueError(f"{label} payload is too short")
    return struct.unpack("<Q", blob[2:10])[0]


def read_key_id_from_signature(signature_encoded: str, label: str) -> int:
    signature_text = base64.b64decode(signature_encoded).decode("utf-8")
    lines = [line.strip() for line in signature_text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError(f"invalid {label} format")
    signature_payload = base64.b64decode(lines[1])
    return key_id_from_blob(signature_payload, label)


def read_pubkey_id_from_config(config_path: str) -> tuple[int, str | None]:
    with open(config_path, "r", encoding="utf-8") as handle:
        config = json.load(handle)

    updater = config.get("plugins", {}).get("updater", {})
    pubkey_encoded = updater.get("pubkey")
    if not pubkey_encoded:
        raise ValueError("plugins.updater.pubkey is missing in config")

    pubkey_text = base64.b64decode(pubkey_encoded).decode("utf-8")
    lines = [line.strip() for line in pubkey_text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError("invalid updater pubkey format in config")

    payload = base64.b64decode(lines[1])
    payload_key_id = key_id_from_blob(payload, "public key")

    comment_match = re.search(r"([0-9A-Fa-f]{16})\s*$", lines[0])
    if comment_match:
        comment_key_id = int(comment_match.group(1), 16)
        if comment_key_id != payload_key_id:
            raise ValueError(
                "updater pubkey comment key id does not match payload key id"
            )

    endpoints = updater.get("endpoints") or []
    endpoint = endpoints[0] if endpoints else None
    return payload_key_id, endpoint


def read_private_key_id_from_env() -> int | None:
    private_key = os.environ.get("TAURI_SIGNING_PRIVATE_KEY", "").strip()
    private_key_path = os.environ.get("TAURI_SIGNING_PRIVATE_KEY_PATH", "").strip()
    if not private_key and not private_key_path:
        return None

    run_env = os.environ.copy()
    if private_key:
        run_env["TAURI_SIGNING_PRIVATE_KEY"] = private_key
    else:
        run_env.pop("TAURI_SIGNING_PRIVATE_KEY", None)
    if private_key_path:
        expanded_path = os.path.expanduser(os.path.expandvars(private_key_path.strip("'\"")))
        run_env["TAURI_SIGNING_PRIVATE_KEY_PATH"] = expanded_path
    else:
        run_env.pop("TAURI_SIGNING_PRIVATE_KEY_PATH", None)

    run_env["CI"] = "true"
    try:
        with tempfile.TemporaryDirectory(prefix="tauri-key-id-check-") as temp_dir:
            probe_path = os.path.join(temp_dir, "probe.txt")
            with open(probe_path, "w", encoding="utf-8") as handle:
                handle.write("probe\n")

            sign = subprocess.run(
                ["cargo", "tauri", "signer", "sign", probe_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=run_env,
                check=False,
            )
            if sign.returncode != 0:
                stderr = (sign.stderr or "").strip()
                stdout = (sign.stdout or "").strip()
                details = stderr or stdout or "unknown error"
                raise ValueError(f"failed to sign probe file: {details}")

            signature_path = f"{probe_path}.sig"
            if not os.path.isfile(signature_path):
                raise ValueError("failed to locate generated probe signature")
            with open(signature_path, "r", encoding="utf-8") as handle:
                signature_encoded = handle.read().strip()
    except FileNotFoundError as exc:
        raise ValueError(f"required command not found: {exc}") from exc

    return read_key_id_from_signature(signature_encoded, "private key signature")


def read_remote_signature_key_ids(latest_json_url: str) -> set[int]:
    with urllib.request.urlopen(latest_json_url, timeout=15) as response:
        data = json.load(response)

    platforms = data.get("platforms", {})
    if not platforms:
        raise ValueError("latest.json has no platforms")

    key_ids: set[int] = set()
    for platform_name, platform_data in platforms.items():
        signature_encoded = platform_data.get("signature")
        if not signature_encoded:
            raise ValueError(f"platform '{platform_name}' has no signature")
        key_ids.add(
            read_key_id_from_signature(
                signature_encoded, f"signature '{platform_name}'"
            )
        )

    return key_ids


def hex_key_id(key_id: int) -> str:
    return f"{key_id:016X}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify that updater pubkey, signing private key, and release signatures use the same key id."
    )
    parser.add_argument(
        "--config",
        default="src-tauri/tauri.conf.json",
        help="Path to tauri config file (default: src-tauri/tauri.conf.json).",
    )
    parser.add_argument(
        "--latest-json-url",
        default="",
        help="Explicit latest.json URL. Defaults to first updater endpoint in config.",
    )
    parser.add_argument(
        "--skip-remote-check",
        action="store_true",
        help="Skip checking key id from remote latest.json signatures.",
    )
    parser.add_argument(
        "--require-private-key",
        action="store_true",
        help="Fail if TAURI_SIGNING_PRIVATE_KEY is missing.",
    )
    args = parser.parse_args()

    try:
        config_key_id, endpoint = read_pubkey_id_from_config(args.config)
    except Exception as exc:
        return fail(f"could not read updater pubkey: {exc}")

    print(f"Config updater pubkey key id: {hex_key_id(config_key_id)}")

    try:
        private_key_id = read_private_key_id_from_env()
    except Exception as exc:
        return fail(f"could not parse TAURI_SIGNING_PRIVATE_KEY: {exc}")

    if private_key_id is None:
        if args.require_private_key:
            return fail("TAURI_SIGNING_PRIVATE_KEY is required but not set")
        print("Signing private key key id: (not provided)")
    else:
        print(f"Signing private key key id: {hex_key_id(private_key_id)}")
        if private_key_id != config_key_id:
            return fail(
                "updater pubkey in config does not match TAURI_SIGNING_PRIVATE_KEY key id"
            )

    if args.skip_remote_check:
        return 0

    latest_json_url = args.latest_json_url.strip() or (endpoint or "")
    if not latest_json_url:
        return fail("no updater endpoint found in config and --latest-json-url not provided")

    try:
        remote_key_ids = read_remote_signature_key_ids(latest_json_url)
    except urllib.error.URLError as exc:
        return fail(f"failed to fetch latest.json from '{latest_json_url}': {exc}")
    except Exception as exc:
        return fail(f"failed to parse remote signatures: {exc}")

    remote_key_ids_hex = sorted(hex_key_id(key_id) for key_id in remote_key_ids)
    print(
        f"Remote latest.json signature key id(s): {', '.join(remote_key_ids_hex)} ({latest_json_url})"
    )

    if len(remote_key_ids) > 1:
        return fail("remote latest.json contains signatures from multiple key ids")
    if config_key_id not in remote_key_ids:
        return fail("updater pubkey key id does not match remote latest.json signatures")

    return 0


if __name__ == "__main__":
    sys.exit(main())
