import importlib.util
import unittest
from pathlib import Path

source = Path(__file__).resolve().parents[1]/'talkbox-media-inventory.py'
spec=importlib.util.spec_from_file_location('talkbox_media_inventory',source)
media=importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


def sample():
    posts=[{'monday_post_id':str(i+1),'asset_ids':''} for i in range(1129)]
    posts[0]['asset_ids']='90001, 90002'
    posts[1]['asset_ids']='90002'
    return {
        'source_board_id':'18370784140',
        'workbook_sha256':media.SOURCE_SHA,
        'posts_parent_first':posts
    }


class MediaInventoryTests(unittest.TestCase):
    def test_extracts_unique_assets_and_preserves_post_edges(self):
        data=media.inventory(sample())
        self.assertEqual([x['source_asset_id'] for x in data['asset_references']],
                         ['90001','90002'])
        self.assertEqual(data['asset_references'][1]['source_post_ids'],['1','2'])
        self.assertEqual(data['verified_media_objects'],0)
        self.assertIsNone(data['asset_references'][0]['download_url'])
        self.assertIsNone(data['asset_references'][0]['file_sha256'])
        self.assertFalse(data['ready_for_activation'])
    def test_rejects_non_numeric_reference(self):
        data=sample()
        data['posts_parent_first'][0]['asset_ids']='90001,https://unsafe.example'
        with self.assertRaisesRegex(ValueError,'Invalid source asset reference'):
            media.inventory(data)
    def test_refuses_wrong_board(self):
        data=sample()
        data['source_board_id']='18370784141'
        with self.assertRaisesRegex(ValueError,'Source identity mismatch'):
            media.inventory(data)
    def test_refuses_incomplete_post_ledger(self):
        data=sample()
        data['posts_parent_first'].pop()
        with self.assertRaisesRegex(ValueError,'Incomplete post provenance'):
            media.inventory(data)
    def test_rejects_zero_invalid_asset_id(self):
        data=sample()
        data['posts_parent_first'][0]['asset_ids']='0'
        with self.assertRaisesRegex(ValueError,'Invalid source asset reference'):
            media.inventory(data)


if __name__=='__main__':
    unittest.main()
