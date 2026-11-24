"""Read the observed Monday export layout without editing the workbook or fetching URLs."""
import sys
import json
import hashlib
import re
from collections import Counter, defaultdict
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
HEADERS = ["Name", "Subitems", "PO Amount", "Currency", "Status", "Confirmation ID",
           "PO confirmation", "PO File", "Date encoded", "Account Manager", "Company Account",
           "Supplier PO Procurement", "Total PO Expenses", "Gross Profit", "Industry Type",
           "Date Received", "Delivery Date"]
COLUMNS = dict(zip("ABCDEFGHIJKLMNOPQ", HEADERS))
MAPPING = {"A":"poNumber","C":"poAmount","D":"currency","E":"status",
           "J":"accountManager","K":"company","M":"procurementExpenses","N":"grossProfit",
           "O":"industry","P":"dateReceived","Q":"deliveryDate"}

def read_rows(path, sheet_name="order intake"):
    with ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        sheets = workbook.findall(".//s:sheet", NS)
        if len(sheets) != 1 or sheets[0].get("name") != sheet_name:
            raise ValueError("Unexpected workbook layout")
        props = workbook.find("s:workbookPr", NS)
        if props is not None and props.get("date1904") in ("1", "true"):
            raise ValueError("Unexpected date system")
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ["".join(t.text or "" for t in x.findall(".//s:t", NS))
                      for x in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", NS)]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        for row in sheet.findall(".//s:sheetData/s:row", NS):
            values = {}
            for cell in row.findall("s:c", NS):
                node = cell.find("s:v", NS)
                value = node.text if node is not None else None
                if cell.get("t") == "s" and value is not None:
                    value = shared[int(value)]
                if cell.get("t") == "inlineStr":
                    value = "".join(t.text or "" for t in cell.findall(".//s:t", NS))
                if value not in (None, ""):
                    column = re.sub(r"\d+", "", cell.get("r"))
                    if column in values:
                        raise ValueError("Duplicate cell")
                    values[column] = value
            yield int(row.get("r")), values

def date_only(value):
    try:
        serial = Decimal(value)
        if not serial.is_finite() or serial < 61 or serial > 146463:
            return value
        return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()
    except (InvalidOperation, ValueError, OverflowError):
        return value

def normalize(rows):
    group = None
    counts = Counter()
    structural = Counter()
    output = []
    raw_totals = defaultdict(Decimal)
    group_sums = defaultdict(Decimal)
    subtotal_deltas = {}
    source_status = Counter()
    for number, values in rows:
        name = values.get("A", "")
        if not values:
            structural["blank"] += 1
        elif number == 1 and values == {"A":"Order Intake"}:
            structural["title"] += 1
        elif re.fullmatch(r"FY \d{4}|Hold", name) and len(values) == 1:
            group = name
            counts.setdefault(group, 0)
            structural["group"] += 1
        elif values == COLUMNS:
            structural["header"] += 1
        elif values == {"A":"Subitems","B":"Name","C":"Owner","D":"Status","E":"Date"}:
            structural["subitem_header"] += 1
        elif not name and set(values) <= {"B","C","D","E"} and "B" in values:
            structural["subitem"] += 1
        elif not name and set(values) <= {"C","M","N","P","Q"} and "C" in values:
            structural["subtotal"] += 1
            subtotal_deltas[group] = str(Decimal(values["C"]) - group_sums[group])
        elif group and name and set(values) <= set(COLUMNS):
            counts[group] += 1
            mapped = {key:values[col] for col,key in MAPPING.items() if col in values}
            for key in ("dateReceived","deliveryDate"):
                if key in mapped:
                    mapped[key] = date_only(mapped[key])
            mapped.update(sourceGroup=group, sourceLocator=f"order intake!A{number}",
                          sourceRaw=values)
            # Confirmation ID is not assumed to be the Monday item ID.
            # Archive state, client, PO date and VAT remain unknown.
            output.append(mapped)
            source_status[values.get("E", "(blank)")] += 1
            try:
                amount = Decimal(values.get("C", ""))
                if amount.is_finite():
                    raw_totals[values.get("D", "(unknown)")] += amount
                    group_sums[group] += amount
            except InvalidOperation:
                pass
        else:
            raise ValueError(f"Unclassified worksheet row {number}")
    return output, {"groupCounts":dict(counts), "structuralRows":dict(structural),
                    "rawAmountTotals":{k:str(v) for k,v in raw_totals.items()},
                    "subtotalDeltas":subtotal_deltas,"statusCounts":dict(source_status)}

def main():
    path = Path(sys.argv[1])
    rows, inventory = normalize(read_rows(path))
    print(json.dumps({"kind":"monday-workbook","boardId":"3670228015",
                      "reference":path.name, "exportedAt":datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                      "originalSha256":hashlib.sha256(path.read_bytes()).hexdigest(),
                      "expectedCount":len(rows), "rows":rows, "inventory":inventory}, ensure_ascii=False))

if __name__ == "__main__":
    main()
