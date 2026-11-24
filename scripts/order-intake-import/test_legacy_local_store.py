import json
import sqlite3
import unittest
from pathlib import Path
from runpy import run_path
from tempfile import TemporaryDirectory

module=run_path(str(Path(__file__).with_name("legacy-local-store.py")))
persist=module["persist"]
read=module["read_snapshot"]

def manifest():
    record={"identity":{"key":"monday:1:2","itemId":"2"},
            "values":{"poNumber":"0001","poAmount":"12.345","currency":None},
            "provenance":{"locator":"sheet!A4"},"sourceGroup":"FY 2026",
            "sourceFiscalYear":2026,"sourceStatus":"Please select","sourceArchiveState":None,
            "financialBasis":"legacy_source_vat_unverified","attachments":{"poFileReference":None,"confirmationReference":None}}
    return {"status":"LOCAL_COMPATIBILITY_ONLY","productionImportAuthorized":False,
            "writesAttempted":0,"sourceCount":1,"representedCount":1,"records":[record]}

class StoreTest(unittest.TestCase):
    def test_roundtrip_and_idempotency(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/"local.sqlite"
            data=json.dumps(manifest()).encode()
            self.assertEqual(persist(path,data),persist(path,data))
            row=read(path)["rows"][0]
            self.assertEqual(row["po_number"],"0001")
            self.assertEqual(row["po_amount"],"12.345")
            self.assertIsNone(row["currency"])
            self.assertIsNone(row["archived"])
            self.assertEqual(row["status"],"Please select")

    def test_different_snapshot_preserves_existing(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/"local.sqlite"
            m=manifest()
            persist(path,json.dumps(m).encode())
            m["records"][0]["values"]["poAmount"]="1"
            with self.assertRaisesRegex(ValueError,"Different snapshot"):
                persist(path,json.dumps(m).encode())
            self.assertEqual(read(path)["rows"][0]["po_amount"],"12.345")

    def test_duplicate_source_key_rejected(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/"local.sqlite"
            m=manifest()
            m["records"]*=2
            m["sourceCount"]=m["representedCount"]=2
            with self.assertRaisesRegex(ValueError,"Duplicate"):
                persist(path,json.dumps(m).encode())
            self.assertFalse(path.exists())

if __name__=="__main__":
    unittest.main()
