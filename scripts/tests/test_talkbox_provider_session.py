import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'talkbox-provider-session.py'
SPEC = importlib.util.spec_from_file_location('tb_session', SCRIPT)
session = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(session)


def result(status, code=0, **payload):
    return subprocess.CompletedProcess([], code, json.dumps(dict(status=status, **payload)), '')


class ProviderSessionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.manifest = self.folder/'private-source.json'
        self.inventory = self.folder/'private-inventory.json'
        self.token = 'synthetic-token-NOT-A-REAL-CREDENTIAL'
        self.responses = [
            result('PROVIDER_METADATA_RECONCILED',
                   verified_issue_ids=87, media_metadata_count=148, ready_for_production=False),
            result('LOCAL_ASSET_BYTES_VERIFIED',
                   verified_bytes=148, ready_for_production=False),
            result('SOURCE_RECOVERY_BYTES_RECONCILED',
                   original_media_bytes_verified=148, ready_for_production=False)
        ]

    def test_no_credential_means_no_subprocess(self):
        invocations=[]
        data=session.execute(self.folder,self.manifest,self.inventory,'',
                             runner=lambda *a,**k:invocations.append(a))
        self.assertEqual(invocations,[])
        self.assertEqual(data['status'],'BLOCKED_PROVIDER_CREDENTIAL')

    def test_success_is_never_production_write_authorization(self):
        invocations=[]
        def run(argv,**kwargs):
            invocations.append((argv,kwargs))
            return self.responses[len(invocations)-1]
        data=session.execute(self.folder,self.manifest,self.inventory,
                             self.token,runner=run,run_id='synthetic-run')
        self.assertEqual(len(invocations),3)
        self.assertEqual(data['status'],'SOURCE_ONLY_RECONCILIATION_COMPLETE')
        self.assertFalse(data['ready_for_production'])
        self.assertFalse(data['production_writes'])
        for argv,options in invocations:
            self.assertNotIn(self.token,' '.join(argv))
            self.assertEqual(options['env']['MONDAY_API_TOKEN'],self.token)
            self.assertTrue(options['capture_output'])
            self.assertFalse(options['check'])
        self.assertNotIn(self.token,repr(data))

    def test_provider_failure_stops_before_asset_recovery(self):
        invocations=[]
        def run(*args,**kwargs):
            invocations.append(1)
            return result('BLOCKED_PROVIDER_RECONCILIATION',code=2)
        outcome=session.execute(self.folder,self.manifest,self.inventory,
                                self.token,runner=run,run_id='synthetic')
        self.assertEqual(len(invocations),1)
        self.assertEqual(outcome['stage'],'PROVIDER_ENUMERATION')
        self.assertNotIn(self.token,repr(outcome))

    def test_partial_asset_count_refused(self):
        responses=[self.responses[0],result('LOCAL_ASSET_BYTES_VERIFIED',
                                             verified_bytes=147,ready_for_production=False)]
        invocations=[]
        def run(*args,**kwargs):
            invocations.append(1)
            return responses[len(invocations)-1]
        outcome=session.execute(self.folder,self.manifest,self.inventory,
                                self.token,runner=run,run_id='synthetic')
        self.assertEqual(len(invocations),2)
        self.assertEqual(outcome['stage'],'ORIGINAL_ASSET_RECOVERY')

    def test_missing_provider_count_refused(self):
        def run(*args,**kwargs):
            return result('PROVIDER_METADATA_RECONCILED',ready_for_production=False)
        outcome=session.execute(self.folder,self.manifest,self.inventory,
                                self.token,runner=run,run_id='synthetic')
        self.assertEqual(outcome['stage'],'PROVIDER_ENUMERATION')

    def test_invalid_provider_output_sanitized(self):
        def run(*args,**kwargs):
            return subprocess.CompletedProcess([],1,'secret-source-data','SECRET IN STDERR')
        outcome=session.execute(self.folder,self.manifest,self.inventory,
                                self.token,runner=run,run_id='synthetic')
        self.assertNotIn('SECRET',repr(outcome))
        self.assertNotIn('secret',repr(outcome))

    def test_credential_not_read_from_noninteractive_terminal(self):
        with patch.dict(os.environ,{'MONDAY_API_TOKEN':''}):
            self.assertEqual(session.acquire_token(interactive=False),'')
        with patch.dict(os.environ,{'MONDAY_API_TOKEN':self.token}):
            self.assertEqual(session.acquire_token(interactive=False),self.token)

    def test_pinned_manifest_and_inventory_paths_are_fixed(self):
        commands=session.commands(self.folder,self.manifest,self.inventory,'synthetic')
        self.assertEqual(len(commands),3)
        self.assertIn(str(self.manifest),commands[0])
        self.assertIn(str(self.inventory),commands[0])
        self.assertTrue(any('provider-evidence.py' in arg for arg in commands[0]))
        self.assertTrue(any('provider-byte-recovery.py' in arg for arg in commands[1]))
        self.assertTrue(any('recovery-readiness.py' in arg for arg in commands[2]))


if __name__=='__main__':
    unittest.main()
