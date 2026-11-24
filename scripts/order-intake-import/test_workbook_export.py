import unittest
from pathlib import Path
from runpy import run_path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

ROOT = Path(__file__).parent
parser = run_path(str(ROOT / "workbook-export.py"))
backup = run_path(str(ROOT / "backup-evidence.py"))

class ExportTest(unittest.TestCase):
    def test_inventory_and_raw_values(self):
        source = [(1,{"A":"Order Intake"}),(2,{"A":"FY 2026"}),
                  (3,parser["COLUMNS"]),(4,{"A":"0007","C":"12.345","D":"USD","P":"46346.375","F":"42"}),
                  (5,{"A":"Subitems","B":"Name","C":"Owner","D":"Status","E":"Date"}),
                  (6,{"B":"Subitem"}),(7,{"C":"12.345","P":"date range"}),
                  (8,{}),(9,{"A":"Hold"}),(10,parser["COLUMNS"])]
        rows, inventory = parser["normalize"](source)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["poNumber"],"0007")
        self.assertEqual(rows[0]["dateReceived"],"2026-11-20")
        self.assertEqual(rows[0]["sourceRaw"]["P"],"46346.375")
        self.assertEqual(rows[0]["sourceLocator"],"order intake!A4")
        self.assertNotIn("sourceItemId",rows[0])
        self.assertNotIn("archived",rows[0])
        self.assertNotIn("vatRate",rows[0])
        self.assertEqual(inventory["groupCounts"],{"FY 2026":1,"Hold":0})
        self.assertEqual(inventory["rawAmountTotals"],{"USD":"12.345"})
        self.assertEqual(sum(inventory["structuralRows"].values()),9)
        self.assertEqual(inventory["subtotalDeltas"],{"FY 2026":"0.000"})

    def test_unknown_structure_fails(self):
        with self.assertRaisesRegex(ValueError,"Unclassified"):
            parser["normalize"]([(1,{"A":"Order Intake"}),(2,{"Z":"unknown"})])

    def test_backup_identity_only(self):
        source={"rows":[{"poNumber":"0007","sourceRaw":{"F":"42"}},
                        {"poNumber":"different","sourceRaw":{"F":"43"}},
                        {"poNumber":"x","sourceRaw":{"F":"44"}},
                        {"poNumber":"x","sourceRaw":{"F":"44"}}]}
        prior=[(4,{"A":"0007","F":"42","V":"42","K":"Historical client"}),
               (5,{"A":"old","F":"43","V":"43"}),
               (6,{"A":"x","F":"44","V":"44"})]
        result=backup["attach_evidence"](source,prior)
        self.assertEqual(result,{"matchedItemIds":1,"unmatchedItemIds":3,"historicalClientNames":1})
        self.assertEqual(source["rows"][0]["sourceItemId"],"42")
        self.assertNotIn("clientName",source["rows"][0])
        self.assertTrue(all("sourceItemId" not in row for row in source["rows"][1:]))

    def test_read_actual_xml_cell_types(self):
        with TemporaryDirectory() as folder:
            path=Path(folder)/"fixture.xlsx"
            ns=parser["NS"]["s"]
            with ZipFile(path,"w") as archive:
                archive.writestr("xl/workbook.xml",f'<workbook xmlns="{ns}"><sheets><sheet name="order intake"/></sheets></workbook>')
                archive.writestr("xl/sharedStrings.xml",f'<sst xmlns="{ns}"><si><t>0007</t></si></sst>')
                archive.writestr("xl/worksheets/sheet1.xml",f'<worksheet xmlns="{ns}"><sheetData><row r="4"><c r="A4" t="s"><v>0</v></c><c r="C4"><v>12.345</v></c><c r="D4" t="inlineStr"><is><t>USD</t></is></c></row></sheetData></worksheet>')
            self.assertEqual(list(parser["read_rows"](path)),[(4,{"A":"0007","C":"12.345","D":"USD"})])

if __name__ == "__main__":
    unittest.main()
