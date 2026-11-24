"""Cross-check stable source identity against the historical account export.
Historical business fields are evidence only, not automatic current values.
"""
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from runpy import run_path

read_rows = run_path(str(Path(__file__).with_name("workbook-export.py")))["read_rows"]

def attach_evidence(source, backup_rows):
    by_confirmation = defaultdict(list)
    item_counts = Counter()
    for number, row in backup_rows:
        item_id = row.get("V", "")
        if row.get("A") and item_id.isdigit() and row.get("F") == item_id:
            by_confirmation[item_id].append((number, row))
            item_counts[item_id] += 1
    current_ids = Counter(r["sourceRaw"].get("F") for r in source["rows"])
    matched = clients = 0
    for row in source["rows"]:
        confirmation = row["sourceRaw"].get("F")
        options = by_confirmation.get(confirmation, [])
        if current_ids[confirmation] != 1 or len(options) != 1 or item_counts[confirmation] != 1:
            continue
        number, prior = options[0]
        if prior["A"].strip().upper() != row["poNumber"].strip().upper():
            continue
        row["sourceItemId"] = confirmation
        row["historicalEvidence"] = {"locator":f"order-intake!A{number}",
                                     "itemId":prior["V"],"clientName":prior.get("K")}
        matched += 1
        clients += bool(prior.get("K"))
    return {"matchedItemIds":matched,"unmatchedItemIds":len(source["rows"])-matched,
            "historicalClientNames":clients}

def main():
    source_path, backup_path = map(Path, sys.argv[1:3])
    source = json.loads(source_path.read_text())
    rows = list(read_rows(backup_path, "order-intake"))
    header = dict(rows).get(3, {})
    if header.get("V") != "Item ID (auto generated)" or header.get("F") != "Confirmation ID" or header.get("K") != "Client Name":
        raise ValueError("Unexpected historical export schema")
    evidence = attach_evidence(source, rows)
    source["historicalBackup"] = {"filename":backup_path.name,
        "sha256":hashlib.sha256(backup_path.read_bytes()).hexdigest(), **evidence}
    print(json.dumps(source, ensure_ascii=False))

if __name__ == "__main__":
    main()
