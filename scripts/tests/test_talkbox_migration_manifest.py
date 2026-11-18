import importlib.util
import hashlib
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

script=Path(__file__).resolve().parents[1]/'talkbox-migration-manifest.py'
spec=importlib.util.spec_from_file_location('talkbox_manifest',script)
migration=importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

def row(n,fields):
    content=''.join(f'<c r="{col}{n}" t="inlineStr"><is><t>{value}</t></is></c>'
                    for col,value in fields.items())
    return f'<row r="{n}">{content}</row>'

def xml(data):
    return ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetData>'+data+'</sheetData></worksheet>')

class ManifestPreflight(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.file=Path(self.temp.name)/'source.xlsx'
    def workbook(self,reply_parent='200'):
        issue_rows=(row(5,{'G':'Item ID (auto generated)'})+
                    row(6,{'A':'Source title','C':'Done','G':'101'}))
        # Reply appears first in the exported source to test parent-first ordering.
        update_rows=(row(2,{'A':'Item ID','J':'Post ID','K':'Parent Post ID'})+
                     row(3,{'A':'101','J':'201','K':reply_parent,'G':'Reply body'})+
                     row(4,{'A':'101','J':'200','G':'Parent body'}))
        with zipfile.ZipFile(self.file,'w') as z:
            z.writestr('xl/worksheets/sheet1.xml',xml(issue_rows))
            z.writestr('xl/worksheets/sheet2.xml',xml(update_rows))
    def test_manifest_preserves_original_source_id_and_reply_order(self):
        self.workbook()
        result=migration.manifest(self.file,1)
        self.assertEqual([p['monday_post_id'] for p in result['posts_parent_first']],['200','201'])
        self.assertEqual(result['posts_parent_first'][1]['parent_monday_post_id'],'200')
        self.assertEqual(result['issues'][0]['monday_item_id'],'101')
        self.assertFalse(result['ready_for_migration'])
        self.assertFalse(result['production_writes_authorized'])
    def test_pinned_source_hash_mismatch_fails_closed(self):
        self.workbook()
        with self.assertRaisesRegex(ValueError,'SHA-256 mismatch'):
            migration.manifest(self.file,1,'0'*64)

    def test_orphan_reply_rejected_before_manifest(self):
        self.workbook('999')
        with self.assertRaises(ValueError):
            migration.manifest(self.file,1)
    def test_wrong_source_count_rejected(self):
        self.workbook()
        with self.assertRaises(ValueError):
            migration.manifest(self.file,87)
    def test_cli_creates_private_manifest_and_refuses_overwrite(self):
        self.workbook()
        output=Path(self.temp.name)/'manifest.json'
        args=[sys.executable,str(script),str(self.file),
              '--output',str(output),'--expected-count','1',
              '--expected-sha256',hashlib.sha256(self.file.read_bytes()).hexdigest()]
        first=subprocess.run(args,capture_output=True,text=True)
        self.assertEqual(first.returncode,0,first.stderr)
        self.assertEqual(output.stat().st_mode&0o777,0o600)
        second=subprocess.run(args,capture_output=True,text=True)
        self.assertNotEqual(second.returncode,0)
        self.assertIn('FileExistsError',second.stderr)

if __name__=='__main__':
    unittest.main()
