import importlib.util
import unittest
from pathlib import Path

module_path=Path(__file__).resolve().parents[1]/'talkbox-source-audit.py'
spec=importlib.util.spec_from_file_location('talkbox_source_audit',module_path)
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class ReplyLineage(unittest.TestCase):
    def row(self,post,issue,parent=''):
        return {'A':issue,'J':post,'K':parent}
    def test_valid_reply_tree(self):
        result=audit.verify_thread_lineage([
            self.row('10','1'),self.row('11','1','10'),self.row('12','1','11'),
            self.row('20','2'),self.row('21','2','20')])
        self.assertEqual(result,{'reply_count':3,'distinct_parent_posts':3,
                                 'reply_lineage_errors':[]})
    def test_orphan_parent_blocked(self):
        result=audit.verify_thread_lineage([self.row('11','1','99')])
        self.assertIn('orphan_reply_parent_id',result['reply_lineage_errors'])
    def test_cross_issue_parent_blocked(self):
        result=audit.verify_thread_lineage([self.row('10','1'),self.row('11','2','10')])
        self.assertIn('cross_issue_reply_parent',result['reply_lineage_errors'])
    def test_cycle_blocked(self):
        result=audit.verify_thread_lineage([self.row('10','1','11'),self.row('11','1','10')])
        self.assertIn('cyclic_reply_graph',result['reply_lineage_errors'])
    def test_self_parent_blocked(self):
        result=audit.verify_thread_lineage([self.row('10','1','10')])
        self.assertIn('self_parent_reply',result['reply_lineage_errors'])
    def test_invalid_parent_id_blocked(self):
        result=audit.verify_thread_lineage([self.row('10','1','not-a-id')])
        self.assertIn('invalid_reply_parent_id',result['reply_lineage_errors'])

if __name__=='__main__':
    unittest.main()
