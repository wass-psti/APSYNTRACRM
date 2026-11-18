#!/usr/bin/env python3
"""Read-only provider evidence recovery for TalkBox; never performs CRM writes.

Requires MONDAY_API_TOKEN supplied to the process, never reads browser
cookies, and does not store transient asset public_url values.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BOARD = "18370784140"
SOURCE_HASH = "fcd0893d2f3e9a4f631a0a160f638b7641c39ab82a1b379e6f8379e3d86b667a"
MANIFEST_HASH = "ffd63a92a83c2284f7f75d454bcd55eb0fe00c061c482853ade1dc4f825decbf"
INVENTORY_HASH = "82e4d064ce924d1f6e004104b21a7099cb25e93fb35572f445d4e870f289477e"
ID_PATTERN = re.compile(r"[1-9][0-9]{0,19}\Z")
REPOSITORY = Path(__file__).resolve().parents[1]

FIRST_PAGE = """query($ids:[ID!]!) {
 boards(ids:$ids) {
  id
  items_page(limit:100) {
   cursor
   items {id name subitems {id name parent_item {id} board {id}}}
  }
 }
}"""
NEXT_PAGE = """query($cursor:String!) {
 next_items_page(cursor:$cursor,limit:100) {
  cursor
  items {id name subitems {id name parent_item {id} board {id}}}
 }
}"""
ASSET_PAGE = """query($ids:[ID!]!) {
 assets(ids:$ids) {
  id name file_extension file_size created_at
  uploaded_by {id name}
 }
}"""


def source_ids(manifest, inventory):
    if (manifest.get("source_board_id") != BOARD or
        inventory.get("source_board_id") != BOARD or
        manifest.get("workbook_sha256") != SOURCE_HASH or
        inventory.get("workbook_sha256") != SOURCE_HASH):
        raise ValueError("Source identity mismatch")
    parents = [str(i["monday_item_id"]) for i in manifest["issues"]]
    assets = [str(i["source_asset_id"]) for i in inventory["asset_references"]]
    if len(parents) != 87 or len(set(parents)) != 87:
        raise ValueError("Incomplete or duplicate source issues")
    if len(assets) != 148 or len(set(assets)) != 148:
        raise ValueError("Incomplete or duplicate source media inventory")
    if any(not ID_PATTERN.fullmatch(s) for s in parents + assets):
        raise ValueError("Invalid source identifier")
    return set(parents), set(assets)


def reconcile_parents(expected, pages):
    if not pages or pages[-1].get("cursor") is not None:
        raise ValueError("Unfinished board pagination")
    observed = set()
    children = {}
    subitem_boards = set()
    for page in pages:
        records = page.get("items")
        if not isinstance(records, list):
            raise ValueError("Provider page missing items")
        for item in records:
            parent = str(item.get("id", ""))
            if parent in observed or not ID_PATTERN.fullmatch(parent):
                raise ValueError("Duplicate or invalid parent ID")
            observed.add(parent)
            subitems = item.get("subitems")
            if not isinstance(subitems, list):
                raise ValueError("Provider did not enumerate subitems")
            for child in subitems:
                cid = str(child.get("id", ""))
                pid = str((child.get("parent_item") or {}).get("id", ""))
                board = str((child.get("board") or {}).get("id", ""))
                if (not ID_PATTERN.fullmatch(cid) or cid in children or cid in expected or
                    pid != parent or not ID_PATTERN.fullmatch(board)):
                    raise ValueError("Invalid subitem parent/identity")
                children[cid] = {"source_subitem_id": cid, "source_parent_id": parent,
                                 "subitem_board_id": board, "name": child.get("name", "")}
                subitem_boards.add(board)
    if observed != expected:
        raise ValueError("Provider parent set differs from complete pinned export")
    if len(subitem_boards) > 1:
        raise ValueError("Multiple subitem boards require separate reconciliation")
    return {"verified_source_parent_count": len(observed),
            "source_subitem_count": len(children),
            "source_subitem_board_ids": sorted(subitem_boards, key=int),
            "source_subitems": [children[k] for k in sorted(children, key=int)]}


def reconcile_assets(expected, batches):
    found = {}
    for batch in batches:
        if not isinstance(batch, list):
            raise ValueError("Missing asset batch")
        for asset in batch:
            aid = str(asset.get("id", ""))
            size = asset.get("file_size")
            if aid in found:
                raise ValueError("duplicate provider asset ID")
            if (not ID_PATTERN.fullmatch(aid) or
                type(size) is not int or size <= 0 or
                not isinstance(asset.get("name"), str) or not asset["name"].strip()):
                raise ValueError("Invalid provider asset")
            found[aid] = {
                "source_asset_id": aid,
                "original_filename": asset["name"],
                "file_size": size,
                "file_extension": asset.get("file_extension"),
                "source_created_at": asset.get("created_at"),
                "uploader_id": str((asset.get("uploaded_by") or {}).get("id", "")),
                "media_state": "METADATA_ONLY",
                "bytes_verified": False,
                "file_sha256": None,
            }
    if set(found) != expected:
        raise ValueError("Missing or unexpected provider asset identifiers")
    return {"metadata_count": len(found), "verified_bytes_count": 0,
            "assets": [found[k] for k in sorted(found, key=int)]}


class Provider:
    def __init__(self, token):
        if not token:
            raise RuntimeError("MONDAY_API_TOKEN is not configured")
        self.token = token

    def query(self, statement, variables):
        payload = json.dumps({"query": statement, "variables": variables}).encode("utf-8")
        for attempt in range(3):
            req = Request("https://api.monday.com/v2", data=payload, method="POST",
                          headers={"Authorization": self.token,
                                   "Content-Type": "application/json",
                                   "API-Version": "2026-10"})
            try:
                with urlopen(req, timeout=25) as response:
                    if response.status != 200:
                        raise RuntimeError("Provider rejected request")
                    body = response.read(4 * 1024 * 1024 + 1)
                if len(body) > 4 * 1024 * 1024:
                    raise RuntimeError("Provider response exceeded size limit")
                parsed = json.loads(body)
                if parsed.get("errors") or not isinstance(parsed.get("data"), dict):
                    raise RuntimeError("Provider GraphQL result invalid")
                return parsed["data"]
            except HTTPError as exc:
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise RuntimeError("Provider API request denied or failed") from None
            except (URLError, TimeoutError):
                if attempt == 2:
                    raise RuntimeError("Provider unavailable") from None
            time.sleep(attempt + 1)
        raise RuntimeError("Provider unavailable")

    def board_pages(self):
        result = self.query(FIRST_PAGE, {"ids": [BOARD]})
        boards = result.get("boards")
        if not isinstance(boards, list) or len(boards) != 1 or str(boards[0].get("id")) != BOARD:
            raise ValueError("Provider returned wrong board")
        page = boards[0].get("items_page")
        pages = []
        seen = set()
        while True:
            if not isinstance(page, dict):
                raise ValueError("Missing page")
            pages.append(page)
            cursor = page.get("cursor")
            if cursor is None:
                return pages
            if not isinstance(cursor, str) or cursor in seen or len(pages) > 20:
                raise ValueError("Invalid or repeated pagination cursor")
            seen.add(cursor)
            page = self.query(NEXT_PAGE, {"cursor": cursor}).get("next_items_page")

    def asset_batches(self, ids):
        ids = sorted(ids, key=int)
        results = []
        for i in range(0, len(ids), 20):
            items = self.query(ASSET_PAGE, {"ids": ids[i:i + 20]}).get("assets")
            if not isinstance(items, list):
                raise ValueError("Missing asset response")
            results.append(items)
        return results


def save_private(path, evidence):
    output = path.expanduser().resolve()
    if output.is_relative_to(REPOSITORY):
        raise ValueError("Evidence output cannot be in repository")
    encoded = (json.dumps(evidence, ensure_ascii=False, sort_keys=True,
                          separators=(",", ":")) + "\n").encode("utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(encoded)
    return hashlib.sha256(encoded).hexdigest()


def run(args):
    original = args.manifest.read_bytes()
    if hashlib.sha256(original).hexdigest() != MANIFEST_HASH:
        raise ValueError("Pinned private manifest hash mismatch")
    manifest = json.loads(original)
    raw_inventory = args.inventory.read_bytes()
    if hashlib.sha256(raw_inventory).hexdigest() != INVENTORY_HASH:
        raise ValueError("Pinned private media inventory hash mismatch")
    inventory = json.loads(raw_inventory)
    parent_ids, asset_ids = source_ids(manifest, inventory)
    token = os.environ.get("MONDAY_API_TOKEN")
    if not token:
        print(json.dumps({"status": "BLOCKED_PROVIDER_CREDENTIAL",
                          "expected_issues": len(parent_ids), "expected_assets": len(asset_ids),
                          "ready_for_production": False}))
        return 3
    provider = Provider(token)
    parents = reconcile_parents(parent_ids, provider.board_pages())
    assets = reconcile_assets(asset_ids, provider.asset_batches(asset_ids))
    evidence = {"source_board_id": BOARD, "workbook_sha256": SOURCE_HASH,
                "parent_lineage": parents, "media": assets,
                "provider_metadata_reconciled": True,
                "attachment_bytes_verified": False,
                "ready_for_production": False, "production_writes_authorized": False}
    digest = save_private(args.output, evidence)
    print(json.dumps({"status": "PROVIDER_METADATA_RECONCILED",
                      "verified_issue_ids": parents["verified_source_parent_count"],
                      "provider_subitem_count": parents["source_subitem_count"],
                      "media_metadata_count": assets["metadata_count"],
                      "verified_media_bytes": 0, "evidence_sha256": digest,
                      "ready_for_production": False}))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        return run(args)
    except (RuntimeError, ValueError, OSError, KeyError, TypeError):
        print(json.dumps({"status": "BLOCKED_PROVIDER_RECONCILIATION",
                          "ready_for_production": False}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
