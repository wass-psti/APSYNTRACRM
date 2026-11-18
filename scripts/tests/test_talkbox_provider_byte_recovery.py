import importlib.util
from io import BytesIO
from pathlib import Path
import tempfile
import unittest

P=Path(__file__).resolve().parents[1]/'talkbox-provider-byte-recovery.py'
S=importlib.util.spec_from_file_location('tb_byte_recovery',P)
recover=importlib.util.module_from_spec(S)
S.loader.exec_module(recover)

class FakeResponse:
    def __init__(self, data, url='https://cdn.monday.com/assets/test'):
        self.src=BytesIO(data); self.url=url
    def read(self, size=-1):return self.src.read(size)
    def geturl(self):return self.url
    def __enter__(self):return self
    def __exit__(self,*args):self.src.close()

class FakeOpener:
    def __init__(self, data, url='https://cdn.monday.com/assets/test'):
        self.data=data; self.url=url; self.calls=0
    def open(self,request,timeout):
        self.calls+=1
        return FakeResponse(self.data,self.url)

class ByteRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.out=Path(self.temp.name)/'assets'
        self.asset={'id':'90001','name':'original.txt','file_size':5,
                    'public_url':'https://cdn.monday.com/assets/test'}
    def test_valid_source_bytes_and_resumable_receipt(self):
        loader=FakeOpener(b'hello')
        first=recover.capture_asset(self.asset,self.out,opener=loader)
        self.assertEqual(first['status'],'VERIFIED_LOCAL_BYTES')
        self.assertTrue(first['bytes_verified'])
        self.assertEqual(first['byte_count'],5)
        self.assertEqual((self.out/'asset-90001.bin').read_bytes(),b'hello')
        self.assertEqual((self.out/'asset-90001.bin').stat().st_mode&0o777,0o600)
        other=recover.capture_asset(self.asset,self.out,opener=loader)
        self.assertEqual(other['status'],'ALREADY_VERIFIED')
        self.assertEqual(loader.calls,1)
    def test_changed_provider_filename_rejected_for_verified_existing_asset(self):
        loader=FakeOpener(b'hello')
        recover.capture_asset(self.asset,self.out,opener=loader)
        changed=dict(self.asset,name='different.txt')
        with self.assertRaisesRegex(ValueError,'identity/filename'):
            recover.capture_asset(changed,self.out,opener=loader)
        self.assertEqual(loader.calls,1)

    def test_forged_receipt_without_verified_flag_is_rejected(self):
        import json
        recover.capture_asset(self.asset,self.out,opener=FakeOpener(b'hello'))
        receipt=self.out/'asset-90001.json'
        row=json.loads(receipt.read_text())
        row['bytes_verified']=False
        receipt.write_text(json.dumps(row))
        with self.assertRaisesRegex(ValueError,'inconsistent'):
            recover.capture_asset(self.asset,self.out,opener=FakeOpener(b'hello'))

    def test_world_readable_asset_directory_is_rejected(self):
        self.out.mkdir(mode=0o755)
        self.out.chmod(0o755)
        with self.assertRaisesRegex(ValueError,'group/other access'):
            recover.capture_asset(self.asset,self.out,opener=FakeOpener(b'hello'))

    def test_symlinked_output_directory_is_rejected(self):
        target=Path(self.temp.name)/'actual'
        target.mkdir()
        alias=Path(self.temp.name)/'alias'
        alias.symlink_to(target,target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'symlink'):
            recover.capture_asset(self.asset,alias,opener=FakeOpener(b'hello'))

    def test_truncated_source_is_rejected_and_not_committed(self):
        with self.assertRaisesRegex(ValueError,'truncated'):
            recover.capture_asset(self.asset,self.out,opener=FakeOpener(b'hey'))
        self.assertFalse((self.out/'asset-90001.bin').exists())
        self.assertFalse((self.out/'asset-90001.part').exists())
    def test_oversize_content_rejected(self):
        with self.assertRaisesRegex(ValueError,'exceed'):
            recover.capture_asset(self.asset,self.out,opener=FakeOpener(b'hello WORLD'))
        self.assertFalse((self.out/'asset-90001.bin').exists())
    def test_changed_local_binary_rejected_on_replay(self):
        recover.capture_asset(self.asset,self.out,opener=FakeOpener(b'hello'))
        (self.out/'asset-90001.bin').write_bytes(b'HELLO')
        with self.assertRaisesRegex(ValueError,'checksum'):
            recover.capture_asset(self.asset,self.out,opener=FakeOpener(b'hello'))
    def test_unexpected_redirect_rejected(self):
        with self.assertRaisesRegex(ValueError,'hostname'):
            recover.capture_asset(self.asset,self.out,
               opener=FakeOpener(b'hello','https://evil.test/bytes'))
    def test_requires_signed_monday_https(self):
        for url in ('http://cdn.monday.com/test','https://127.0.0.1/x',
                    'https://cdn.monday.com.evil.test/x','file:///tmp/data'):
            with self.subTest(url=url),self.assertRaises(ValueError):
                recover.validate_url(url)
    def test_nontrusted_initial_url_rejected(self):
        other=dict(self.asset,public_url='https://localhost/private')
        with self.assertRaises(ValueError):
            recover.capture_asset(other,self.out,opener=FakeOpener(b'hello'))
    def test_oversized_declared_asset_rejected(self):
        with self.assertRaisesRegex(ValueError,'size'):
            recover.capture_asset(dict(self.asset,file_size=501*1024*1024),self.out,
                                  opener=FakeOpener(b'hello'))
    def test_outside_repository_required(self):
        with self.assertRaisesRegex(ValueError,'repository'):
            recover.capture_asset(self.asset,recover.provider.REPOSITORY/'private-bad',
                                  opener=FakeOpener(b'hello'))

if __name__=='__main__':unittest.main()
