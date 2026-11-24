"""Offline review of the exact historical batch against a fresh native inventory.
This utility neither connects to nor writes to any database.
"""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from runpy import run_path

store = run_path(str(Path(__file__).with_name("legacy-local-store.py")))
WORKSPACE = store["WORKSPACE"]
BOARD = "3670228015"

def sha(data):
    return hashlib.sha256(data).hexdigest()

def review(manifest_bytes, workbook_bytes, inventory, expected_hash):
    manifest = json.loads(manifest_bytes)
    if sha(manifest_bytes) != expected_hash:
        raise ValueError("Compatibility manifest hash mismatch")
    workbook_hash = sha(workbook_bytes)
    if inventory.get("workspaceId") != WORKSPACE or inventory.get("complete") is not True:
        raise ValueError("Incomplete destination inventory")
    if inventory.get("registryExists") is not False or inventory.get("legacyTableExists") is not False:
        raise ValueError("Production schema state changed; reconcile before activation")
    native = inventory["rows"]
    if inventory["expectedCount"] != len(native):
        raise ValueError("Destination count mismatch")
    native_ids = {row["id"] for row in native}
    if len(native_ids) != len(native):
        raise ValueError("Duplicate native identity")
    target_po = {row["po_number"].strip().upper() for row in native if row["workspace_id"] == WORKSPACE}
    batch = []
    records = manifest["records"]
    materialized = list(store["materialize"](manifest))
    locators = set()
    item_ids = set()
    for record, (record_id, key, ordinal, payload) in zip(records, materialized):
        provenance = record["provenance"]
        locator = provenance["locator"]
        if provenance["boardId"] != BOARD or provenance["workbookSha256"] != workbook_hash or locator in locators:
            raise ValueError("Source provenance mismatch")
        locators.add(locator)
        item_id = record["identity"]["itemId"]
        if item_id is not None:
            if not re.fullmatch(r"[0-9]+", item_id) or item_id in item_ids or key != f"monday:{BOARD}:{item_id}":
                raise ValueError("Invalid corroborated identity")
            item_ids.add(item_id)
        elif key != f"snapshot:{workbook_hash}:{locator}":
            raise ValueError("Invalid snapshot-only identity")
        if record_id in native_ids:
            raise ValueError("Native UUID collision")
        if record["values"]["poNumber"].strip().upper() in target_po:
            raise ValueError("Native PO collision")
        batch.append({"id":record_id,"sourceKey":key,"locator":locator,
                      "payloadSha256":sha(payload.encode("utf-8"))})
    if len({row["id"] for row in batch}) != len(records):
        raise ValueError("Duplicate generated UUID")
    po_counts = Counter(record["values"]["poNumber"].strip().upper() for record in records)
    return {"status":"REVIEW_READY_NOT_AUTHORIZED","productionImportAuthorized":False,
            "workspaceId":WORKSPACE,"boardId":BOARD,"manifestSha256":expected_hash,
            "workbookSha256":workbook_hash,"sourceCount":len(batch),
            "confirmedItemIds":len(item_ids),"snapshotOnlyIds":len(batch)-len(item_ids),
            "nativeUuidCollisions":0,"nativePoCollisions":0,"nativeInventoryCount":len(native),
            "repeatedPoRows":sum(n for n in po_counts.values() if n>1),
            "unknownCurrency":sum(not r["values"]["currency"] for r in records),
            "unknownArchive":sum(r["sourceArchiveState"] is None for r in records),
            "missingCurrentClient":sum(not r["values"]["clientName"] for r in records),
            "missingVatRate":sum(r["values"]["vatRate"] is None for r in records),
            "records":batch}

if __name__=="__main__":
    manifest,workbook,inventory,expected=sys.argv[1:]
    report=review(Path(manifest).read_bytes(),Path(workbook).read_bytes(),
                  json.loads(Path(inventory).read_text()),expected)
    print(json.dumps(report,ensure_ascii=False,indent=2))
