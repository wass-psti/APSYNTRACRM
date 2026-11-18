#!/usr/bin/env python3
"""Generate a private, never-fabricated monday asset provenance inventory.

This only extracts source asset IDs. It does not claim the bytes or URLs exist.
"""
import argparse
import hashlib
import json
import os
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SOURCE_SHA = "fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a"
MANIFEST_SHA = "ffd63a92a83c2284f7f75d454bcd55eb0fe00c061c482853ade1dc4f825decbf"
ASSET = re.compile(r"^[1-9][0-9]{0,19}$")


def inventory(manifest):
    if manifest.get("workbook_sha256") != SOURCE_SHA or manifest.get("source_board_id") != "18370784140":
        raise ValueError("Source identity mismatch")
    posts = manifest.get("posts_parent_first")
    if not isinstance(posts, list) or len(posts) != 1129:
        raise ValueError("Incomplete post provenance")
    refs = {}
    for post in posts:
        original = str(post.get("asset_ids") or "").strip()
        if not original:
            continue
        post_id = str(post["monday_post_id"])
        parts = [part.strip().strip('[]"\' ') for part in original.split(",")]
        if any(not ASSET.fullmatch(p) for p in parts):
            raise ValueError("Invalid source asset reference")
        for asset_id in set(parts):
            refs.setdefault(asset_id, set()).add(post_id)
    return {
        "source_board_id": "18370784140",
        "workbook_sha256": SOURCE_SHA,
        "asset_references": [
            {"source_asset_id": asset_id,
             "source_post_ids": sorted(post_ids, key=int),
             "media_state": "BYTES_UNVERIFIED",
             "file_sha256": None, "download_url": None, "filename": None}
            for asset_id, post_ids in sorted(refs.items(), key=lambda pair: int(pair[0]))
        ],
        "verified_media_objects": 0,
        "ready_for_activation": False
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("manifest", type=Path)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    output = args.output.expanduser().resolve()
    if output.is_relative_to(REPO):
        p.error("Private output must be outside repository")
    raw = args.manifest.read_bytes()
    if hashlib.sha256(raw).hexdigest() != MANIFEST_SHA:
        p.error("Private manifest SHA-256 mismatch")
    data = inventory(json.loads(raw))
    blob = (json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))+"\n").encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(blob)
    print(json.dumps({
        "unique_assets": len(data["asset_references"]),
        "posts_with_assets": len(set(p for ref in data["asset_references"] for p in ref["source_post_ids"])),
        "verified_media_objects": 0,
        "ready_for_activation": False,
        "inventory_sha256": hashlib.sha256(blob).hexdigest(),
        "output_permissions": oct(output.stat().st_mode & 0o777)
    }, sort_keys=True))


if __name__ == "__main__":
    main()
