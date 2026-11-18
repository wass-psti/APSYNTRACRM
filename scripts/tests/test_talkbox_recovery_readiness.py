import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

P=Path(__file__).resolve().parents[1]/'talkbox-recovery-readiness.py'
S=importlib.util.spec_from_file_location('tb_readiness',P)
readiness=importlib.util.module_from_spec(S)
S.loader.exec_module(readiness)

class RecoveryReadinessTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.ids=[str(1000+i) for i in range(87)]
        self.assets=[str(3000+i) for i in range(148)]
        self.manifest={'source_board_id':readiness.provider.BOARD,
                       'workbook_sha256':readiness.provider.SOURCE_HASH,
                       'issues':[{'monday_item_id':x} for x in self.ids]}
        self.inventory={'source_board_id':readiness.provider.BOARD,
                        'workbook_sha256':readiness.provider.SOURCE_HASH,
                        'asset_references':[{'source_asset_id':x} for x in self.assets]}
        self.evidence={'source_board_id':readiness.provider.BOARD,
                       'workbook_sha256':readiness.provider.SOURCE_HASH,
                       'provider_metadata_reconciled':True,
                       'provider_readback_at_utc':'2026-11-19T00:00:00+00:00',
                       'parent_lineage':{'verified_source_parent_count':87,
                                         'source_parent_ids':self.ids,
                                         'source_subitem_count':0,'source_subitems':[]},
                       'media':{'metadata_count':148,
                                'assets':[{'source_asset_id':x,'original_filename':'file.bin','file_size':1}
                                          for x in self.assets]}}
        for aid in self.assets:
            (self.root/('asset-'+aid+'.bin')).write_bytes(b'x')
            (self.root/('asset-'+aid+'.json')).write_text(json.dumps({
                'source_asset_id':aid,'byte_count':1,'source_file_size':1,'status':'VERIFIED_LOCAL_BYTES',
                'sha256':hashlib.sha256(b'x').hexdigest(),
                'original_filename':'file.bin','bytes_verified':True}))

    def verify(self):
        return readiness.assess_source(self.evidence,self.manifest,self.inventory,self.root)

    def test_complete_synthetic_receipts_not_production_authorization(self):
        result=self.verify()
        self.assertEqual(result['source_issue_ids_verified'],87)
        self.assertEqual(result['source_media_objects_verified'],148)
        self.assertFalse(result['ready_for_production'])
        self.assertFalse(result['production_writes_authorized'])

    def test_missing_original_bytes_rejected(self):
        (self.root/'asset-3000.bin').unlink()
        with self.assertRaises(ValueError):self.verify()

    def test_corrupt_original_bytes_rejected(self):
        (self.root/'asset-3000.bin').write_bytes(b'y')
        with self.assertRaises(ValueError):self.verify()

    def test_parent_count_mismatch_rejected(self):
        self.evidence['parent_lineage']['verified_source_parent_count']=86
        with self.assertRaises(ValueError):self.verify()

    def test_child_parent_mismatch_rejected(self):
        self.evidence['parent_lineage']['source_subitem_count']=1
        self.evidence['parent_lineage']['source_subitems']=[{
            'source_subitem_id':'99999','source_parent_id':'987654321',
            'subitem_board_id':'18371220520'}]
        with self.assertRaises(ValueError):self.verify()

if __name__=='__main__':unittest.main()
