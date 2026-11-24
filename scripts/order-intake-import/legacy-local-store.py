"""Nonproduction persistence proof: immutable, private SQLite snapshot.
No Supabase connection or production mutation. Financial values remain strings.
"""
from contextlib import closing
import hashlib
import json
import sqlite3
import sys
import uuid
from pathlib import Path

WORKSPACE = "00000000-0000-4000-8000-000000000001"
NAMESPACE = uuid.UUID("3439f416-7176-4e7f-8cec-2db35ff5d329")
SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshot (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 manifest_sha256 TEXT NOT NULL, row_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS legacy_order (
 id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE,
 ordinal INTEGER NOT NULL UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload))
);
"""
FIELD_MAP = {"poNumber":"po_number","clientName":"client_name","poDate":"po_date",
 "dateReceived":"date_received","deliveryDate":"delivery_date","currency":"currency",
 "poAmount":"po_amount","vatRate":"vat_rate","vatExclusiveAmount":"vat_exclusive_amount",
 "vatAmount":"vat_amount","procurementExpenses":"procurement_expenses","grossProfit":"gross_profit",
 "company":"company","industry":"industry","accountManager":"account_manager",
 "buyerInCharge":"buyer_in_charge","endUserInCharge":"end_user_in_charge","notes":"notes"}

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))

def stable_id(key):
    return str(uuid.uuid5(NAMESPACE, WORKSPACE+":"+key))

def materialize(manifest):
    records=manifest["records"]
    if (manifest.get("status")!="LOCAL_COMPATIBILITY_ONLY" or
        manifest.get("productionImportAuthorized") is not False or manifest.get("writesAttempted")!=0 or
        len(records)!=manifest["sourceCount"] or len(records)!=manifest["representedCount"]):
        raise ValueError("Invalid local compatibility manifest")
    keys=set()
    for index,record in enumerate(records):
        key=record["identity"]["key"]
        if not isinstance(key,str) or not key or key in keys:
            raise ValueError("Duplicate or missing source key")
        keys.add(key)
        yield stable_id(key),key,index,canonical(record)

def persist(path, manifest_bytes):
    records=list(materialize(json.loads(manifest_bytes)))
    checksum=hashlib.sha256(manifest_bytes).hexdigest()
    with closing(sqlite3.connect(path)) as db:
        db.executescript(SCHEMA)
        with db:
            db.execute("BEGIN IMMEDIATE")
            existing=db.execute("SELECT manifest_sha256,row_count FROM snapshot WHERE singleton=1").fetchone()
            if existing is None:
                db.executemany("INSERT INTO legacy_order VALUES (?,?,?,?)",records)
                db.execute("INSERT INTO snapshot VALUES (1,?,?)",(checksum,len(records)))
            elif existing!=(checksum,len(records)):
                raise ValueError("Different snapshot; use a new local database")
            actual=db.execute("SELECT id,source_key,ordinal,payload FROM legacy_order ORDER BY ordinal").fetchall()
            if actual!=records:
                raise ValueError("Persisted snapshot readback mismatch")
    return {"rows":len(records),"manifestSha256":checksum,"productionWrites":0}

def read_snapshot(path):
    with closing(sqlite3.connect(Path(path).resolve().as_uri()+"?mode=ro",uri=True)) as db:
        meta=db.execute("SELECT manifest_sha256,row_count FROM snapshot WHERE singleton=1").fetchone()
        stored=db.execute("SELECT id,source_key,payload FROM legacy_order ORDER BY ordinal").fetchall()
        if not meta or meta[1]!=len(stored):
            raise ValueError("Invalid persisted snapshot")
        rows=[]
        for record_id,key,payload in stored:
            record=json.loads(payload)
            if record_id!=stable_id(key) or record["identity"]["key"]!=key:
                raise ValueError("Invalid persisted source identity")
            row={target:record["values"].get(source) for source,target in FIELD_MAP.items()}
            row.update(id=record_id,workspace_id=WORKSPACE,record_kind="legacy",
                       source_key=key,source_item_id=record["identity"]["itemId"],
                       source_locator=record["provenance"]["locator"],source_group=record["sourceGroup"],
                       fiscal_year=record["sourceFiscalYear"],status=record["sourceStatus"],
                       archived=record["sourceArchiveState"],financial_basis=record["financialBasis"],
                       historical_client_name=(record.get("historicalClientEvidence") or {}).get("clientName"),
                       po_file_reference=record["attachments"]["poFileReference"],
                       confirmation_reference=record["attachments"]["confirmationReference"])
            rows.append(row)
        return {"workspaceId":WORKSPACE,"manifestSha256":meta[0],"rows":rows}

if __name__=="__main__":
    operation,path,*args=sys.argv[1:]
    if operation=="persist" and len(args)==1:
        result=persist(path,Path(args[0]).read_bytes())
    elif operation=="read" and not args:
        result=read_snapshot(path)
    else:
        raise ValueError("Usage: persist database manifest | read database")
    print(json.dumps(result,ensure_ascii=False))
