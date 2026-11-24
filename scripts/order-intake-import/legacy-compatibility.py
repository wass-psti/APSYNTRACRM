"""Local legacy compatibility manifest. Not a database import or new-order payload."""
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

BOARD_ID = "3670228015"
WORKSPACE_ID = "00000000-0000-4000-8000-000000000001"
STATUSES = {"Working on it", "Processed", "PO Issued to Supplier", "PO Acknowledged",
            "Waiting for Delivery", "In Transit", "Customs Clearance", "Delayed", "Arrived",
            "Receiving Report", "Delivered", "Collected", "Closed", "Cancelled"}
FIELDS = ("poNumber", "clientName", "poDate", "dateReceived", "deliveryDate",
          "currency", "poAmount", "vatRate", "vatExclusiveAmount", "vatAmount",
          "procurementExpenses", "grossProfit", "company", "industry",
          "accountManager", "buyerInCharge", "endUserInCharge", "notes")

def digest(data):
    return hashlib.sha256(data).hexdigest()

def require(condition, message):
    if not condition:
        raise ValueError(message)

def text_or_none(value):
    return value if isinstance(value, str) and value.strip() else None

def decimal_or_none(value):
    try:
        amount = Decimal(value)
        return amount if amount.is_finite() else None
    except (TypeError, InvalidOperation, ValueError):
        return None

def load_live_evidence(documents):
    result = {}
    for document in documents:
        require(document.get("boardId") == BOARD_ID, "Unexpected live board")
        for row in document["rows"]:
            item_id, label = row["id"], row["label"]
            require(re.fullmatch(r"[0-9]+", item_id) and label.startswith("More options for "),
                    "Invalid live item identity")
            name = label.removeprefix("More options for ")
            require(item_id not in result or result[item_id] == name, "Conflicting live item identity")
            result[item_id] = name
    return result

def identity(row, live, confirmations, historical_hash, original_hash):
    confirmation = text_or_none(row["sourceRaw"].get("F"))
    prior = row.get("historicalEvidence") or {}
    historical_id = text_or_none(row.get("sourceItemId"))
    if historical_id:
        require(historical_hash and prior.get("itemId") == historical_id == confirmation,
                "Uncorroborated historical identity")
    if confirmation in live and live[confirmation] != row["poNumber"]:
        raise ValueError("Live source PO identity conflicts with export")
    live_match = confirmation and confirmations[confirmation] == 1 and live.get(confirmation) == row["poNumber"]
    item_id = historical_id or (confirmation if live_match else None)
    if item_id:
        return {"key":f"monday:{BOARD_ID}:{item_id}", "itemId":item_id,
                "confirmationId":confirmation,
                "evidence":"historical_and_live" if historical_id and live_match else
                "historical" if historical_id else "live"}
    # Only snapshot-local identity; never use it to deduplicate another export.
    return {"key":f"snapshot:{original_hash}:{row['sourceLocator']}", "itemId":None,
            "confirmationId":confirmation, "evidence":"snapshot_only"}

def legacy_record(row, review, identity_info, original_hash, historical_hash, duplicate_count):
    values = {key:text_or_none(row.get(key)) for key in FIELDS}
    raw_status = text_or_none(row.get("status"))
    group = row["sourceGroup"]
    fiscal = re.fullmatch(r"FY ([0-9]{4})", group)
    prior = row.get("historicalEvidence")
    attachments = {"poFileReference":text_or_none(row["sourceRaw"].get("H")),
                   "confirmationReference":text_or_none(row["sourceRaw"].get("G"))}
    issues = [issue for issue in review["issues"] if issue not in ("MISSING_sourceItemId", "DUPLICATE_SOURCE_PO")]
    if not identity_info["itemId"]:
        issues.append("SOURCE_ITEM_ID_UNCONFIRMED")
    if duplicate_count > 1:
        issues.append("REPEATED_PO_DESTINATION_CONTRACT_CONFLICT")
    if prior and text_or_none(prior.get("clientName")) and values["clientName"] is None:
        issues.append("HISTORICAL_CLIENT_EVIDENCE_REVIEW")
    return {"identity":identity_info,
            "provenance":{"boardId":BOARD_ID,"workbookSha256":original_hash,"locator":row["sourceLocator"],
                          "historicalWorkbookSha256":historical_hash if prior else None},
            "sourceGroup":group,"sourceFiscalYear":int(fiscal[1]) if fiscal else None,
            "sourceArchiveState":row.get("archived") if isinstance(row.get("archived"),bool) else None,
            "values":values,"sourceStatus":raw_status,
            "workflowStatus":raw_status if raw_status in STATUSES else None,
            "financialBasis":"legacy_source_vat_unverified",
            "historicalClientEvidence":prior,
            "attachments":attachments,"rawSource":row["sourceRaw"],
            "duplicatePoCount":duplicate_count,
            "newOrderValidationIssues":review["issues"],"newOrderValidationWarnings":review["warnings"],
            "reconciliationIssues":issues,
            "disposition":"LOCAL_LEGACY_REPRESENTATION_NOT_IMPORT_READY"}

