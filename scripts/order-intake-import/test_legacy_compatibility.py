import unittest
from copy import deepcopy
from pathlib import Path
from runpy import run_path

module = run_path(str(Path(__file__).with_name("legacy-compatibility.py")))
reconcile = module["reconcile"]
load_live = module["load_live_evidence"]
BOARD = module["BOARD_ID"]
WORKSPACE = module["WORKSPACE_ID"]

def fixture():
    rows = [
        {"sourceLocator":"order intake!A4","sourceGroup":"FY 2026","poNumber":"0007",
         "sourceItemId":"42","historicalEvidence":{"itemId":"42","clientName":"Prior client"},
         "poAmount":"12.345","grossProfit":"10.123","currency":"USD","status":"Collected",
         "sourceRaw":{"A":"0007","F":"42","C":"12.345","H":"original file reference"}},
        {"sourceLocator":"order intake!A5","sourceGroup":"FY 2025","poNumber":"0007",
         "poAmount":"100","status":"Please select","sourceRaw":{"A":"0007","F":"43","C":"100"}},
        {"sourceLocator":"order intake!A6","sourceGroup":"FY 2025","poNumber":"other",
         "sourceRaw":{"A":"other","F":"44"}}
    ]
    source = {"kind":"monday-workbook","boardId":BOARD,"originalSha256":"a"*64,
              "historicalBackup":{"sha256":"b"*64},"expectedCount":3,"rows":rows,
              "inventory":{"groupCounts":{"FY 2026":1,"FY 2025":2,"Hold":0}}}
    report = {"sourceCount":3,"writesAttempted":0,"productionImportAuthorized":False,
              "results":[{"row":i,"sourceLocator":r["sourceLocator"],"sourceItemId":r.get("sourceItemId"),
                          "issues":["INVALID_clientName","MISSING_sourceItemId","DUPLICATE_SOURCE_PO"],
                          "warnings":[]} for i,r in enumerate(rows,1)]}
    destination = {"workspaceId":WORKSPACE,"complete":True,"expectedCount":0,"rows":[]}
    return source,report,destination,{"43":"0007"}

class CompatibilityTest(unittest.TestCase):
    def test_preservation_and_identity(self):
        args = fixture()
        before = deepcopy(args)
        result = reconcile(*args)
        self.assertEqual(args,before)
        self.assertEqual(result["representedCount"],3)
        self.assertEqual(result["identityEvidence"],{"historical":1,"live":1,"snapshot_only":1})
        self.assertEqual(result["duplicatePoRows"],2)
        self.assertEqual(result["sourceGroups"]["Hold"],0)
        self.assertEqual(len({r["identity"]["key"] for r in result["records"]}),3)
        self.assertEqual(result["records"][0]["values"]["poNumber"],"0007")
        self.assertEqual(result["records"][0]["values"]["poAmount"],"12.345")
        self.assertEqual(result["records"][0]["historicalClientEvidence"]["clientName"],"Prior client")
        self.assertIsNone(result["records"][0]["values"]["clientName"])
        self.assertIsNone(result["records"][0]["sourceArchiveState"])
        self.assertEqual(result["records"][0]["attachments"]["poFileReference"],"original file reference")
        self.assertEqual(result["records"][1]["sourceStatus"],"Please select")
        self.assertIsNone(result["records"][1]["workflowStatus"])
        self.assertEqual(result["reconciliationIssueCounts"]["SOURCE_ITEM_ID_UNCONFIRMED"],1)
        self.assertEqual(result["reconciliationIssueCounts"]["REPEATED_PO_DESTINATION_CONTRACT_CONFLICT"],2)
        self.assertFalse(result["productionImportAuthorized"])

    def test_financial_coverage(self):
        result = reconcile(*fixture())["financialInventory"]
        self.assertEqual(result["USD"]["fields"]["poAmount"]["rawSum"],"12.345")
        self.assertIsNone(result["USD"]["fields"]["procurementExpenses"]["rawSum"])
        self.assertFalse(result["UNKNOWN"]["isMonetaryTotal"])
        self.assertEqual(result["UNKNOWN"]["fields"]["poAmount"]["knownCount"],1)
        self.assertEqual(result["UNKNOWN"]["fields"]["poAmount"]["rawSum"],"100")

    def test_bad_identity_and_inventory_fail(self):
        source,report,destination,live = fixture()
        with self.assertRaisesRegex(ValueError,"conflicts"):
            reconcile(source,report,destination,{"43":"different"})
        source["expectedCount"]=4
        with self.assertRaisesRegex(ValueError,"Inventory"):
            reconcile(source,report,destination,live)

    def test_report_mismatch_fails(self):
        source,report,destination,live = fixture()
        report["results"][0]["sourceLocator"]="wrong"
        with self.assertRaisesRegex(ValueError,"row mismatch"):
            reconcile(source,report,destination,live)

    def test_live_board_and_conflict(self):
        with self.assertRaisesRegex(ValueError,"Unexpected live board"):
            load_live([{"boardId":"other","rows":[]}])
        with self.assertRaisesRegex(ValueError,"Conflicting"):
            load_live([{"boardId":BOARD,"rows":[{"id":"42","label":"More options for A"},
                {"id":"42","label":"More options for B"}]}])

if __name__=="__main__":
    unittest.main()
