import importlib.util
from pathlib import Path
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'talkbox-authenticated-playground.py'
SPEC=importlib.util.spec_from_file_location('tb_playground',SCRIPT)
mod=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


class FakeProviderUI:
    def __init__(self,source,assets):
        self.source=source;self.assets=assets;self.calls=[]
    def api(self,query,alias):
        self.calls.append((query,alias))
        if 'items(ids:' in query:
            return [dict(id=i,name='Synthetic',board={'id':mod.provider.BOARD},subitems=[])
                    for i in parse_ids(query,'items(ids:')]
        if 'assets(ids:' in query:
            return [dict(id=i,name='Synthetic',file_size=10,public_url='https://cdn.monday.com/synthetic')
                    for i in parse_ids(query,'assets(ids:')]
        raise AssertionError('Unexpected GraphQL call')


def parse_ids(query,marker):
    return query.split(marker,1)[1].split(']',1)[0].lstrip('[').split(',')


class PlaygroundTests(unittest.TestCase):
    def setUp(self):
        self.parent_ids={str(i+1000) for i in range(87)}
        self.asset_ids={str(i+3000) for i in range(148)}
        self.fake=FakeProviderUI(self.parent_ids,self.asset_ids)

    def test_queries_are_read_only(self):
        pq=mod.parent_query(['1001','1002'],'parents_0')
        aq=mod.asset_query(['3001'],'assets_0')
        self.assertTrue(pq.startswith('query {'))
        self.assertTrue(aq.startswith('query {'))
        self.assertNotIn('mutation',pq+aq)
        self.assertIn('parent_item',pq)
        self.assertIn('public_url',aq)
        self.assertNotIn('Authorization',pq+aq)

    def test_parent_identity_all_87_in_five_batches(self):
        x=mod.verified_parents(self.fake,self.parent_ids)
        self.assertEqual(x['verified_source_parent_count'],87)
        self.assertEqual(x['source_subitem_count'],0)
        self.assertEqual(len(self.fake.calls),5)
        self.assertEqual(set(x['source_parent_ids']),self.parent_ids)

    def test_missing_parent_in_one_batch_rejected(self):
        class Missing(FakeProviderUI):
            def api(self,query,alias):
                return super().api(query,alias)[:-1]
        with self.assertRaisesRegex(ValueError,'source parent IDs'):
            mod.verified_parents(Missing(self.parent_ids,self.asset_ids),self.parent_ids)

    def test_incorrect_board_identity_rejected(self):
        class WrongBoard(FakeProviderUI):
            def api(self,query,alias):
                out=super().api(query,alias)
                out[0]['board']={'id':'99999'}
                return out
        with self.assertRaisesRegex(ValueError,'wrong board'):
            mod.verified_parents(WrongBoard(self.parent_ids,self.asset_ids),self.parent_ids)

    def test_asset_metadata_all_148_in_eight_batches(self):
        x=mod.verified_assets(self.fake,self.asset_ids,Path('/unused'),fetch_bytes=False)
        self.assertEqual(x['metadata_count'],148)
        self.assertEqual(x['verified_bytes_count'],0)
        self.assertEqual(len(self.fake.calls),8)
        self.assertTrue(all(not a['bytes_verified'] for a in x['assets']))
        self.assertTrue(all(a.get('public_url') is None for a in x['assets']))

    def test_missing_asset_batch_rejected(self):
        class Missing(FakeProviderUI):
            def api(self,query,alias):
                return super().api(query,alias)[:-1]
        with self.assertRaisesRegex(ValueError,'Incomplete original source asset'):
            mod.verified_assets(Missing(self.parent_ids,self.asset_ids),
                                self.asset_ids,Path('/unused'),fetch_bytes=False)

    def test_query_batches_bounded(self):
        sizes=[len(chunk) for chunk in mod.batches(self.asset_ids)]
        self.assertEqual(sizes,[20,20,20,20,20,20,20,8])
        self.assertEqual(sum(sizes),148)

if __name__=='__main__':unittest.main()