def financial_inventory(records):
    totals = defaultdict(lambda: {"rows":0, "fields":defaultdict(lambda: [0,Decimal(0)])})
    for record in records:
        values = record["values"]
        currency = values["currency"]
        key = currency if currency and re.fullmatch(r"[A-Z]{3}",currency) else "UNKNOWN"
        entry = totals[key]
        entry["rows"] += 1
        for field in ("poAmount","procurementExpenses","grossProfit"):
            value = decimal_or_none(values[field])
            if value is not None:
                entry["fields"][field][0] += 1
                entry["fields"][field][1] += value
    result = {}
    for currency, entry in sorted(totals.items()):
        result[currency] = {"rows":entry["rows"], "isMonetaryTotal":currency!="UNKNOWN",
                            "fields":{field:{"knownCount":entry["fields"][field][0],
                                             "rawSum":str(entry["fields"][field][1]) if entry["fields"][field][0] else None}
                                      for field in ("poAmount","procurementExpenses","grossProfit")}}
    return result

def reconcile(source, report, destination, live):
    rows = source["rows"]
    original_hash = source.get("originalSha256","")
    historical_hash = source.get("historicalBackup",{}).get("sha256")
    require(source.get("kind")=="monday-workbook" and source.get("boardId")==BOARD_ID
            and re.fullmatch(r"[a-f0-9]{64}", original_hash), "Unexpected source")
    require(destination.get("workspaceId")==WORKSPACE_ID and destination.get("complete") is True
            and destination.get("expectedCount")==len(destination["rows"]), "Incomplete destination")
    require(len(rows)==source["expectedCount"]==report["sourceCount"]==len(report["results"]),
            "Inventory mismatch")
    require(report.get("writesAttempted")==0 and report.get("productionImportAuthorized") is False,
            "Unexpected validation report")
    locators = [row["sourceLocator"] for row in rows]
    require(len(set(locators))==len(rows), "Duplicate source locator")
    confirmations = Counter(row["sourceRaw"].get("F") for row in rows)
    po_counts = Counter(row["poNumber"].strip().upper() for row in rows)
    records = []
    for index,(row,review) in enumerate(zip(rows,report["results"]),1):
        require(review["row"]==index and review["sourceLocator"]==row["sourceLocator"]
                and review["sourceItemId"]==row.get("sourceItemId"), "Dry-run row mismatch")
        info = identity(row,live,confirmations,historical_hash,original_hash)
        records.append(legacy_record(row,review,info,original_hash,historical_hash,
                                     po_counts[row["poNumber"].strip().upper()]))
    require(len({r["identity"]["key"] for r in records})==len(rows), "Duplicate compatibility identity")
    groups = Counter(r["sourceGroup"] for r in records)
    expected_groups = source.get("inventory",{}).get("groupCounts")
    if expected_groups is not None:
        require(all(groups.get(k,0)==v for k,v in expected_groups.items()) and
                all(k in expected_groups for k in groups), "Source group inventory mismatch")
        groups = {**expected_groups, **groups}
    existing = set()
    for row in destination["rows"]:
        key = row["po_number"].strip().upper()
        require(key and key not in existing and row.get("workspace_id")==WORKSPACE_ID and
                isinstance(row.get("archived"),bool), "Invalid destination identity")
        existing.add(key)
    return {"status":"LOCAL_COMPATIBILITY_ONLY","productionImportAuthorized":False,"writesAttempted":0,
            "sourceCount":len(rows),"representedCount":len(records),
            "identityEvidence":dict(Counter(r["identity"]["evidence"] for r in records)),
            "sourceGroups":dict(groups),
            "reconciliationIssueCounts":dict(Counter(i for r in records for i in r["reconciliationIssues"])),
            "sourceStatuses":dict(Counter(r["sourceStatus"] or "UNKNOWN" for r in records)),
            "duplicatePoGroups":sum(n>1 for n in po_counts.values()),
            "duplicatePoRows":sum(n for n in po_counts.values() if n>1),
            "destinationPoCollisionRows":sum(r["values"]["poNumber"].strip().upper() in existing for r in records),
            "historicalClientEvidenceCount":sum(bool((r["historicalClientEvidence"] or {}).get("clientName")) for r in records),
            "financialInventory":financial_inventory(records),"records":records}

def main():
    source_path, report_path, destination_path, *live_paths = map(Path,sys.argv[1:])
    source_bytes, report_bytes, dest_bytes = (p.read_bytes() for p in (source_path,report_path,destination_path))
    source, report, destination = map(json.loads,(source_bytes,report_bytes,dest_bytes))
    require(report["sourceSha256"]==digest(source_bytes) and report["destinationSha256"]==digest(dest_bytes),
            "Dry-run inputs do not match report checksums")
    live_docs = [json.loads(line) for p in live_paths for line in p.read_text().splitlines() if line.strip()]
    manifest = reconcile(source,report,destination,load_live_evidence(live_docs))
    manifest["inputHashes"] = {"source":digest(source_bytes),"dryRunReport":digest(report_bytes),
                               "destination":digest(dest_bytes),"liveEvidence":[digest(p.read_bytes()) for p in live_paths]}
    print(json.dumps(manifest,ensure_ascii=False,indent=2))

if __name__ == "__main__":
    main()
