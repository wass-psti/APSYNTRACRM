#!/usr/bin/env python3
"""One-session, read-only monday source recovery (no credential persistence).

Use a pre-existing approved MONDAY_API_TOKEN or enter it at a hidden local TTY
prompt. This tool never creates, regenerates, prints, or writes a credential.
It never performs CRM data, auth, schema or permission writes.
"""
import argparse
from datetime import datetime, timezone
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SPEC = importlib.util.spec_from_file_location("tb_provider_session_source", HERE / "talkbox-provider-evidence.py")
PROVIDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROVIDER)
MANIFEST_NAME = "CP-TB-NATIVE-01J-private-migration-manifest.json"
INVENTORY_NAME = "CP-TB-NATIVE-01L-private-media-inventory.json"


def source_inputs(directory):
    directory = directory.expanduser().resolve(strict=True)
    if directory.is_relative_to(ROOT):
        raise ValueError("Source evidence must reside outside the repository")
    manifest = directory / MANIFEST_NAME
    inventory = directory / INVENTORY_NAME
    if hashlib.sha256(manifest.read_bytes()).hexdigest() != PROVIDER.MANIFEST_HASH:
        raise ValueError("Pinned source manifest hash mismatch")
    if hashlib.sha256(inventory.read_bytes()).hexdigest() != PROVIDER.INVENTORY_HASH:
        raise ValueError("Pinned source asset inventory hash mismatch")
    return directory, manifest, inventory


def commands(directory, manifest, inventory, run_id):
    provider_file = directory / ("CP-TB-NATIVE-01P-provider-" + run_id + ".json")
    assets_dir = directory / "CP-TB-NATIVE-01P-assets"
    outcome_file = directory / ("CP-TB-NATIVE-01P-parity-" + run_id + ".json")
    python = sys.executable
    return [
        [python, str(HERE / "talkbox-provider-evidence.py"),
         "--manifest", str(manifest), "--inventory", str(inventory),
         "--output", str(provider_file)],
        [python, str(HERE / "talkbox-provider-byte-recovery.py"),
         "--manifest", str(manifest), "--inventory", str(inventory),
         "--output-dir", str(assets_dir)],
        [python, str(HERE / "talkbox-recovery-readiness.py"),
         "--manifest", str(manifest), "--inventory", str(inventory),
         "--provider-evidence", str(provider_file),
         "--asset-directory", str(assets_dir),
         "--output", str(outcome_file)]
    ]


def execute(directory, manifest, inventory, token, runner=subprocess.run, run_id=None):
    if not token or not token.strip():
        return {"status": "BLOCKED_PROVIDER_CREDENTIAL", "ready_for_production": False}
    if run_id is None:
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:12]
    child_env = dict(os.environ)
    child_env["MONDAY_API_TOKEN"] = token
    stages = ("PROVIDER_ENUMERATION", "ORIGINAL_ASSET_RECOVERY", "SOURCE_PARITY_READBACK")
    expected_status = ("PROVIDER_METADATA_RECONCILED", "LOCAL_ASSET_BYTES_VERIFIED",
                       "SOURCE_RECOVERY_BYTES_RECONCILED")
    for name, required_status, command in zip(stages, expected_status,
                                              commands(directory, manifest, inventory, run_id)):
        outcome = runner(command, env=child_env, text=True, capture_output=True, timeout=900,
                         cwd=str(ROOT), check=False)
        # The CLI's JSON status is a strict public status contract. Never
        # forward stdout/stderr unfiltered: it may contain private provider data.
        status = {}
        try:
            status = json.loads(outcome.stdout.strip())
            stage_status = status.get("status", "")
        except (ValueError, AttributeError):
            stage_status = ""
        count_valid = (
            (name != "PROVIDER_ENUMERATION" or
             (status.get("verified_issue_ids") == 87 and
              status.get("media_metadata_count") == 148 and
              status.get("ready_for_production") is False)) and
            (name != "ORIGINAL_ASSET_RECOVERY" or
             (status.get("verified_bytes") == 148 and
              status.get("ready_for_production") is False)) and
            (name != "SOURCE_PARITY_READBACK" or
             (status.get("original_media_bytes_verified") == 148 and
              status.get("ready_for_production") is False))
        ) if isinstance(status, dict) else False
        if outcome.returncode != 0 or stage_status != required_status or not count_valid:
            return {"status": "BLOCKED_SOURCE_RECOVERY", "stage": name,
                    "ready_for_production": False, "production_writes": False}
    return {"status": "SOURCE_ONLY_RECONCILIATION_COMPLETE",
            "source_issues": 87, "source_assets": 148,
            "ready_for_production": False, "production_writes": False}


def acquire_token(interactive=True):
    token = os.environ.get("MONDAY_API_TOKEN", "")
    if token:
        return token
    if not interactive or not sys.stdin.isatty():
        return ""
    print("Enter an existing approved monday.com API token on this Mac (input hidden).")
    try:
        return getpass.getpass("monday.com token: ")
    except (EOFError, KeyboardInterrupt):
        return ""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-directory", type=Path, default=Path.home() /
                        ".apsyntra-work/talkbox-source-evidence")
    parser.add_argument("--non-interactive", action="store_true",
                        help="Return a blocked result instead of prompting for a credential")
    args = parser.parse_args()
    try:
        directory, manifest, inventory = source_inputs(args.source_directory)
        token = acquire_token(not args.non_interactive)
        result = execute(directory, manifest, inventory, token)
        print(json.dumps(result, sort_keys=True))
        return 0 if result["status"] == "SOURCE_ONLY_RECONCILIATION_COMPLETE" else 3
    except (ValueError, OSError, subprocess.TimeoutExpired):
        print(json.dumps({"status": "BLOCKED_SOURCE_RECOVERY_PREFLIGHT",
                          "ready_for_production": False, "production_writes": False}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
