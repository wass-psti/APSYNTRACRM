import json
import unittest
from copy import deepcopy
from pathlib import Path
from runpy import run_path

module=run_path(str(Path(__file__).with_name("activation-readiness.py")))
review=module["review"]
sha=module["sha"]
workspace=module["WORKSPACE"]
workbook=b"synthetic workbook"
workbook_hash=sha(workbook)

def fixture():
    records=[]
    for i,item in enumerate(("42",None),1):
        locator=f"sheet!A{i}"
        key=f"monday:3670228015:{item}" if item else f"snapshot:{workbook_hash}:{locator}"
        records.append({"identity":{"key":key,"itemId":item},"provenance":{"boardId":"3670228015","locator":locator,"workbookSha256":workbook_hash},
            "values":{"poNumber":"001","currency":None,"clientName":None,"vatRate":None},"sourceArchiveState":None})
    return {"status":"LOCAL_COMPATIBILITY_ONLY","productionImportAuthorized":False,"writesAttempted":0,
            "sourceCount":2,"representedCount":2,"records":records}

def destination():
    return {"workspaceId":workspace,"complete":True,"registryExists":False,"legacyTableExists":False,"expectedCount":0,"rows":[]}

def run(manifest,inventory):
    raw=json.dumps(manifest).encode()
    return review(raw,workbook,inventory,sha(raw))

class ActivationReviewTest(unittest.TestCase):
    def test_repeated_po_and_snapshot_identity(self):
        result=run(fixture(),destination())
        self.assertEqual(result["sourceCount"],2)
        self.assertEqual(result["snapshotOnlyIds"],1)
        self.assertEqual(result["repeatedPoRows"],2)
        self.assertEqual(len({r["id"] for r in result["records"]}),2)
        self.assertFalse(result["productionImportAuthorized"])

    def test_hash_mismatch(self):
        with self.assertRaisesRegex(ValueError,"hash mismatch"):
            review(json.dumps(fixture()).encode(),workbook,destination(),"0"*64)

    def test_schema_and_inventory_changed(self):
        for change in ({"registryExists":True},{"expectedCount":1},{"complete":False}):
            with self.assertRaises(ValueError):
                run(fixture(),{**destination(),**change})

    def test_native_collisions(self):
        m=fixture()
        batch=run(m,destination())
        for row,reason in (
            ({"id":batch["records"][0]["id"],"workspace_id":workspace,"po_number":"different"},"UUID"),
            ({"id":"different","workspace_id":workspace,"po_number":" 001 "},"PO")):
            with self.assertRaisesRegex(ValueError,reason+" collision"):
                run(m,{**destination(),"expectedCount":1,"rows":[row]})

    def test_bad_source_identity(self):
        m=fixture()
        m["records"][1]["identity"]["key"]="unverified-key"
        with self.assertRaisesRegex(ValueError,"snapshot-only"):
            run(m,destination())

    def test_workbook_provenance(self):
        m=fixture()
        m["records"][0]["provenance"]["workbookSha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"provenance"):
            run(m,destination())

if __name__=="__main__":
    unittest.main()
